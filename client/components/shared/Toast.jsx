const React = require('react');
const { useEffect } = React;
const Icons = require('./Icons');

const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex items-start gap-3 bg-bg-surface border border-amber-500/40 rounded-xl px-4 py-3 shadow-2xl max-w-sm">
      <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-text-primary text-sm font-semibold">Duplicates skipped</p>
        <p className="text-text-secondary text-xs mt-0.5">{toast.message}</p>
      </div>
      <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0 mt-0.5">
        <Icons.X className="w-4 h-4" />
      </button>
    </div>
  );
};

module.exports = Toast;
