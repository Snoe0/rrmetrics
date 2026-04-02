import { Hono } from 'hono';
import Stripe from 'stripe';
import type { Env, AuthContext } from '../bindings';
import * as referralDb from '../db/referrals';
import * as commissionsDb from '../db/commissions';
import * as profilesDb from '../db/profiles';
import { requiresLogin } from '../middleware/supabase-auth';
import { createServiceClient } from '../lib/supabase';

function getStripe(env: Env): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY);
}

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
      connectAccountId: profile.stripe_connect_account_id ?? null,
      connectOnboarded: profile.stripe_connect_onboarded ?? false,
      payoutHistory,
    });
  } catch (err) {
    console.error('GET /api/referral/balance error:', err);
    return c.json({ error: 'Failed to fetch balance' }, 500);
  }
});

// POST /api/referral/connect — create Custom Connect account with inline form data
referral.post('/api/referral/connect', requiresLogin, async (c) => {
  const user = c.get('user');
  const profile = c.get('profile');
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const serviceClient = createServiceClient(c.env);

  try {
    // Already onboarded
    if (profile.stripe_connect_onboarded && profile.stripe_connect_account_id) {
      return c.json({ ok: true, onboarded: true });
    }

    const body = await c.req.json();
    const { firstName, lastName, dobYear, dobMonth, dobDay, ssnLast4, address, bankToken } = body;

    // Validate required fields
    if (!firstName || !lastName || !dobYear || !dobMonth || !dobDay || !ssnLast4 || !address || !bankToken) {
      return c.json({ error: 'All fields are required.' }, 400);
    }
    if (!address.line1 || !address.city || !address.state || !address.postalCode) {
      return c.json({ error: 'Complete address is required.' }, 400);
    }
    if (String(ssnLast4).length !== 4) {
      return c.json({ error: 'SSN must be exactly 4 digits.' }, 400);
    }

    let accountId = profile.stripe_connect_account_id;

    if (!accountId) {
      // Create Custom Connect account with all details inline
      const account = await stripe.accounts.create({
        type: 'custom',
        country: 'US',
        email: profile.email,
        business_type: 'individual',
        individual: {
          first_name: firstName,
          last_name: lastName,
          email: profile.email,
          dob: {
            year: Number(dobYear),
            month: Number(dobMonth),
            day: Number(dobDay),
          },
          ssn_last_4: String(ssnLast4),
          address: {
            line1: address.line1,
            line2: address.line2 || undefined,
            city: address.city,
            state: address.state,
            postal_code: address.postalCode,
            country: 'US',
          },
        },
        capabilities: {
          transfers: { requested: true },
        },
        external_account: bankToken,
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '0.0.0.0',
        },
        metadata: { userId: user.id },
      });
      accountId = account.id;
    } else {
      // Account exists but not onboarded — update details
      await stripe.accounts.update(accountId, {
        individual: {
          first_name: firstName,
          last_name: lastName,
          email: profile.email,
          dob: {
            year: Number(dobYear),
            month: Number(dobMonth),
            day: Number(dobDay),
          },
          ssn_last_4: String(ssnLast4),
          address: {
            line1: address.line1,
            line2: address.line2 || undefined,
            city: address.city,
            state: address.state,
            postal_code: address.postalCode,
            country: 'US',
          },
        },
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '0.0.0.0',
        },
      });
      // Attach bank account
      await stripe.accounts.createExternalAccount(accountId, {
        external_account: bankToken,
      });
    }

    // Check if account is ready for transfers
    const account = await stripe.accounts.retrieve(accountId);
    const onboarded = !!(account.capabilities?.transfers === 'active' || account.charges_enabled);

    await profilesDb.updateById(serviceClient, user.id, {
      stripeConnectAccountId: accountId,
      stripeConnectOnboarded: onboarded,
    });

    return c.json({ ok: true, onboarded });
  } catch (err: any) {
    console.error('POST /api/referral/connect error:', err);
    const msg = err?.raw?.message || err?.message || 'Failed to set up payout account.';
    return c.json({ error: msg }, 500);
  }
});

// POST /api/referral/payout — instant cash out
referral.post('/api/referral/payout', requiresLogin, async (c) => {
  const user = c.get('user');
  const profile = c.get('profile');
  const stripe = getStripe(c.env);
  if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

  const serviceClient = createServiceClient(c.env);

  try {
    const body = await c.req.json();
    const amountCents = Number(body.amount_cents);

    if (!profile.stripe_connect_onboarded || !profile.stripe_connect_account_id) {
      return c.json({ error: 'Connect your bank account before requesting a payout.' }, 400);
    }

    if (!amountCents || amountCents < 1500) {
      return c.json({ error: 'Minimum payout is $15.00.' }, 400);
    }

    // Atomic: check balance + create payout_request in one transaction
    let payoutRequest;
    try {
      payoutRequest = await commissionsDb.callAtomicPayout(serviceClient, user.id, amountCents);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }

    // Execute Stripe transfer immediately
    try {
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: profile.stripe_connect_account_id,
        metadata: {
          payoutRequestId: payoutRequest.id,
          userId: user.id,
        },
      });

      await commissionsDb.completePayoutRequest(serviceClient, payoutRequest.id, transfer.id);

      // Discord notification
      if (c.env.DISCORD_PAYOUT_WEBHOOK) {
        const amount = (amountCents / 100).toFixed(2);
        fetch(c.env.DISCORD_PAYOUT_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `💸 Payout completed: ${profile.email} cashed out $${amount}`,
          }),
        }).catch(() => {});
      }

      return c.json({ ok: true, transferId: transfer.id });
    } catch (stripeErr: any) {
      // Transfer failed — mark payout as failed so balance is released
      await commissionsDb.failPayoutRequest(
        serviceClient,
        payoutRequest.id,
        `Stripe transfer failed: ${stripeErr.message}`,
      );
      console.error('Stripe transfer failed:', stripeErr);
      return c.json({ error: 'Payout transfer failed. Please try again later.' }, 500);
    }
  } catch (err) {
    console.error('POST /api/referral/payout error:', err);
    return c.json({ error: 'Failed to process payout.' }, 500);
  }
});

export default referral;
