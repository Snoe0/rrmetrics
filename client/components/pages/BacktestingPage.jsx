const helper = require('../../helper.js');
const { authFetch } = helper;
const React = require('react');
const { useState, useEffect } = React;
const Icons = require('../shared/Icons');

const BacktestingContent = ({ subscriptionStatus }) => {
  const [sessions, setSessions] = useState([]);
  const [activeTrades, setActiveTrades] = useState([]);
  const [allTrades, setAllTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const isProUser = subscriptionStatus?.plan === 'pro';
  const hasReachedSessionLimit = isProUser && sessions.length >= 1;
  const [statsFilter, setStatsFilter] = useState('all'); // 'all' | session id
  const [showStartForm, setShowStartForm] = useState(false);
  const [showEndForm, setShowEndForm] = useState(false);

  // Start session form state
  const [newTicker, setNewTicker] = useState('');
  const [newName, setNewName] = useState('');
  const [newStartDate, setNewStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  // End session form state
  const [endDate, setEndDate] = useState('');

  // Add trade form state
  const [tradeResult, setTradeResult] = useState('win');
  const [tradePF, setTradePF] = useState('');
  const [tradeTime, setTradeTime] = useState('');
  const [tradeSubmitting, setTradeSubmitting] = useState(false);

  const activeSession = sessions.find(s => s.isActive) || null;

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [sessRes, tradesRes] = await Promise.all([
        authFetch('/api/backtesting/sessions'),
        authFetch('/api/backtesting/trades'),
      ]);
      const sessData = await sessRes.json();
      const tradesData = await tradesRes.json();
      setSessions(sessData.sessions || []);
      setAllTrades(tradesData.trades || []);
    } catch (err) {
      console.error('Failed to load sessions', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const loadActiveTrades = async (sessionId) => {
    try {
      const res = await authFetch(`/api/backtesting/sessions/${sessionId}/trades`);
      const data = await res.json();
      setActiveTrades(data.trades || []);
    } catch (err) {
      console.error('Failed to load active trades', err);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (activeSession) loadActiveTrades(activeSession._id);
    else setActiveTrades([]);
  }, [activeSession?._id]);

  const handleStartSession = async (e) => {
    e.preventDefault();
    if (!newTicker.trim()) return;
    try {
      await authFetch('/api/backtesting/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() || undefined, ticker: newTicker.trim(), startDate: newStartDate }),
      });
      setShowStartForm(false);
      setNewTicker(''); setNewName(''); setNewStartDate(new Date().toISOString().slice(0, 10));
      await load(false);
    } catch (err) {
      console.error('Failed to start session', err);
    }
  };

  const handleEndSession = async (e) => {
    e.preventDefault();
    if (!activeSession) return;
    try {
      await authFetch(`/api/backtesting/sessions/${activeSession._id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endDate }),
      });
      setShowEndForm(false);
      setEndDate('');
      await load(false);
    } catch (err) {
      console.error('Failed to end session', err);
    }
  };

  const handleContinueSession = async (sessionId) => {
    try {
      await authFetch(`/api/backtesting/sessions/${sessionId}/continue`, { method: 'POST' });
      await load(false);
    } catch (err) {
      console.error('Failed to continue session', err);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Delete this session and all its trades?')) return;
    try {
      await authFetch(`/api/backtesting/sessions/${sessionId}`, { method: 'DELETE' });
      await load(false);
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  };

  const openEndForm = () => {
    if (!showEndForm && activeSession) {
      setEndDate(activeSession.endDate || new Date().toISOString().slice(0, 10));
    }
    setShowEndForm(!showEndForm);
  };

  const handleAddTrade = async (e) => {
    e.preventDefault();
    if (!activeSession || !tradePF || !tradeTime) return;
    setTradeSubmitting(true);
    try {
      await authFetch('/api/backtesting/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSession._id,
          result: tradeResult,
          profitFactor: parseFloat(tradePF),
          timeOfDay: tradeTime,
        }),
      });
      setTradePF(''); setTradeTime(''); setTradeResult('win');
      await loadActiveTrades(activeSession._id);
      await load(false);
    } catch (err) {
      console.error('Failed to add trade', err);
    } finally {
      setTradeSubmitting(false);
    }
  };

  const handleDeleteTrade = async (tradeId) => {
    try {
      await authFetch(`/api/backtesting/trades/${tradeId}`, { method: 'DELETE' });
      await loadActiveTrades(activeSession._id);
      await load(false);
    } catch (err) {
      console.error('Failed to delete trade', err);
    }
  };

  // Compute aggregate stats from filtered sessions
  const filteredSessions = statsFilter === 'all'
    ? sessions
    : sessions.filter(s => s._id === statsFilter);

  const filteredTrades = statsFilter === 'all'
    ? allTrades
    : allTrades.filter(t => t.sessionId === statsFilter);

  const aggregateStats = (() => {
    const total = filteredSessions.reduce((s, x) => s + (x.tradeCount || 0), 0);
    const wins = filteredSessions.reduce((s, x) => s + (x.winCount || 0), 0);
    const losses = filteredSessions.reduce((s, x) => s + (x.lossCount || 0), 0);
    const rrSum = filteredSessions.reduce((s, x) => s + (x.avgProfitFactor || 0) * (x.tradeCount || 0), 0);
    return {
      total,
      wins,
      losses,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      avgRR: total > 0 ? rrSum / total : 0,
    };
  })();

  // R:R distribution analysis
  const rrBuckets = (() => {
    const buckets = [
      { label: '0-1R', min: 0, max: 1, trades: [] },
      { label: '1-2R', min: 1, max: 2, trades: [] },
      { label: '2-3R', min: 2, max: 3, trades: [] },
      { label: '3R+', min: 3, max: Infinity, trades: [] },
    ];
    filteredTrades.forEach(t => {
      const rr = t.profitFactor;
      const bucket = buckets.find(b => rr >= b.min && rr < b.max) || buckets[buckets.length - 1];
      bucket.trades.push(t);
    });
    return buckets.map(b => ({
      label: b.label,
      count: b.trades.length,
      wins: b.trades.filter(t => t.result === 'win').length,
      losses: b.trades.filter(t => t.result === 'loss').length,
      winRate: b.trades.length > 0 ? (b.trades.filter(t => t.result === 'win').length / b.trades.length) * 100 : 0,
    }));
  })();

  // Time-of-day buckets
  const timeBuckets = (() => {
    const buckets = [
      { label: 'Pre-Market', desc: 'Before 9:30', min: '00:00', max: '09:30', trades: [] },
      { label: 'Open', desc: '9:30–10:30', min: '09:30', max: '10:30', trades: [] },
      { label: 'Mid-Morning', desc: '10:30–12:00', min: '10:30', max: '12:00', trades: [] },
      { label: 'Midday', desc: '12:00–14:00', min: '12:00', max: '14:00', trades: [] },
      { label: 'Afternoon', desc: '14:00–16:00', min: '14:00', max: '16:00', trades: [] },
      { label: 'After-Hours', desc: 'After 16:00', min: '16:00', max: '24:00', trades: [] },
    ];
    filteredTrades.forEach(t => {
      const time = t.timeOfDay; // "HH:MM" format
      const bucket = buckets.find(b => time >= b.min && time < b.max) || buckets[buckets.length - 1];
      bucket.trades.push(t);
    });
    return buckets.map(b => ({
      label: b.label,
      desc: b.desc,
      count: b.trades.length,
      wins: b.trades.filter(t => t.result === 'win').length,
      losses: b.trades.filter(t => t.result === 'loss').length,
      winRate: b.trades.length > 0 ? (b.trades.filter(t => t.result === 'win').length / b.trades.length) * 100 : 0,
    })).filter(b => b.count > 0);
  })();

  const inputClass = 'bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent w-full';
  const labelClass = 'block text-text-tertiary text-xs font-semibold uppercase tracking-wider mb-1';
  const btnPrimary = 'px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all';
  const btnSecondary = 'px-4 py-2 bg-bg-input border border-border text-text-secondary text-sm font-medium rounded-lg hover:text-text-primary transition-colors';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-muted text-sm">
        Loading backtesting data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-text-primary text-2xl font-bold">Backtesting</h1>
          <p className="text-text-muted text-sm mt-1">Track wins and losses across backtesting sessions</p>
        </div>
        {!activeSession && !showStartForm && !hasReachedSessionLimit && (
          <button className={btnPrimary} onClick={() => setShowStartForm(true)}>
            + Start Session
          </button>
        )}
      </div>

      {/* Pro session limit banner */}
      {hasReachedSessionLimit && (
        <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
          <Icons.AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <p className="text-text-primary text-sm font-medium">Upgrade to Elite to unlock Unlimited Backtesting Sessions</p>
          <button className="ml-auto px-4 py-1.5 bg-yellow-500 text-black text-xs font-semibold rounded-lg hover:brightness-110 transition-all whitespace-nowrap" onClick={() => { window.location.href = '/upgrade'; }}>
            Upgrade
          </button>
        </div>
      )}

      {/* Start Session Form */}
      {showStartForm && (
        <div className="bg-bg-surface border border-border rounded-xl p-5">
          <h2 className="text-text-primary font-semibold mb-4">Start New Session</h2>
          <form onSubmit={handleStartSession} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Ticker *</label>
              <input className={inputClass} placeholder="NQ, ES, MNQ..." value={newTicker} onChange={e => setNewTicker(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Session Name (optional)</label>
              <input className={inputClass} placeholder="e.g. Morning breakout v2" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Start Date</label>
              <input type="date" className={inputClass} value={newStartDate} onChange={e => setNewStartDate(e.target.value)} required />
            </div>
            <div className="flex items-end gap-3">
              <button type="submit" className={btnPrimary}>Start</button>
              <button type="button" className={btnSecondary} onClick={() => setShowStartForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Active Session Panel */}
      {activeSession && (
        <div className="bg-bg-surface border border-accent/30 rounded-xl p-5">
          <div className="flex gap-6">
            {/* Left column: header + controls + add trade form */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-positive animate-pulse"></span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-positive">Active Session</span>
                  </div>
                  <h2 className="text-text-primary font-semibold text-lg">
                    {activeSession.name || activeSession.ticker}
                    {activeSession.name && <span className="text-text-muted font-normal ml-2 text-sm">({activeSession.ticker})</span>}
                  </h2>
                  <p className="text-text-muted text-xs mt-0.5">Started {activeSession.startDate}</p>
                </div>
                <div className="flex gap-2">
                  {!showStartForm && (
                    <button className={btnPrimary} onClick={() => setShowStartForm(true)}>+ New Session</button>
                  )}
                  <button
                    className="px-4 py-2 bg-negative/10 border border-negative/30 text-negative text-sm font-medium rounded-lg hover:bg-negative/20 transition-colors"
                    onClick={openEndForm}
                  >
                    End Session
                  </button>
                </div>
              </div>

              {/* End session inline form */}
              {showEndForm && (
                <form onSubmit={handleEndSession} className="flex items-end gap-3 pt-2 border-t border-border">
                  <div>
                    <label className={labelClass}>End Date</label>
                    <input type="date" className={`${inputClass} w-auto`} value={endDate} onChange={e => setEndDate(e.target.value)} required />
                  </div>
                  <button type="submit" className="px-4 py-2 bg-negative/10 border border-negative/30 text-negative text-sm font-medium rounded-lg hover:bg-negative/20 transition-colors">
                    Confirm End
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => setShowEndForm(false)}>Cancel</button>
                </form>
              )}

              {/* Add Trade Form */}
              <form onSubmit={handleAddTrade} className="border-t border-border pt-4">
                <p className="text-text-tertiary text-xs font-semibold uppercase tracking-wider mb-3">Log Trade</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className={labelClass}>Result</label>
                    <div className="flex rounded-lg overflow-hidden border border-border">
                      <button
                        type="button"
                        onClick={() => setTradeResult('win')}
                        className={`px-4 py-2 text-sm font-semibold transition-colors ${tradeResult === 'win' ? 'bg-positive text-white' : 'bg-bg-input text-text-muted hover:text-text-primary'}`}
                      >
                        Win
                      </button>
                      <button
                        type="button"
                        onClick={() => setTradeResult('loss')}
                        className={`px-4 py-2 text-sm font-semibold transition-colors ${tradeResult === 'loss' ? 'bg-negative text-white' : 'bg-bg-input text-text-muted hover:text-text-primary'}`}
                      >
                        Loss
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-[100px]">
                    <label className={labelClass}>Risk-Reward</label>
                    <input
                      type="number" step="0.01" min="0"
                      className={inputClass}
                      placeholder="e.g. 2.5"
                      value={tradePF}
                      onChange={e => setTradePF(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Time of Trade</label>
                    <input
                      type="time"
                      className={inputClass}
                      value={tradeTime}
                      onChange={e => setTradeTime(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className={btnPrimary} disabled={tradeSubmitting}>
                    {tradeSubmitting ? 'Adding...' : 'Add Trade'}
                  </button>
                </div>
              </form>
            </div>

            {/* Right column: order book — most recent trade at top */}
            <div className="w-48 flex-shrink-0 border-l border-border pl-5">
              <p className="text-text-tertiary text-xs font-semibold uppercase tracking-wider mb-2">
                Trade Log {activeTrades.length > 0 && <span className="text-text-muted font-normal normal-case">({activeTrades.length})</span>}
              </p>
              {activeTrades.length === 0 ? (
                <p className="text-text-muted text-xs mt-4">No trades yet</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {[...activeTrades].reverse().map((t) => (
                    <div
                      key={t._id}
                      className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded border-l-2 text-xs ${
                        t.result === 'win'
                          ? 'border-positive bg-positive/5'
                          : 'border-negative bg-negative/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`font-semibold w-3 ${t.result === 'win' ? 'text-positive' : 'text-negative'}`}>
                          {t.result === 'win' ? 'W' : 'L'}
                        </span>
                        <span className="font-mono text-text-primary">{t.profitFactor.toFixed(2)}R</span>
                        <span className="text-text-muted">{t.timeOfDay}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteTrade(t._id)}
                        className="text-text-muted hover:text-negative transition-colors flex-shrink-0"
                      >
                        <Icons.X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      {sessions.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-text-primary font-semibold">Stats Overview</h2>
            <select
              value={statsFilter}
              onChange={e => setStatsFilter(e.target.value)}
              className="bg-bg-input border border-border rounded-lg px-3 py-1.5 text-xs font-medium text-text-primary"
            >
              <option value="all">All Sessions</option>
              {sessions.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name || s.ticker}{s.isActive ? ' (Active)' : ''} — {s.startDate}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total Trades', value: aggregateStats.total },
              { label: 'Wins', value: aggregateStats.wins, color: 'text-positive' },
              { label: 'Losses', value: aggregateStats.losses, color: 'text-negative' },
              { label: 'Win Rate', value: `${aggregateStats.winRate.toFixed(1)}%`, color: aggregateStats.winRate >= 50 ? 'text-positive' : 'text-negative' },
              { label: 'Avg RR', value: aggregateStats.avgRR.toFixed(2)},
            ].map(stat => (
              <div key={stat.label} className="bg-bg-input rounded-lg p-3 text-center">
                <div className={`text-xl font-bold font-mono ${stat.color || 'text-text-primary'}`}>{stat.value}</div>
                <div className="text-text-muted text-xs mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Win Rate by R:R Range */}
          {filteredTrades.length > 0 && (
            <div>
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Win Rate by Risk-Reward</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {rrBuckets.map(b => (
                  <div key={b.label} className="bg-bg-input rounded-lg p-3">
                    <div className="text-text-muted text-xs font-medium mb-1">{b.label}</div>
                    <div className={`text-lg font-bold font-mono ${b.count > 0 ? (b.winRate >= 50 ? 'text-positive' : 'text-negative') : 'text-text-muted'}`}>
                      {b.count > 0 ? `${b.winRate.toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-text-muted text-xs mt-0.5">
                      {b.count > 0 ? `${b.wins}W / ${b.losses}L (${b.count})` : 'No trades'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* R:R Distribution Bar */}
          {filteredTrades.length > 0 && (
            <div>
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">R:R Distribution</h3>
              <div className="space-y-2">
                {rrBuckets.map(b => {
                  const pct = filteredTrades.length > 0 ? (b.count / filteredTrades.length) * 100 : 0;
                  return (
                    <div key={b.label} className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary w-10 text-right font-mono">{b.label}</span>
                      <div className="flex-1 bg-bg-input rounded-full h-4 overflow-hidden flex">
                        {b.wins > 0 && (
                          <div
                            className="h-full bg-positive/70"
                            style={{ width: `${(b.wins / filteredTrades.length) * 100}%` }}
                          />
                        )}
                        {b.losses > 0 && (
                          <div
                            className="h-full bg-negative/70"
                            style={{ width: `${(b.losses / filteredTrades.length) * 100}%` }}
                          />
                        )}
                      </div>
                      <span className="text-xs text-text-muted w-10 font-mono">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Win Rate by Time of Day */}
          {timeBuckets.length > 0 && (
            <div>
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Win Rate by Time of Day</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {timeBuckets.map(b => (
                  <div key={b.label} className="bg-bg-input rounded-lg p-3">
                    <div className="text-text-muted text-[10px] font-medium">{b.label}</div>
                    <div className="text-text-muted text-[9px] mb-1">{b.desc}</div>
                    <div className={`text-lg font-bold font-mono ${b.winRate >= 50 ? 'text-positive' : 'text-negative'}`}>
                      {b.winRate.toFixed(1)}%
                    </div>
                    <div className="text-text-muted text-xs mt-0.5">
                      {b.wins}W / {b.losses}L ({b.count})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sessions List */}
      <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-text-primary font-semibold">Sessions</h2>
          {!activeSession && !showStartForm && !hasReachedSessionLimit && (
            <button className={btnPrimary} onClick={() => setShowStartForm(true)}>+ Start Session</button>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Icons.FlaskConical className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted text-sm">No sessions yet. Start your first backtesting session.</p>
            <button className={`${btnPrimary} mt-4`} onClick={() => setShowStartForm(true)}>+ Start Session</button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map(session => (
              <div key={session._id} className="px-5 py-4 flex items-center gap-4 flex-wrap hover:bg-bg-input/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-text-primary font-medium">
                      {session.name || session.ticker}
                    </span>
                    {session.name && (
                      <span className="text-text-muted text-xs">({session.ticker})</span>
                    )}
                    {session.isActive && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-positive/10 text-positive border border-positive/20">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-text-muted text-xs mt-0.5">
                    {session.startDate}
                    {session.endDate ? ` → ${session.endDate}` : ' → now'}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <div className="text-center">
                    <div className="font-mono font-semibold text-text-primary">{session.tradeCount || 0}</div>
                    <div className="text-text-muted text-xs">trades</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-mono font-semibold ${(session.winRate || 0) >= 50 ? 'text-positive' : 'text-negative'}`}>
                      {(session.winRate || 0).toFixed(1)}%
                    </div>
                    <div className="text-text-muted text-xs">win rate</div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono font-semibold text-text-primary">{(session.avgProfitFactor || 0).toFixed(2)}R</div>
                    <div className="text-text-muted text-xs">avg R:R</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!session.isActive && (
                    <button
                      onClick={() => handleContinueSession(session._id)}
                      className={btnSecondary}
                    >
                      Continue
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteSession(session._id)}
                    className="p-2 text-text-muted hover:text-negative transition-colors rounded-lg hover:bg-negative/10"
                  >
                    <Icons.Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


const BacktestingPage = ({ subscriptionStatus }) => {
  const plan = subscriptionStatus?.plan;
  // Free and trial users see a blurred preview
  if (plan !== 'pro' && plan !== 'elite') {
    return (
      <div>
        <h1 className="text-text-primary text-2xl font-bold mb-1">Backtesting</h1>
        <p className="text-text-muted text-sm mb-8">Track wins and losses across backtesting sessions</p>

        {/* Blurred peek of the interface */}
        <div className="relative rounded-xl overflow-hidden">
          <div className="pointer-events-none select-none blur-[6px] opacity-60">
            {/* Fake active session panel */}
            <div className="bg-bg-surface border border-accent/30 rounded-xl p-5 space-y-4 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-positive"></span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-positive">Active Session</span>
                  </div>
                  <h2 className="text-text-primary font-semibold text-lg">Morning Breakout v2 <span className="text-text-muted font-normal ml-2 text-sm">(NQ)</span></h2>
                  <p className="text-text-muted text-xs mt-0.5">Started 2026-02-15</p>
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-text-tertiary text-xs font-semibold uppercase tracking-wider mb-3">Log Trade</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex rounded-lg overflow-hidden border border-border">
                    <span className="px-4 py-2 text-sm font-semibold bg-positive text-white">Win</span>
                    <span className="px-4 py-2 text-sm font-semibold bg-bg-input text-text-muted">Loss</span>
                  </div>
                  <div className="flex-1 min-w-[100px] bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-muted">2.50</div>
                  <div className="bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-muted">09:45</div>
                  <span className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg">Add Trade</span>
                </div>
              </div>
            </div>

            {/* Fake stats overview */}
            <div className="bg-bg-surface border border-border rounded-xl p-5">
              <h2 className="text-text-primary font-semibold mb-4">Stats Overview</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Total Trades', value: '24' },
                  { label: 'Wins', value: '16' },
                  { label: 'Losses', value: '8' },
                  { label: 'Win Rate', value: '66.7%' },
                  { label: 'Avg RR', value: '2.14R' },
                ].map(stat => (
                  <div key={stat.label} className="bg-bg-input rounded-lg p-3 text-center">
                    <div className="text-xl font-bold font-mono text-text-primary">{stat.value}</div>
                    <div className="text-text-muted text-xs mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Overlay CTA */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-bg-surface/95 backdrop-blur-sm border border-border rounded-xl p-8 text-center shadow-2xl max-w-sm mx-4">
              <Icons.FlaskConical className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
              <h2 className="text-text-primary font-semibold text-lg mb-2">Pro & Elite Feature</h2>
              <p className="text-text-muted text-sm mb-5">
                Backtesting is available on the Pro and Elite plans. Create sessions, log trades, and track your strategy performance over time.
              </p>
              <button
                className="px-6 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
                onClick={() => { window.location.href = '/upgrade'; }}
              >
                Upgrade Now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <BacktestingContent subscriptionStatus={subscriptionStatus} />;
};


module.exports = BacktestingPage;
