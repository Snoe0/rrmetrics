const React = require('react');
const { useState, useEffect } = React;
const helper = require('../../helper.js');
const { authFetch } = helper;
const Icons = require('../shared/Icons');
const { toEST } = require('../../utils/dateUtils');
const { getTradePL } = require('../../utils/analytics');

const PreMarketPage = ({ subscriptionStatus, trades }) => {
  const [items, setItems] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [settings, setSettings] = useState({ resetTime: '06:00', timezone: 'America/New_York' });
  const [loading, setLoading] = useState(true);
  const [newItemLabel, setNewItemLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [consistencyData, setConsistencyData] = useState(null);
  const [consistencyLoading, setConsistencyLoading] = useState(true);

  const isElite = subscriptionStatus && subscriptionStatus.isPremium;

  const getTodayDate = () => {
    const now = new Date();
    return now.toLocaleDateString('en-CA'); // YYYY-MM-DD
  };

  const todayDate = getTodayDate();

  const fetchChecklist = async () => {
    try {
      const resp = await authFetch(`/api/premarket/checklist?date=${todayDate}`);
      const data = await resp.json();
      if (!data.error) {
        setItems(data.items || []);
        setCompletions(data.completions || []);
        if (data.settings) {
          setSettings({
            resetTime: data.settings.resetTime,
            timezone: data.settings.timezone,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch checklist:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConsistency = async () => {
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 90);
      const startDate = start.toLocaleDateString('en-CA');
      const endDate = end.toLocaleDateString('en-CA');
      const resp = await authFetch(`/api/premarket/consistency?startDate=${startDate}&endDate=${endDate}`);
      const data = await resp.json();
      if (!data.error) {
        setConsistencyData(data.completionsByDate || {});
      }
    } catch (err) {
      console.error('Failed to fetch consistency:', err);
    } finally {
      setConsistencyLoading(false);
    }
  };

  useEffect(() => {
    if (!isElite) { setLoading(false); setConsistencyLoading(false); return; }
    fetchChecklist();
    fetchConsistency();
  }, [isElite]);

  const addItem = async () => {
    const label = newItemLabel.trim();
    if (!label) return;
    try {
      const resp = await authFetch('/api/premarket/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, sortOrder: items.length }),
      });
      const item = await resp.json();
      if (!item.error) {
        setItems([...items, item]);
        setNewItemLabel('');
      }
    } catch (err) {
      console.error('Failed to add item:', err);
    }
  };

  const updateItem = async (id) => {
    const label = editingLabel.trim();
    if (!label) return;
    try {
      const resp = await authFetch(`/api/premarket/checklist/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const updated = await resp.json();
      if (!updated.error) {
        setItems(items.map(i => i._id === id ? updated : i));
        setEditingId(null);
        setEditingLabel('');
      }
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  };

  const deleteItem = async (id) => {
    try {
      await authFetch(`/api/premarket/checklist/${id}`, { method: 'DELETE' });
      setItems(items.filter(i => i._id !== id));
      setCompletions(completions.filter(c => c.itemId !== id));
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const toggleItem = async (itemId) => {
    // Optimistic update — immediately reflect in UI
    const wasCompleted = completions.some(c => c.itemId === itemId);
    if (wasCompleted) {
      setCompletions(prev => prev.filter(c => c.itemId !== itemId));
    } else {
      setCompletions(prev => [...prev, { itemId, completedDate: todayDate }]);
    }
    try {
      const resp = await authFetch('/api/premarket/checklist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, date: todayDate }),
      });
      const result = await resp.json();
      if (result.error) {
        // Revert on error
        if (wasCompleted) {
          setCompletions(prev => [...prev, { itemId, completedDate: todayDate }]);
        } else {
          setCompletions(prev => prev.filter(c => c.itemId !== itemId));
        }
      }
    } catch (err) {
      console.error('Failed to toggle item:', err);
      // Revert on error
      if (wasCompleted) {
        setCompletions(prev => [...prev, { itemId, completedDate: todayDate }]);
      } else {
        setCompletions(prev => prev.filter(c => c.itemId !== itemId));
      }
    }
  };

  const saveSettings = async (resetTime, timezone) => {
    try {
      const resp = await authFetch('/api/premarket/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetTime, timezone }),
      });
      const result = await resp.json();
      if (!result.error) {
        setSettings(prev => ({ ...prev, resetTime: result.resetTime, timezone: result.timezone }));
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const isCompleted = (itemId) => completions.some(c => c.itemId === itemId);
  const completedCount = items.filter(i => isCompleted(i._id)).length;
  const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalDate, setSelectedCalDate] = useState(null);

  const toggleCalendarItem = async (itemId, date) => {
    if (!date) return;
    const completedIds = consistencyData?.[date] || [];
    const wasCompleted = completedIds.includes(itemId);

    // Optimistic update
    setConsistencyData(prev => {
      const updated = { ...prev };
      if (wasCompleted) {
        updated[date] = (updated[date] || []).filter(id => id !== itemId);
      } else {
        updated[date] = [...(updated[date] || []), itemId];
      }
      return updated;
    });
    if (date === todayDate) {
      if (wasCompleted) {
        setCompletions(prev => prev.filter(c => c.itemId !== itemId));
      } else {
        setCompletions(prev => [...prev, { itemId, completedDate: todayDate }]);
      }
    }

    try {
      const resp = await authFetch('/api/premarket/checklist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, date }),
      });
      const result = await resp.json();
      if (result.error) {
        // Revert
        await fetchConsistency();
        if (date === todayDate) await fetchChecklist();
      }
    } catch (err) {
      console.error('Failed to toggle item:', err);
      await fetchConsistency();
      if (date === todayDate) await fetchChecklist();
    }
  };

  const timezoneLabels = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Los_Angeles': 'PT',
    'UTC': 'UTC',
  };

  if (!isElite) {
    return (
      <div className="text-center py-16">
        <Icons.Sunrise className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h2 className="text-text-primary text-xl font-semibold mb-2">Pre-Market Prep</h2>
        <p className="text-text-secondary text-sm mb-6 max-w-md mx-auto">
          Build a daily pre-market checklist, track your routine consistency, and see how your preparation correlates with trading performance.
        </p>
        <a href="/upgrade" className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-text text-sm font-semibold rounded-xl hover:brightness-110 transition-all">
          <Icons.Zap className="w-4 h-4" /> Upgrade to Elite
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // --- Consistency analytics (computed client-side) ---
  const now90 = new Date();
  const start90 = new Date();
  start90.setDate(start90.getDate() - 90);
  const start90Str = start90.toLocaleDateString('en-CA');
  const now90Str = now90.toLocaleDateString('en-CA');

  const tradingDates = trades
    ? [...new Set(
        trades
          .filter(t => t.exitTime)
          .map(t => {
            const e = toEST(t.exitTime);
            return `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
          })
          .filter(d => d >= start90Str && d <= now90Str)
      )]
    : [];

  const tradingDaysCount = tradingDates.length;

  const itemConsistency = consistencyData !== null && items.length > 0
    ? items.map(item => {
        const daysCompleted = tradingDates.filter(d => {
          const completedIds = consistencyData[d] || [];
          return completedIds.includes(item._id);
        }).length;
        const rate = tradingDaysCount > 0 ? daysCompleted / tradingDaysCount : 0;
        return { item, daysCompleted, rate };
      }).sort((a, b) => a.rate - b.rate)
    : [];

  const overallRate = itemConsistency.length > 0
    ? itemConsistency.reduce((sum, x) => sum + x.rate, 0) / itemConsistency.length
    : 0;

  const overallPct = Math.round(overallRate * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Pre-Market Prep</h1>
          <p className="text-text-secondary text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
        >
          <Icons.Settings className="w-3.5 h-3.5" />
          {settings.resetTime} {timezoneLabels[settings.timezone] || settings.timezone}
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-bg-surface border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Reset Settings</h3>
          <p className="text-xs text-text-secondary">Checklist resets daily at this time. Items completed before this time count for the previous day.</p>
          <div className="flex gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Reset Time</label>
              <select
                value={settings.resetTime}
                onChange={(e) => {
                  const newTime = e.target.value;
                  setSettings({ ...settings, resetTime: newTime });
                  saveSettings(newTime, settings.timezone);
                }}
                className="bg-bg-page border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
              >
                {Array.from({ length: 24 }, (_, i) => {
                  const h = String(i).padStart(2, '0');
                  return <option key={h} value={`${h}:00`}>{`${h}:00`}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Timezone</label>
              <select
                value={settings.timezone}
                onChange={(e) => {
                  const newTz = e.target.value;
                  setSettings({ ...settings, timezone: newTz });
                  saveSettings(settings.resetTime, newTz);
                }}
                className="bg-bg-page border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
              >
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Checklist Section */}
      <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">My Checklist</h2>
            <span className="text-xs text-text-secondary">{completedCount}/{items.length} complete</span>
          </div>
          {items.length > 0 && (
            <div className="w-full bg-bg-page rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ease-out bg-positive`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item._id} className="flex items-center gap-3 px-5 py-3 group hover:bg-bg-page/50 transition-colors">
              <button
                onClick={() => toggleItem(item._id)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  isCompleted(item._id)
                    ? 'bg-accent border-accent text-white'
                    : 'border-border hover:border-accent'
                }`}
              >
                {isCompleted(item._id) && (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </button>

              {editingId === item._id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateItem(item._id);
                      if (e.key === 'Escape') { setEditingId(null); setEditingLabel(''); }
                    }}
                    className="flex-1 bg-bg-page border border-border rounded px-2 py-1 text-sm text-text-primary"
                    autoFocus
                  />
                  <button onClick={() => updateItem(item._id)} className="text-accent text-xs font-medium">Save</button>
                  <button onClick={() => { setEditingId(null); setEditingLabel(''); }} className="text-text-secondary text-xs">Cancel</button>
                </div>
              ) : (
                <>
                  <span className={`flex-1 text-sm ${isCompleted(item._id) ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
                    {item.label}
                  </span>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={() => { setEditingId(item._id); setEditingLabel(item.label); }}
                      className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                    >
                      <Icons.Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteItem(item._id)}
                      className="p-1 text-text-secondary hover:text-negative transition-colors"
                    >
                      <Icons.X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add item */}
        <div className="px-5 py-3 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={newItemLabel}
              onChange={(e) => setNewItemLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
              placeholder="Add a checklist item..."
              className="flex-1 bg-bg-page border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary"
            />
            <button
              onClick={addItem}
              disabled={!newItemLabel.trim()}
              className="px-3 py-2 bg-accent text-gray-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Icons.Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar + Consistency — side by side */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prep Calendar (Mon-Fri only) */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Prep Calendar</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCalendarMonth(prev => {
                    const d = new Date(prev.year, prev.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="p-1 rounded hover:bg-bg-input text-text-muted hover:text-text-primary transition-colors"
                >
                  <Icons.ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-text-primary min-w-[100px] text-center">
                  {new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setCalendarMonth(prev => {
                    const d = new Date(prev.year, prev.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="p-1 rounded hover:bg-bg-input text-text-muted hover:text-text-primary transition-colors"
                >
                  <Icons.ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="p-4">
              {(() => {
                const { year, month } = calendarMonth;
                const daysInMonth = new Date(year, month + 1, 0).getDate();

                // Build rows: each row is Mon-Fri for one week
                const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
                const weeks = [];
                let currentWeek = [null, null, null, null, null]; // Mon-Fri slots

                for (let d = 1; d <= daysInMonth; d++) {
                  const date = new Date(year, month, d);
                  const dow = date.getDay(); // 0=Sun, 6=Sat
                  if (dow === 0 || dow === 6) continue; // skip weekends
                  const slot = dow - 1; // Mon=0, Tue=1, ... Fri=4
                  currentWeek[slot] = d;
                  if (dow === 5 || d === daysInMonth) {
                    weeks.push(currentWeek);
                    currentWeek = [null, null, null, null, null];
                  }
                }

                return (
                  <div>
                    <div className="grid grid-cols-5 gap-1 mb-1">
                      {dayNames.map(d => (
                        <div key={d} className="text-center text-[9px] font-medium text-text-muted py-0.5">{d}</div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      {weeks.map((week, wi) => (
                        <div key={wi} className="grid grid-cols-5 gap-1">
                          {week.map((day, di) => {
                            if (day === null) return <div key={`e-${di}`} />;

                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isToday = dateStr === todayDate;
                            const isFuture = dateStr > todayDate;
                            const isSelected = dateStr === selectedCalDate;
                            const completedIds = consistencyData?.[dateStr] || [];
                            const done = completedIds.length;
                            const total = items.length;
                            const allDone = done >= total && total > 0;
                            const someDone = done > 0 && done < total;

                            return (
                              <button
                                key={day}
                                onClick={() => !isFuture && setSelectedCalDate(isSelected ? null : dateStr)}
                                className={`relative aspect-square rounded text-[11px] font-medium transition-all flex items-center justify-center ${
                                  isFuture ? 'text-text-muted/30 cursor-default' :
                                  allDone ? 'bg-positive/15 text-positive' :
                                  someDone ? 'bg-yellow-500/10 text-yellow-600' :
                                  'bg-bg-page text-text-muted hover:bg-bg-input'
                                } ${isToday ? 'ring-2 ring-accent' : ''} ${isSelected ? 'ring-2 ring-text-primary' : ''}`}
                              >
                                {day}
                                {allDone && (
                                  <svg className="absolute bottom-0 right-0 w-2 h-2 text-positive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Selected day task list */}
                    {selectedCalDate && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs font-semibold text-text-primary mb-2">
                          {new Date(selectedCalDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <div className="space-y-1">
                          {items.map(item => {
                            const completedIds = consistencyData?.[selectedCalDate] || [];
                            const isDone = completedIds.includes(item._id);
                            return (
                              <button
                                key={item._id}
                                onClick={() => toggleCalendarItem(item._id, selectedCalDate)}
                                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-bg-input/50 transition-colors"
                              >
                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isDone ? 'bg-accent border-accent text-white' : 'border-border'
                                }`}>
                                  {isDone && (
                                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </span>
                                <span className={`text-xs ${isDone ? 'line-through text-text-secondary' : 'text-text-primary'}`}>{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Legend */}
                    <div className="flex items-center gap-3 mt-3 text-[9px] text-text-muted">
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-positive/15 inline-block" /> Done</div>
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-500/10 inline-block" /> Partial</div>
                      <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-bg-page inline-block" /> None</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Consistency Analytics */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Checklist Consistency</h2>
              <p className="text-xs text-text-secondary mt-0.5">On days you traded (last 90 days)</p>
            </div>

            {consistencyLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : tradingDaysCount === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                No trading days found in the last 90 days
              </div>
            ) : (
              <div className="px-4 py-4 space-y-4">
                {/* Overall stat */}
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="26" fill="none" className="stroke-border" strokeWidth="6" />
                      <circle
                        cx="32" cy="32" r="26" fill="none"
                        className="stroke-positive"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 26}`}
                        strokeDashoffset={`${2 * Math.PI * 26 * (1 - overallRate)}`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-text-primary">
                      {overallPct}%
                    </span>
                  </div>
                  <div>
                    <div className="text-text-primary font-semibold text-sm">Overall Adherence</div>
                    <div className="text-text-secondary text-xs mt-0.5">{tradingDaysCount} trading {tradingDaysCount === 1 ? 'day' : 'days'} analyzed</div>
                  </div>
                </div>

                {/* Per-item breakdown */}
                <div className="space-y-2">
                  {itemConsistency.map(({ item, daysCompleted, rate }) => {
                    const pct = Math.round(rate * 100);
                    const isMostSkipped = rate < 0.5;
                    return (
                      <div key={item._id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs text-text-primary truncate">{item.label}</span>
                            {isMostSkipped && (
                              <span className="text-[10px] text-negative font-medium flex-shrink-0">Most skipped</span>
                            )}
                          </div>
                          <span className="text-[10px] text-text-secondary flex-shrink-0 ml-2">
                            {daysCompleted}/{tradingDaysCount} — {pct}%
                          </span>
                        </div>
                        <div className="w-full bg-bg-page rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 bg-positive`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* P&L vs Prep Completion Chart */}
      {trades && trades.length > 0 && items.length > 0 && !consistencyLoading && (
        <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">P&L vs Prep Completion</h2>
            <p className="text-xs text-text-secondary mt-0.5">X-axis: tasks completed. Green = winning day, red = losing day.</p>
          </div>
          <div className="px-5 py-4">
            {(() => {
              // Group trades by date, compute daily P&L
              const dailyPL = {};
              trades.filter(t => t.exitTime).forEach(t => {
                const e = toEST(t.exitTime);
                const dateStr = `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
                if (dateStr < start90Str || dateStr > now90Str) return;
                if (!dailyPL[dateStr]) dailyPL[dateStr] = 0;
                dailyPL[dateStr] += getTradePL(t);
              });

              const totalTasks = items.length;
              const dataPoints = Object.entries(dailyPL).map(([date, pl]) => {
                const completedIds = consistencyData?.[date] || [];
                const tasksCompleted = completedIds.length;
                return { date, pl, tasksCompleted };
              });

              if (dataPoints.length === 0) {
                return <p className="text-text-muted text-sm text-center py-4">No trading days with P&L data in the last 90 days</p>;
              }

              const pls = dataPoints.map(d => d.pl);
              const maxPL = Math.max(...pls, 0);
              const minPL = Math.min(...pls, 0);
              const range = Math.max(maxPL - minPL, 1);

              const chartW = 600;
              const chartH = 220;
              const padL = 60;
              const padR = 20;
              const padT = 15;
              const padB = 35;
              const plotW = chartW - padL - padR;
              const plotH = chartH - padT - padB;

              const zeroY = padT + plotH * (maxPL / range);

              return (
                <div>
                  <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" style={{ maxHeight: '260px' }}>
                    {/* Zero line */}
                    <line x1={padL} y1={zeroY} x2={chartW - padR} y2={zeroY} stroke="rgb(var(--border))" strokeWidth="1" strokeDasharray="4 2" />
                    <text x={padL - 8} y={zeroY + 3} textAnchor="end" fill="rgb(var(--text-muted))" fontSize="9" fontFamily="monospace">$0</text>

                    {/* Max line */}
                    {maxPL > 0 && (
                      <>
                        <line x1={padL} y1={padT} x2={chartW - padR} y2={padT} stroke="rgb(var(--border))" strokeWidth="0.5" />
                        <text x={padL - 8} y={padT + 3} textAnchor="end" fill="rgb(var(--text-muted))" fontSize="9" fontFamily="monospace">
                          ${maxPL >= 1000 ? `${(maxPL / 1000).toFixed(1)}k` : maxPL.toFixed(0)}
                        </text>
                      </>
                    )}

                    {/* Min line */}
                    {minPL < 0 && (
                      <>
                        <line x1={padL} y1={padT + plotH} x2={chartW - padR} y2={padT + plotH} stroke="rgb(var(--border))" strokeWidth="0.5" />
                        <text x={padL - 8} y={padT + plotH + 3} textAnchor="end" fill="rgb(var(--text-muted))" fontSize="9" fontFamily="monospace">
                          {minPL >= -1000 ? `-$${Math.abs(minPL).toFixed(0)}` : `-$${(Math.abs(minPL) / 1000).toFixed(1)}k`}
                        </text>
                      </>
                    )}

                    {/* X-axis labels (task count) */}
                    {Array.from({ length: totalTasks + 1 }, (_, i) => {
                      const x = padL + (i / totalTasks) * plotW;
                      return (
                        <g key={i}>
                          <line x1={x} y1={padT + plotH} x2={x} y2={padT + plotH + 4} stroke="rgb(var(--border))" strokeWidth="0.5" />
                          <text x={x} y={chartH - 8} textAnchor="middle" fill="rgb(var(--text-muted))" fontSize="9" fontFamily="monospace">{i}</text>
                        </g>
                      );
                    })}
                    <text x={padL + plotW / 2} y={chartH - 0} textAnchor="middle" fill="rgb(var(--text-muted))" fontSize="8">Tasks Completed</text>

                    {/* Vertical grid lines */}
                    {Array.from({ length: totalTasks + 1 }, (_, i) => {
                      const x = padL + (i / totalTasks) * plotW;
                      return <line key={i} x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgb(var(--border))" strokeWidth="0.3" strokeDasharray="2 3" />;
                    })}

                    {/* Data points */}
                    {dataPoints.map((d) => {
                      const x = padL + (d.tasksCompleted / totalTasks) * plotW;
                      const y = padT + plotH * ((maxPL - d.pl) / range);
                      const isWin = d.pl > 0;
                      return (
                        <g key={d.date}>
                          <circle
                            cx={x} cy={y} r={5}
                            fill={isWin ? 'rgb(var(--positive))' : 'rgb(var(--negative))'}
                            fillOpacity={0.8}
                            stroke={isWin ? 'rgb(var(--positive))' : 'rgb(var(--negative))'}
                            strokeWidth={1.5}
                          />
                          <title>{`${d.date}: $${d.pl.toFixed(2)} (${d.tasksCompleted}/${totalTasks} tasks)`}</title>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Summary stats by task completion */}
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {[
                      { label: 'All Done', filter: d => d.tasksCompleted >= totalTasks, color: 'text-positive' },
                      { label: 'Partial', filter: d => d.tasksCompleted > 0 && d.tasksCompleted < totalTasks, color: 'text-yellow-500' },
                      { label: 'No Prep', filter: d => d.tasksCompleted === 0, color: 'text-negative' },
                    ].map(({ label, filter, color }) => {
                      const pts = dataPoints.filter(filter);
                      const avgPL = pts.length > 0 ? pts.reduce((s, d) => s + d.pl, 0) / pts.length : 0;
                      const winRate = pts.length > 0 ? (pts.filter(d => d.pl > 0).length / pts.length) * 100 : 0;
                      return (
                        <div key={label} className="bg-bg-input rounded-lg p-3 text-center">
                          <div className={`text-xs font-medium ${color} mb-1`}>{label}</div>
                          <div className="text-text-primary font-mono font-semibold text-sm">
                            {pts.length > 0 ? `$${avgPL.toFixed(0)}` : '—'}
                          </div>
                          <div className="text-text-muted text-xs">
                            {pts.length > 0 ? `${winRate.toFixed(0)}% win · ${pts.length} days` : 'No data'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};


module.exports = PreMarketPage;
