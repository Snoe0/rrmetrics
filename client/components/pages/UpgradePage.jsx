const React = require('react');
const Icons = require('../shared/Icons');

const UpgradePage = ({ pricing }) => {
  const planDefs = (pricing && pricing.plans) || {};
  const plans = [
    {
      name: (planDefs.trial && planDefs.trial.name) || 'Trial',
      price: '$0',
      period: '14 days',
      features: (planDefs.trial && planDefs.trial.features) || ['All Pro features for 14 days', 'Up to 50 trades'],
      accent: false,
      popular: false,
    },
    {
      name: (planDefs.pro && planDefs.pro.name) || 'Pro',
      price: `$${(pricing && pricing.pro) || '19'}`,
      period: '/month',
      features: (planDefs.pro && planDefs.pro.features) || ['Unlimited trades', 'Advanced analytics', '1 Backtesting session'],
      accent: true,
      popular: true,
    },
    {
      name: (planDefs.elite && planDefs.elite.name) || 'Elite',
      price: `$${(pricing && pricing.elite) || '24'}`,
      period: '/month',
      features: (planDefs.elite && planDefs.elite.features) || ['Everything in Pro', 'Unlimited Backtesting'],
      accent: false,
      popular: false,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-text-primary">Upgrade Your Plan</h1>
        <p className="text-text-secondary mt-2 max-w-lg mx-auto">Choose the plan that fits your trading style.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {plans.map(plan => (
          <div
            key={plan.name}
            className={`relative bg-bg-surface rounded-xl p-6 flex flex-col ${
              plan.accent
                ? 'border-2 border-accent'
                : 'border border-border'
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-accent text-accent-text text-xs font-bold rounded-full">
                Most Popular
              </div>
            )}
            <h3 className="text-text-primary font-semibold text-lg">{plan.name}</h3>
            <div className="mt-4 mb-6">
              <span className="text-text-primary font-mono text-4xl font-bold">{plan.price}</span>
              <span className="text-text-tertiary text-sm ml-1">{plan.period}</span>
            </div>
            <ul className="space-y-3 flex-1">
              {plan.features.map(feature => (
                <li key={feature} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Icons.Check className="w-4 h-4 text-accent flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              onClick={() => plan.name !== 'Trial' && (window.location.href = '/upgrade')}
              className={`mt-6 w-full py-2.5 text-sm font-semibold rounded-lg transition-all ${
                plan.accent
                  ? 'bg-accent text-accent-text hover:brightness-110'
                  : 'bg-bg-input border border-border text-text-primary hover:border-accent'
              }`}
            >
              {plan.name === 'Trial' ? 'Current Plan' : `Get ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-text-muted text-xs">Cancel anytime. Remaining balance refunded.</p>
    </div>
  );
};

module.exports = UpgradePage;
