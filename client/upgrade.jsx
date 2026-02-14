const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');
require('./styles/globals.css');

// =====================================================
// LOCAL ICONS
// =====================================================
const Icons = {
  TrendingUp: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
      <polyline points="16 7 22 7 22 13"></polyline>
    </svg>
  ),
  Check: (props) => (
    <svg className={props.className || "w-4 h-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  ArrowLeft: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12 19 5 12 12 5"></polyline>
    </svg>
  ),
  CheckCircle: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  ),
  AlertCircle: (props) => (
    <svg className={props.className || "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  ),
};

// =====================================================
// APP
// =====================================================
const App = () => {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') setSuccess(true);
    if (params.get('canceled') === 'true') setCanceled(true);
  }, []);

  const handleUpgrade = async (planId) => {
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError('Failed to connect to payment service.');
      setLoading(null);
    }
  };

  const plans = [
    {
      id: 'trial',
      name: 'Trial',
      price: '$0',
      period: '14 days',
      features: ['Up to 50 trades', 'Basic analytics', 'Single broker connection', 'Email support'],
      accent: false,
      popular: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$19',
      period: '/month',
      features: ['Unlimited trades', 'Advanced analytics', 'All broker connections', 'Priority support', 'Export to CSV', 'Custom tags'],
      accent: true,
      popular: true,
    },
    {
      id: 'elite',
      name: 'Elite',
      price: '$24',
      period: '/month',
      features: ['Everything in Pro', 'AI trade insights', 'Team collaboration', 'API access', 'Custom dashboards', 'Dedicated account manager'],
      accent: false,
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-bg-page">
      {/* Header */}
      <header className="border-b border-border bg-bg-surface">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md" />
            <span className="text-text-primary font-semibold text-[15px] tracking-[3px] uppercase">RR Metrics</span>
          </div>
          <a href="/trades" className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm transition-colors">
            <Icons.ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </a>
        </div>
      </header>

      <main className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Success Banner */}
          {success && (
            <div className="mb-8 p-4 bg-positive/10 border border-positive/30 rounded-lg flex items-center gap-3">
              <Icons.CheckCircle className="w-5 h-5 text-positive flex-shrink-0" />
              <div>
                <p className="text-text-primary font-semibold text-sm">Payment successful!</p>
                <p className="text-text-secondary text-sm">Your subscription is now active. Enjoy your upgraded plan.</p>
              </div>
            </div>
          )}

          {/* Canceled Banner */}
          {canceled && (
            <div className="mb-8 p-4 bg-warning/10 border border-warning/30 rounded-lg flex items-center gap-3">
              <Icons.AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
              <div>
                <p className="text-text-primary font-semibold text-sm">Payment canceled</p>
                <p className="text-text-secondary text-sm">No charges were made. You can try again whenever you're ready.</p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-8 p-4 bg-negative/10 border border-negative/30 rounded-lg flex items-center gap-3">
              <Icons.AlertCircle className="w-5 h-5 text-negative flex-shrink-0" />
              <p className="text-text-primary text-sm">{error}</p>
            </div>
          )}

          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-text-primary">Upgrade Your Plan</h1>
            <p className="text-text-secondary mt-2 max-w-lg mx-auto">Choose the plan that fits your trading style. All plans include a 14-day money-back guarantee.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map(plan => (
              <div
                key={plan.name}
                className={`relative bg-bg-surface rounded-xl p-6 flex flex-col ${
                  plan.accent ? 'border-2 border-accent' : 'border border-border'
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
                  onClick={() => plan.id !== 'trial' && handleUpgrade(plan.id)}
                  disabled={plan.id === 'trial' || loading !== null}
                  className={`mt-6 w-full py-2.5 text-sm font-semibold rounded-lg transition-all ${
                    plan.accent
                      ? 'bg-accent text-accent-text hover:brightness-110 disabled:opacity-50'
                      : 'bg-bg-input border border-border text-text-primary hover:border-accent disabled:opacity-50'
                  }`}
                >
                  {plan.id === 'trial'
                    ? 'Current Plan'
                    : loading === plan.id
                      ? 'Redirecting...'
                      : `Get ${plan.name}`}
                </button>
              </div>
            ))}
          </div>

          <p className="text-center text-text-muted text-xs mt-8">14-day money-back guarantee on all paid plans. Cancel anytime.</p>
        </div>
      </main>
    </div>
  );
};

const init = () => {
  const root = createRoot(document.getElementById('content'));
  root.render(<App />);
};

window.onload = init;
