const React = require('react');

const FreeBanner = ({ subscriptionStatus, proPrice }) => {
  if (!subscriptionStatus) return null;
  const plan = subscriptionStatus.plan;
  if (plan === 'pro' || plan === 'elite') return null;

  if (plan === 'trial') {
    const trialEndsAt = subscriptionStatus.trialEndsAt ? new Date(subscriptionStatus.trialEndsAt) : null;
    const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - new Date()) / (1000 * 60 * 60 * 24))) : null;
    const tradeCount = subscriptionStatus.tradeCount ?? null;
    const tradesLeft = tradeCount !== null ? Math.max(0, 50 - tradeCount) : null;
    return (
      <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 mb-6">
        <p className="text-sm text-accent">
          <span className="font-semibold">You're on your free trial.</span>
          <span className="text-text-secondary ml-1">
            {daysLeft !== null && <span className="text-accent font-medium">{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</span>}
            {daysLeft !== null && tradesLeft !== null && <span className="text-text-muted mx-1">·</span>}
            {tradesLeft !== null && <span className="text-accent font-medium">{tradesLeft} of 50 trades remaining</span>}
            {(daysLeft !== null || tradesLeft !== null) && <span>. </span>}
            Upgrade to Pro before your trial ends to keep unlimited access.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 mb-6">
      <p className="text-sm text-accent">
        <span className="font-semibold">Your trial has ended.</span>
        <span className="text-text-secondary ml-1">Upgrade to Pro for just ${proPrice}/month to unlock unlimited trades, broker sync, CSV import, strategy tracking, and more.</span>
      </p>
    </div>
  );
};

module.exports = FreeBanner;
