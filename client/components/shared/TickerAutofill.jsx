const React = require('react');
const { useState, useRef, useMemo } = React;
const { COMMON_TICKERS } = require('../../utils/tickValues');

const TickerAutofill = ({ id, name, placeholder, defaultValue, className, trades, onChange }) => {
  const [value, setValue] = useState(defaultValue || '');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef(null);

  // Build merged suggestion list: user history first, then static, deduplicated
  const suggestions = useMemo(() => {
    const userTickers = [...new Set((trades || []).map(t => (t.ticker || '').toUpperCase()).filter(Boolean))];
    const seen = new Set(userTickers);
    const staticFiltered = COMMON_TICKERS.filter(t => !seen.has(t));
    return [...userTickers, ...staticFiltered];
  }, [trades]);

  const filtered = useMemo(() => {
    const q = value.toUpperCase().trim();
    if (!q) return suggestions.slice(0, 8);
    return suggestions.filter(t => t.startsWith(q)).slice(0, 8);
  }, [value, suggestions]);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const select = (ticker) => {
    setValue(ticker);
    setOpen(false);
    setHighlightIdx(-1);
    if (onChange) onChange(ticker);
  };

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      select(filtered[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlightIdx(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={id}
        name={name}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const v = e.target.value.toUpperCase();
          setValue(v);
          setOpen(true);
          setHighlightIdx(-1);
          if (onChange) onChange(v);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={className}
        style={{ textTransform: 'uppercase' }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-bg-surface border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((t, i) => (
            <li
              key={t}
              className={`px-3 py-2 text-sm cursor-pointer font-mono ${i === highlightIdx ? 'bg-accent/20 text-accent' : 'text-text-primary hover:bg-bg-input'}`}
              onMouseDown={() => select(t)}
              onMouseEnter={() => setHighlightIdx(i)}
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

module.exports = TickerAutofill;
