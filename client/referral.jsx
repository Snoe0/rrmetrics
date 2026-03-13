const React = require('react');
const { useState, useEffect, useCallback } = React;
const { createRoot } = require('react-dom/client');
require('./styles/globals.css');
const { supabase, authFetch } = require('./helper');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt$ = (cents) => `$${(cents / 100).toFixed(2)}`;

const StatusBadge = ({ status }) => {
  const styles = {
    pending_transfer: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    completed: 'bg-positive/20 text-positive border-positive/40',
    failed: 'bg-negative/20 text-negative border-negative/40',
    pending_approval: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    approved: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    rejected: 'bg-negative/20 text-negative border-negative/40',
  };
  const labels = {
    pending_transfer: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
    pending_approval: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${styles[status] || 'bg-bg-input text-text-secondary border-border'}`}>
      {labels[status] || status}
    </span>
  );
};

// ─── Sections ─────────────────────────────────────────────────────────────────

const ReferralLinkSection = ({ code, link, onGenerate, generating }) => (
  <div className="bg-bg-surface border border-border rounded-xl p-6">
    <h2 className="text-text-primary font-semibold text-sm mb-1">Your Referral Link</h2>
    <p className="text-text-secondary text-xs mb-4">
      Share this link. You earn 15% commission on every payment your referred users make — recurring.
    </p>
    {link ? (
      <div className="flex gap-2 items-center">
        <input
          type="text"
          readOnly
          value={link}
          className="flex-1 px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm font-mono"
        />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(link)}
          className="px-4 py-2 bg-accent text-accent-text rounded-lg text-sm font-semibold hover:brightness-110 transition-all"
        >
          Copy
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className="px-5 py-2 bg-accent text-accent-text rounded-lg text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
      >
        {generating ? 'Generating...' : 'Generate Referral Link'}
      </button>
    )}
  </div>
);

const StatsSection = ({ stats }) => {
  const items = [
    { label: 'Total Referred', value: stats.total },
    { label: 'Subscribed', value: stats.subscribed },
    { label: 'Commissions Earned', value: stats.completed },
  ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((item) => (
        <div key={item.label} className="bg-bg-surface border border-border rounded-xl p-5 text-center">
          <div className="text-text-secondary text-xs uppercase tracking-wider mb-1">{item.label}</div>
          <div className="text-text-primary font-mono text-3xl font-bold">{item.value}</div>
        </div>
      ))}
    </div>
  );
};

const BalanceSection = ({ balance }) => (
  <div className="bg-bg-surface border border-border rounded-xl p-6">
    <h2 className="text-text-primary font-semibold text-sm mb-4">Commission Balance</h2>
    <div className="grid grid-cols-3 gap-4">
      <div>
        <div className="text-text-secondary text-xs mb-1">Total Earned</div>
        <div className="text-positive font-mono text-2xl font-bold">{fmt$(balance.earnedCents)}</div>
      </div>
      <div>
        <div className="text-text-secondary text-xs mb-1">Pending</div>
        <div className="text-yellow-400 font-mono text-2xl font-bold">{fmt$(balance.reservedCents)}</div>
      </div>
      <div>
        <div className="text-text-secondary text-xs mb-1">Available</div>
        <div className="text-text-primary font-mono text-2xl font-bold">{fmt$(balance.availableCents)}</div>
      </div>
    </div>
    <p className="text-text-muted text-xs mt-3">
      Rate: 15% recurring on every payment from referred users. Minimum $25 to cash out. Commissions become available 14 days after earning.
    </p>
  </div>
);

const ConnectSection = ({ connectAccountId, connectOnboarded, onConnect, onVerify, connecting }) => {
  if (!connectAccountId) {
    return (
      <div className="bg-bg-surface border border-border rounded-xl p-6">
        <h2 className="text-text-primary font-semibold text-sm mb-1">Bank Account</h2>
        <p className="text-text-secondary text-xs mb-4">
          Connect your bank account via Stripe to receive cash payouts.
        </p>
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          className="px-5 py-2 bg-accent text-accent-text rounded-lg text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
        >
          {connecting ? 'Redirecting...' : 'Connect Your Bank Account'}
        </button>
      </div>
    );
  }

  if (!connectOnboarded) {
    return (
      <div className="bg-bg-surface border border-border rounded-xl p-6">
        <h2 className="text-text-primary font-semibold text-sm mb-1">Bank Account</h2>
        <p className="text-yellow-400 text-xs mb-4">
          Your account setup is incomplete. Complete it to receive payouts.
        </p>
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting}
          className="px-5 py-2 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-lg text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
        >
          {connecting ? 'Redirecting...' : 'Complete Account Setup'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-6">
      <h2 className="text-text-primary font-semibold text-sm mb-1">Bank Account</h2>
      <div className="flex items-center gap-2 mt-2">
        <span className="w-2 h-2 rounded-full bg-positive inline-block"></span>
        <span className="text-positive text-sm font-semibold">Connected</span>
      </div>
    </div>
  );
};

const PayoutSection = ({ balance, connectOnboarded, onPayout, payingOut }) => {
  const [amount, setAmount] = useState('');
  const available = balance.availableCents;
  const canRequest = connectOnboarded && available >= 2500;

  const handleSubmit = (e) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    onPayout(cents);
  };

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-6">
      <h2 className="text-text-primary font-semibold text-sm mb-1">Request Cash Out</h2>
      {!connectOnboarded && (
        <p className="text-text-secondary text-xs mb-2">Connect your bank account to request a payout.</p>
      )}
      {connectOnboarded && available < 2500 && (
        <p className="text-text-secondary text-xs mb-2">
          Minimum balance of $25.00 required. You have {fmt$(available)}.
        </p>
      )}
      {canRequest && (
        <form onSubmit={handleSubmit} className="flex gap-2 items-center mt-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="25"
              max={(available / 100).toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={(available / 100).toFixed(2)}
              className="pl-7 pr-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm w-36"
              required
            />
          </div>
          <button
            type="submit"
            disabled={payingOut}
            className="px-5 py-2 bg-positive/20 border border-positive/40 text-positive rounded-lg text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {payingOut ? 'Processing...' : 'Cash Out'}
          </button>
        </form>
      )}
    </div>
  );
};

const PayoutHistorySection = ({ history }) => {
  if (!history.length) return null;

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-6">
      <h2 className="text-text-primary font-semibold text-sm mb-4">Payout History</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-secondary text-xs uppercase tracking-wider border-b border-border">
              <th className="pb-3 pr-4">Date</th>
              <th className="pb-3 pr-4">Amount</th>
              <th className="pb-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.id} className="border-b border-border/50 last:border-0">
                <td className="py-3 pr-4 text-text-secondary font-mono text-xs">
                  {new Date(row.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 pr-4 text-text-primary font-mono font-semibold">
                  {fmt$(row.amount_cents)}
                </td>
                <td className="py-3">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────

const App = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [code, setCode] = useState(null);
  const [link, setLink] = useState(null);
  const [stats, setStats] = useState({ total: 0, subscribed: 0, completed: 0 });
  const [balance, setBalance] = useState({
    earnedCents: 0,
    reservedCents: 0,
    availableCents: 0,
    connectAccountId: null,
    connectOnboarded: false,
    payoutHistory: [],
  });

  const [generating, setGenerating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [payingOut, setPayingOut] = useState(false);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const [referralRes, balanceRes] = await Promise.all([
        authFetch('/api/referral'),
        authFetch('/api/referral/balance'),
      ]);
      const [referralData, balanceData] = await Promise.all([
        referralRes.json(),
        balanceRes.json(),
      ]);

      if (referralData.code) setCode(referralData.code);
      if (referralData.link) setLink(referralData.link);
      if (referralData.stats) setStats(referralData.stats);
      if (!balanceData.error) setBalance(balanceData);
    } catch {
      setError('Failed to load referral data.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Check for Stripe Connect redirect on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.href = '/login';
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const connectStatus = params.get('connect');

      if (connectStatus === 'success') {
        // Verify onboarding
        authFetch('/api/referral/connect/verify')
          .then((r) => r.json())
          .then((data) => {
            if (data.onboarded) showToast('Bank account connected successfully!');
            else showToast('Setup incomplete — please try again.', true);
            window.history.replaceState({}, '', '/referral');
            loadData();
          })
          .catch(() => { loadData(); });
      } else if (connectStatus === 'refresh') {
        showToast('Stripe setup was interrupted. Please try again.', true);
        window.history.replaceState({}, '', '/referral');
        loadData();
      } else {
        loadData();
      }
    });
  }, [loadData]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await authFetch('/api/referral/generate', { method: 'POST' });
      const data = await res.json();
      if (data.code) {
        setCode(data.code);
        setLink(data.link);
      }
    } catch {
      showToast('Failed to generate referral link.', true);
    } finally {
      setGenerating(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await authFetch('/api/referral/connect', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error || 'Failed to start account setup.', true);
        setConnecting(false);
      }
    } catch {
      showToast('Failed to connect bank account.', true);
      setConnecting(false);
    }
  };

  const handlePayout = async (amountCents) => {
    setPayingOut(true);
    try {
      const res = await authFetch('/api/referral/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: amountCents }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Payout sent! Funds are on the way to your bank account.');
        loadData();
      } else {
        showToast(data.error || 'Payout failed. Please try again.', true);
      }
    } catch {
      showToast('Payout failed. Please try again.', true);
    } finally {
      setPayingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-page">
        <div className="text-text-secondary text-sm">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-page">
        <div className="text-negative text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-page py-10">
      <div className="max-w-2xl mx-auto px-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-text-primary font-bold text-xl">Referral Program</h1>
            <p className="text-text-secondary text-xs mt-1">
              Earn real cash for every subscriber you refer.
            </p>
          </div>
          <a
            href="/trades"
            className="text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            ← Dashboard
          </a>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`px-4 py-3 rounded-xl border text-sm ${
            toast.isError
              ? 'bg-negative/10 border-negative/40 text-negative'
              : 'bg-positive/10 border-positive/40 text-positive'
          }`}>
            {toast.msg}
          </div>
        )}

        <ReferralLinkSection
          code={code}
          link={link}
          onGenerate={handleGenerate}
          generating={generating}
        />

        <StatsSection stats={stats} />

        <BalanceSection balance={balance} />

        <ConnectSection
          connectAccountId={balance.connectAccountId}
          connectOnboarded={balance.connectOnboarded}
          onConnect={handleConnect}
          connecting={connecting}
        />

        <PayoutSection
          balance={balance}
          connectOnboarded={balance.connectOnboarded}
          onPayout={handlePayout}
          payingOut={payingOut}
        />

        <PayoutHistorySection history={balance.payoutHistory || []} />
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
