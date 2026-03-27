const React = require('react');

const TrendingUpIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const TrendingDownIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
    <polyline points="16 17 22 17 22 11" />
  </svg>
);

const ChangeIndicator = ({ value }) => {
  if (value === null || value === undefined || !isFinite(value)) return null;
  const isPositive = value > 0;
  const isZero = value === 0;

  if (isZero) return null;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
      isPositive
        ? 'bg-positive/10 text-positive'
        : 'bg-negative/10 text-negative'
    }`}>
      {isPositive ? <TrendingUpIcon /> : <TrendingDownIcon />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

module.exports = ChangeIndicator;
