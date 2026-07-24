const React = require('react');
const { useState, useEffect } = React;
const { authFetch } = require('../../helper');
const Icons = require('../shared/Icons');
const EvalFilterControl = require('../shared/EvalFilterControl');

const StrategyPage = ({ trades, evalFilter, setEvalFilter }) => {
  const [rules, setRules] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [disciplineScore, setDisciplineScore] = useState(0);
  const [combinations, setCombinations] = useState([]);
  const [tradeRuleStates, setTradeRuleStates] = useState([]);
  const [dailyRuleStates, setDailyRuleStates] = useState([]);
  const [ruleFilters, setRuleFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [newRuleLabel, setNewRuleLabel] = useState('');
  const [newRuleType, setNewRuleType] = useState('trade');
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [activeTab, setActiveTab] = useState('rules');

  const fetchRules = async () => {
    try {
      const resp = await authFetch('/api/strategy/rules');
      const data = await resp.json();
      if (!data.error) setRules(data.rules || []);
    } catch (err) {
      console.error('Failed to fetch rules:', err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const resp = await authFetch(`/api/strategy/analytics${evalFilter !== 'all' ? `?evalFilter=${evalFilter}` : ''}`);
      const data = await resp.json();
      if (!data.error) {
        setAnalytics(data.analytics || []);
        setDisciplineScore(data.disciplineScore || 0);
        setCombinations(data.combinations || []);
        setTradeRuleStates(data.tradeRuleStates || []);
        setDailyRuleStates(data.dailyRuleStates || []);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  };

  useEffect(() => {
    Promise.all([fetchRules(), fetchAnalytics()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [evalFilter]);

  const handleAddRule = async () => {
    if (!newRuleLabel.trim()) return;
    try {
      const resp = await authFetch('/api/strategy/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newRuleLabel.trim(), type: newRuleType }),
      });
      const rule = await resp.json();
      if (!rule.error) {
        setRules(prev => [...prev, rule]);
        setNewRuleLabel('');
        fetchAnalytics();
      }
    } catch (err) {
      console.error('Failed to add rule:', err);
    }
  };

  const handleUpdateRule = async (ruleId) => {
    if (!editingLabel.trim()) return;
    try {
      const resp = await authFetch(`/api/strategy/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editingLabel.trim() }),
      });
      const updated = await resp.json();
      if (!updated.error) {
        setRules(prev => prev.map(r => r._id === ruleId ? updated : r));
        setEditingId(null);
      }
    } catch (err) {
      console.error('Failed to update rule:', err);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await authFetch(`/api/strategy/rules/${ruleId}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r._id !== ruleId));
      fetchAnalytics();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icons.RefreshCw className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  const tradeRules = rules.filter(r => r.type === 'trade');
  const dayRules = rules.filter(r => r.type === 'day');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-text-primary text-2xl font-bold">Strategy</h1>
          <p className="text-text-secondary text-sm mt-1">Define and track your trading rules</p>
        </div>
        {trades && <EvalFilterControl trades={trades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-bg-surface rounded-lg p-1 w-fit">
        {['rules', 'analytics'].map(tab => (
          <button
            key={tab}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-bg-page text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'rules' ? 'Rules' : 'Analytics'}
          </button>
        ))}
      </div>

      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Add new rule */}
          <div className="bg-bg-surface border border-border rounded-xl p-5">
            <h3 className="text-text-primary font-semibold text-sm mb-3">Add New Rule</h3>
            <div className="flex gap-3">
              <select
                className="px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent"
                value={newRuleType}
                onChange={(e) => setNewRuleType(e.target.value)}
              >
                <option value="trade">Trade Rule</option>
                <option value="day">Daily Rule</option>
              </select>
              <input
                type="text"
                className="flex-1 px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent"
                placeholder="e.g., Wait for confirmation before entry"
                value={newRuleLabel}
                onChange={(e) => setNewRuleLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
              />
              <button
                className="px-4 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                onClick={handleAddRule}
                disabled={!newRuleLabel.trim()}
              >
                Add
              </button>
            </div>
          </div>

          {/* Trade Rules */}
          <div className="bg-bg-surface border border-border rounded-xl p-5">
            <h3 className="text-text-primary font-semibold text-sm mb-3">Trade Rules</h3>
            <p className="text-text-tertiary text-xs mb-3">Check these off for each trade individually</p>
            {tradeRules.length === 0 ? (
              <p className="text-text-muted text-sm">No trade rules defined yet.</p>
            ) : (
              <div className="space-y-2">
                {tradeRules.map(rule => (
                  <div key={rule._id} className="flex items-center gap-3 bg-bg-input rounded-lg px-3 py-2.5">
                    {editingId === rule._id ? (
                      <>
                        <input
                          type="text"
                          className="flex-1 px-2 py-1 bg-bg-surface border border-border rounded text-text-primary text-sm focus:outline-none focus:border-accent"
                          value={editingLabel}
                          onChange={(e) => setEditingLabel(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateRule(rule._id)}
                          autoFocus
                        />
                        <button className="text-positive text-xs font-medium" onClick={() => handleUpdateRule(rule._id)}>Save</button>
                        <button className="text-text-muted text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <Icons.Target className="w-4 h-4 text-accent flex-shrink-0" />
                        <span className="flex-1 text-text-primary text-sm">{rule.label}</span>
                        <button
                          className="text-text-muted hover:text-text-secondary text-xs"
                          onClick={() => { setEditingId(rule._id); setEditingLabel(rule.label); }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-text-muted hover:text-negative text-xs"
                          onClick={() => handleDeleteRule(rule._id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily Rules */}
          <div className="bg-bg-surface border border-border rounded-xl p-5">
            <h3 className="text-text-primary font-semibold text-sm mb-3">Daily Rules</h3>
            <p className="text-text-tertiary text-xs mb-3">Check these off each trading day in the day detail panel</p>
            {dayRules.length === 0 ? (
              <p className="text-text-muted text-sm">No daily rules defined yet.</p>
            ) : (
              <div className="space-y-2">
                {dayRules.map(rule => (
                  <div key={rule._id} className="flex items-center gap-3 bg-bg-input rounded-lg px-3 py-2.5">
                    {editingId === rule._id ? (
                      <>
                        <input
                          type="text"
                          className="flex-1 px-2 py-1 bg-bg-surface border border-border rounded text-text-primary text-sm focus:outline-none focus:border-accent"
                          value={editingLabel}
                          onChange={(e) => setEditingLabel(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateRule(rule._id)}
                          autoFocus
                        />
                        <button className="text-positive text-xs font-medium" onClick={() => handleUpdateRule(rule._id)}>Save</button>
                        <button className="text-text-muted text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <Icons.Target className="w-4 h-4 text-info flex-shrink-0" />
                        <span className="flex-1 text-text-primary text-sm">{rule.label}</span>
                        <button
                          className="text-text-muted hover:text-text-secondary text-xs"
                          onClick={() => { setEditingId(rule._id); setEditingLabel(rule.label); }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-text-muted hover:text-negative text-xs"
                          onClick={() => handleDeleteRule(rule._id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (() => {
        // Computed values for analytics tab
        const tradeAnalytics = analytics.filter(a => a.type === 'trade');
        const dayAnalytics = analytics.filter(a => a.type === 'day');

        // Insights: top rules by profitability
        const mostProfitableTradeRule = tradeAnalytics
          .filter(a => a.followedCount >= 2)
          .sort((a, b) => b.avgPLFollowed - a.avgPLFollowed)[0];
        const bestDailyRule = dayAnalytics
          .filter(a => a.daysWithDataFollowed >= 2)
          .sort((a, b) => b.winRateFollowed - a.winRateFollowed)[0];

        // Rule filters
        const getFilter = (ruleId) => ruleFilters[ruleId] || 'any';
        const hasActiveFilters = Object.values(ruleFilters).some(v => v !== 'any');
        const toggleFilter = (ruleId, state) => setRuleFilters(prev => ({ ...prev, [ruleId]: (prev[ruleId] || 'any') === state ? 'any' : state }));

        // Compute filtered stats based on active rule filters
        const filteredStats = (() => {
          if (!hasActiveFilters) return null;
          const activeFilters = Object.entries(ruleFilters).filter(([, s]) => s !== 'any');
          const tradeFilters = activeFilters.filter(([id]) => rules.find(r => r._id === id && r.type === 'trade'));
          const dayFilters = activeFilters.filter(([id]) => rules.find(r => r._id === id && r.type === 'day'));
          let pls = [];
          if (tradeFilters.length > 0) {
            pls = tradeRuleStates
              .filter(t => tradeFilters.every(([id, state]) => state === 'followed' ? !!t.checks[id] : !t.checks[id]))
              .map(t => t.pl);
          }
          if (dayFilters.length > 0) {
            const dayPLs = dailyRuleStates
              .filter(d => dayFilters.every(([id, state]) => state === 'followed' ? !!d.checks[id] : !d.checks[id]))
              .flatMap(d => d.tradePLs);
            pls = [...pls, ...dayPLs];
          }
          if (pls.length === 0) return { count: 0, avgPL: 0, winRate: 0, profitFactor: 0 };
          const count = pls.length;
          const avgPL = pls.reduce((s, v) => s + v, 0) / count;
          const winRate = (pls.filter(v => v > 0).length / count) * 100;
          const grossWin = pls.filter(v => v > 0).reduce((s, v) => s + v, 0);
          const grossLoss = Math.abs(pls.filter(v => v < 0).reduce((s, v) => s + v, 0));
          const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
          return { count, avgPL, winRate, profitFactor };
        })();

        // Small metric display helper
        const Metric = ({ label, followed, broken, isPositiveBetter = true }) => {
          const fGood = isPositiveBetter ? followed >= broken : followed <= broken;
          return (
            <div className="flex justify-between text-xs py-1 border-b border-border/40 last:border-0">
              <span className="text-text-muted">{label}</span>
              <div className="flex gap-4">
                <span className={`font-mono font-medium ${fGood ? 'text-positive' : 'text-text-secondary'}`}>{followed}</span>
                <span className={`font-mono font-medium ${!fGood ? 'text-positive' : 'text-text-secondary'}`}>{broken}</span>
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-6">
            {/* Discipline Score */}
            <div className="bg-bg-surface border border-border rounded-xl p-5">
              <h3 className="text-text-primary font-semibold text-sm mb-3">Overall Discipline Score</h3>
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold font-mono text-accent">{disciplineScore.toFixed(0)}%</div>
                <div className="flex-1">
                  <div className="w-full bg-bg-input rounded-full h-3">
                    <div className="bg-accent h-3 rounded-full transition-all" style={{ width: `${Math.min(100, disciplineScore)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {analytics.length === 0 ? (
              <div className="bg-bg-surface border border-border rounded-xl p-8 text-center">
                <p className="text-text-muted text-sm">No rule check data yet. Start checking off rules in your day detail panels.</p>
              </div>
            ) : (
              <>
                {/* Insights */}
                {(mostProfitableTradeRule || bestDailyRule) && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-4">Top Insights</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {mostProfitableTradeRule && (
                        <div className="bg-positive/5 border border-positive/20 rounded-lg p-4">
                          <div className="text-text-muted text-[10px] font-semibold uppercase tracking-wider mb-1">Most Profitable Trade Rule</div>
                          <div className="text-text-primary text-sm font-medium leading-snug mb-2">{mostProfitableTradeRule.label}</div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-positive text-xl font-mono font-bold">{mostProfitableTradeRule.avgPLFollowed >= 0 ? '+' : ''}${mostProfitableTradeRule.avgPLFollowed.toFixed(2)}</span>
                            <span className="text-text-muted text-xs">avg P/L when followed</span>
                          </div>
                          <div className="flex gap-3 mt-1.5 text-xs text-text-tertiary">
                            <span>{mostProfitableTradeRule.winRateFollowed.toFixed(0)}% win rate</span>
                            <span>{mostProfitableTradeRule.profitFactorFollowed.toFixed(2)}x profit factor</span>
                          </div>
                        </div>
                      )}
                      {bestDailyRule && (
                        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                          <div className="text-text-muted text-[10px] font-semibold uppercase tracking-wider mb-1">Best Daily Rule (Win Rate)</div>
                          <div className="text-text-primary text-sm font-medium leading-snug mb-2">{bestDailyRule.label}</div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-accent text-xl font-mono font-bold">{bestDailyRule.winRateFollowed.toFixed(0)}%</span>
                            <span className="text-text-muted text-xs">day win rate when followed</span>
                          </div>
                          <div className="flex gap-3 mt-1.5 text-xs text-text-tertiary">
                            <span>{bestDailyRule.avgPLFollowed >= 0 ? '+' : ''}${bestDailyRule.avgPLFollowed.toFixed(2)} avg day P/L</span>
                            <span>{bestDailyRule.profitFactorFollowed.toFixed(2)}x profit factor</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Rule Filter */}
                {rules.length > 0 && (tradeRuleStates.length > 0 || dailyRuleStates.length > 0) && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-text-primary font-semibold text-sm">Filter by Rule State</h3>
                        <p className="text-text-tertiary text-xs mt-0.5">Select rules to see performance when they're followed or broken</p>
                      </div>
                      {hasActiveFilters && (
                        <button className="text-xs text-text-tertiary hover:text-text-primary transition-colors" onClick={() => setRuleFilters({})}>Clear all</button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {rules.map(rule => {
                        const f = getFilter(rule._id);
                        return (
                          <div key={rule._id} className="flex items-center gap-3">
                            <span className="flex-1 text-text-primary text-xs truncate">{rule.label}</span>
                            <div className="flex rounded-lg overflow-hidden border border-border text-[11px] font-medium shrink-0">
                              <button
                                className={`px-3 py-1.5 transition-colors ${f === 'followed' ? 'bg-positive text-white' : 'text-text-tertiary hover:text-positive hover:bg-positive/10'}`}
                                onClick={() => toggleFilter(rule._id, 'followed')}
                              >✓ Followed</button>
                              <button
                                className={`px-3 py-1.5 border-x border-border transition-colors ${f === 'any' ? 'bg-bg-input text-text-primary' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-input'}`}
                                onClick={() => toggleFilter(rule._id, 'any')}
                              >Any</button>
                              <button
                                className={`px-3 py-1.5 transition-colors ${f === 'broken' ? 'bg-negative text-white' : 'text-text-tertiary hover:text-negative hover:bg-negative/10'}`}
                                onClick={() => toggleFilter(rule._id, 'broken')}
                              >✗ Broken</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hasActiveFilters && filteredStats && (
                      <div className="mt-4 pt-4 border-t border-border">
                        {filteredStats.count === 0 ? (
                          <p className="text-text-muted text-xs text-center">No trades match this filter combination.</p>
                        ) : (
                          <>
                            <div className="text-text-secondary text-xs font-medium mb-3">Filtered Results — {filteredStats.count} trade{filteredStats.count !== 1 ? 's' : ''}</div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { label: 'Win Rate', value: filteredStats.winRate.toFixed(0) + '%', color: filteredStats.winRate >= 50 ? 'text-positive' : 'text-negative' },
                                { label: 'Avg P/L', value: (filteredStats.avgPL >= 0 ? '+' : '') + '$' + filteredStats.avgPL.toFixed(2), color: filteredStats.avgPL >= 0 ? 'text-positive' : 'text-negative' },
                                { label: 'Profit Factor', value: filteredStats.profitFactor >= 99 ? '∞' : filteredStats.profitFactor.toFixed(2) + 'x', color: filteredStats.profitFactor >= 1 ? 'text-positive' : 'text-negative' },
                                { label: 'Trades', value: filteredStats.count, color: 'text-text-primary' },
                              ].map(item => (
                                <div key={item.label} className="bg-bg-input rounded-lg px-3 py-2.5 text-center">
                                  <div className="text-text-muted text-[10px] uppercase tracking-wider mb-1">{item.label}</div>
                                  <div className={`font-mono font-bold text-sm ${item.color}`}>{item.value}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Trade Rule Analytics */}
                {tradeAnalytics.length > 0 && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-4">Trade Rule Analytics</h3>
                    <div className="space-y-5">
                      {tradeAnalytics.map(a => (
                        <div key={a.ruleId}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-text-primary text-sm font-medium">{a.label}</span>
                            <span className={`text-xs font-mono ${a.adherenceRate >= 70 ? 'text-positive' : a.adherenceRate >= 40 ? 'text-warning' : 'text-negative'}`}>{a.adherenceRate.toFixed(0)}% adherence</span>
                          </div>
                          <div className="w-full bg-bg-input rounded-full h-1.5 mb-3">
                            <div className={`h-1.5 rounded-full transition-all ${a.adherenceRate >= 70 ? 'bg-positive' : a.adherenceRate >= 40 ? 'bg-warning' : 'bg-negative'}`} style={{ width: `${Math.min(100, a.adherenceRate)}%` }} />
                          </div>
                          <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-bg-input border-b border-border">
                                  <th className="text-left px-3 py-2 text-text-muted font-medium">Metric</th>
                                  <th className="text-right px-3 py-2 text-positive font-medium">Followed ({a.followedCount})</th>
                                  <th className="text-right px-3 py-2 text-negative font-medium">Broken ({a.brokenCount})</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  { label: 'Avg P/L', fVal: (a.avgPLFollowed >= 0 ? '+' : '') + '$' + a.avgPLFollowed.toFixed(2), bVal: (a.avgPLBroken >= 0 ? '+' : '') + '$' + a.avgPLBroken.toFixed(2), fBetter: a.avgPLFollowed >= a.avgPLBroken },
                                  { label: 'Win Rate', fVal: a.winRateFollowed.toFixed(0) + '%', bVal: a.winRateBroken.toFixed(0) + '%', fBetter: a.winRateFollowed >= a.winRateBroken },
                                  { label: 'Profit Factor', fVal: a.profitFactorFollowed >= 99 ? '∞' : a.profitFactorFollowed.toFixed(2) + 'x', bVal: a.profitFactorBroken >= 99 ? '∞' : a.profitFactorBroken.toFixed(2) + 'x', fBetter: a.profitFactorFollowed >= a.profitFactorBroken },
                                ].map(row => (
                                  <tr key={row.label} className="border-b border-border/40 last:border-0">
                                    <td className="px-3 py-2 text-text-muted">{row.label}</td>
                                    <td className={`px-3 py-2 text-right font-mono font-semibold ${row.fBetter ? 'text-positive' : 'text-text-secondary'}`}>{row.fVal}</td>
                                    <td className={`px-3 py-2 text-right font-mono font-semibold ${!row.fBetter ? 'text-positive' : 'text-text-secondary'}`}>{row.bVal}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily Rule Analytics */}
                {dayAnalytics.length > 0 && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-1">Daily Rule Analytics</h3>
                    <p className="text-text-tertiary text-xs mb-4">Stats are computed at the day level — each followed/broken day is one data point</p>
                    <div className="space-y-5">
                      {dayAnalytics.map(a => (
                        <div key={a.ruleId}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-text-primary text-sm font-medium">{a.label}</span>
                            <span className={`text-xs font-mono ${a.adherenceRate >= 70 ? 'text-positive' : a.adherenceRate >= 40 ? 'text-warning' : 'text-negative'}`}>{a.adherenceRate.toFixed(0)}% adherence</span>
                          </div>
                          <div className="w-full bg-bg-input rounded-full h-1.5 mb-3">
                            <div className={`h-1.5 rounded-full transition-all ${a.adherenceRate >= 70 ? 'bg-positive' : a.adherenceRate >= 40 ? 'bg-warning' : 'bg-negative'}`} style={{ width: `${Math.min(100, a.adherenceRate)}%` }} />
                          </div>
                          <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-bg-input border-b border-border">
                                  <th className="text-left px-3 py-2 text-text-muted font-medium">Day Metric</th>
                                  <th className="text-right px-3 py-2 text-positive font-medium">Followed ({a.daysWithDataFollowed ?? a.followedCount}d)</th>
                                  <th className="text-right px-3 py-2 text-negative font-medium">Broken ({a.daysWithDataBroken ?? a.brokenCount}d)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  { label: 'Avg Day P/L', fVal: (a.avgPLFollowed >= 0 ? '+' : '') + '$' + a.avgPLFollowed.toFixed(2), bVal: (a.avgPLBroken >= 0 ? '+' : '') + '$' + a.avgPLBroken.toFixed(2), fBetter: a.avgPLFollowed >= a.avgPLBroken },
                                  { label: 'Day Win Rate', fVal: a.winRateFollowed.toFixed(0) + '%', bVal: a.winRateBroken.toFixed(0) + '%', fBetter: a.winRateFollowed >= a.winRateBroken },
                                  { label: 'Profit Factor', fVal: a.profitFactorFollowed >= 99 ? '∞' : a.profitFactorFollowed.toFixed(2) + 'x', bVal: a.profitFactorBroken >= 99 ? '∞' : a.profitFactorBroken.toFixed(2) + 'x', fBetter: a.profitFactorFollowed >= a.profitFactorBroken },
                                ].map(row => (
                                  <tr key={row.label} className="border-b border-border/40 last:border-0">
                                    <td className="px-3 py-2 text-text-muted">{row.label}</td>
                                    <td className={`px-3 py-2 text-right font-mono font-semibold ${row.fBetter ? 'text-positive' : 'text-text-secondary'}`}>{row.fVal}</td>
                                    <td className={`px-3 py-2 text-right font-mono font-semibold ${!row.fBetter ? 'text-positive' : 'text-text-secondary'}`}>{row.bVal}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Most Broken Rules */}
                {analytics.filter(a => a.brokenCount > 0).length > 0 && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-3">Most Broken Rules</h3>
                    <div className="space-y-2">
                      {analytics.filter(a => a.brokenCount > 0).sort((a, b) => b.brokenCount - a.brokenCount).slice(0, 5).map(a => (
                        <div key={a.ruleId} className="flex items-center justify-between bg-bg-input rounded-lg px-3 py-2">
                          <span className="text-text-primary text-sm">{a.label}</span>
                          <span className="text-negative text-xs font-mono">{a.brokenCount} time{a.brokenCount !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Combination Analytics */}
                {combinations && combinations.length > 0 && (
                  <div className="bg-bg-surface border border-border rounded-xl p-5">
                    <h3 className="text-text-primary font-semibold text-sm mb-1">Rule Combination Analysis</h3>
                    <p className="text-text-tertiary text-xs mb-5">How P&L compares when following pairs of rules together</p>
                    <div className="space-y-6">
                      {combinations.map((combo, idx) => {
                        const rows = [
                          { label: '✓ Both followed', stats: combo.both, highlight: true },
                          { label: `✓ ${combo.rule1Label} only`, stats: combo.onlyRule1 },
                          { label: `✓ ${combo.rule2Label} only`, stats: combo.onlyRule2 },
                          { label: 'Neither followed', stats: combo.neither },
                        ].filter(r => r.stats.count > 0);
                        if (rows.length === 0) return null;
                        return (
                          <div key={idx}>
                            <div className="text-xs font-medium mb-2 flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-accent/10 text-accent truncate max-w-[45%]">{combo.rule1Label}</span>
                              <span className="text-text-muted">×</span>
                              <span className="px-2 py-0.5 rounded bg-accent/10 text-accent truncate max-w-[45%]">{combo.rule2Label}</span>
                            </div>
                            <div className="rounded-lg border border-border overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-bg-input border-b border-border">
                                    <th className="text-left px-3 py-2 text-text-tertiary font-medium">Scenario</th>
                                    <th className="text-right px-3 py-2 text-text-tertiary font-medium">Trades</th>
                                    <th className="text-right px-3 py-2 text-text-tertiary font-medium">Avg P/L</th>
                                    <th className="text-right px-3 py-2 text-text-tertiary font-medium">Win Rate</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row, ri) => (
                                    <tr key={ri} className={`border-b border-border/50 last:border-0 ${row.highlight ? 'bg-positive/5' : ''}`}>
                                      <td className="px-3 py-2 text-text-secondary">{row.label}</td>
                                      <td className="px-3 py-2 text-right font-mono text-text-primary">{row.stats.count}</td>
                                      <td className={`px-3 py-2 text-right font-mono font-semibold ${row.stats.avgPL >= 0 ? 'text-positive' : 'text-negative'}`}>{row.stats.avgPL >= 0 ? '+' : ''}${row.stats.avgPL.toFixed(2)}</td>
                                      <td className="px-3 py-2 text-right font-mono text-text-secondary">{row.stats.winRate.toFixed(0)}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
};


module.exports = StrategyPage;
