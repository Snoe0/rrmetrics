import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import { requiresAdmin } from '../middleware/admin-auth';
import { createServiceClient } from '../lib/supabase';
import * as adminDb from '../db/admin';
import * as commissionsDb from '../db/commissions';
import { sendEmail } from '../utils/email';
import { buildUnsubscribeUrl } from '../utils/unsubscribe';
import Stripe from 'stripe';

function getStripe(env: Env): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY);
}

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const admin = new Hono<HonoEnv>();

// All /api/admin/* routes require admin auth
admin.use('/api/admin/*', requiresAdmin);

// ─── Stats ────────────────────────────────────────────────────────────────────

// GET /api/admin/stats
admin.get('/api/admin/stats', async (c) => {
  const supabase = createServiceClient(c.env);
  try {
    const stats = await adminDb.getCustomerStats(supabase);
    return c.json(stats);
  } catch (err) {
    console.error('admin stats error:', err);
    return c.json({ error: 'Failed to fetch stats.' }, 500);
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────

// GET /api/admin/users?page=1&pageSize=50
admin.get('/api/admin/users', async (c) => {
  const supabase = createServiceClient(c.env);
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '50', 10);
  try {
    const result = await adminDb.listUsers(supabase, page, pageSize);
    return c.json(result);
  } catch (err) {
    console.error('admin users error:', err);
    return c.json({ error: 'Failed to fetch users.' }, 500);
  }
});

// ─── Storage costs ───────────────────────────────────────────────────────────

// GET /api/admin/storage-costs
admin.get('/api/admin/storage-costs', async (c) => {
  const supabase = createServiceClient(c.env);
  try {
    const costs = await adminDb.getUserStorageCosts(supabase);
    return c.json({ costs });
  } catch (err) {
    console.error('admin storage costs error:', err);
    return c.json({ error: 'Failed to fetch storage costs.' }, 500);
  }
});

// ─── Suspicious accounts ──────────────────────────────────────────────────────

// GET /api/admin/suspicious
admin.get('/api/admin/suspicious', async (c) => {
  const supabase = createServiceClient(c.env);
  try {
    const groups = await adminDb.getSuspiciousAccounts(supabase);
    return c.json({ groups });
  } catch (err) {
    console.error('admin suspicious error:', err);
    return c.json({ error: 'Failed to fetch suspicious accounts.' }, 500);
  }
});

// ─── Announcements ────────────────────────────────────────────────────────────

// GET /api/admin/announcements
admin.get('/api/admin/announcements', async (c) => {
  const supabase = createServiceClient(c.env);
  try {
    const announcements = await adminDb.listAnnouncements(supabase);
    return c.json({ announcements });
  } catch (err) {
    console.error('admin list announcements error:', err);
    return c.json({ error: 'Failed to list announcements.' }, 500);
  }
});

// POST /api/admin/announcements
admin.post('/api/admin/announcements', async (c) => {
  const supabase = createServiceClient(c.env);
  const reqBody = await c.req.json();
  const { title, body: msgBody, type = 'info', active = false } = reqBody;

  if (!title || !msgBody) {
    return c.json({ error: 'title and body are required.' }, 400);
  }
  if (!['info', 'warning', 'success'].includes(type)) {
    return c.json({ error: 'type must be info, warning, or success.' }, 400);
  }

  try {
    const announcement = await adminDb.createAnnouncement(supabase, title, msgBody, type, active);
    return c.json({ announcement }, 201);
  } catch (err) {
    console.error('admin create announcement error:', err);
    return c.json({ error: 'Failed to create announcement.' }, 500);
  }
});

// PATCH /api/admin/announcements/:id
admin.patch('/api/admin/announcements/:id', async (c) => {
  const supabase = createServiceClient(c.env);
  const id = c.req.param('id');
  const reqBody = await c.req.json();
  const fields: Record<string, unknown> = {};
  if ('title' in reqBody) fields.title = reqBody.title;
  if ('body' in reqBody) fields.body = reqBody.body;
  if ('type' in reqBody) fields.type = reqBody.type;
  if ('active' in reqBody) fields.active = reqBody.active;

  try {
    await adminDb.updateAnnouncement(supabase, id, fields as Parameters<typeof adminDb.updateAnnouncement>[2]);
    return c.json({ ok: true });
  } catch (err) {
    console.error('admin update announcement error:', err);
    return c.json({ error: 'Failed to update announcement.' }, 500);
  }
});

// DELETE /api/admin/announcements/:id
admin.delete('/api/admin/announcements/:id', async (c) => {
  const supabase = createServiceClient(c.env);
  const id = c.req.param('id');
  try {
    await adminDb.deleteAnnouncement(supabase, id);
    return c.json({ ok: true });
  } catch (err) {
    console.error('admin delete announcement error:', err);
    return c.json({ error: 'Failed to delete announcement.' }, 500);
  }
});

// ─── Mass email ────────────────────────────────────────────────────────────────

// POST /api/admin/email/send
// Body: { subject, text, html, planFilter? }
// planFilter: 'all' | 'pro' | 'elite' | 'free' | 'expired_trial'
admin.post('/api/admin/email/send', async (c) => {
  const supabase = createServiceClient(c.env);
  const reqBody = await c.req.json();
  const { subject, text, html, planFilter = 'all' } = reqBody;

  if (!subject || !text || !html) {
    return c.json({ error: 'subject, text, and html are required.' }, 400);
  }

  // ── TEST MODE: override recipient ──
  const TEST_EMAIL_OVERRIDE = 'maintainer@users.noreply.github.com';
  // Remove when ready for production
  // ───────────────────────────────────

  try {
    const trialDays = parseInt(c.env.TRIAL_DAYS || '14', 10);
    const recipients = await adminDb.getAllEmails(supabase, planFilter, trialDays);
    if (recipients.length === 0) {
      return c.json({ sent: 0, message: 'No users match the filter.' });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      try {
        // Build per-user unsubscribe URL
        const unsubUrl = await buildUnsubscribeUrl(recipient.id, c.env.APP_URL, c.env.ENCRYPTION_KEY);

        // Append unsubscribe footer to HTML
        const htmlWithUnsub = html +
          `<div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">` +
          `<a href="${unsubUrl}" style="color:#6b7280;font-size:11px;text-decoration:underline;">Unsubscribe</a></div>`;
        const textWithUnsub = text + `\n\nUnsubscribe: ${unsubUrl}`;

        const emailTo = TEST_EMAIL_OVERRIDE || recipient.email;
        await sendEmail(
          { to: emailTo, subject, text: textWithUnsub, html: htmlWithUnsub },
          c.env.RESEND_API_KEY,
          c.env.RESEND_FROM_EMAIL,
        );
        sent++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${recipient.email}: ${message}`);
      }
    }

    return c.json({ sent, total: recipients.length, errors });
  } catch (err) {
    console.error('admin mass email error:', err);
    return c.json({ error: 'Failed to send emails.' }, 500);
  }
});

// ─── Subscription management ──────────────────────────────────────────────────

// PATCH /api/admin/users/:id/subscription
// Body: { plan: 'free' | 'pro' | 'elite' }
// Downgrading to free also cancels the Stripe subscription.
admin.patch('/api/admin/users/:id/subscription', async (c) => {
  const supabase = createServiceClient(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();
  const { plan } = body;

  if (!['free', 'pro', 'elite'].includes(plan)) {
    return c.json({ error: 'plan must be free, pro, or elite.' }, 400);
  }

  try {
    const { data: profile, error: lookupErr } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', id)
      .single();

    if (lookupErr || !profile) return c.json({ error: 'User not found.' }, 404);

    // Cancel Stripe subscription when downgrading to free
    if (plan === 'free' && profile.stripe_subscription_id) {
      const stripe = getStripe(c.env);
      if (stripe) {
        await stripe.subscriptions.cancel(profile.stripe_subscription_id);
      }
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        subscription_plan: plan,
        subscription_status: plan === 'free' ? 'canceled' : 'active',
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    return c.json({ ok: true, plan });
  } catch (err) {
    console.error('admin set subscription error:', err);
    return c.json({ error: 'Failed to update subscription.' }, 500);
  }
});

// POST /api/admin/users/:id/extend
// Body: { months: number }  (1–12)
// Extends the user's Stripe subscription by setting trial_end to current billing date + N months.
admin.post('/api/admin/users/:id/extend', async (c) => {
  const supabase = createServiceClient(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();
  const months = Number(body.months);

  if (!months || months < 1 || months > 12) {
    return c.json({ error: 'months must be between 1 and 12.' }, 400);
  }

  try {
    const { data: profile, error: lookupErr } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', id)
      .single();

    if (lookupErr || !profile) return c.json({ error: 'User not found.' }, 404);
    if (!profile.stripe_subscription_id) {
      return c.json({ error: 'User has no Stripe subscription to extend.' }, 400);
    }

    const stripe = getStripe(c.env);
    if (!stripe) return c.json({ error: 'Stripe not configured.' }, 503);

    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);

    // Use trial_end if already trialing, current_period_end for active subscriptions,
    // or fall back to now if neither is available.
    const subAny = subscription as any;
    const base: number =
      subscription.status === 'trialing' && subscription.trial_end
        ? subscription.trial_end
        : (subAny.current_period_end ?? Math.floor(Date.now() / 1000));

    const newTrialEnd = base + months * 30 * 24 * 60 * 60;

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      trial_end: newTrialEnd,
      proration_behavior: 'none',
    });

    return c.json({ ok: true, trialEnd: newTrialEnd });
  } catch (err) {
    console.error('admin extend subscription error:', err);
    return c.json({ error: 'Failed to extend subscription.' }, 500);
  }
});

// ─── Role management ─────────────────────────────────────────────────────────

// PATCH /api/admin/users/:id/role
// Body: { role: 'user' | 'developer' }
admin.patch('/api/admin/users/:id/role', async (c) => {
  const supabase = createServiceClient(c.env);
  const id = c.req.param('id');
  const body = await c.req.json();
  const { role } = body;

  if (!['user', 'developer'].includes(role)) {
    return c.json({ error: 'role must be user or developer.' }, 400);
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', id);

    if (error) throw error;

    return c.json({ ok: true, role });
  } catch (err) {
    console.error('admin set role error:', err);
    return c.json({ error: 'Failed to update role.' }, 500);
  }
});

// ─── Payout management ────────────────────────────────────────────────────────

// GET /api/admin/payouts?status=pending_approval
admin.get('/api/admin/payouts', async (c) => {
  const supabase = createServiceClient(c.env);
  const statusFilter = c.req.query('status');
  try {
    const payouts = await commissionsDb.listPendingPayouts(supabase, statusFilter);
    return c.json({ payouts });
  } catch (err) {
    console.error('admin payouts list error:', err);
    return c.json({ error: 'Failed to fetch payouts.' }, 500);
  }
});

// POST /api/admin/payouts/:id/approve — approve payout and send via Wise
admin.post('/api/admin/payouts/:id/approve', async (c) => {
  const payoutId = c.req.param('id');
  const supabase = createServiceClient(c.env);

  if (!c.env.WISE_API_TOKEN || !c.env.WISE_PROFILE_ID) {
    return c.json({ error: 'Wise not configured.' }, 503);
  }

  try {
    // Get the payout request
    const { data: payout, error: fetchErr } = await supabase
      .from('payout_requests')
      .select('*, profiles!payout_requests_referrer_id_fkey(email, wise_recipient_id)')
      .eq('id', payoutId)
      .eq('status', 'pending_approval')
      .single();

    if (fetchErr || !payout) {
      return c.json({ error: 'Payout request not found or already processed.' }, 404);
    }

    const wiseRecipientId = (payout as any).profiles?.wise_recipient_id;
    if (!wiseRecipientId) {
      return c.json({ error: 'User has no Wise recipient set up.' }, 400);
    }

    const amountUsd = payout.amount_cents / 100;
    const profileId = c.env.WISE_PROFILE_ID;
    const headers = {
      'Authorization': `Bearer ${c.env.WISE_API_TOKEN}`,
      'Content-Type': 'application/json',
    };

    // 1. Create quote
    const quoteRes = await fetch(`https://api.wise.com/v3/profiles/${profileId}/quotes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceCurrency: 'USD',
        targetCurrency: 'USD',
        sourceAmount: amountUsd,
      }),
    });
    if (!quoteRes.ok) {
      const err = await quoteRes.text();
      console.error('Wise quote error:', err);
      return c.json({ error: 'Failed to create Wise quote.' }, 500);
    }
    const quote = await quoteRes.json() as { id: string };

    // 2. Create transfer
    const transferRes = await fetch('https://api.wise.com/v1/transfers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        targetAccount: Number(wiseRecipientId),
        quoteUuid: quote.id,
        customerTransactionId: payoutId,
      }),
    });
    if (!transferRes.ok) {
      const err = await transferRes.text();
      console.error('Wise transfer error:', err);
      return c.json({ error: 'Failed to create Wise transfer.' }, 500);
    }
    const transfer = await transferRes.json() as { id: number };

    // 3. Fund the transfer from Wise balance
    const fundRes = await fetch(
      `https://api.wise.com/v3/profiles/${profileId}/transfers/${transfer.id}/payments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'BALANCE' }),
      },
    );
    if (!fundRes.ok) {
      const err = await fundRes.text();
      console.error('Wise fund error:', err);
      // Transfer created but not funded — mark as failed
      await commissionsDb.failPayoutRequest(supabase, payoutId, `Wise funding failed: ${err}`);
      return c.json({ error: 'Failed to fund Wise transfer.' }, 500);
    }

    // Mark payout as completed
    await commissionsDb.completePayoutRequest(supabase, payoutId, `wise-${transfer.id}`);

    return c.json({ ok: true, wiseTransferId: transfer.id });
  } catch (err: any) {
    console.error('admin approve payout error:', err);
    return c.json({ error: err?.message || 'Failed to approve payout.' }, 500);
  }
});

// POST /api/admin/payouts/:id/reject — reject a payout request
admin.post('/api/admin/payouts/:id/reject', async (c) => {
  const payoutId = c.req.param('id');
  const supabase = createServiceClient(c.env);

  try {
    const body = await c.req.json().catch(() => ({}));
    const reason = (body as any).reason || 'Rejected by admin';
    await commissionsDb.failPayoutRequest(supabase, payoutId, reason);
    return c.json({ ok: true });
  } catch (err: any) {
    console.error('admin reject payout error:', err);
    return c.json({ error: err?.message || 'Failed to reject payout.' }, 500);
  }
});

export default admin;
