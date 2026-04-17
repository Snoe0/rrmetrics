const React = require('react');
const { useState } = React;

const ChangeIndicator = require('../shared/ChangeIndicator');
const WinRateCard = require('../shared/WinRateCard');
const StatCard = require('../shared/StatCard');
const PeriodFilter = require('../shared/PeriodFilter');
const EvalFilterControl = require('../shared/EvalFilterControl');
const CalendarView = require('./CalendarView');
const Icons = require('../shared/Icons');

const { getDateRange, getPreviousDateRange, filterTradesByDateRange, calcPercentChange } = require('../../utils/periodUtils');
const { calculateAnalytics, applyEvalFilter } = require('../../utils/analytics');
const { formatDuration } = require('../../utils/dateUtils');


const AvgWinLossCard = ({ avgWin, avgLoss }) => {
  const absLoss = Math.abs(avgLoss);
  const total = avgWin + absLoss;
  const ratio = absLoss > 0 ? (avgWin / absLoss).toFixed(2) : avgWin > 0 ? '∞' : '0.00';
  const winPct = total > 0 ? (avgWin / total) * 100 : 50;
  return (
    <div className="bg-bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center gap-4">
        <div>
          <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-2">Avg Win / Loss</div>
          <div className="font-mono text-2xl font-bold text-text-primary">{ratio}</div>
        </div>
        <div className="flex-1 flex flex-col gap-3 ml-8">
          <div className="flex h-2 rounded-full overflow-hidden">
            <div className="bg-positive" style={{ width: `${winPct}%` }} />
            <div className="bg-negative flex-1" />
          </div>
          <div className="flex justify-between text-[12px] font-mono">
            <span className="text-positive">${avgWin.toFixed(0)}</span>
            <span className="text-negative">-${absLoss.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};



const DashboardPage = ({ trades, subscriptionStatus, onOpenForm, onOpenImport, onManualSync, brokerStatuses, onOpenAddTrade, onEditTrade, dailyNotes, onSaveNote, onDeleteNote, tags, strategyRules, evalFilter, setEvalFilter, sidebarCollapsed }) => {
  const [period, setPeriod] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const hasBrokers = brokerStatuses && brokerStatuses.length > 0;

  const handleSync = async () => {
    if (syncing || !onManualSync) return;
    setSyncing(true);
    try { await onManualSync(); } finally { setSyncing(false); }
  };

  const baseTrades = applyEvalFilter(trades, evalFilter);
  const dateRange = getDateRange(period);
  const filteredTrades = filterTradesByDateRange(baseTrades, dateRange);
  const stats = calculateAnalytics(filteredTrades);

  const prevRange = getPreviousDateRange(period);
  const prevTrades = prevRange ? filterTradesByDateRange(baseTrades, prevRange) : null;
  const prevStats = prevTrades ? calculateAnalytics(prevTrades) : null;
  const showChange = period !== 'all' && prevStats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary text-sm mt-1">Overview of your trading performance</p>
        </div>
        <div className="flex items-center gap-2">
          {hasBrokers && (
            <button
              className="flex items-center justify-center w-9 h-9 bg-bg-surface border border-border text-text-secondary rounded-lg hover:text-text-primary hover:border-accent transition-all disabled:opacity-50"
              onClick={handleSync}
              disabled={syncing}
              title="Sync broker trades"
            >
              <Icons.RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          )}
          {subscriptionStatus && subscriptionStatus.isPremium && (subscriptionStatus.tradeCount == null || subscriptionStatus.tradeCount < 50) && (
            <>
              <button className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all" onClick={onOpenForm}>
                <Icons.Plus className="w-4 h-4" />
                New Trade
              </button>
              <button
                className="flex items-center justify-center w-9 h-9 bg-bg-surface border border-border text-text-secondary rounded-lg hover:text-text-primary hover:border-accent transition-all"
                onClick={onOpenImport}
                title="Import CSV"
                aria-label="Import CSV"
              >
                <Icons.Download className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Period Filter + Eval filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <PeriodFilter value={period} onChange={setPeriod} trades={trades} />
        </div>
        <EvalFilterControl trades={trades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total P/L"
          value={`$${stats.totalPL.toFixed(2)}`}
          color={stats.totalPL >= 0 ? 'text-positive' : 'text-negative'}
          change={showChange ? calcPercentChange(stats.totalPL, prevStats.totalPL) : null}
        />
        <WinRateCard wins={stats.wins} losses={stats.losses} total={stats.totalTrades}
          change={showChange ? calcPercentChange(stats.winRate, prevStats.winRate) : null} />
        <StatCard label="Total Trades" value={stats.totalTrades} color="text-text-primary"
          subValue={`${stats.avgTradesPerDay.toFixed(1)} avg/day`}
          change={showChange ? calcPercentChange(stats.totalTrades, prevStats.totalTrades) : null} />
        <StatCard label="Avg Duration" value={formatDuration(stats.avgDuration)} color="text-text-primary" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AvgWinLossCard avgWin={stats.avgWin} avgLoss={stats.avgLoss} />
        <StatCard label="Best Trade" value={`$${stats.bestTrade.toFixed(2)}`} color="text-positive"
          change={showChange ? calcPercentChange(stats.bestTrade, prevStats.bestTrade) : null} />
        <StatCard label="Worst Trade" value={`$${stats.worstTrade.toFixed(2)}`} color="text-negative" />
        <StatCard label="Breakeven Rate" value={`${stats.breakevenPct.toFixed(1)}%`} subValue={`${stats.breakevens} trades`} color="text-text-primary" />
      </div>

      {/* Calendar */}
      <CalendarView trades={baseTrades} dailyNotes={dailyNotes} onSaveNote={onSaveNote} onDeleteNote={onDeleteNote} tags={tags} subscriptionStatus={subscriptionStatus} strategyRules={strategyRules} onOpenAddTrade={onOpenAddTrade} onEditTrade={onEditTrade} sidebarCollapsed={sidebarCollapsed} />
    </div>
  );
};


module.exports = DashboardPage;
