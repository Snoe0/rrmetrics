const DASHBOARD_WIDGETS = [
  { id: 'dash-primary-stats', label: 'Primary Stats', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
  { id: 'dash-secondary-stats', label: 'Secondary Stats', x: 0, y: 2, w: 12, h: 2, minW: 6, minH: 2 },
  { id: 'dash-calendar', label: 'Calendar', x: 0, y: 4, w: 12, h: 9, minW: 8, minH: 6 },
];

const ANALYTICS_WIDGETS = [
  { id: 'ana-primary-stats', label: 'Primary Stats', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2 },
  { id: 'ana-secondary-stats', label: 'Secondary Stats', x: 0, y: 2, w: 12, h: 3, minW: 6, minH: 2 },
  { id: 'ana-long-short', label: 'Long vs Short', x: 0, y: 5, w: 12, h: 3, minW: 6, minH: 3 },
  { id: 'ana-equity-curve', label: 'Equity Curve', x: 0, y: 8, w: 6, h: 5, minW: 4, minH: 4 },
  { id: 'ana-detailed-stats', label: 'Detailed Statistics', x: 6, y: 8, w: 6, h: 5, minW: 4, minH: 4 },
  { id: 'ana-ticker-pl', label: 'P/L by Ticker', x: 0, y: 13, w: 6, h: 5, minW: 4, minH: 4 },
  { id: 'ana-perf-day', label: 'Performance by Day', x: 6, y: 13, w: 6, h: 5, minW: 4, minH: 4 },
  { id: 'ana-perf-time', label: 'Performance by Time', x: 0, y: 18, w: 12, h: 6, minW: 6, minH: 4 },
  { id: 'ana-monte-carlo', label: 'Monte Carlo Simulation', x: 0, y: 24, w: 12, h: 6, minW: 6, minH: 5 },
];

module.exports = { DASHBOARD_WIDGETS, ANALYTICS_WIDGETS };
