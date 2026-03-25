// Dollar value per 1 point of price movement for common futures contracts.
// Used when manualPL is not set. Add more tickers here as needed.
const TICK_VALUES = {
  // Equity index futures
  NQ: 20, MNQ: 2,
  ES: 50, MES: 5,
  YM: 5,  MYM: 0.5,
  RTY: 50, M2K: 5,
  // Metals
  GC: 100, MGC: 10,
  SI: 5000, SIL: 1000,
  // Energy
  CL: 1000, MCL: 100,
  NG: 10000,
  // Rates
  ZB: 1000, ZN: 1000, ZF: 1000,
};

const COMMON_TICKERS = [
  // Futures (from TICK_VALUES)
  'ES', 'MES', 'NQ', 'MNQ', 'YM', 'MYM', 'RTY', 'M2K',
  'GC', 'MGC', 'SI', 'SIL', 'CL', 'MCL', 'NG',
  'ZB', 'ZN', 'ZF',
  // Popular stocks & ETFs
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'NVDA', 'GOOGL',
  'META', 'AMD', 'INTC', 'JPM', 'BAC', 'DIS', 'NFLX',
  'COIN', 'SOFI', 'PLTR', 'IWM', 'DIA', 'GLD', 'TLT',
];

// Minimum price increment per contract. Stocks default to 0.01.
const TICK_SIZES = {
  NQ: 0.25, MNQ: 0.25,
  ES: 0.25, MES: 0.25,
  YM: 1.0,  MYM: 1.0,
  RTY: 0.10, M2K: 0.10,
  GC: 0.10, MGC: 0.10,
  SI: 0.005, SIL: 0.005,
  CL: 0.01, MCL: 0.01,
  NG: 0.001,
  ZB: 1/32, ZN: 1/64, ZF: 1/128,
};

const getPointValue = (ticker) => TICK_VALUES[(ticker || '').toUpperCase()] ?? 1;
const getTickSize = (ticker) => TICK_SIZES[(ticker || '').toUpperCase()] ?? 0.01;

const BREAKEVEN_TICK_THRESHOLD = 4;

const isBreakevenTrade = (trade) => {
  const priceDiff = Math.abs(trade.exitPrice - trade.enterPrice);
  const threshold = getTickSize(trade.ticker) * BREAKEVEN_TICK_THRESHOLD;
  return priceDiff <= threshold;
};

module.exports = { TICK_VALUES, TICK_SIZES, COMMON_TICKERS, getPointValue, getTickSize, isBreakevenTrade };
