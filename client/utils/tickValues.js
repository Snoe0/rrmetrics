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

const getPointValue = (ticker) => TICK_VALUES[(ticker || '').toUpperCase()] ?? 1;

module.exports = { TICK_VALUES, COMMON_TICKERS, getPointValue };
