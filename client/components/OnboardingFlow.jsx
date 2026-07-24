const React = require('react');
const { useState, useEffect, useRef } = React;
const { authFetch } = require('../helper');
const Icons = require('./shared/Icons');

const EXPERIENCE_LEVELS = [
  { id: 'beginner', label: 'Beginner', desc: 'Just getting started', icon: Icons.Target },
  { id: 'intermediate', label: 'Intermediate', desc: 'Some experience', icon: Icons.TrendingUp },
  { id: 'advanced', label: 'Advanced', desc: 'Seasoned trader', icon: Icons.Zap },
];

// ── Page Components ──────────────────────────────────────────────

const WelcomePage = ({ onSelect }) => (
  <div className="onboard-page-content">
    <div className="mb-6">
      <h1 className="text-4xl font-bold mb-1">
        <span className="text-accent">Welcome</span>
        <span className="text-text-primary"> to RR Metrics</span>
      </h1>
      <div className="w-12 h-0.5 bg-accent mx-auto mt-3 rounded-full" />
    </div>
    <p className="text-text-secondary text-base mb-10">How experienced are you with trading?</p>
    <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
      {EXPERIENCE_LEVELS.map((level) => {
        const Icon = level.icon;
        return (
          <button
            key={level.id}
            onClick={() => onSelect(level.id)}
            className="flex items-center gap-4 px-5 py-4 bg-bg-surface border border-border rounded-xl
                       hover:border-accent/50 hover:bg-accent/5 transition-all duration-200 cursor-pointer text-left group"
          >
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
              <Icon className="w-4 h-4 text-accent" />
            </div>
            <div>
              <div className="text-text-primary font-medium text-sm group-hover:text-accent transition-colors">{level.label}</div>
              <div className="text-text-muted text-xs">{level.desc}</div>
            </div>
          </button>
        );
      })}
      <button
        onClick={() => onSelect('never')}
        className="mt-2 text-text-tertiary text-sm hover:text-text-secondary transition-colors cursor-pointer underline underline-offset-2"
      >
        I've never traded before
      </button>
    </div>
  </div>
);

