const React = require('react');
const { useState, useEffect } = React;
const helper = require('../../helper.js');
const { authFetch } = helper;
const Icons = require('../shared/Icons');

const PAYOUT_MIN_CENTS = 1500;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const ReferralPage = () => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [code, setCode] = useState(null);
  const [link, setLink] = useState(null);
  const [stats, setStats] = useState({ total: 0, subscribed: 0, completed: 0 });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [editingCode, setEditingCode] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);

  // Balance & payout state
  const [balance, setBalance] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [connectLoading, setConnectLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState(null);
  const [redeemLoading, setRedeemLoading] = useState(false);

  // Bank setup form state
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [setupForm, setSetupForm] = useState({
    firstName: '', lastName: '',
    routingNumber: '', accountNumber: '', accountType: 'CHECKING',
    line1: '', line2: '', city: '', state: '', postalCode: '',
  });

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

  const handleSaveCustomCode = async () => {
    setSavingCode(true);
    setError(null);
    try {
      const res = await authFetch('/api/referral/customize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: customCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to set code.');
      } else {
        setCode(data.code);
        setLink(data.link);
        setEditingCode(false);
        setCustomCode('');
      }
    } catch {
      setError('Failed to set code.');
    } finally {
      setSavingCode(false);
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
    setConnectLoading(true);
    setError(null);

    try {
      const res = await authFetch('/api/referral/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: setupForm.firstName,
          lastName: setupForm.lastName,
          accountType: setupForm.accountType,
          routingNumber: setupForm.routingNumber,
          accountNumber: setupForm.accountNumber,
          address: {
            line1: setupForm.line1,
            line2: setupForm.line2,
            city: setupForm.city,
            state: setupForm.state,
            postalCode: setupForm.postalCode,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to set up payout account.');
      } else {
        setBalance(prev => prev ? { ...prev, connectOnboarded: true } : prev);
        setShowSetupForm(false);
        setPayoutSuccess('Bank account connected successfully!');
      }
    } catch {
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
        setError(data.error || 'Payout request failed. Please try again.');
      } else {
        setPayoutSuccess(`Payout of $${(balance.availableCents / 100).toFixed(2)} requested! It will be processed within 1-2 business days.`);
        const balRes = await authFetch('/api/referral/balance');
        const balData = await balRes.json();
        if (balData) {
          setBalance(balData);
          if (balData.payoutHistory) setPayoutHistory(balData.payoutHistory);
        }
      }
    } catch {
      setError('Payout request failed. Please try again.');
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleRedeemCredit = async () => {
    if (redeemLoading) return;
    if (!window.confirm('Redeem your earnings for one free month of subscription? This will deduct one month\'s subscription cost from your available balance and apply it as a credit on your next invoice.')) return;
    setRedeemLoading(true);
    setError(null);
    setPayoutSuccess(null);
    try {
      const res = await authFetch('/api/referral/redeem-credit', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to redeem credit.');
      } else {
        setPayoutSuccess(`Success! ${fmtCents(data.creditCents)} credit applied to your next invoice — that's one free month.`);
        const balRes = await authFetch('/api/referral/balance');
        const balData = await balRes.json();
        if (balData) {
          setBalance(balData);
          if (balData.payoutHistory) setPayoutHistory(balData.payoutHistory);
        }
      }
    } catch {
      setError('Failed to redeem credit.');
    } finally {
      setRedeemLoading(false);
    }
  };

  const fmtCents = (cents) => `$${(cents / 100).toFixed(2)}`;

  const statusColors = {
    completed: 'text-positive',
    pending_transfer: 'text-warning',
    pending_approval: 'text-warning',
    failed: 'text-negative',
  };

  const statusLabels = {
    completed: 'Completed',
    pending_transfer: 'Processing',
    pending_approval: 'Pending Approval',
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
            <div className="flex items-center justify-between mt-3 gap-2">
              <p className="text-text-muted text-xs">Your code: <span className="font-mono text-text-secondary">{code}</span></p>
              {!editingCode && stats.total === 0 && (
                <button
                  onClick={() => { setEditingCode(true); setCustomCode(code); }}
                  className="text-xs text-accent hover:brightness-110"
                >
                  Customize
                </button>
              )}
              {stats.total > 0 && (
                <span className="text-xs text-text-muted">Locked — in use by referrals</span>
              )}
            </div>
            {editingCode && (
              <div className="mt-3 p-3 bg-bg-input border border-border rounded-lg">
                <label className="block text-text-secondary text-xs font-medium mb-1">Custom code (4-20 chars, letters/numbers/dashes)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    className="flex-1 bg-bg-page border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
                    placeholder="YOURCODE"
                  />
                  <button
                    onClick={handleSaveCustomCode}
                    disabled={savingCode || !customCode.trim()}
                    className="px-3 py-2 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 disabled:opacity-50"
                  >
                    {savingCode ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingCode(false); setCustomCode(''); setError(null); }}
                    className="px-3 py-2 bg-bg-page border border-border text-text-secondary text-xs rounded-lg hover:brightness-110"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="text-text-primary font-semibold text-sm mb-1">Get your referral link</h2>
            <p className="text-text-secondary text-sm mb-4">
              Generate a unique link to share with friends. A link is only created when you ask for one.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
              >
                <Icons.Gift className="w-4 h-4" />
                {generating ? 'Generating...' : 'Generate My Referral Link'}
              </button>
              {!editingCode && (
                <button
                  onClick={() => { setEditingCode(true); setCustomCode(''); }}
                  className="px-4 py-2.5 border border-border text-text-secondary text-sm rounded-lg hover:brightness-110"
                >
                  Choose custom code
                </button>
              )}
            </div>
            {editingCode && (
              <div className="mt-3 p-3 bg-bg-input border border-border rounded-lg">
                <label className="block text-text-secondary text-xs font-medium mb-1">Custom code (4-20 chars, letters/numbers/dashes)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    className="flex-1 bg-bg-page border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
                    placeholder="YOURCODE"
                  />
                  <button
                    onClick={handleSaveCustomCode}
                    disabled={savingCode || !customCode.trim()}
                    className="px-3 py-2 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 disabled:opacity-50"
                  >
                    {savingCode ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingCode(false); setCustomCode(''); setError(null); }}
                    className="px-3 py-2 bg-bg-page border border-border text-text-secondary text-xs rounded-lg hover:brightness-110"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
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
                      <p className="text-text-muted text-xs">Payouts are sent via ACH direct deposit to your bank account.</p>

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

                      {/* Bank details */}
                      <div>
                        <label className={labelClass}>Bank Account</label>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <input type="text" required maxLength={9} pattern="\d{9}" value={setupForm.routingNumber} onChange={e => updateForm('routingNumber', e.target.value.replace(/\D/g, '').slice(0, 9))} className={inputClass} placeholder="Routing number (9 digits)" />
                          <input type="text" required value={setupForm.accountNumber} onChange={e => updateForm('accountNumber', e.target.value.replace(/\D/g, ''))} className={inputClass} placeholder="Account number" />
                        </div>
                        <select value={setupForm.accountType} onChange={e => updateForm('accountType', e.target.value)} className={inputClass + ' max-w-[200px]'}>
                          <option value="CHECKING">Checking</option>
                          <option value="SAVINGS">Savings</option>
                        </select>
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
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-text-secondary text-sm">
                        {balance.availableCents >= PAYOUT_MIN_CENTS
                          ? `${fmtCents(balance.availableCents)} ready to cash out.`
                          : `Minimum cashout is ${fmtCents(PAYOUT_MIN_CENTS)}. You need ${fmtCents(PAYOUT_MIN_CENTS - balance.availableCents)} more.`
                        }
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={handleRedeemCredit}
                        disabled={redeemLoading || balance.availableCents <= 0}
                        title="Apply your earnings as credit toward your next invoice"
                        className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50 whitespace-nowrap"
                      >
                        <Icons.Gift className="w-4 h-4" />
                        {redeemLoading ? 'Redeeming...' : 'Redeem Free Month'}
                      </button>
                      <button
                        onClick={handleCashout}
                        disabled={payoutLoading || balance.availableCents < PAYOUT_MIN_CENTS}
                        className="flex items-center gap-2 px-4 py-2.5 bg-positive text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50 whitespace-nowrap"
                      >
                        <Icons.DollarSign className="w-4 h-4" />
                        {payoutLoading ? 'Requesting...' : `Cash Out ${fmtCents(balance.availableCents)}`}
                      </button>
                    </div>
                  </div>
                  <p className="text-text-muted text-xs mt-2">
                    Don't want to wait for a payout? Redeem your earnings as a credit on your next subscription invoice.
                  </p>
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
