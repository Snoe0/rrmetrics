const React = require('react');
const { useState, useEffect, useRef } = React;
const helper = require('../../helper.js');
const { authFetch } = helper;
const Icons = require('../shared/Icons');

const PAYOUT_MIN_CENTS = 1500;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

// Dynamically load Stripe.js if not already present
function loadStripeJs() {
  return new Promise((resolve) => {
    if (window.Stripe) return resolve(window.Stripe);
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => resolve(window.Stripe);
    document.head.appendChild(script);
  });
}

const ReferralPage = ({ userRole, userEmail }) => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [code, setCode] = useState(null);
  const [link, setLink] = useState(null);
  const [stats, setStats] = useState({ total: 0, subscribed: 0, completed: 0 });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  // Balance & payout state
  const [balance, setBalance] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [connectLoading, setConnectLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState(null);

  // Bank setup form state
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [setupForm, setSetupForm] = useState({
    firstName: '', lastName: '',
    dobMonth: '', dobDay: '', dobYear: '',
    ssnLast4: '',
    line1: '', line2: '', city: '', state: '', postalCode: '',
    routingNumber: '', accountNumber: '',
  });
  const [publishableKey, setPublishableKey] = useState(null);

  useEffect(() => {
    Promise.all([
      authFetch('/api/referral').then(r => r.json()),
      authFetch('/api/referral/balance').then(r => r.json()).catch(() => null),
    ]).then(([referralData, balanceData]) => {
      if (referralData.code) setCode(referralData.code);
      if (referralData.link) setLink(referralData.link);
      if (referralData.stats) setStats(referralData.stats);
      if (balanceData) {
        setBalance(balanceData);
        if (balanceData.payoutHistory) setPayoutHistory(balanceData.payoutHistory);
      }
    }).catch(() => setError('Failed to load referral data.'))
      .finally(() => setLoading(false));

    // Fetch Stripe publishable key
    fetch('/api/stripe/config').then(r => r.json()).then(d => {
      if (d.publishableKey) setPublishableKey(d.publishableKey);
    }).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await authFetch('/api/referral/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate code.');
      } else {
        setCode(data.code);
        setLink(data.link);
      }
    } catch {
      setError('Failed to generate code.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const updateForm = (field, value) => {
    setSetupForm(prev => ({ ...prev, [field]: value }));
  };

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    if (!publishableKey) { setError('Stripe is not configured.'); return; }
    setConnectLoading(true);
    setError(null);

    try {
      // Load Stripe.js and tokenize bank account
      const StripeFn = await loadStripeJs();
      const stripe = StripeFn(publishableKey);

      const { token, error: tokenError } = await stripe.createToken('bank_account', {
        country: 'US',
        currency: 'usd',
        routing_number: setupForm.routingNumber,
        account_number: setupForm.accountNumber,
        account_holder_name: `${setupForm.firstName} ${setupForm.lastName}`,
        account_holder_type: 'individual',
      });

      if (tokenError) {
        setError(tokenError.message);
        setConnectLoading(false);
        return;
      }

      // Submit to backend
      const res = await authFetch('/api/referral/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: setupForm.firstName,
          lastName: setupForm.lastName,
          dobYear: setupForm.dobYear,
          dobMonth: setupForm.dobMonth,
          dobDay: setupForm.dobDay,
          ssnLast4: setupForm.ssnLast4,
          address: {
            line1: setupForm.line1,
            line2: setupForm.line2,
            city: setupForm.city,
            state: setupForm.state,
            postalCode: setupForm.postalCode,
          },
          bankToken: token.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to set up payout account.');
      } else {
        setBalance(prev => prev ? { ...prev, connectOnboarded: data.onboarded } : prev);
        setShowSetupForm(false);
        if (data.onboarded) {
          setPayoutSuccess('Bank account connected successfully!');
        }
      }
    } catch (err) {
      setError('Failed to set up payout account.');
    } finally {
      setConnectLoading(false);
    }
  };

  const handleCashout = async () => {
    if (!balance || balance.availableCents < PAYOUT_MIN_CENTS) return;
    setPayoutLoading(true);
    setError(null);
    setPayoutSuccess(null);
    try {
      const res = await authFetch('/api/referral/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: balance.availableCents }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Payout failed. Please try again.');
      } else {
        setPayoutSuccess(`$${(balance.availableCents / 100).toFixed(2)} sent to your bank account!`);
        const balRes = await authFetch('/api/referral/balance');
        const balData = await balRes.json();
        if (balData) {
          setBalance(balData);
          if (balData.payoutHistory) setPayoutHistory(balData.payoutHistory);
        }
      }
    } catch {
      setError('Payout failed. Please try again.');
    } finally {
      setPayoutLoading(false);
    }
  };

  const fmtCents = (cents) => `$${(cents / 100).toFixed(2)}`;

  const statusColors = {
    completed: 'text-positive',
    pending_transfer: 'text-warning',
    failed: 'text-negative',
  };

  const statusLabels = {
    completed: 'Completed',
    pending_transfer: 'Processing',
    pending_approval: 'Pending',
    failed: 'Failed',
  };

  const inputClass = 'w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent';
  const labelClass = 'block text-text-secondary text-xs font-medium mb-1';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">Refer &amp; Earn</h1>
        <p className="text-text-secondary text-sm">Earn 15% recurring commission on every referral's subscription.</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-negative/10 border border-negative/20 rounded-lg text-negative text-sm">
          {error}
        </div>
      )}

      {payoutSuccess && (
        <div className="mb-6 p-3 bg-positive/10 border border-positive/20 rounded-lg text-positive text-sm">
          {payoutSuccess}
        </div>
      )}

      {/* How it works */}
      <div className="bg-bg-surface border border-border rounded-xl p-6 mb-6">
        <h2 className="text-text-primary font-semibold text-sm mb-4">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: '1', text: 'Share your unique referral link with friends' },
            { step: '2', text: 'They get 15% off their first month when they subscribe' },
            { step: '3', text: 'You earn 15% of their subscription — every month they stay' },
          ].map(({ step, text }) => (
            <div key={step} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {step}
              </div>
              <p className="text-text-secondary text-sm">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Referral link / generate */}
      <div className="bg-bg-surface border border-border rounded-xl p-6 mb-6">
        {code ? (
          <>
            <h2 className="text-text-primary font-semibold text-sm mb-1">Your referral link</h2>
            <p className="text-text-muted text-xs mb-4">
              Anyone who signs up with this link gets <span className="text-positive font-medium">15% off their first month</span>.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2.5 font-mono text-sm text-text-secondary overflow-x-auto whitespace-nowrap">
                {link}
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-medium rounded-lg hover:brightness-110 transition-all whitespace-nowrap"
              >
                {copied ? <Icons.Check className="w-4 h-4" /> : <Icons.Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-text-muted text-xs mt-3">Your code: <span className="font-mono text-text-secondary">{code}</span></p>
          </>
        ) : (
          <>
            <h2 className="text-text-primary font-semibold text-sm mb-1">Get your referral link</h2>
            <p className="text-text-secondary text-sm mb-4">
              Generate a unique link to share with friends. A link is only created when you ask for one.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              <Icons.Gift className="w-4 h-4" />
              {generating ? 'Generating...' : 'Generate My Referral Link'}
            </button>
          </>
        )}
      </div>

      {/* Earnings & Stats — only show once a code exists */}
      {code && (
        <>
          {/* Earnings overview */}
          {balance && (
            <div className="bg-bg-surface border border-border rounded-xl p-6 mb-6">
              <h2 className="text-text-primary font-semibold text-sm mb-4">Earnings</h2>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="text-center p-3 bg-bg-input rounded-lg border border-border">
                  <div className="text-2xl font-bold font-mono text-text-primary">{fmtCents(balance.earnedCents)}</div>
                  <div className="text-text-muted text-xs mt-1">Total Earned</div>
                </div>
                <div className="text-center p-3 bg-bg-input rounded-lg border border-border">
                  <div className="text-2xl font-bold font-mono text-positive">{fmtCents(balance.availableCents)}</div>
                  <div className="text-text-muted text-xs mt-1">Available</div>
                </div>
                <div className="text-center p-3 bg-bg-input rounded-lg border border-border">
                  <div className="text-2xl font-bold font-mono text-warning">{fmtCents(balance.pendingCents || 0)}</div>
                  <div className="text-text-muted text-xs mt-1">Pending</div>
                </div>
              </div>

              {(balance.pendingCents || 0) > 0 && (
                <p className="text-text-muted text-xs mb-4">
                  {fmtCents(balance.pendingCents)} is pending until the billing period ends (~30 days).
                </p>
              )}

              {/* Connect / Cashout */}
              {!balance.connectOnboarded ? (
                <div className="border-t border-border pt-4">
                  {!showSetupForm ? (
                    <>
                      <p className="text-text-secondary text-sm mb-3">
                        Connect your bank account to cash out your earnings.
                      </p>
                      <button
                        onClick={() => setShowSetupForm(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
                      >
                        <Icons.Zap className="w-4 h-4" />
                        Set Up Payouts
                      </button>
                    </>
                  ) : (
                    <form onSubmit={handleConnectSubmit} className="space-y-4">
                      <h3 className="text-text-primary font-semibold text-sm">Set Up Bank Account</h3>
                      <p className="text-text-muted text-xs">Your information is securely processed by Stripe. We never store your bank details.</p>

                      {/* Name */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>First Name</label>
                          <input type="text" required value={setupForm.firstName} onChange={e => updateForm('firstName', e.target.value)} className={inputClass} placeholder="John" />
                        </div>
                        <div>
                          <label className={labelClass}>Last Name</label>
                          <input type="text" required value={setupForm.lastName} onChange={e => updateForm('lastName', e.target.value)} className={inputClass} placeholder="Doe" />
                        </div>
                      </div>

                      {/* DOB */}
                      <div>
                        <label className={labelClass}>Date of Birth</label>
                        <div className="grid grid-cols-3 gap-2">
                          <input type="number" required min="1" max="12" value={setupForm.dobMonth} onChange={e => updateForm('dobMonth', e.target.value)} className={inputClass} placeholder="MM" />
                          <input type="number" required min="1" max="31" value={setupForm.dobDay} onChange={e => updateForm('dobDay', e.target.value)} className={inputClass} placeholder="DD" />
                          <input type="number" required min="1900" max={new Date().getFullYear() - 18} value={setupForm.dobYear} onChange={e => updateForm('dobYear', e.target.value)} className={inputClass} placeholder="YYYY" />
                        </div>
                      </div>

                      {/* SSN Last 4 */}
                      <div>
                        <label className={labelClass}>Last 4 of SSN</label>
                        <input type="text" required maxLength={4} pattern="\d{4}" value={setupForm.ssnLast4} onChange={e => updateForm('ssnLast4', e.target.value.replace(/\D/g, '').slice(0, 4))} className={inputClass + ' max-w-[120px]'} placeholder="1234" />
                      </div>

                      {/* Address */}
                      <div>
                        <label className={labelClass}>Address</label>
                        <input type="text" required value={setupForm.line1} onChange={e => updateForm('line1', e.target.value)} className={inputClass + ' mb-2'} placeholder="Street address" />
                        <input type="text" value={setupForm.line2} onChange={e => updateForm('line2', e.target.value)} className={inputClass + ' mb-2'} placeholder="Apt, suite, etc. (optional)" />
                        <div className="grid grid-cols-3 gap-2">
                          <input type="text" required value={setupForm.city} onChange={e => updateForm('city', e.target.value)} className={inputClass} placeholder="City" />
                          <select required value={setupForm.state} onChange={e => updateForm('state', e.target.value)} className={inputClass}>
                            <option value="">State</option>
                            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <input type="text" required maxLength={5} pattern="\d{5}" value={setupForm.postalCode} onChange={e => updateForm('postalCode', e.target.value.replace(/\D/g, '').slice(0, 5))} className={inputClass} placeholder="ZIP" />
                        </div>
                      </div>

                      {/* Bank details */}
                      <div>
                        <label className={labelClass}>Bank Account</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" required maxLength={9} pattern="\d{9}" value={setupForm.routingNumber} onChange={e => updateForm('routingNumber', e.target.value.replace(/\D/g, '').slice(0, 9))} className={inputClass} placeholder="Routing number" />
                          <input type="text" required value={setupForm.accountNumber} onChange={e => updateForm('accountNumber', e.target.value.replace(/\D/g, ''))} className={inputClass} placeholder="Account number" />
                        </div>
                      </div>

                      {/* TOS */}
                      <p className="text-text-muted text-xs">
                        By submitting, you agree to the <a href="https://stripe.com/connect-account/legal/full" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Stripe Connected Account Agreement</a>.
                      </p>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={connectLoading}
                          className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                        >
                          {connectLoading ? 'Connecting...' : 'Connect Bank Account'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSetupForm(false)}
                          className="px-4 py-2.5 text-text-secondary text-sm rounded-lg hover:bg-bg-input transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-text-secondary text-sm">
                        {balance.availableCents >= PAYOUT_MIN_CENTS
                          ? `${fmtCents(balance.availableCents)} ready to cash out.`
                          : `Minimum cashout is ${fmtCents(PAYOUT_MIN_CENTS)}. You need ${fmtCents(PAYOUT_MIN_CENTS - balance.availableCents)} more.`
                        }
                      </p>
                    </div>
                    <button
                      onClick={handleCashout}
                      disabled={payoutLoading || balance.availableCents < PAYOUT_MIN_CENTS}
                      className="flex items-center gap-2 px-4 py-2.5 bg-positive text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50 whitespace-nowrap"
                    >
                      <Icons.DollarSign className="w-4 h-4" />
                      {payoutLoading ? 'Processing...' : `Cash Out ${fmtCents(balance.availableCents)}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Referral stats */}
          <div className="bg-bg-surface border border-border rounded-xl p-6 mb-6">
            <h2 className="text-text-primary font-semibold text-sm mb-4">Referral Stats</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Referred', value: stats.total },
                { label: 'Subscribed', value: stats.subscribed },
                { label: 'Earning From', value: stats.completed },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-3 bg-bg-input rounded-lg border border-border">
                  <div className="text-2xl font-bold font-mono text-text-primary">{value}</div>
                  <div className="text-text-muted text-xs mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Payout history */}
          {payoutHistory.length > 0 && (
            <div className="bg-bg-surface border border-border rounded-xl p-6">
              <h2 className="text-text-primary font-semibold text-sm mb-4">Payout History</h2>
              <div className="space-y-2">
                {payoutHistory.map(payout => (
                  <div key={payout.id} className="flex items-center justify-between p-3 bg-bg-input rounded-lg border border-border">
                    <div>
                      <p className="text-sm text-text-primary font-medium">{fmtCents(payout.amount_cents)}</p>
                      <p className="text-xs text-text-muted">
                        {new Date(payout.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <span className={`text-xs font-medium ${statusColors[payout.status] || 'text-text-muted'}`}>
                      {statusLabels[payout.status] || payout.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

module.exports = ReferralPage;
