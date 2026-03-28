const React = require('react');

const ChangeIndicator = ({ value }) => {
  if (value === null || value === undefined || !isFinite(value)) return null;
  const isPositive = value > 0;
  const isZero = value === 0;
  return (
    <span className={`inline-flex items-center text-xs font-medium ${isZero ? 'text-text-muted' : isPositive ? 'text-positive' : 'text-negative'}`}>
      {isPositive ? '\u25B2' : isZero ? '' : '\u25BC'} {Math.abs(value).toFixed(1)}%
    </span>
  );
};

module.exports = ChangeIndicator;
