const { getPointValue } = require('./tickValues');
const { toEST } = require('./dateUtils');

const getTradePL = (trade) => {
  if (trade.manualPL !== null && trade.manualPL !== undefined) return trade.manualPL;
  return (trade.exitPrice - trade.enterPrice) * trade.quantity * getPointValue(trade.ticker);
};

const calculateAnalytics = (trades) => {
  if (!trades || trades.length === 0) {
    return {
      totalPL: 0, winRate: 0, avgWin: 0, avgLoss: 0,
      totalTrades: 0, wins: 0, losses: 0, avgDuration: 0,
      bestTrade: 0, worstTrade: 0,
    };
  }

  const tradesWithPL = trades.map(trade => ({
    ...trade,
    pl: getTradePL(trade),
    duration: new Date(trade.exitTime) - new Date(trade.enterTime)
  }));

  const winningTrades = tradesWithPL.filter(trade => trade.pl > 0);
  const losingTrades = tradesWithPL.filter(trade => trade.pl < 0);

  const totalPL = tradesWithPL.reduce((sum, trade) => sum + trade.pl, 0);
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, trade) => sum + trade.pl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, trade) => sum + trade.pl, 0) / losingTrades.length : 0;
  const avgDuration = tradesWithPL.reduce((sum, trade) => sum + trade.duration, 0) / tradesWithPL.length;
  const winRate = (winningTrades.length / tradesWithPL.length) * 100;

  const allPLs = tradesWithPL.map(trade => trade.pl);
  const bestTrade = Math.max(...allPLs);
  const worstTrade = Math.min(...allPLs);

  return {
    totalPL, winRate, avgWin, avgLoss,
    totalTrades: trades.length, wins: winningTrades.length,
    losses: losingTrades.length, avgDuration, bestTrade, worstTrade,
  };
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

module.exports = { getTradePL, calculateAnalytics, groupTradesByDate };
