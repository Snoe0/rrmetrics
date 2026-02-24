const React = require('react');
const { useState } = React;

const ChangeIndicator = require('../shared/ChangeIndicator');
const StatCard = require('../shared/StatCard');
const PeriodFilter = require('../shared/PeriodFilter');
const EvalFilterControl = require('../shared/EvalFilterControl');
const CalendarView = require('./CalendarView');
const Icons = require('../shared/Icons');

const { getDateRange, getPreviousDateRange, filterTradesByDateRange, calcPercentChange } = require('../../utils/periodUtils');
const { calculateAnalytics } = require('../../utils/analytics');
const { formatDuration } = require('../../utils/dateUtils');
const WinRateCard = ({ wins, losses, total, change }) => {
  const neutral = Math.max(0, total - wins - losses);
  const winRate = total > 0 ? (wins / total * 100) : 0;
  // Stroke-dasharray gauge: circle starts at 3-o'clock and goes CW.
  // rotate(180) moves start to 9-o'clock; CW from there traces 9→12→3 = top semicircle.
  const cx = 36, cy = 32, r = 28, sw = 6;
  const C = 2 * Math.PI * r;
  const half = Math.PI * r; // gauge arc length = half circumference
  const winsLen = total > 0 ? (wins / total) * half : 0;
  const neuLen  = total > 0 ? (neutral / total) * half : 0;
  const losLen  = total > 0 ? (losses / total) * half : 0;
  // Each segment rotates to its starting position (CW degrees from 3-o'clock)
  const neuStartDeg = 180 + (total > 0 ? (wins / total) * 180 : 0);
  const losStartDeg = 180 + (total > 0 ? ((wins + neutral) / total) * 180 : 0);
  return (
    <div className="bg-bg-surface border border-border rounded-xl p-5 relative">
      <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-2">Win Rate</div>
      <div className="flex items-baseline gap-2">
        <div className="font-mono text-2xl font-bold text-text-primary">{winRate.toFixed(1)}%</div>
        {change !== null && change !== undefined && <ChangeIndicator value={change} />}
      </div>
      <div className="absolute right-4 top-4 flex flex-col items-center gap-1">
        <svg width={96} height={50} viewBox="0 0 72 38">
          {/* Background track */}
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke="rgb(var(--border))" strokeWidth={sw} strokeLinecap="butt"
            strokeDasharray={`${half} ${C - half}`}
            transform={`rotate(180, ${cx}, ${cy})`} />
          {/* Wins */}
          {winsLen > 0.01 && (
            <circle cx={cx} cy={cy} r={r} fill="none"
              stroke="rgb(var(--positive))" strokeWidth={sw} strokeLinecap="butt"
              strokeDasharray={`${winsLen} ${C - winsLen}`}
              transform={`rotate(180, ${cx}, ${cy})`} />
          )}
          {/* Neutral */}
          {neuLen > 0.01 && (
            <circle cx={cx} cy={cy} r={r} fill="none"
              stroke="rgb(var(--accent))" strokeWidth={sw} strokeLinecap="butt"
              strokeDasharray={`${neuLen} ${C - neuLen}`}
              transform={`rotate(${neuStartDeg}, ${cx}, ${cy})`} />
          )}
          {/* Losses */}
          {losLen > 0.01 && (
            <circle cx={cx} cy={cy} r={r} fill="none"
              stroke="rgb(var(--negative))" strokeWidth={sw} strokeLinecap="butt"
              strokeDasharray={`${losLen} ${C - losLen}`}
              transform={`rotate(${losStartDeg}, ${cx}, ${cy})`} />
          )}
        </svg>
        <div className="flex justify-between" style={{ width: 96 }}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-positive/20 text-positive text-[9px] font-bold">{wins}</span>
          {neutral > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-[9px] font-bold">{neutral}</span>}
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-negative/20 text-negative text-[9px] font-bold">{losses}</span>
        </div>
      </div>
    </div>
  );
};


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


const applyEvalFilter = (trades, evalFilter) => {
  if (evalFilter === 'exclude') return trades.filter(t => !t.isEval);
  if (evalFilter === 'only') return trades.filter(t => t.isEval);
  return trades;
};

const DashboardPage = ({ trades, subscriptionStatus, onOpenForm, onOpenImport, onOpenAddTrade, onEditTrade, dailyNotes, onSaveNote, onDeleteNote, tags, strategyRules, evalFilter, setEvalFilter }) => {
  const [period, setPeriod] = useState('all');

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
          <button className="flex items-center gap-2 px-4 py-2.5 bg-bg-surface border border-border text-text-secondary text-sm font-semibold rounded-lg hover:text-text-primary hover:border-accent transition-all" onClick={onOpenImport}>
            <Icons.Download className="w-4 h-4" />
            Import CSV
          </button>
          {subscriptionStatus && subscriptionStatus.isPremium && (subscriptionStatus.tradeCount == null || subscriptionStatus.tradeCount < 50) && (
            <button className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all" onClick={onOpenForm}>
              <Icons.Plus className="w-4 h-4" />
              New Trade
            </button>
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
          change={showChange ? calcPercentChange(stats.totalTrades, prevStats.totalTrades) : null} />
        <StatCard label="Avg Duration" value={formatDuration(stats.avgDuration)} color="text-text-primary" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <AvgWinLossCard avgWin={stats.avgWin} avgLoss={stats.avgLoss} />
        <StatCard label="Best Trade" value={`$${stats.bestTrade.toFixed(2)}`} color="text-positive"
          change={showChange ? calcPercentChange(stats.bestTrade, prevStats.bestTrade) : null} />
        <StatCard label="Worst Trade" value={`$${stats.worstTrade.toFixed(2)}`} color="text-negative" />
      </div>

      {/* Calendar */}
      <CalendarView trades={baseTrades} dailyNotes={dailyNotes} onSaveNote={onSaveNote} onDeleteNote={onDeleteNote} tags={tags} subscriptionStatus={subscriptionStatus} strategyRules={strategyRules} onOpenAddTrade={onOpenAddTrade} onEditTrade={onEditTrade} />
    </div>
  );
};


module.exports = DashboardPage;
