import { Hono } from 'hono';
import Stripe from 'stripe';
import type { Env, AuthContext } from '../bindings';
import * as referralDb from '../db/referrals';
import * as commissionsDb from '../db/commissions';
import * as profilesDb from '../db/profiles';
import { requiresLogin } from '../middleware/supabase-auth';
import { createServiceClient } from '../lib/supabase';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const referral = new Hono<HonoEnv>();

// GET /api/referral — returns code (null if not yet generated) and stats
referral.get('/api/referral', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const code = await referralDb.getCode(supabase, user.id);
    const stats = await referralDb.getStats(supabase, user.id);
    const link = code ? `${c.env.APP_URL}/?ref=${code}` : null;
    return c.json({ code, link, stats });
  } catch (err) {
    console.error('GET /api/referral error:', err);
    return c.json({ error: 'Failed to fetch referral data' }, 500);
  }
});

// POST /api/referral/generate — user explicitly requests a code be created
referral.post('/api/referral/generate', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    // Idempotent: return existing code if already generated
    const existing = await referralDb.getCode(supabase, user.id);
    if (existing) {
      return c.json({ code: existing, link: `${c.env.APP_URL}/?ref=${existing}` });
    }

    const code = await referralDb.generateCode(supabase, user.id);
    return c.json({ code, link: `${c.env.APP_URL}/?ref=${code}` });
  } catch (err) {
    console.error('POST /api/referral/generate error:', err);
    return c.json({ error: 'Failed to generate referral code' }, 500);
  }
});

// POST /api/referral/customize — set/change to a custom code
referral.post('/api/referral/customize', requiresLogin, async (c) => {
  const user = c.get('user');
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request.' }, 400); }

  const serviceClient = createServiceClient(c.env);
  try {
    const result = await referralDb.setCustomCode(serviceClient, user.id, body?.code ?? '');
    if (result.error) return c.json({ error: result.error }, 400);
    return c.json({ code: result.code, link: `${c.env.APP_URL}/?ref=${result.code}` });
  } catch (err) {
    console.error('POST /api/referral/customize error:', err);
    return c.json({ error: 'Failed to set referral code.' }, 500);
  }
});

// POST /api/referral/apply — apply a friend's referral code to the current user
referral.post('/api/referral/apply', requiresLogin, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const code = (body.code || '').trim().toUpperCase();

  if (!code) {
    return c.json({ error: 'Referral code is required.' }, 400);
  }

  // Service-role client — RLS blocks anonymous client inserts into referral_uses
  const serviceClient = createServiceClient(c.env);

  try {
    const result = await referralDb.applyCode(serviceClient, code, user.id);
    if (result.error) return c.json({ error: result.error }, 400);
    return c.json({ success: true });
  } catch (err) {
    console.error('POST /api/referral/apply error:', err);
    return c.json({ error: 'Failed to apply referral code.' }, 500);
  }
});

// GET /api/referral/balance — commission balance + connect status + payout history
referral.get('/api/referral/balance', requiresLogin, async (c) => {
  const user = c.get('user');
  const profile = c.get('profile');
  const supabase = c.get('supabase');

  try {
    const [balance, payoutHistory] = await Promise.all([
      commissionsDb.getBalance(supabase, user.id),
      commissionsDb.getPayoutHistory(supabase, user.id),
    ]);

    return c.json({
      ...balance,
      connectOnboarded: profile.wise_onboarded ?? false,
      payoutHistory,
    });
  } catch (err) {
    console.error('GET /api/referral/balance error:', err);
    return c.json({ error: 'Failed to fetch balance' }, 500);
  }
});

// POST /api/referral/connect — create Wise recipient with bank details
referral.post('/api/referral/connect', requiresLogin, async (c) => {
  const user = c.get('user');
  const profile = c.get('profile');

  if (!c.env.WISE_API_TOKEN || !c.env.WISE_PROFILE_ID) {
    return c.json({ error: 'Payout service not configured.' }, 503);
  }

  const serviceClient = createServiceClient(c.env);

  try {
    // Already onboarded
    if (profile.wise_onboarded && profile.wise_recipient_id) {
      return c.json({ ok: true, onboarded: true });
    }

    const body = await c.req.json();
    const { firstName, lastName, accountType, routingNumber, accountNumber, address } = body;

    if (!firstName || !lastName || !routingNumber || !accountNumber || !address) {
      return c.json({ error: 'All fields are required.' }, 400);
    }
    if (!address.line1 || !address.city || !address.state || !address.postalCode) {
      return c.json({ error: 'Complete address is required.' }, 400);
    }
    if (String(routingNumber).length !== 9) {
      return c.json({ error: 'Routing number must be 9 digits.' }, 400);
    }

    // Create Wise recipient
    const wiseRes = await fetch('https://api.wise.com/v1/accounts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.WISE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile: Number(c.env.WISE_PROFILE_ID),
        accountHolderName: `${firstName} ${lastName}`,
        currency: 'USD',
        type: 'aba',
        details: {
          legalType: 'PRIVATE',
          abartn: routingNumber,
          accountNumber: accountNumber,
          accountType: accountType || 'CHECKING',
          address: {
            firstLine: address.line1,
            city: address.city,
            state: address.state,
            postCode: address.postalCode,
            country: 'US',
          },
        },
      }),
    });

    if (!wiseRes.ok) {
      const err = await wiseRes.json().catch(() => ({}));
      console.error('Wise create recipient error:', err);
      const msg = (err as any)?.errors?.[0]?.message || 'Failed to create payout recipient.';
      return c.json({ error: msg }, 400);
    }

    const recipient = await wiseRes.json() as { id: number };

    await profilesDb.updateById(serviceClient, user.id, {
      wiseRecipientId: String(recipient.id),
      wiseOnboarded: true,
    });

    return c.json({ ok: true, onboarded: true });
  } catch (err: any) {
    console.error('POST /api/referral/connect error:', err);
    return c.json({ error: err?.message || 'Failed to set up payout account.' }, 500);
  }
});

