import type { Env } from '../bindings';
import { createServiceClient } from '../lib/supabase';
import Stripe from 'stripe';
import * as dripDb from '../db/email-drips';
import { sendEmail } from '../utils/email';
import { buildUnsubscribeUrl } from '../utils/unsubscribe';
import {
  trialExpiredEmail,
  followUp3dEmail,
  followUp7dEmail,
  monthlyEmail,
} from '../utils/email-templates';

const MAX_EMAILS_PER_RUN = 20;
const CONCURRENCY = 5;

// ── TEST MODE: Send all emails to this address instead of the real user ──
const TEST_EMAIL_OVERRIDE = 'maintainer@users.noreply.github.com';
// Remove or set to '' when ready for production
// ──────────────────────────────────────────────────────────────────────────

interface EligibleUser {
  id: string;
  email: string;
  created_at: string;
  stripe_customer_id: string | null;
}

/**
 * Ensure the COMEBACK50 base coupon exists in Stripe.
 */
async function ensureBaseCoupon(stripe: Stripe): Promise<void> {
  try {
    const coupon = await stripe.coupons.retrieve('COMEBACK50');
    if ((coupon as any).deleted) throw { statusCode: 404 };
  } catch (err: any) {
    if (err?.statusCode !== 404) throw err; // Only create if not found
    await stripe.coupons.create({
      id: 'COMEBACK50',
      percent_off: 50,
      duration: 'once',
      name: 'Welcome Back - 50% Off First Month',
    });
    console.log('[Email Drip] Created COMEBACK50 coupon');
  }
}

/**
 * Create a unique single-use promotion code for a user.
 */
async function createPromoCode(stripe: Stripe, userId: string): Promise<string> {
  const promo = await stripe.promotionCodes.create({
    promotion: { coupon: 'COMEBACK50', type: 'coupon' },
    max_redemptions: 1,
    metadata: { userId },
  });
  return promo.code;
}

/**
 * Process a single user's drip email.
 */
