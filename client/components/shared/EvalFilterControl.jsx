const React = require('react');

const EvalFilterControl = ({ trades, evalFilter, setEvalFilter }) => {
  if (!trades.some(t => t.isEval)) return null;
  return (
    <div className="flex-shrink-0 flex border border-border rounded-lg overflow-hidden text-xs font-medium">
      {[
        { value: 'all', label: 'All' },
        { value: 'exclude', label: 'Excl. Evals' },
        { value: 'only', label: 'Only Evals' },
      ].map(({ value, label }, i, arr) => (
        <button
          key={value}
          className={`px-3 py-1.5 transition-colors ${i < arr.length - 1 ? 'border-r border-border' : ''} ${
            evalFilter === value
              ? 'bg-accent/15 text-accent'
              : 'bg-bg-input text-text-secondary hover:text-text-primary'
          }`}
          onClick={() => setEvalFilter(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

module.exports = EvalFilterControl;
