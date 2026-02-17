import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../bindings';

interface SubscriptionStatus {
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysRemaining: number;
}

/**
 * Computes subscription/trial status from the user's profile data.
 * Sets `subscriptionStatus` on the context variables.
 */
export const checkSubscriptionStatus = createMiddleware<{
  Bindings: Env;
  Variables: AuthContext & { subscriptionStatus: SubscriptionStatus };
}>(async (c, next) => {
  const profile = c.get('profile');
  if (!profile) {
    return next();
  }

  if ((profile.subscription_plan || 'trial') !== 'trial') {
    c.set('subscriptionStatus', {
      isPremium: true,
      isTrialActive: false,
      trialDaysRemaining: 0,
    });
    return next();
  }

  const TRIAL_DAYS = parseInt(c.env.TRIAL_DAYS || '14', 10);
  const accountCreated = new Date(profile.created_at);
  const now = new Date();
  const daysSinceCreation = Math.floor(
    (now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24),
  );
  const trialDaysRemaining = Math.max(0, TRIAL_DAYS - daysSinceCreation);
  const isTrialActive = trialDaysRemaining > 0;

  c.set('subscriptionStatus', {
    isPremium: false,
    isTrialActive,
    trialDaysRemaining,
  });

  return next();
});
