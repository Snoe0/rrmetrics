const React = require('react');
const { useState, useEffect } = React;
const helper = require('../../helper.js');
const { authFetch } = helper;
const { getTradePL } = require('../../utils/analytics');
const { formatDuration, formatDateEST, formatTimeEST } = require('../../utils/dateUtils');
const { TAG_COLOR_PRESETS } = require('../../utils/tagConstants');
const Icons = require('../shared/Icons');
const RuleChecklist = require('../shared/RuleChecklist');

const TradeListPage = ({ trades, triggerReload, onEdit, onOpenForm, onOpenImport, tags, strategyRules }) => {
  const [searchTicker, setSearchTicker] = useState('');
  const [sortField, setSortField] = useState('exitTime');
  const [sortDir, setSortDir] = useState('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sideFilters, setSideFilters] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [showNewTagInline, setShowNewTagInline] = useState(false);
  const [inlineTagName, setInlineTagName] = useState('');
  const [inlineTagColor, setInlineTagColor] = useState(TAG_COLOR_PRESETS[0]);
  const [inlineTagCreating, setInlineTagCreating] = useState(false);
  const [expandedTradeId, setExpandedTradeId] = useState(null);
  const [tradeChecksMap, setTradeChecksMap] = useState({});
  const [checksLoading, setChecksLoading] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [selectedTradeIds, setSelectedTradeIds] = useState(new Set());
  const [bulkTagPickerOpen, setBulkTagPickerOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  useEffect(() => {
    setSelectedTradeIds(new Set());
  }, [searchTicker, dateFrom, dateTo, sideFilters, filterTags]);

  const COLUMN_DEFS = [
    { id: 'date', label: 'Date', alwaysOn: true },
    { id: 'ticker', label: 'Ticker', alwaysOn: true },
    { id: 'tags', label: 'Tags' },
    { id: 'entry', label: 'Entry' },
    { id: 'exit', label: 'Exit' },
    { id: 'qty', label: 'Qty' },
    { id: 'pl', label: 'P/L', alwaysOn: true },
    { id: 'duration', label: 'Duration' },
  ];
  const DEFAULT_COLUMNS = ['date','ticker','tags','entry','exit','qty','pl','duration'];
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('tradeTableColumns'));
      if (Array.isArray(saved)) return saved;
    } catch {}
    return DEFAULT_COLUMNS;
  });
  const toggleColumn = (colId) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId];
      localStorage.setItem('tradeTableColumns', JSON.stringify(next));
      return next;
    });
  };
  const isCol = (colId) => visibleColumns.includes(colId);
  const visibleColCount = visibleColumns.length + 2; // +1 for checkbox, +1 for actions

  const doDelete = async (id) => {
    setDeletingIds(prev => new Set([...prev, id]));
    setDeleteConfirmId(null);
    try {
      const response = await authFetch('/api/removeTrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: id }),
      });
      const data = await response.json();
      if (data.error) {
        setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      } else {
        triggerReload();
      }
    } catch {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleDeleteClick = (id) => {
    if (localStorage.getItem('skipTradeDeleteConfirm') === 'true') {
      doDelete(id);
    } else {
      setDeleteConfirmId(id);
    }
  };

  const tradeRules = strategyRules ? strategyRules.filter(r => r.type === 'trade') : [];

  const fetchTradeChecksForList = async (tradeId) => {
    if (tradeChecksMap[tradeId] !== undefined) return;
    try {
      const resp = await authFetch(`/api/strategy/checks/trade/${tradeId}`);
      const data = await resp.json();
      if (!data.error) setTradeChecksMap(prev => ({ ...prev, [tradeId]: data.checks || [] }));
    } catch (err) {
      console.error('Failed to fetch trade checks:', err);
    }
  };

  const handleTradeRuleToggle = async (tradeId, ruleId, followed) => {
    setChecksLoading(true);
    try {
      const resp = await authFetch('/api/strategy/checks/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId, ruleId, followed }),
      });
      const check = await resp.json();
      if (!check.error) {
        setTradeChecksMap(prev => {
          const existing = prev[tradeId] || [];
          const filtered = existing.filter(ch => ch.ruleId !== ruleId);
          return { ...prev, [tradeId]: [...filtered, check] };
        });
      }
    } catch (err) {
      console.error('Failed to toggle trade check:', err);
    } finally {
      setChecksLoading(false);
    }
  };

  const handleInlineCreateTag = async () => {
    if (!inlineTagName.trim() || inlineTagCreating) return;
    setInlineTagCreating(true);
    try {
      const response = await authFetch('/api/makeTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inlineTagName.trim(), color: inlineTagColor }),
      });
      const data = await response.json();
      if (!data.error) {
        setInlineTagName('');
        setInlineTagColor(TAG_COLOR_PRESETS[0]);
        setShowNewTagInline(false);
        triggerReload();
      }
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
    setInlineTagCreating(false);
  };

  /**
   * handleBulkEval - Marks or unmarks selected trades as evaluation trades.
   * Calls POST /api/bulkUpdateTrades with action 'markEval' or 'unmarkEval'.
   * Clears selection and triggers data reload on success.
   * @param {boolean} isEval - true to mark as eval, false to unmark
   */
  const handleBulkEval = async (isEval) => {
    if (selectedTradeIds.size === 0 || bulkActionLoading) return;
    setBulkActionLoading(true);
    try {
      const response = await authFetch('/api/bulkUpdateTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeIds: [...selectedTradeIds],
          action: isEval ? 'markEval' : 'unmarkEval',
        }),
      });
      const data = await response.json();
      if (!data.error) {
        setSelectedTradeIds(new Set());
        triggerReload();
      }
    } catch (err) {
      console.error('Bulk eval error:', err);
    }
    setBulkActionLoading(false);
  };

  /**
   * handleBulkAddTags - Adds one or more tags to all selected trades.
   * Calls POST /api/bulkUpdateTrades with action 'addTags' and tag ID array.
   * Closes tag picker, clears selection, and triggers reload on success.
   * @param {string[]} tagIds - Array of tag IDs to add
   */
  const handleBulkAddTags = async (tagIds) => {
    if (selectedTradeIds.size === 0 || tagIds.length === 0 || bulkActionLoading) return;
    setBulkActionLoading(true);
    try {
      const response = await authFetch('/api/bulkUpdateTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeIds: [...selectedTradeIds],
          action: 'addTags',
          tags: tagIds,
        }),
      });
      const data = await response.json();
      if (!data.error) {
        setBulkTagPickerOpen(false);
        setSelectedTradeIds(new Set());
        triggerReload();
      }
    } catch (err) {
      console.error('Bulk add tags error:', err);
    }
    setBulkActionLoading(false);
  };

  /**
   * handleBulkDelete - Deletes all selected trades after confirmation.
   * Calls POST /api/bulkDeleteTrades with array of trade IDs.
   * Closes confirm modal, clears selection, and triggers reload on success.
   */
  const handleBulkDelete = async () => {
    if (selectedTradeIds.size === 0 || bulkActionLoading) return;
    setBulkActionLoading(true);
    try {
      const response = await authFetch('/api/bulkDeleteTrades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeIds: [...selectedTradeIds] }),
      });
      const data = await response.json();
      if (!data.error) {
        setBulkDeleteConfirm(false);
        setSelectedTradeIds(new Set());
        triggerReload();
      }
    } catch (err) {
      console.error('Bulk delete error:', err);
    }
    setBulkActionLoading(false);
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const colMap = [
      { id: 'date', header: 'Date', value: t => new Date(t.exitTime).toISOString(), alwaysOn: true },
      { id: 'ticker', header: 'Ticker', value: t => t.ticker, alwaysOn: true },
      { id: 'tags', header: 'Tags', value: t => {
        if (!t.tags || !tags) return '';
        return t.tags.map(tid => { const tag = tags.find(tg => tg._id === tid); return tag ? tag.name : ''; }).filter(Boolean).join('; ');
      }},
      { id: 'entry', header: 'Enter Price', value: t => t.enterPrice },
      { id: 'exit', header: 'Exit Price', value: t => t.exitPrice },
      { id: 'qty', header: 'Quantity', value: t => t.quantity },
      { id: 'pl', header: 'P/L', value: t => getTradePL(t).toFixed(2), alwaysOn: true },
      { id: 'duration', header: 'Duration', value: t => {
        const dur = new Date(t.exitTime) - new Date(t.enterTime);
        return formatDuration(dur);
      }},
    ];
    const activeCols = colMap.filter(c => c.alwaysOn || visibleColumns.includes(c.id));
    // Always include enter/exit times and comments in export for completeness
    const headers = [...activeCols.map(c => c.header), 'Enter Time', 'Exit Time', 'Comments'];
    const rows = filtered.map(t => {
      return [
        ...activeCols.map(c => c.value(t)),
        new Date(t.enterTime).toISOString(),
        new Date(t.exitTime).toISOString(),
        (t.comments || '').replace(/"/g, '""'),
      ].map(v => `"${v}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rr-metrics-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let filtered = deletingIds.size > 0 ? trades.filter(t => !deletingIds.has(t._id)) : trades;

  if (searchTicker) {
    const terms = searchTicker.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (terms.length > 0) {
      filtered = filtered.filter(t => terms.some(term => t.ticker.toLowerCase().includes(term)));
    }
  }

  if (filterTags.length > 0) {
    filtered = filtered.filter(t =>
      t.tags && t.tags.some(tagId => filterTags.includes(tagId))
    );
  }

  if (sideFilters.length > 0) {
    filtered = filtered.filter(t => {
      const pl = getTradePL(t);
      return sideFilters.every(f => {
        if (f === 'wins') return pl > 0;
        if (f === 'losses') return pl < 0;
        if (f === 'long') return t.quantity > 0;
        if (f === 'short') return t.quantity < 0;
        return true;
      });
    });
  }

  if (dateFrom) {
    const from = new Date(dateFrom);
    filtered = filtered.filter(t => new Date(t.exitTime) >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    filtered = filtered.filter(t => new Date(t.exitTime) <= to);
  }

  filtered = [...filtered].sort((a, b) => {
    let valA, valB;
    if (sortField === 'ticker') {
      valA = a.ticker.toLowerCase();
      valB = b.ticker.toLowerCase();
    } else if (sortField === 'pl') {
      valA = getTradePL(a);
      valB = getTradePL(b);
    } else {
      valA = new Date(a[sortField]);
      valB = new Date(b[sortField]);
    }
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <Icons.ChevronUp className="w-3 h-3 ml-1 inline" /> : <Icons.ChevronDown className="w-3 h-3 ml-1 inline" />;
  };

  const formatDateTime = (dateString) => formatDateEST(dateString);

  const formatTime = (dateString) => formatTimeEST(dateString);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Trades</h1>
          <p className="text-text-secondary text-sm mt-1">Manage and review your trade history</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-bg-surface border border-border text-text-secondary text-sm font-semibold rounded-lg hover:text-text-primary hover:border-accent transition-all disabled:opacity-40"
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Export CSV
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-bg-surface border border-border text-text-secondary text-sm font-semibold rounded-lg hover:text-text-primary hover:border-accent transition-all"
            onClick={onOpenImport}
          >
            <Icons.Download className="w-4 h-4" />
            Import CSV
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all" onClick={onOpenForm}>
            <Icons.Plus className="w-4 h-4" />
            New Trade
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
          <input
            type="text"
            placeholder="Search tickers (comma-separated)..."
            value={searchTicker}
            onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
            className="w-full pl-9 pr-4 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
            style={{ textTransform: 'uppercase' }}
            autoComplete="off"
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
        />
        <div className="flex items-center gap-1.5">
          {[
            { id: 'long', label: 'Long', activeClass: 'bg-positive/15 border-positive/50 text-positive' },
            { id: 'short', label: 'Short', activeClass: 'bg-negative/15 border-negative/50 text-negative' },
            { id: 'wins', label: 'Wins', activeClass: 'bg-positive/15 border-positive/50 text-positive' },
            { id: 'losses', label: 'Losses', activeClass: 'bg-negative/15 border-negative/50 text-negative' },
          ].map(opt => {
            const isActive = sideFilters.includes(opt.id);
            return (
              <button
                key={opt.id}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? opt.activeClass
                    : 'bg-bg-input border-border text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => setSideFilters(prev =>
                  prev.includes(opt.id) ? prev.filter(f => f !== opt.id) : [...prev, opt.id]
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags && tags.map(tag => {
            const isActive = filterTags.includes(tag._id);
            return (
              <button
                key={tag._id}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  !isActive ? 'bg-bg-input border-border text-text-secondary hover:text-text-primary' : ''
                }`}
                style={isActive ? {
                  borderColor: tag.color,
                  backgroundColor: tag.color + '20',
                  color: tag.color,
                } : undefined}
                onClick={() => {
                  setFilterTags(prev =>
                    prev.includes(tag._id)
                      ? prev.filter(id => id !== tag._id)
                      : [...prev, tag._id]
                  );
                }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }}></span>
                {tag.name}
              </button>
            );
          })}
          {!showNewTagInline ? (
            <button
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-dashed border-border text-text-tertiary hover:text-text-primary hover:border-accent transition-colors"
              onClick={() => setShowNewTagInline(true)}
            >
              <Icons.Plus className="w-3 h-3" />
              New Tag
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-bg-input border border-border rounded-full">
              <input
                type="text"
                value={inlineTagName}
                onChange={(e) => setInlineTagName(e.target.value)}
                placeholder="Tag name"
                className="bg-transparent text-text-primary text-xs focus:outline-none w-20 placeholder-text-muted"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleInlineCreateTag(); if (e.key === 'Escape') { setShowNewTagInline(false); setInlineTagName(''); } }}
              />
              {TAG_COLOR_PRESETS.slice(0, 4).map(color => (
                <button
                  key={color}
                  type="button"
                  className={`w-4 h-4 rounded-full border transition-all flex-shrink-0 ${
                    inlineTagColor === color ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setInlineTagColor(color)}
                />
              ))}
              <button
                className="text-accent text-xs font-semibold hover:brightness-110 disabled:opacity-50 px-1"
                onClick={handleInlineCreateTag}
                disabled={inlineTagCreating || !inlineTagName.trim()}
              >
                {inlineTagCreating ? '...' : 'Add'}
              </button>
              <button
                className="text-text-muted text-xs hover:text-text-primary px-0.5"
                onClick={() => { setShowNewTagInline(false); setInlineTagName(''); }}
              >
                &times;
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-text-tertiary text-sm">{filtered.length} trade{filtered.length !== 1 ? 's' : ''}</span>
          <div className="relative">
            <button
              onClick={() => setShowColumnMenu(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-tertiary hover:text-text-primary hover:bg-bg-input border border-border transition-colors"
              title="Toggle columns"
            >
              <Icons.Layers className="w-3.5 h-3.5" />
              Columns
            </button>
            {showColumnMenu && (
              <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColumnMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-bg-surface border border-border rounded-lg shadow-xl p-1.5 min-w-[160px]">
                {COLUMN_DEFS.filter(c => !c.alwaysOn).map(col => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer hover:bg-bg-input transition-colors"
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isCol(col.id) ? 'bg-accent border-accent' : 'border-border'
                      }`}
                      onClick={(e) => { e.preventDefault(); toggleColumn(col.id); }}
                    >
                      {isCol(col.id) && <Icons.Check className="w-3 h-3 text-accent-text" />}
                    </div>
                    <span className="text-sm text-text-secondary">{col.label}</span>
                  </label>
                ))}
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action bar — shown when one or more trades are checkbox-selected */}
      {selectedTradeIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-accent/10 border border-accent/30 rounded-xl">
          <span className="text-sm font-semibold text-text-primary">{selectedTradeIds.size} trade{selectedTradeIds.size !== 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              className="px-3 py-1.5 text-xs font-medium bg-bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-all disabled:opacity-50"
              onClick={() => handleBulkEval(true)}
              disabled={bulkActionLoading}
            >
              Mark Eval
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium bg-bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-all disabled:opacity-50"
              onClick={() => handleBulkEval(false)}
              disabled={bulkActionLoading}
            >
              Unmark Eval
            </button>
            <div className="relative">
              <button
                className="px-3 py-1.5 text-xs font-medium bg-bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent transition-all disabled:opacity-50"
                onClick={() => setBulkTagPickerOpen(v => !v)}
                disabled={bulkActionLoading}
              >
                Add Tags
              </button>
              {bulkTagPickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBulkTagPickerOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-20 bg-bg-surface border border-border rounded-lg shadow-xl p-2 min-w-[180px]">
                    {tags && tags.map(tag => (
                      <button
                        key={tag._id}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors"
                        onClick={() => handleBulkAddTags([tag._id])}
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }}></span>
                        {tag.name}
                      </button>
                    ))}
                    {(!tags || tags.length === 0) && (
                      <p className="text-text-muted text-xs px-3 py-2">No tags created yet</p>
                    )}
                  </div>
                </>
              )}
            </div>
            <button
              className="px-3 py-1.5 text-xs font-medium bg-negative/10 border border-negative/30 rounded-lg text-negative hover:bg-negative/20 transition-all disabled:opacity-50"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkActionLoading}
            >
              Delete
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium text-text-tertiary hover:text-text-primary transition-colors"
              onClick={() => setSelectedTradeIds(new Set())}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-tertiary text-lg">No trades yet</p>
            <p className="text-text-muted text-sm mt-1">Add your first trade to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-border accent-accent"
                      checked={filtered.length > 0 && filtered.every(t => selectedTradeIds.has(t._id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTradeIds(new Set(filtered.map(t => t._id)));
                        } else {
                          setSelectedTradeIds(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-primary" onClick={() => toggleSort('exitTime')}>
                    Date <SortIcon field="exitTime" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-primary" onClick={() => toggleSort('ticker')}>
                    Ticker <SortIcon field="ticker" />
                  </th>
                  {isCol('tags') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Tags</th>}
                  {isCol('entry') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Entry</th>}
                  {isCol('exit') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Exit</th>}
                  {isCol('qty') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Qty</th>}
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-primary" onClick={() => toggleSort('pl')}>
                    P/L <SortIcon field="pl" />
                  </th>
                  {isCol('duration') && <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Duration</th>}
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-tertiary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(trade => {
                  const pl = getTradePL(trade);
                  const duration = new Date(trade.exitTime) - new Date(trade.enterTime);
                  const isExpanded = expandedTradeId === trade._id;
                  const tradeTags = tags && trade.tags ? tags.filter(tag => trade.tags.includes(tag._id)) : [];
                  return (
                    <React.Fragment key={trade._id}>
                      <tr
                        className="border-b border-border/50 hover:bg-bg-input/50 transition-colors cursor-pointer"
                        onClick={() => onEdit(trade)}
                      >
                        <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-border accent-accent"
                            checked={selectedTradeIds.has(trade._id)}
                            onChange={() => {
                              setSelectedTradeIds(prev => {
                                const next = new Set(prev);
                                if (next.has(trade._id)) next.delete(trade._id);
                                else next.add(trade._id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-text-primary text-sm">{formatDateTime(trade.exitTime)}</div>
                          <div className="text-text-muted text-xs">{formatTime(trade.enterTime)} - {formatTime(trade.exitTime)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-semibold text-text-primary">{trade.ticker}</span>
                          <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            trade.quantity > 0
                              ? 'bg-positive/15 text-positive'
                              : 'bg-negative/15 text-negative'
                          }`}>
                            {trade.quantity > 0 ? 'LONG' : 'SHORT'}
                          </span>
                          {trade.isEval && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/15 text-accent">EVAL</span>
                          )}
                        </td>
                        {isCol('tags') && (
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {trade.tags && trade.tags.map(tagId => {
                                const tag = tags && tags.find(t => t._id === tagId);
                                if (!tag) return null;
                                return (
                                  <span
                                    key={tagId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                    style={{ backgroundColor: tag.color + '20', color: tag.color }}
                                  >
                                    {tag.name}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        )}
                        {isCol('entry') && <td className="px-4 py-3 font-mono text-sm text-text-secondary">${trade.enterPrice.toFixed(2)}</td>}
                        {isCol('exit') && <td className="px-4 py-3 font-mono text-sm text-text-secondary">${trade.exitPrice.toFixed(2)}</td>}
                        {isCol('qty') && <td className="px-4 py-3 font-mono text-sm text-text-secondary">{trade.quantity}</td>}
                        <td className="px-4 py-3">
                          <span className={`font-mono text-sm font-semibold ${pl >= 0 ? 'text-positive' : 'text-negative'}`}>
                            {pl >= 0 ? '+' : ''}${pl.toFixed(2)}
                          </span>
                          {trade.manualPL !== null && trade.manualPL !== undefined && (
                            <span className="text-text-muted text-xs ml-1">(M)</span>
                          )}
                        </td>
                        {isCol('duration') && <td className="px-4 py-3 text-sm text-text-secondary">{formatDuration(duration)}</td>}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-input transition-colors"
                              onClick={(e) => { e.stopPropagation(); onEdit(trade); }}
                              title="Edit"
                            >
                              <Icons.Edit />
                            </button>
                            <button
                              className="p-1.5 rounded-lg text-text-tertiary hover:text-negative hover:bg-negative/10 transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleDeleteClick(trade._id); }}
                              title="Delete"
                            >
                              <Icons.Trash />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border/50">
                          <td colSpan={visibleColCount} className="px-6 py-4 bg-bg-input/20">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div className="space-y-3">
                                {tradeTags.length > 0 && (
                                  <div>
                                    <span className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">Tags</span>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                      {tradeTags.map(tag => (
                                        <span key={tag._id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: tag.color + '22', color: tag.color }}>
                                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }}></span>
                                          {tag.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {trade.comments && (
                                  <div>
                                    <span className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">Notes</span>
                                    <div className="text-xs text-text-secondary bg-bg-surface rounded-lg px-3 py-2 mt-1.5">{trade.comments}</div>
                                  </div>
                                )}
                                {trade.screenshot && (
                                  <div>
                                    <span className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">Screenshot</span>
                                    <img src={trade.screenshot} alt="Trade screenshot" className="rounded-lg border border-border max-h-48 w-full object-contain bg-bg-surface mt-1.5" />
                                  </div>
                                )}
                                {!trade.comments && !trade.screenshot && tradeTags.length === 0 && tradeRules.length === 0 && (
                                  <p className="text-text-muted text-xs">No notes or screenshot attached to this trade.</p>
                                )}
                              </div>
                              {tradeRules.length > 0 && (
                                <div>
                                  <span className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">Trade Rules</span>
                                  <div className="mt-1.5">
                                    <RuleChecklist
                                      rules={tradeRules}
                                      checks={tradeChecksMap[trade._id] || []}
                                      onToggle={(ruleId, followed) => handleTradeRuleToggle(trade._id, ruleId, followed)}
                                      loading={checksLoading}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-bg-surface border border-border rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-text-primary font-semibold mb-1">Delete Trade</h3>
            <p className="text-text-secondary text-sm mb-5">Are you sure you want to delete this trade? This cannot be undone.</p>
            <label className="flex items-center gap-2 text-text-tertiary text-sm mb-5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded"
                onChange={e => {
                  if (e.target.checked) localStorage.setItem('skipTradeDeleteConfirm', 'true');
                  else localStorage.removeItem('skipTradeDeleteConfirm');
                }}
              />
              Do not show again
            </label>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                onClick={() => setDeleteConfirmId(null)}
              >Cancel</button>
              <button
                className="px-4 py-2 text-sm bg-negative text-white rounded-lg hover:opacity-80 transition-opacity"
                onClick={() => doDelete(deleteConfirmId)}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="bg-bg-surface border border-border rounded-xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-text-primary font-semibold mb-1">Delete {selectedTradeIds.size} Trade{selectedTradeIds.size !== 1 ? 's' : ''}</h3>
            <p className="text-text-secondary text-sm mb-5">Are you sure you want to delete {selectedTradeIds.size} trade{selectedTradeIds.size !== 1 ? 's' : ''}? This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                onClick={() => setBulkDeleteConfirm(false)}
              >Cancel</button>
              <button
                className="px-4 py-2 text-sm bg-negative text-white rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
                onClick={handleBulkDelete}
                disabled={bulkActionLoading}
              >{bulkActionLoading ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};


module.exports = TradeListPage;