const WhatWeDoPage = ({ onNext, ready }) => (
  <div className="onboard-page-content">
    <h1 className="text-3xl font-bold mb-2">
      <span className="text-text-primary">What is </span><span className="text-accent">RR Metrics</span><span className="text-text-primary">?</span>
    </h1>
    <p className="text-text-secondary text-lg mb-8 max-w-md mx-auto">
      A journaling tool for day traders to track their trades and improve based on real analytics.
    </p>
    <div className="flex flex-col gap-4 w-full max-w-sm mx-auto mb-10 text-left">
      {[
        { icon: Icons.BarChart, title: 'Track Every Trade', desc: 'Log entries, exits, P&L, and notes automatically or manually.' },
        { icon: Icons.TrendingUp, title: 'Real Analytics', desc: 'See win rate, R:R, streaks, and performance by ticker, day, or strategy.' },
        { icon: Icons.RefreshCw, title: 'Auto-Sync', desc: 'Connect your broker and trades import automatically.' },
        { icon: Icons.Target, title: 'Improve Over Time', desc: 'Spot patterns in your trading and build better habits.' },
      ].map(({ icon: Icon, title, desc }, i) => (
        <div
          key={title}
          className="flex items-start gap-3 onboard-stagger"
          style={{ animationDelay: `${i * 100 + 200}ms` }}
        >
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-accent" />
          </div>
          <div>
            <div className="text-text-primary font-medium text-sm">{title}</div>
            <div className="text-text-tertiary text-sm">{desc}</div>
          </div>
        </div>
      ))}
    </div>
    <div className={`flex flex-col items-center gap-3 transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <button onClick={onNext} className="onboard-btn-primary">Next</button>
      <a
        href="/guides/getting-started"
        target="_blank"
        rel="noreferrer"
        className="text-text-tertiary text-sm hover:text-accent transition-colors underline underline-offset-2"
      >
        Read the Quick Start Guide
      </a>
    </div>
  </div>
);

const PRIMARY_BROKERS = [
  { key: 'tradovate', label: 'Tradovate', icon: '/assets/img/tradovate.png', subtitle: 'Futures trading' },
  { key: 'webull', label: 'Webull', icon: '/assets/img/webull.svg', subtitle: 'Stocks, options & futures', comingSoon: true },
  { key: 'robinhood', label: 'Robinhood', icon: '/assets/img/robinhood.svg', subtitle: 'Stocks & options', comingSoon: true },
];

const MORE_BROKERS = [
  { key: 'ninjatrader', label: 'NinjaTrader', icon: '/assets/img/ninjatrader.jpeg', subtitle: 'Advanced charting' },
  { key: 'alpha_futures', label: 'Alpha Futures', icon: '/assets/img/alphafutures.png', subtitle: 'Prop firm' },
  { key: 'apex_trader_funding', label: 'Apex Trader Funding', icon: '/assets/img/apex.png', subtitle: 'Prop firm' },
  { key: 'tradeify', label: 'Tradeify', icon: '/assets/img/tradeify.png', subtitle: 'Prop firm' },
  { key: 'my_funded_futures', label: 'My Funded Futures', icon: '/assets/img/myfundedfutures.png', subtitle: 'Prop firm' },
  { key: 'lucid_trading', label: 'Lucid Trading', icon: '/assets/img/lucidtrading.png', subtitle: 'Prop firm' },
  { key: 'top_one_futures', label: 'Top One Futures', icon: '/assets/img/toponefutures.png', subtitle: 'Prop firm' },
  { key: 'fundednext_futures', label: 'FundedNext Futures', icon: '/assets/img/fundednext.png', subtitle: 'Prop firm' },
  { key: 'blue_guardian', label: 'Blue Guardian Futures', icon: '/assets/img/blueguardian.png', subtitle: 'Prop firm' },
  { key: 'topstep', label: 'Topstep (ProjectX)', icon: '/assets/img/topstep.png', subtitle: 'Prop firm', separate: true },
];

const ALL_ONBOARD_BROKERS = [...PRIMARY_BROKERS, ...MORE_BROKERS];

const BrokerConnectPage = ({ onNext, onSkip, ready }) => {
  const [connecting, setConnecting] = useState(false);
  const [connectingBroker, setConnectingBroker] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [environment, setEnvironment] = useState('demo');
  const [error, setError] = useState(null);
  const [showMore, setShowMore] = useState(false);

  // Check for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tvCode = params.get('tv_code');
    const tvConn = params.get('tv_conn');
    const tvBroker = params.get('tv_broker') || 'tradovate';
    if (tvCode && tvConn) {
      handleOAuthCallback(tvCode, tvConn, tvBroker);
      const url = new URL(window.location);
      url.searchParams.delete('tv_code');
      url.searchParams.delete('tv_conn');
      url.searchParams.delete('tv_broker');
      window.history.replaceState({}, '', url);
    }
  }, []);

  const handleOAuthCallback = async (code, connectionId, broker) => {
    setSyncing(true);
    setError(null);
    const brokerLabel = ALL_ONBOARD_BROKERS.find(b => b.key === broker)?.label || broker;
    try {
      const exchangeRes = await authFetch('/api/tradovate/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, connectionId }),
      });
      const exchangeData = await exchangeRes.json();
      if (exchangeData.error) throw new Error(exchangeData.error);

      await authFetch('/api/tradovate/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });

      setSyncing(false);
      setSynced(true);
      setConnectedAccounts((prev) => [...prev, { broker: brokerLabel, environment }]);
    } catch (err) {
      setSyncing(false);
      setError(err.message || 'Connection failed. You can connect later in Settings.');
    }
  };

  const handleConnect = async (brokerKey) => {
    setConnecting(true);
    setConnectingBroker(brokerKey);
    setError(null);
    try {
      const res = await authFetch('/api/tradovate/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment, broker: brokerKey }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (err) {
      setConnecting(false);
      setConnectingBroker(null);
      setError(err.message || 'Failed to start connection.');
    }
  };

  if (syncing) {
    return (
      <div className="onboard-page-content">
        <div className="flex flex-col items-center gap-4">
          <div className="onboard-sync-spinner" />
          <h2 className="text-xl font-semibold text-text-primary">Syncing your trades...</h2>
          <p className="text-text-tertiary text-sm">This may take a moment</p>
        </div>
      </div>
    );
  }

  if (synced) {
    const handleConnectAnother = () => {
      setSynced(false);
      setConnecting(false);
      setConnectingBroker(null);
      setError(null);
    };

    return (
      <div className="onboard-page-content cursor-pointer" onClick={() => { if (ready) onNext(); }}>
        <div className="w-16 h-16 rounded-full bg-positive/20 flex items-center justify-center onboard-check-pop mb-4">
          <Icons.Check className="w-8 h-8 text-positive" />
        </div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Synced!</h2>
        <p className="text-text-tertiary text-sm mb-6">Your trades have been imported</p>

        <div className="w-full max-w-xs mx-auto mb-6 space-y-2">
          {connectedAccounts.map((acct, i) => (
            <div key={i} className="flex items-center gap-2 bg-positive/5 border border-positive/20 rounded-lg px-4 py-2.5">
              <Icons.Check className="w-4 h-4 text-positive flex-shrink-0" />
              <span className="text-text-primary text-sm">{acct.broker}</span>
              <span className="text-text-muted text-xs capitalize">({acct.environment})</span>
            </div>
          ))}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); handleConnectAnother(); }}
          className="text-text-tertiary text-sm hover:text-text-secondary transition-all cursor-pointer underline underline-offset-2 mb-8"
        >
          Connect another account
        </button>

        <p className={`text-text-muted text-xs onboard-float transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}>Click anywhere to continue</p>
      </div>
    );
  }

  return (
    <div className="onboard-page-content">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-text-primary">We can </span><span className="text-accent">auto-sync</span><span className="text-text-primary"> your trades!</span>
      </h1>
      <p className="text-text-secondary text-lg mb-8">Which broker do you use?</p>

      {/* Primary broker cards */}
      <div className="w-full max-w-sm mx-auto mb-4 space-y-3">
        {PRIMARY_BROKERS.map((broker) => (
          <div key={broker.key} className={`bg-bg-surface border border-border rounded-xl p-4 ${broker.comingSoon ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={broker.icon} alt={broker.label} className="w-9 h-9 rounded-lg object-contain" />
                <div className="text-left">
                  <div className="text-text-primary font-semibold text-sm">{broker.label}</div>
                  <div className="text-text-tertiary text-xs">{broker.subtitle}</div>
                </div>
              </div>
              {broker.comingSoon ? (
                <span className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent font-medium">Coming Soon</span>
              ) : (
                <button
                  onClick={() => handleConnect(broker.key)}
                  disabled={connecting}
                  className="px-4 py-2 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {connectingBroker === broker.key ? 'Connecting...' : 'Connect'}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Show More toggle */}
        <button
          onClick={() => setShowMore(!showMore)}
          className="w-full text-center text-sm text-accent hover:text-accent/80 transition-colors cursor-pointer py-2"
        >
          {showMore ? 'Show Less' : `Show More (${MORE_BROKERS.length} more)`}
        </button>

        {/* Expanded grid of all other brokers */}
        {showMore && (
          <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {MORE_BROKERS.map((broker) => (
              <button
                key={broker.key}
                onClick={() => !broker.separate && handleConnect(broker.key)}
                disabled={connecting || broker.separate}
                className={`flex flex-col items-center gap-1.5 p-3 bg-bg-surface border border-border rounded-xl
                  ${broker.separate ? 'opacity-60' : 'hover:border-accent/50 hover:bg-accent/5 cursor-pointer'}
                  transition-all disabled:cursor-default`}
              >
                <img src={broker.icon} alt={broker.label} className="w-8 h-8 rounded-lg object-contain" />
                <span className="text-text-primary text-xs font-medium text-center leading-tight">{broker.label}</span>
                {broker.separate && (
                  <span className="text-[10px] text-positive">In Settings</span>
                )}
                {connectingBroker === broker.key && (
                  <span className="text-[10px] text-accent">Connecting...</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Environment selector */}
      <div className="flex items-center gap-2 justify-center mb-4">
        <span className="text-text-tertiary text-xs">Environment:</span>
        <select
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          className="bg-bg-input border border-border rounded-lg px-2 py-1 text-text-primary text-xs"
        >
          <option value="demo">Demo</option>
          <option value="live">Live</option>
        </select>
      </div>

      {error && (
        <p className="text-negative text-sm mb-4 max-w-sm mx-auto">{error}</p>
      )}

      {/* Skip for now */}
      <button
        onClick={onNext}
        className="text-text-tertiary text-sm hover:text-text-secondary transition-colors cursor-pointer underline underline-offset-2"
        title="Connect later in Settings"
      >
        Skip for now
      </button>
    </div>
  );
};

const CustomizePage = ({ theme, customColors, onThemeChange, onNext, ready }) => {
  const [selectedTheme, setSelectedTheme] = useState(theme === 'custom' ? 'dark' : theme);
  const [accentColor, setAccentColor] = useState(customColors?.accent || '');

  const handleThemeSelect = (t) => {
    setSelectedTheme(t);
    onThemeChange(t, { ...customColors, accent: accentColor || null });
  };

  const handleAccentChange = (hex) => {
    setAccentColor(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onThemeChange(selectedTheme, { ...customColors, accent: hex });
    }
  };

  const presetColors = ['#BFFF00', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#06B6D4'];

  return (
    <div className="onboard-page-content">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-text-primary">Make it </span><span className="text-accent">yours</span><span className="text-text-primary">.</span>
      </h1>
      <p className="text-text-secondary text-base mb-8">Choose your look and feel.</p>

      {/* Theme toggle */}
      <div className="flex gap-3 justify-center mb-8">
        {['dark', 'light'].map((t) => (
          <button
            key={t}
            onClick={() => handleThemeSelect(t)}
            className={`px-6 py-3 rounded-xl border transition-all duration-200 cursor-pointer capitalize font-medium ${
              selectedTheme === t
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-bg-surface text-text-secondary hover:border-accent/30'
            }`}
          >
            {t === 'dark' ? 'Dark' : 'Light'}
          </button>
        ))}
      </div>

      {/* Accent color */}
      <div className="w-full max-w-xs mx-auto mb-8">
        <label className="text-text-secondary text-sm mb-3 block">Accent Color</label>
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {presetColors.map((color) => (
            <button
              key={color}
              onClick={() => handleAccentChange(color)}
              className="w-8 h-8 rounded-full border-2 transition-all duration-150 cursor-pointer"
              style={{
                backgroundColor: color,
                borderColor: accentColor === color ? 'white' : 'transparent',
                transform: accentColor === color ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 justify-center">
          <input
            type="color"
            value={accentColor || '#BFFF00'}
            onChange={(e) => handleAccentChange(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <input
            type="text"
            value={accentColor}
            onChange={(e) => handleAccentChange(e.target.value)}
            placeholder="#BFFF00"
            className="bg-bg-input border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm w-24 font-mono"
          />
        </div>
      </div>

      <p className="text-text-muted text-xs mb-6">Navigate to Settings &rarr; Preferences to change this later.</p>
      <button onClick={onNext} className={`onboard-btn-primary transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>Next</button>
    </div>
  );
};

const GoodLuckPage = ({ onComplete }) => {
  useEffect(() => {
    const completeTimer = setTimeout(() => onComplete(), 2500);
    return () => clearTimeout(completeTimer);
  }, []);

  return (
    <div className="onboard-page-content">
      <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-6 onboard-check-pop">
        <Icons.TrendingUp className="w-8 h-8 text-accent" />
      </div>
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-text-primary">We want you to </span><span className="text-accent">succeed!</span>
      </h1>
      <p className="text-text-secondary text-base mb-10">Good luck on your trading journey.</p>
    </div>
  );
};

// ── Main OnboardingFlow ──────────────────────────────────────────

const OnboardingFlow = ({ onComplete, theme, customColors, onThemeChange }) => {
  const [experience, setExperience] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [animating, setAnimating] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const containerRef = useRef(null);
  const readyTimerRef = useRef(null);

  // Reset the 3-second gate whenever pageIndex changes
  useEffect(() => {
    setPageReady(false);
    readyTimerRef.current = setTimeout(() => setPageReady(true), 3000);
    return () => clearTimeout(readyTimerRef.current);
  }, [pageIndex]);

  // Build page list dynamically based on experience level
  const needsExplainer = experience === 'beginner' || experience === 'never';
  const pages = ['welcome'];
  if (needsExplainer) pages.push('whatwedo');
  pages.push('broker', 'customize', 'goodluck');

  const currentPageId = pages[pageIndex];
  const totalDots = pages.length;

  const goNext = () => {
    if (animating) return;
    setDirection(1);
    setAnimating(true);
    setTimeout(() => {
      setPageIndex((i) => Math.min(i + 1, pages.length - 1));
      setAnimating(false);
    }, 350);
  };

  const handleExperienceSelect = (level) => {
    setExperience(level);
    // After setting experience, advance — pages array will recalculate on next render
    setDirection(1);
    setAnimating(true);
    setTimeout(() => {
      setPageIndex(1); // Will be 'whatwedo' or 'broker' depending on level
      setAnimating(false);
    }, 350);
  };

  const handleComplete = async () => {
    try {
      await authFetch('/api/account/onboarding-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Failed to mark onboarding complete:', err);
    }
    setDismissing(true);
    setTimeout(() => onComplete(), 800);
  };

  const handleSkip = () => handleComplete();

  const renderPage = () => {
    switch (currentPageId) {
      case 'welcome':
        return <WelcomePage onSelect={handleExperienceSelect} />;
      case 'whatwedo':
        return <WhatWeDoPage onNext={goNext} ready={pageReady} />;
      case 'broker':
        return <BrokerConnectPage onNext={goNext} onSkip={goNext} ready={pageReady} />;
      case 'customize':
        return <CustomizePage theme={theme} customColors={customColors} onThemeChange={onThemeChange} onNext={goNext} ready={pageReady} />;
      case 'goodluck':
        return <GoodLuckPage onComplete={handleComplete} />;
      default:
        return null;
    }
  };

  return (
    <div className={`fixed inset-0 z-[200] flex flex-col transition-all duration-700 ${
      dismissing ? 'opacity-0' : 'opacity-100'
    } ${
      currentPageId === 'customize' ? 'bg-bg-page/30 backdrop-blur-sm' : 'bg-bg-page'
    }`}>
      {/* Skip button — hidden on welcome page */}
      {currentPageId !== 'welcome' && (
        <div className="absolute top-5 right-6 z-10">
          <button
            onClick={handleSkip}
            className="text-text-muted text-sm hover:text-text-secondary transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>
      )}

      {/* Page content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden" ref={containerRef}>
        <div
          className={`w-full max-w-lg mx-auto px-6 transition-all duration-350 ease-out ${
            animating
              ? direction === 1
                ? 'opacity-0 translate-x-12'
                : 'opacity-0 -translate-x-12'
              : 'opacity-100 translate-x-0'
          }`}
          style={{ transitionDuration: '350ms' }}
        >
          {renderPage()}
        </div>
      </div>

      {/* Progress dots */}
      <div className="pb-8 flex justify-center gap-2">
        {Array.from({ length: totalDots }).map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i === pageIndex
                ? 'w-6 h-2 bg-accent'
                : i < pageIndex
                ? 'w-2 h-2 bg-accent/40'
                : 'w-2 h-2 bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

module.exports = OnboardingFlow;
