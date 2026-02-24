const React = require('react');
const Icons = require('./Icons');

const RuleChecklist = ({ rules, checks, onToggle, loading }) => {
  if (!rules || rules.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {rules.map(rule => {
        const check = checks.find(ch => ch.ruleId === rule._id);
        const followed = check ? check.followed : false;
        return (
          <button
            key={rule._id}
            className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
              followed
                ? 'bg-positive/10 text-positive'
                : 'bg-bg-input text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => onToggle(rule._id, !followed)}
            disabled={loading}
          >
            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
              followed ? 'bg-positive border-positive' : 'border-border'
            }`}>
              {followed && <Icons.Check className="w-3 h-3 text-white" />}
            </span>
            {rule.label}
          </button>
        );
      })}
    </div>
  );
};

module.exports = RuleChecklist;
