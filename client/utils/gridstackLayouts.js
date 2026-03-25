const DASHBOARD_WIDGETS = [
  { id: 'dash-primary-stats', label: 'Primary Stats', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 1 },
  { id: 'dash-secondary-stats', label: 'Secondary Stats', x: 0, y: 2, w: 12, h: 2, minW: 6, minH: 1 },
  { id: 'dash-calendar', label: 'Calendar', x: 0, y: 4, w: 12, h: 16, minW: 8, minH: 10 },
];

const ANALYTICS_WIDGETS = [
  { id: 'ana-primary-stats', label: 'Primary Stats', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 1 },
  { id: 'ana-secondary-stats', label: 'Secondary Stats', x: 0, y: 2, w: 12, h: 3, minW: 6, minH: 2 },
  { id: 'ana-long-short', label: 'Long vs Short', x: 0, y: 5, w: 12, h: 4, minW: 6, minH: 3 },
  { id: 'ana-equity-curve', label: 'Equity Curve', x: 0, y: 9, w: 6, h: 6, minW: 4, minH: 4 },
  { id: 'ana-detailed-stats', label: 'Detailed Statistics', x: 6, y: 9, w: 6, h: 6, minW: 4, minH: 4 },
  { id: 'ana-ticker-pl', label: 'P/L by Ticker', x: 0, y: 15, w: 6, h: 6, minW: 4, minH: 4 },
  { id: 'ana-perf-day', label: 'Performance by Day', x: 6, y: 15, w: 6, h: 6, minW: 4, minH: 4 },
  { id: 'ana-perf-time', label: 'Performance by Time', x: 0, y: 21, w: 12, h: 7, minW: 6, minH: 5 },
  { id: 'ana-monte-carlo', label: 'Monte Carlo Simulation', x: 0, y: 28, w: 12, h: 8, minW: 6, minH: 5 },
];

module.exports = { DASHBOARD_WIDGETS, ANALYTICS_WIDGETS };
