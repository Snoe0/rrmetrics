const React = require('react');
const { useState, useRef, useEffect } = React;
const Icons = require('./Icons');

const LayoutControls = ({ isLocked, setIsLocked, widgetVisibility, toggleWidget, resetLayout, widgetDefs }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="flex items-center gap-1.5">
      {/* Lock toggle */}
      <button
        onClick={() => setIsLocked(!isLocked)}
        className={`p-2 rounded-lg border transition-all ${
          isLocked
            ? 'border-border text-text-tertiary hover:text-text-secondary hover:border-text-muted'
            : 'border-accent/40 text-accent bg-accent/5 hover:bg-accent/10'
        }`}
        title={isLocked ? 'Unlock layout for editing' : 'Lock layout'}
      >
        {isLocked ? (
          <Icons.Lock className="w-4 h-4" />
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
          </svg>
        )}
      </button>

      {/* Widget visibility dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className={`p-2 rounded-lg border transition-all ${
            open
              ? 'border-accent/40 text-accent bg-accent/5'
              : 'border-border text-text-tertiary hover:text-text-secondary hover:border-text-muted'
          }`}
          title="Customize widgets"
        >
          <Icons.Settings className="w-4 h-4" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-bg-surface border border-border rounded-xl shadow-lg z-50 py-2">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Widgets</span>
            </div>
            <div className="py-1 max-h-[300px] overflow-y-auto">
              {widgetDefs.map(def => (
                <label
                  key={def.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-bg-input/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={widgetVisibility[def.id] !== false}
                    onChange={() => toggleWidget(def.id)}
                    className="accent-checkbox"
                  />
                  <span className="text-sm text-text-secondary">{def.label}</span>
                </label>
              ))}
            </div>
            <div className="px-3 pt-2 pb-1 border-t border-border">
              <button
                onClick={() => { resetLayout(); setOpen(false); }}
                className="w-full text-xs text-text-tertiary hover:text-text-primary py-1.5 px-3 rounded-lg border border-border hover:border-text-muted transition-all"
              >
                Reset Layout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

module.exports = LayoutControls;
