import { createMiddleware } from 'hono/factory';
import type { Env, SessionData } from '../bindings';

interface SubscriptionStatus {
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysRemaining: number;
}

/**
 * Computes subscription/trial status from the session's account data.
 * Sets `subscriptionStatus` on the context variables.
 */
export const checkSubscriptionStatus = createMiddleware<{
  Bindings: Env;
  Variables: {
    session: SessionData | null;
    sessionId: string | null;
    subscriptionStatus: SubscriptionStatus;
  };
}>(async (c, next) => {
  const session = c.get('session');
  if (!session) {
    return next();
  }

  const { account } = session;

  if (account.isPremium) {
    c.set('subscriptionStatus', {
      isPremium: true,
      isTrialActive: false,
      trialDaysRemaining: 0,
    });
    return next();
  }

  const TRIAL_DAYS = 7;
  const accountCreated = new Date(account.createdDate);
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