// POST /api/referral/redeem-credit — exchange available earnings for a free month of subscription
referral.post('/api/referral/redeem-credit', requiresLogin, async (c) => {
  const user = c.get('user');
  const profile = c.get('profile');
  const serviceClient = createServiceClient(c.env);

  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: 'Billing is not configured.' }, 503);
  }
  if (!profile.stripe_customer_id || !profile.stripe_subscription_id) {
    return c.json({ error: 'You need an active subscription to redeem a free month.' }, 400);
  }

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  try {
    // Determine cost of one month — use the recurring price unit_amount, normalize yearly to monthly
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
      expand: ['items.data.price'],
    });
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return c.json({ error: 'Your subscription is not active.' }, 400);
    }
    const item = subscription.items.data[0];
    const price = item?.price;
    if (!price || price.unit_amount == null) {
      return c.json({ error: 'Could not determine subscription price.' }, 500);
    }
    const interval = price.recurring?.interval;
    const intervalCount = price.recurring?.interval_count ?? 1;
    let monthlyCents: number;
    if (interval === 'month') {
      monthlyCents = Math.round(price.unit_amount / intervalCount);
    } else if (interval === 'year') {
      monthlyCents = Math.round(price.unit_amount / (12 * intervalCount));
    } else {
      return c.json({ error: 'Unsupported billing interval for credit redemption.' }, 400);
    }

    // Atomically reserve the funds (bypass min/cooldown)
    let payoutRequest;
    try {
      const { data, error } = await serviceClient.rpc('create_payout_atomic', {
        p_user_id: user.id,
        p_amount_cents: monthlyCents,
        p_min_cents: 0,
        p_cooldown_hours: 0,
      });
      if (error) throw new Error(error.message);
      payoutRequest = data;
    } catch (err: any) {
      const msg = String(err.message || '');
      if (msg.includes('Insufficient')) {
        return c.json({ error: `You need at least $${(monthlyCents / 100).toFixed(2)} in available earnings to redeem a free month.` }, 400);
      }
      return c.json({ error: msg || 'Failed to redeem credit.' }, 400);
    }

    // Apply Stripe customer balance credit (negative amount = credit toward future invoices)
    let balanceTx;
    try {
      balanceTx = await stripe.customers.createBalanceTransaction(profile.stripe_customer_id, {
        amount: -monthlyCents,
        currency: (price.currency || 'usd').toLowerCase(),
        description: `Referral credit redemption — 1 month free (payout_request ${payoutRequest.id})`,
      });
    } catch (err: any) {
      // Roll back the reservation so the user's balance is released
      await serviceClient
        .from('payout_requests')
        .update({
          status: 'failed',
          admin_note: `Stripe credit failed: ${err?.message || 'unknown'}`,
          processed_at: new Date().toISOString(),
        })
        .eq('id', payoutRequest.id);
      console.error('Stripe credit error:', err);
      return c.json({ error: 'Failed to apply credit. Your balance has not been deducted.' }, 500);
    }

    // Mark the payout_request as completed so it counts as paid out
    await serviceClient
      .from('payout_requests')
      .update({
        status: 'completed',
        stripe_transfer_id: balanceTx.id,
        admin_note: 'Redeemed for subscription credit',
        processed_at: new Date().toISOString(),
      })
      .eq('id', payoutRequest.id);

    return c.json({ ok: true, creditCents: monthlyCents });
  } catch (err: any) {
    console.error('POST /api/referral/redeem-credit error:', err);
    return c.json({ error: err?.message || 'Failed to redeem credit.' }, 500);
  }
});

// POST /api/referral/payout — request cash out (requires admin approval)
referral.post('/api/referral/payout', requiresLogin, async (c) => {
  const user = c.get('user');
  const profile = c.get('profile');
  const serviceClient = createServiceClient(c.env);

  try {
    const body = await c.req.json();
    const amountCents = Number(body.amount_cents);

    if (!profile.wise_onboarded || !profile.wise_recipient_id) {
      return c.json({ error: 'Connect your bank account before requesting a payout.' }, 400);
    }

    if (!amountCents || amountCents < 1500) {
      return c.json({ error: 'Minimum payout is $15.00.' }, 400);
    }

    // Atomic: check balance + create payout_request as pending_approval
    let payoutRequest;
    try {
      payoutRequest = await commissionsDb.callAtomicPayout(serviceClient, user.id, amountCents);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }

    // Discord notification for admin review
    if (c.env.DISCORD_PAYOUT_WEBHOOK) {
      const amount = (amountCents / 100).toFixed(2);
      fetch(c.env.DISCORD_PAYOUT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `💰 Payout request: ${profile.email} requested $${amount} — needs approval`,
        }),
      }).catch(() => {});
    }

    return c.json({ ok: true, requestId: payoutRequest.id });
  } catch (err) {
    console.error('POST /api/referral/payout error:', err);
    return c.json({ error: 'Failed to process payout request.' }, 500);
  }
});

export default referral;
