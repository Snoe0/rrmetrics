const React = require('react');
const { useState, useEffect, useRef, useCallback } = React;

const STORAGE_PREFIX = 'gridstack-';

function getStorageKey(pageKey) {
  return STORAGE_PREFIX + pageKey;
}

function loadLayout(pageKey) {
  try {
    const raw = localStorage.getItem(getStorageKey(pageKey));
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.version === 1) return data;
    }
  } catch (e) { /* ignore corrupt data */ }
  return null;
}

function saveLayout(pageKey, data) {
  try {
    localStorage.setItem(getStorageKey(pageKey), JSON.stringify(data));
  } catch (e) { /* quota exceeded, etc */ }
}

function useGridStack(pageKey, defaultWidgets) {
  const containerRef = useRef(null);
  const gridRef = useRef(null);
  const [isLocked, setIsLocked] = useState(true);
  const [widgetVisibility, setWidgetVisibility] = useState(() => {
    const saved = loadLayout(pageKey);
    const vis = {};
    if (saved && saved.widgets) {
      saved.widgets.forEach(w => { vis[w.id] = w.visible !== false; });
    }
    // Ensure all default widgets have a visibility entry
    defaultWidgets.forEach(w => {
      if (vis[w.id] === undefined) vis[w.id] = true;
    });
    return vis;
  });
  const [ready, setReady] = useState(false);
  const savePendingRef = useRef(null);

  // Debounced save
  const persistLayout = useCallback(() => {
    if (savePendingRef.current) clearTimeout(savePendingRef.current);
    savePendingRef.current = setTimeout(() => {
      const grid = gridRef.current;
      if (!grid) return;

      const items = grid.getGridItems();
      const widgets = defaultWidgets.map(def => {
        const el = items.find(item => item.getAttribute('gs-id') === def.id);
        if (el) {
          return {
            id: def.id,
            x: parseInt(el.getAttribute('gs-x')) || 0,
            y: parseInt(el.getAttribute('gs-y')) || 0,
            w: parseInt(el.getAttribute('gs-w')) || def.w,
            h: parseInt(el.getAttribute('gs-h')) || def.h,
            visible: true,
          };
        }
        return { id: def.id, x: def.x, y: def.y, w: def.w, h: def.h, visible: false };
      });

      saveLayout(pageKey, { version: 1, locked: isLocked, widgets });
    }, 300);
  }, [pageKey, defaultWidgets, isLocked]);

  // Init GridStack
  useEffect(() => {
    if (!containerRef.current) return;

    let GridStack;
    try {
      GridStack = require('gridstack').GridStack;
    } catch (e) {
      console.error('GridStack not available:', e);
      return;
    }

    const saved = loadLayout(pageKey);

    const grid = GridStack.init({
      column: 12,
      cellHeight: 40,
      margin: 8,
      float: false,
      animate: true,
      staticGrid: true, // start locked
      disableOneColumnMode: true,
    }, containerRef.current);

    gridRef.current = grid;

    // Add widgets
    const visibleWidgets = defaultWidgets.filter(w => widgetVisibility[w.id] !== false);
    grid.batchUpdate(true);
    visibleWidgets.forEach(def => {
      const savedWidget = saved && saved.widgets && saved.widgets.find(w => w.id === def.id);
      const pos = savedWidget && savedWidget.visible !== false ? savedWidget : def;

      const el = document.createElement('div');
      el.className = 'grid-stack-item';
      el.setAttribute('gs-id', def.id);
      el.setAttribute('gs-x', pos.x);
      el.setAttribute('gs-y', pos.y);
      el.setAttribute('gs-w', pos.w);
      el.setAttribute('gs-h', pos.h);
      el.setAttribute('gs-min-w', def.minW);
      el.setAttribute('gs-min-h', def.minH);

      const content = document.createElement('div');
      content.className = 'grid-stack-item-content';
      content.id = 'gs-content-' + def.id;
      el.appendChild(content);

      grid.addWidget(el);
    });
    grid.batchUpdate(false);

    // Restore lock state
    if (saved && saved.locked === false) {
      grid.setStatic(false);
      setIsLocked(false);
    }

    grid.on('change', () => persistLayout());

    setReady(true);

    return () => {
      if (savePendingRef.current) clearTimeout(savePendingRef.current);
      grid.destroy(false);
      gridRef.current = null;
      setReady(false);
    };
  }, []); // Only run once on mount

  // Handle lock/unlock
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.setStatic(isLocked);
    persistLayout();
  }, [isLocked]);

  const toggleWidget = useCallback((widgetId) => {
    const grid = gridRef.current;
    if (!grid) return;

    setWidgetVisibility(prev => {
      const newVis = { ...prev, [widgetId]: !prev[widgetId] };

      if (newVis[widgetId]) {
        // Show widget - add it back
        const def = defaultWidgets.find(w => w.id === widgetId);
        if (def) {
          const el = document.createElement('div');
          el.className = 'grid-stack-item';
          el.setAttribute('gs-id', def.id);
          el.setAttribute('gs-w', def.w);
          el.setAttribute('gs-h', def.h);
          el.setAttribute('gs-min-w', def.minW);
          el.setAttribute('gs-min-h', def.minH);

          const content = document.createElement('div');
          content.className = 'grid-stack-item-content';
          content.id = 'gs-content-' + def.id;
          el.appendChild(content);

          grid.addWidget(el);
        }
      } else {
        // Hide widget - remove it
        const items = grid.getGridItems();
        const el = items.find(item => item.getAttribute('gs-id') === widgetId);
        if (el) grid.removeWidget(el, false);
      }

      // Save after toggle
      setTimeout(() => persistLayout(), 100);
      return newVis;
    });
  }, [defaultWidgets, persistLayout]);

  const resetLayout = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // Remove all existing widgets
    grid.removeAll(false);

    // Re-add all defaults
    const newVis = {};
    grid.batchUpdate(true);
    defaultWidgets.forEach(def => {
      newVis[def.id] = true;

      const el = document.createElement('div');
      el.className = 'grid-stack-item';
      el.setAttribute('gs-id', def.id);
      el.setAttribute('gs-x', def.x);
      el.setAttribute('gs-y', def.y);
      el.setAttribute('gs-w', def.w);
      el.setAttribute('gs-h', def.h);
      el.setAttribute('gs-min-w', def.minW);
      el.setAttribute('gs-min-h', def.minH);

      const content = document.createElement('div');
      content.className = 'grid-stack-item-content';
      content.id = 'gs-content-' + def.id;
      el.appendChild(content);

      grid.addWidget(el);
    });
    grid.batchUpdate(false);

    setWidgetVisibility(newVis);
    setIsLocked(true);
    grid.setStatic(true);

    // Clear saved layout
    localStorage.removeItem(getStorageKey(pageKey));
  }, [pageKey, defaultWidgets]);

  return {
    containerRef,
    gridRef,
    isLocked,
    setIsLocked,
    widgetVisibility,
    toggleWidget,
    resetLayout,
    ready,
  };
}

module.exports = { useGridStack };
