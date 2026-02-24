import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../bindings';

export type EffectivePlan = 'trial' | 'free' | 'pro' | 'elite';

interface SubscriptionStatus {
  isPremium: boolean;
  effectivePlan: EffectivePlan;
  hasTradeLimit: boolean;
}

/**
 * Computes subscription status from the user's profile.
 * - trial: free plan AND account age < TRIAL_DAYS (all Pro features, 50 trade cap)
 * - free: free plan AND trial period expired (limited features, 50 trade cap)
 * - pro / elite: paid subscription (unlimited trades, full features)
 */
export const checkSubscriptionStatus = createMiddleware<{
  Bindings: Env;
  Variables: AuthContext & { subscriptionStatus: SubscriptionStatus };
}>(async (c, next) => {
  const profile = c.get('profile');
  if (!profile) {
    return next();
  }

  const plan = profile.subscription_plan || 'free';
  const isPaidPlan = plan === 'pro' || plan === 'elite';

  let effectivePlan: EffectivePlan;

  if (isPaidPlan) {
    effectivePlan = plan as 'pro' | 'elite';
  } else {
    const trialDays = parseInt(c.env.TRIAL_DAYS || '14', 10);
    const createdAt = new Date(profile.created_at);
    const trialExpiry = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const inTrialPeriod = new Date() < trialExpiry;
    effectivePlan = inTrialPeriod ? 'trial' : 'free';
  }

  c.set('subscriptionStatus', {
    isPremium: effectivePlan === 'trial' || effectivePlan === 'pro' || effectivePlan === 'elite',
    effectivePlan,
    hasTradeLimit: !isPaidPlan,
  });

  return next();
});

/** Broker connection limits by plan. */
export const BROKER_ACCOUNT_LIMITS: Record<EffectivePlan, number> = {
  trial: 0,
  free: 0,
  pro: 3,
  elite: Infinity,
};

/**
 * Requires a Pro or Elite subscription for broker sync features.
 * Must be chained AFTER checkSubscriptionStatus.
 * Returns 402 with upgrade prompt for free/trial users.
 */
export const requiresBrokerSync = createMiddleware<{
  Bindings: Env;
  Variables: AuthContext & { subscriptionStatus: SubscriptionStatus };
}>(async (c, next) => {
  const status = c.get('subscriptionStatus' as any) as SubscriptionStatus | undefined;
  if (!status) {
    return c.json({ error: 'Subscription status not available' }, 500);
  }

  const plan = status.effectivePlan;
  if (plan !== 'pro' && plan !== 'elite') {
    return c.json(
      { error: 'Broker sync requires a Pro or Elite subscription.', upgrade: true },
      402,
    );
  }

  return next();
});
