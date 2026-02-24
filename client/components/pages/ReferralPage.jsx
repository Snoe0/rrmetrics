const React = require('react');
const { useState, useEffect } = React;
const helper = require('../../helper.js');
const { authFetch } = helper;
const Icons = require('../shared/Icons');

const ReferralPage = () => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [code, setCode] = useState(null);
  const [link, setLink] = useState(null);
  const [stats, setStats] = useState({ total: 0, subscribed: 0, completed: 0 });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    authFetch('/api/referral')
      .then((r) => r.json())
      .then((data) => {
        if (data.code) setCode(data.code);
        if (data.link) setLink(data.link);
        if (data.stats) setStats(data.stats);
      })
      .catch(() => setError('Failed to load referral data.'))
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

  const handleCopy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
        <p className="text-text-secondary text-sm">Share RR Metrics and earn free months.</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-negative/10 border border-negative/20 rounded-lg text-negative text-sm">
          {error}
        </div>
      )}

      {/* How it works */}
      <div className="bg-bg-surface border border-border rounded-xl p-6 mb-6">
        <h2 className="text-text-primary font-semibold text-sm mb-4">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: '1', text: 'Generate your unique referral link below' },
            { step: '2', text: 'A friend signs up with your link — they get 15% off their first month' },
            { step: '3', text: 'After 3 friends complete their first billing cycle, you earn a free month' },
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

      {/* Stats — only show once a code exists */}
      {code && (
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h2 className="text-text-primary font-semibold text-sm mb-4">Your stats</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Referred', value: stats.total },
              { label: 'Subscribed', value: stats.subscribed },
              { label: 'First month done', value: stats.completed },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-3 bg-bg-input rounded-lg border border-border">
                <div className="text-2xl font-bold font-mono text-text-primary">{value}</div>
                <div className="text-text-muted text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-text-muted text-xs mt-4">
            Every 3 friends who complete their first billing cycle earns you 1 free month, applied automatically at your next renewal.
          </p>
        </div>
      )}
    </div>
  );
};

module.exports = ReferralPage;
