const React = require('react');
const { useState } = React;
const ChangeIndicator = require('./ChangeIndicator');

const StatCard = ({ label, value, subValue, color, change, tooltip }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div className="relative rounded-xl border border-border bg-gradient-to-t from-accent/[0.03] to-bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-text-secondary text-xs font-medium tracking-wide flex items-center gap-1.5">
          {label}
          {tooltip && (
            <span
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-text-tertiary/40 text-text-tertiary text-[9px] cursor-help select-none"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >?</span>
          )}
        </div>
        {change !== undefined && change !== null && <ChangeIndicator value={change} />}
      </div>
      <div className={`font-mono text-2xl font-bold tracking-tight ${color || 'text-text-primary'}`}>{value}</div>
      {subValue && <div className="text-text-tertiary text-xs mt-1.5">{subValue}</div>}
      {tooltip && showTooltip && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-bg-input border border-border rounded-lg p-3 shadow-lg text-xs text-text-secondary leading-relaxed whitespace-pre-line">
          {tooltip}
        </div>
      )}
    </div>
  );
};

module.exports = StatCard;
