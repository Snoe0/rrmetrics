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

// Query the grid container's actual DOM to find portal targets
function scanTargets(containerEl) {
  const targets = {};
  if (!containerEl) return targets;
  const items = containerEl.querySelectorAll('.grid-stack-item');
  items.forEach(item => {
    const id = item.getAttribute('gs-id');
    const content = item.querySelector('.grid-stack-item-content');
    if (id && content) targets[id] = content;
  });
  return targets;
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
    defaultWidgets.forEach(w => {
      if (vis[w.id] === undefined) vis[w.id] = true;
    });
    return vis;
  });
  const [ready, setReady] = useState(false);
  const [portalTargets, setPortalTargets] = useState({});
  const savePendingRef = useRef(null);

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

  // Rescan portal targets from actual DOM
  const refreshPortals = useCallback(() => {
    setPortalTargets(scanTargets(containerRef.current));
  }, []);

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
      cellHeight: 70,
      margin: 8,
      float: false,
      animate: true,
      staticGrid: true,
      disableOneColumnMode: true,
    }, containerRef.current);

    gridRef.current = grid;

    // Add widgets using options API — let GridStack create the DOM
    const visibleWidgets = defaultWidgets.filter(w => widgetVisibility[w.id] !== false);
    grid.batchUpdate(true);
    visibleWidgets.forEach(def => {
      const savedWidget = saved && saved.widgets && saved.widgets.find(w => w.id === def.id);
      const pos = savedWidget && savedWidget.visible !== false ? savedWidget : def;
      grid.addWidget({
        id: def.id,
        x: pos.x, y: pos.y, w: pos.w, h: pos.h,
        minW: def.minW, minH: def.minH,
      });
    });
    grid.batchUpdate(false);

    // Restore lock state
    if (saved && saved.locked === false) {
      grid.setStatic(false);
      setIsLocked(false);
    }

    grid.on('change', () => persistLayout());

    setReady(true);
    // Scan DOM after GridStack has created all elements
    setPortalTargets(scanTargets(containerRef.current));

    return () => {
      if (savePendingRef.current) clearTimeout(savePendingRef.current);
      grid.destroy(false);
      gridRef.current = null;
      setReady(false);
      setPortalTargets({});
    };
  }, []);

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

    const isCurrentlyVisible = widgetVisibility[widgetId] !== false;

    if (!isCurrentlyVisible) {
      const def = defaultWidgets.find(w => w.id === widgetId);
      if (def) {
        grid.addWidget({
          id: def.id,
          w: def.w, h: def.h,
          minW: def.minW, minH: def.minH,
        });
      }
    } else {
      const items = grid.getGridItems();
      const el = items.find(item => item.getAttribute('gs-id') === widgetId);
      if (el) grid.removeWidget(el, false);
    }

    // Scan synchronously — addWidget/removeWidget update DOM immediately
    const newTargets = scanTargets(containerRef.current);
    setPortalTargets(newTargets);
    setWidgetVisibility({ ...widgetVisibility, [widgetId]: !isCurrentlyVisible });
    persistLayout();
  }, [defaultWidgets, widgetVisibility, persistLayout]);

  const resetLayout = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;

    grid.removeAll(false);

    const newVis = {};
    grid.batchUpdate(true);
    defaultWidgets.forEach(def => {
      newVis[def.id] = true;
      grid.addWidget({
        id: def.id,
        x: def.x, y: def.y, w: def.w, h: def.h,
        minW: def.minW, minH: def.minH,
      });
    });
    grid.batchUpdate(false);

    setWidgetVisibility(newVis);
    setIsLocked(true);
    grid.setStatic(true);

    localStorage.removeItem(getStorageKey(pageKey));

    setPortalTargets(scanTargets(containerRef.current));
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
    portalTargets,
  };
}

module.exports = { useGridStack };
