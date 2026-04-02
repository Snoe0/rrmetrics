import { Hono } from 'hono';
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
