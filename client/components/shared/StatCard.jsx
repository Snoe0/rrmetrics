const React = require('react');
const ChangeIndicator = require('./ChangeIndicator');

const StatCard = ({ label, value, subValue, color, change }) => (
  <div className="bg-bg-surface border border-border rounded-xl p-5">
    <div className="text-text-secondary text-xs font-medium uppercase tracking-wider mb-2">{label}</div>
    <div className="flex items-baseline gap-2">
      <div className={`font-mono text-2xl font-bold ${color || 'text-text-primary'}`}>{value}</div>
      {change !== undefined && change !== null && <ChangeIndicator value={change} />}
    </div>
    {subValue && <div className="text-text-tertiary text-xs mt-1">{subValue}</div>}
  </div>
);

module.exports = StatCard;
