const React = require('react');
const { useState, useEffect, useRef } = React;
const Icons = require('./Icons');

const AccountFilterDropdown = ({ trades, selectedAccounts, setSelectedAccounts }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Extract unique non-empty account names
  const accounts = [...new Set((trades || []).map(t => t.account).filter(Boolean))].sort();
  if (accounts.length === 0) return null;

  const toggleAccount = (acct) => {
    setSelectedAccounts(prev =>
      prev.includes(acct) ? prev.filter(a => a !== acct) : [...prev, acct]
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          selectedAccounts.length > 0
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-border bg-bg-input text-text-secondary hover:text-text-primary'
        }`}
      >
        <Icons.Briefcase size={12} className="w-3 h-3" />
        <span>{selectedAccounts.length > 0 ? `${selectedAccounts.length} account${selectedAccounts.length > 1 ? 's' : ''}` : 'Accounts'}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-bg-surface border border-border rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
          {accounts.map(acct => {
            const isSelected = selectedAccounts.includes(acct);
            return (
              <button
                key={acct}
                onClick={() => toggleAccount(acct)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-bg-input transition-colors text-left"
              >
                <span className={`flex-1 truncate ${isSelected ? 'text-text-primary' : 'text-text-tertiary'}`}>
                  {acct}
                </span>
                {isSelected && (
                  <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                )}
              </button>
            );
          })}
          {selectedAccounts.length > 0 && (
            <button
              onClick={() => setSelectedAccounts([])}
              className="w-full text-xs text-accent hover:bg-bg-input px-3 py-1.5 border-t border-border mt-1 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
};

module.exports = AccountFilterDropdown;