async function processUser(
  user: EligibleUser,
  env: Env,
  supabase: ReturnType<typeof createServiceClient>,
  stripe: Stripe,
): Promise<void> {
  const trialDays = parseInt(env.TRIAL_DAYS || '14', 10);
  const createdAt = new Date(user.created_at);
  const trialExpiry = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Not expired yet — skip
  if (now < trialExpiry) return;

  const daysSinceExpiry = (now.getTime() - trialExpiry.getTime()) / (1000 * 60 * 60 * 24);
  const userName = user.email.split('@')[0];
  const recipientEmail = TEST_EMAIL_OVERRIDE || user.email;

  // Build unsubscribe URL
  const unsubscribeUrl = await buildUnsubscribeUrl(user.id, env.APP_URL, env.ENCRYPTION_KEY);

  // ── Check drip sequence in order ──

  // 1. Trial expired email (Day 0+)
  const sentTrialExpired = await dripDb.hasSentDrip(supabase, user.id, 'trial_expired');
  if (!sentTrialExpired) {
    let promoCode: string | undefined;
    try {
      promoCode = await createPromoCode(stripe, user.id);
    } catch (err) {
      console.error(`[Email Drip] Failed to create promo for ${user.id}:`, err);
    }

    const upgradeUrl = promoCode
      ? `${env.APP_URL}/upgrade?code=${promoCode}`
      : `${env.APP_URL}/upgrade`;

    const email = trialExpiredEmail({ userName, promoCode, upgradeUrl, unsubscribeUrl, appUrl: env.APP_URL });
    await sendEmail({ to: recipientEmail, ...email }, env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);
    await dripDb.logDripSend(supabase, user.id, 'trial_expired', promoCode);
    console.log(`[Email Drip] Sent trial_expired to ${user.id}`);
    return;
  }

  // 2. Follow-up Day 3
  if (daysSinceExpiry >= 3) {
    const sentFollowup3d = await dripDb.hasSentDrip(supabase, user.id, 'followup_3d');
    if (!sentFollowup3d) {
      const promoCode = await dripDb.getPromoCode(supabase, user.id);
      const upgradeUrl = promoCode
        ? `${env.APP_URL}/upgrade?code=${promoCode}`
        : `${env.APP_URL}/upgrade`;

      const email = followUp3dEmail({ userName, promoCode: promoCode || undefined, upgradeUrl, unsubscribeUrl, appUrl: env.APP_URL });
      await sendEmail({ to: recipientEmail, ...email }, env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);
      await dripDb.logDripSend(supabase, user.id, 'followup_3d');
      console.log(`[Email Drip] Sent followup_3d to ${user.id}`);
      return;
    }
  }

  // 3. Follow-up Day 7
  if (daysSinceExpiry >= 7) {
    const sentFollowup7d = await dripDb.hasSentDrip(supabase, user.id, 'followup_7d');
    if (!sentFollowup7d) {
      const promoCode = await dripDb.getPromoCode(supabase, user.id);
      const upgradeUrl = promoCode
        ? `${env.APP_URL}/upgrade?code=${promoCode}`
        : `${env.APP_URL}/upgrade`;

      const email = followUp7dEmail({ userName, promoCode: promoCode || undefined, upgradeUrl, unsubscribeUrl, appUrl: env.APP_URL });
      await sendEmail({ to: recipientEmail, ...email }, env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);
      await dripDb.logDripSend(supabase, user.id, 'followup_7d');
      console.log(`[Email Drip] Sent followup_7d to ${user.id}`);
      return;
    }
  }

  // 4. Monthly re-engagement (30+ days after the 7d follow-up window)
  if (daysSinceExpiry >= 37) {
    const sentFollowup7d = await dripDb.hasSentDrip(supabase, user.id, 'followup_7d');
    if (!sentFollowup7d) return; // Don't start monthly until the 7d sequence is done

    const lastMonthly = await dripDb.getLastMonthlySent(supabase, user.id);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (!lastMonthly || lastMonthly < thirtyDaysAgo) {
      const upgradeUrl = `${env.APP_URL}/upgrade`;
      const email = monthlyEmail({ userName, upgradeUrl, unsubscribeUrl, appUrl: env.APP_URL });
      await sendEmail({ to: recipientEmail, ...email }, env.RESEND_API_KEY, env.RESEND_FROM_EMAIL);
      await dripDb.logMonthlySend(supabase, user.id);
      console.log(`[Email Drip] Sent monthly to ${user.id}`);
    }
  }
}

/**
 * Process all eligible users in batches with limited concurrency.
 */
export async function processEmailDrips(env: Env): Promise<void> {
  const supabase = createServiceClient(env);

  if (!env.STRIPE_SECRET_KEY) {
    console.log('[Email Drip] Stripe not configured, skipping');
    return;
  }
  if (!env.RESEND_API_KEY) {
    console.log('[Email Drip] Resend not configured, skipping');
    return;
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  // Ensure base coupon exists
  try {
    await ensureBaseCoupon(stripe);
  } catch (err) {
    console.error('[Email Drip] Failed to ensure COMEBACK50 coupon:', err);
    // Continue — emails will be sent without promo codes
  }

  // Query eligible users: free plan, not unsubscribed
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, created_at, stripe_customer_id')
    .eq('subscription_plan', 'free')
    .eq('email_unsubscribed', false)
    .limit(MAX_EMAILS_PER_RUN);

  if (error) {
    console.error('[Email Drip] Query error:', error);
    return;
  }

  if (!users || users.length === 0) {
    console.log('[Email Drip] No eligible users');
    return;
  }

  console.log(`[Email Drip] Processing ${users.length} eligible users`);

  // Process in batches of CONCURRENCY
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((user) => processUser(user as EligibleUser, env, supabase, stripe)),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[Email Drip] User processing failed:', result.reason);
      }
    }
  }

  console.log('[Email Drip] Cron run complete');
}
