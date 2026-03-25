const { getPointValue, isBreakevenTrade } = require('./tickValues');
const { toEST } = require('./dateUtils');

const getTradePL = (trade) => {
  if (trade.manualPL !== null && trade.manualPL !== undefined) return trade.manualPL;
  return (trade.exitPrice - trade.enterPrice) * trade.quantity * getPointValue(trade.ticker);
};

const calculateAnalytics = (trades) => {
  const empty = {
    totalPL: 0, winRate: 0, avgWin: 0, avgLoss: 0,
    totalTrades: 0, wins: 0, losses: 0, breakevens: 0,
    breakevenPct: 0, avgDuration: 0, bestTrade: 0, worstTrade: 0,
  };
  if (!trades || trades.length === 0) return empty;

  const tradesWithPL = trades.map(trade => ({
    ...trade,
    pl: getTradePL(trade),
    duration: new Date(trade.exitTime) - new Date(trade.enterTime),
    isBE: isBreakevenTrade(trade),
  }));

  const beCount = tradesWithPL.filter(t => t.isBE).length;
  const decisive = tradesWithPL.filter(t => !t.isBE);

  const winningTrades = decisive.filter(t => t.pl > 0);
  const losingTrades = decisive.filter(t => t.pl <= 0);

  const totalPL = tradesWithPL.reduce((sum, t) => sum + t.pl, 0);
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.pl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + t.pl, 0) / losingTrades.length : 0;
  const avgDuration = tradesWithPL.reduce((sum, t) => sum + t.duration, 0) / tradesWithPL.length;
  const winRate = decisive.length > 0 ? (winningTrades.length / decisive.length) * 100 : 0;

  const allPLs = tradesWithPL.map(t => t.pl);
  const bestTrade = Math.max(...allPLs);
  const worstTrade = Math.min(...allPLs);

  return {
    totalPL, winRate, avgWin, avgLoss,
    totalTrades: trades.length, wins: winningTrades.length,
    losses: losingTrades.length, breakevens: beCount,
    breakevenPct: (beCount / trades.length) * 100,
    avgDuration, bestTrade, worstTrade,
  };
};

// Sharpe ratio: mean(daily returns) / stdev(daily returns), annualized
const calculateSharpeRatio = (trades) => {
  const dailyReturns = getDailyReturns(trades);
  if (dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;

  // Annualize: ~252 trading days
  return (mean / std) * Math.sqrt(252);
};

// Sortino ratio: mean(daily returns) / downside deviation, annualized
const calculateSortinoRatio = (trades) => {
  const dailyReturns = getDailyReturns(trades);
  if (dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const negReturns = dailyReturns.filter(r => r < 0);
  if (negReturns.length === 0) return mean > 0 ? Infinity : 0;

  const downsideVariance = dailyReturns.reduce((s, r) => s + Math.min(0, r) ** 2, 0) / dailyReturns.length;
  const downsideDev = Math.sqrt(downsideVariance);
  if (downsideDev === 0) return 0;

  return (mean / downsideDev) * Math.sqrt(252);
};

// Helper: get array of daily P/L totals
const getDailyReturns = (trades) => {
  if (!trades || trades.length === 0) return [];
  const grouped = groupTradesByDate(trades);
  return Object.values(grouped).map(d => d.totalPL);
};

// Monte Carlo simulation for eval pass rate
// Config: { profitTarget, maxDrawdown, simulations, tradesPerDay }
const runMonteCarloSimulation = (trades, config = {}) => {
  const {
    profitTarget = 3000,
    maxDrawdown = 2000,
    simulations = 10000,
    maxDays = 100,
  } = config;

  if (!trades || trades.length === 0) return { passRate: 0, avgDaysToPass: 0, medianDaysToPass: 0 };

  // Get per-trade P/L values (excluding breakevens for simulation realism)
  const pls = trades.map(t => getTradePL(t));

  // Compute average trades per day from actual data
  const grouped = groupTradesByDate(trades);
  const dayCounts = Object.values(grouped).map(d => d.tradeCount);
  const avgTradesPerDay = dayCounts.reduce((s, c) => s + c, 0) / dayCounts.length;
  const tradesPerDay = Math.round(avgTradesPerDay) || 1;

  let passes = 0;
  const daysToPass = [];

  for (let sim = 0; sim < simulations; sim++) {
    let equity = 0;
    let peak = 0;
    let passed = false;

    for (let day = 1; day <= maxDays; day++) {
      // Simulate a day of trading
      for (let t = 0; t < tradesPerDay; t++) {
        const pl = pls[Math.floor(Math.random() * pls.length)];
        equity += pl;
        if (equity > peak) peak = equity;
      }

      // Check EOD trailing drawdown
      const drawdown = peak - equity;
      if (drawdown >= maxDrawdown) break;

      // Check profit target
      if (equity >= profitTarget) {
        passed = true;
        daysToPass.push(day);
        break;
      }
    }

    if (passed) passes++;
  }

  const passRate = (passes / simulations) * 100;
  const sorted = [...daysToPass].sort((a, b) => a - b);
  const avgDaysToPass = sorted.length > 0 ? sorted.reduce((s, d) => s + d, 0) / sorted.length : 0;
  const medianDaysToPass = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

  return { passRate, avgDaysToPass, medianDaysToPass, totalSimulations: simulations };
};

const groupTradesByDate = (trades) => {
  const grouped = {};
  trades.forEach(trade => {
    const pl = getTradePL(trade);
    const e = toEST(trade.exitTime);
    const dateKey = `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
    if (!grouped[dateKey]) grouped[dateKey] = { totalPL: 0, tradeCount: 0, trades: [] };
    grouped[dateKey].totalPL += pl;
    grouped[dateKey].tradeCount++;
    grouped[dateKey].trades.push(trade);
  });
  return grouped;
};

const applyEvalFilter = (trades, evalFilter) => {
  if (evalFilter === 'exclude') return trades.filter(t => !t.isEval);
  if (evalFilter === 'only') return trades.filter(t => t.isEval);
  return trades;
};

module.exports = {
  getTradePL, calculateAnalytics, groupTradesByDate, applyEvalFilter,
  calculateSharpeRatio, calculateSortinoRatio, runMonteCarloSimulation,
};
