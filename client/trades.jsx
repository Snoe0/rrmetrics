const helper = require('./helper.js');
const { authFetch, supabase } = helper;
const React = require('react');
const { useState, useEffect } = React;
const { createRoot } = require('react-dom/client');
require('./styles/globals.css');

// Context
const { SidePanelContext } = require('./utils/contexts');

// Shared components
const Icons = require('./components/shared/Icons');
const Toast = require('./components/shared/Toast');

// Layout
const Sidebar = require('./components/Sidebar');

// Modal components
const TradeFormPopup = require('./components/modals/TradeFormPopup');
const CSVImportModal = require('./components/modals/CSVImportModal');
const SyncPopup = require('./components/modals/SyncPopup');

// Page components
const DashboardPage = require('./components/pages/DashboardPage');
const TradeListPage = require('./components/pages/TradeListPage');
const AnalyticsPage = require('./components/pages/AnalyticsPage');
const SettingsPage = require('./components/pages/SettingsPage');
const PreMarketPage = require('./components/pages/PreMarketPage');
const StrategyPage = require('./components/pages/StrategyPage');
const BacktestingPage = require('./components/pages/BacktestingPage');
const TradeSyncerPage = require('./components/pages/TradeSyncerPage');
const DotGrid = require('./components/shared/DotGrid');
const OnboardingFlow = require('./components/OnboardingFlow');
const { useThemeFavicon } = require('./components/shared/LogoIcon');

const App = () => {
  const [currentPage, setCurrentPage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tv_code') || params.get('tv_error') || params.get('webull_code') || params.get('wb_error')) return 'settings';
    if (params.get('tab')) return params.get('tab');
    return 'dashboard';
  });
  const [reloadTrades, setReloadTrades] = useState(false);
  const [trades, setTrades] = useState([]);
  const [accountBrokers, setAccountBrokers] = useState({});
  const [tags, setTags] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [syncPopupOpen, setSyncPopupOpen] = useState(false);
  const [brokerStatuses, setBrokerStatuses] = useState([]);
  const [toast, setToast] = useState(null);
  const [syncNotification, setSyncNotification] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [customColors, setCustomColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('customColors')) || {}; } catch { return {}; }
  });
  const [dailyNotes, setDailyNotes] = useState([]);
  const [strategyRules, setStrategyRules] = useState([]);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => {
      const stored = localStorage.getItem('sidebar-width');
      return stored ? Number(stored) < 140 : localStorage.getItem('sidebar-collapsed') === 'true';
    }
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem('sidebar-width');
    return stored ? Number(stored) : (localStorage.getItem('sidebar-collapsed') === 'true' ? 64 : 240);
  });
  const [evalFilter, setEvalFilterState] = useState(() => {
    const stored = localStorage.getItem('evalFilter');
    return ['all', 'exclude', 'only'].includes(stored) ? stored : 'exclude';
  });

  const setEvalFilter = (val) => {
    setEvalFilterState(val);
    localStorage.setItem('evalFilter', val);
  };

  const [selectedAccounts, setSelectedAccounts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('rrmetrics_selectedAccounts'));
      if (Array.isArray(saved)) return saved;
    } catch {}
    return [];
  });

  useEffect(() => {
    localStorage.setItem('rrmetrics_selectedAccounts', JSON.stringify(selectedAccounts));
  }, [selectedAccounts]);

  useEffect(() => {
    if (trades && trades.length > 0 && selectedAccounts.length > 0) {
      const validAccounts = new Set(trades.map(t => t.account || 'Manual'));
      const cleaned = selectedAccounts.filter(a => validAccounts.has(a));
      if (cleaned.length !== selectedAccounts.length) {
        setSelectedAccounts(cleaned);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades]);

  const triggerReload = () => setReloadTrades(!reloadTrades);

  // Dynamic favicon matching accent color
  useThemeFavicon(theme, customColors);

  // Apply theme to DOM and persist
  useEffect(() => {
    const root = document.documentElement;
    const hexToChannels = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b];
    };
    const toRgbStr = (r, g, b) => `${r} ${g} ${b}`;
    const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));

    // 1. Set base theme
    const baseTheme = theme === 'custom' ? 'dark' : theme;
    root.setAttribute('data-theme', baseTheme);

    // 2. Clear non-accent overrides
    ['--bg-page', '--bg-surface', '--bg-input', '--border', '--text-primary', '--text-secondary', '--text-tertiary', '--text-muted', '--positive', '--negative'].forEach(p => root.style.removeProperty(p));

    // 3. Apply accent if set (all users)
    if (customColors.accent) {
      const [r, g, b] = hexToChannels(customColors.accent);
      root.style.setProperty('--accent', toRgbStr(r, g, b));
      // Use custom text color for accent buttons if set and not pure black/white
      if (customColors.textPrimary) {
        const tp = customColors.textPrimary.toLowerCase();
        if (tp !== '#000000' && tp !== '#ffffff') {
          const [tr, tg, tb] = hexToChannels(customColors.textPrimary);
          root.style.setProperty('--accent-text', toRgbStr(tr, tg, tb));
        } else {
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          root.style.setProperty('--accent-text', luminance > 0.5 ? '0 0 0' : '255 255 255');
        }
      } else {
        // Auto-compute accent-text based on luminance (WCAG relative luminance)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        root.style.setProperty('--accent-text', luminance > 0.5 ? '0 0 0' : '255 255 255');
      }
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-text');
    }

    // 4. Apply full custom overrides (Elite custom theme only)
    if (theme === 'custom') {
      if (customColors.bgPage) {
        const [r, g, b] = hexToChannels(customColors.bgPage);
        root.style.setProperty('--bg-page', toRgbStr(r, g, b));
      }
      if (customColors.bgSurface) {
        const [r, g, b] = hexToChannels(customColors.bgSurface);
        root.style.setProperty('--bg-surface', toRgbStr(r, g, b));
        root.style.setProperty('--bg-input', toRgbStr(clamp(r + 15), clamp(g + 15), clamp(b + 15)));
        root.style.setProperty('--border', toRgbStr(clamp(r + 20), clamp(g + 20), clamp(b + 20)));
      }
      if (customColors.textPrimary) {
        const [tr, tg, tb] = hexToChannels(customColors.textPrimary);
        root.style.setProperty('--text-primary', toRgbStr(tr, tg, tb));
        const bgHex = customColors.bgPage || '#050505';
        const [br, bg2, bb] = hexToChannels(bgHex);
        const blend = (fg, bg, a) => clamp(fg * a + bg * (1 - a));
        root.style.setProperty('--text-secondary', toRgbStr(blend(tr, br, 0.6), blend(tg, bg2, 0.6), blend(tb, bb, 0.6)));
        root.style.setProperty('--text-tertiary', toRgbStr(blend(tr, br, 0.43), blend(tg, bg2, 0.43), blend(tb, bb, 0.43)));
        root.style.setProperty('--text-muted', toRgbStr(blend(tr, br, 0.25), blend(tg, bg2, 0.25), blend(tb, bb, 0.25)));
      }
      if (customColors.positive) { const [r, g, b] = hexToChannels(customColors.positive); root.style.setProperty('--positive', toRgbStr(r, g, b)); }
      if (customColors.negative) { const [r, g, b] = hexToChannels(customColors.negative); root.style.setProperty('--negative', toRgbStr(r, g, b)); }
    }

    localStorage.setItem('theme', theme);
    localStorage.setItem('customColors', JSON.stringify(customColors));
  }, [theme, customColors]);

  // Fetch theme from account on mount
  useEffect(() => {
    const fetchAccountTheme = async () => {
      try {
        const response = await authFetch('/api/account');
        const data = await response.json();
        if (data.account && data.account.theme) {
          setTheme(data.account.theme);
          if (data.account.customColors) setCustomColors(data.account.customColors);
        }
        if (data.account && data.account.onboardingCompleted === false) setShowOnboarding(true);
      } catch (err) {
        console.error('Failed to fetch account theme:', err);
      }
    };
    fetchAccountTheme();
  }, []);

  const themeDebounceRef = React.useRef(null);

  const handleThemeChange = (newTheme, newCustomColors) => {
    setTheme(newTheme);
    if (newCustomColors !== undefined) setCustomColors(newCustomColors);
    const colorsToSave = newCustomColors !== undefined ? newCustomColors : customColors;

    if (themeDebounceRef.current) clearTimeout(themeDebounceRef.current);
    themeDebounceRef.current = setTimeout(() => {
      authFetch('/api/preferences/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme, customColors: colorsToSave }),
      }).catch(err => console.error('Failed to save theme:', err));
    }, 300);
  };

  useEffect(() => {
    const loadTradesFromServer = async () => {
      const response = await authFetch('/api/getTrades');
      const data = await response.json();
      setTrades(data.trades);
      if (data.accountBrokers) setAccountBrokers(data.accountBrokers);
    };
    loadTradesFromServer();
  }, [reloadTrades]);

  useEffect(() => {
    const loadTags = async () => {
      try {
        const response = await authFetch('/api/getTags');
        const data = await response.json();
        setTags(data.tags || []);
      } catch (err) {
        console.error('Failed to fetch tags:', err);
      }
    };
    loadTags();
  }, [reloadTrades]);

  useEffect(() => {
    authFetch('/api/strategy/rules')
      .then(r => r.json())
      .then(data => { if (data.rules) setStrategyRules(data.rules); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loadDailyNotes = async () => {
      try {
        const response = await authFetch('/api/getDailyNotes');
        const data = await response.json();
        setDailyNotes(data.notes || []);
      } catch (err) {
        console.error('Failed to fetch daily notes:', err);
      }
    };
    loadDailyNotes();
  }, [reloadTrades]);

  const handleSaveNote = async (date, content) => {
    try {
      const response = await authFetch('/api/saveDailyNote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, content }),
      });
      const data = await response.json();
      if (!data.error) {
        setDailyNotes(prev => {
          const filtered = prev.filter(n => n.date !== date);
          return [...filtered, data];
        });
      }
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  const handleDeleteNote = async (date) => {
    try {
      await authFetch('/api/removeDailyNote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      setDailyNotes(prev => prev.filter(n => n.date !== date));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // All broker types to auto-sync: { apiBase, brokerParam (optional), label }
  const SYNC_BROKERS = [
    { apiBase: '/api/tradovate', brokerParam: 'tradovate',           label: 'Tradovate' },
    { apiBase: '/api/tradovate', brokerParam: 'ninjatrader',         label: 'NinjaTrader' },
    { apiBase: '/api/tradovate', brokerParam: 'alpha_futures',       label: 'Alpha Futures' },
    { apiBase: '/api/tradovate', brokerParam: 'apex_trader_funding', label: 'Apex Trader Funding' },
    { apiBase: '/api/webull',    brokerParam: null,                  label: 'Webull' },
    { apiBase: '/api/robinhood', brokerParam: null,                  label: 'Robinhood' },
    { apiBase: '/api/projectx',  brokerParam: null,                  label: 'Topstep' },
  ];

  // Auto-sync brokers on mount
  useEffect(() => {
    const autoSync = async () => {
      const statuses = [];
      let anyNewTrades = false;

      for (const { apiBase, brokerParam, label } of SYNC_BROKERS) {
        try {
          const statusUrl = brokerParam
            ? `${apiBase}/status?broker=${brokerParam}`
            : `${apiBase}/status`;
          const statusRes = await authFetch(statusUrl);
          const statusData = await statusRes.json();
          const conns = statusData.connections || [];
          const configuredConns = conns.filter(c => c.configured);

          if (conns.length === 0) continue;

          statuses.push({ name: label, apiBase, brokerParam, connections: conns, ...statusData });

          if (configuredConns.length > 0) {
            setSyncNotification(`Syncing trades from ${label}...`);
            let totalSynced = 0;

            for (const conn of configuredConns) {
              try {
                const syncRes = await authFetch(`${apiBase}/sync`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ connectionId: conn.connectionId }),
                });
                const syncData = await syncRes.json();
                totalSynced += syncData.synced || 0;
              } catch (err) {
                console.error(`Auto-sync failed for ${label} connection ${conn.connectionId}:`, err);
              }
            }

            if (totalSynced > 0) {
              setSyncNotification(`Synced ${totalSynced} new trade${totalSynced !== 1 ? 's' : ''} from ${label}`);
              anyNewTrades = true;
            }
          }
        } catch (err) {
          console.error(`${label} auto-sync failed:`, err);
        }
      }

      if (anyNewTrades) {
        triggerReload();
        setTimeout(() => setSyncNotification(null), 4000);
      } else {
        setSyncNotification(null);
      }
      setBrokerStatuses(statuses);
    };
    autoSync();
  }, []);

  const handleManualSync = async () => {
    const hasExpired = brokerStatuses.some(b =>
      (b.connections || []).some(c => c.expired)
    );
    if (hasExpired) {
      setSyncPopupOpen(true);
      return;
    }
    let anyNewTrades = false;
    for (const broker of brokerStatuses) {
      const conns = (broker.connections || []).filter(c => c.configured);
      if (conns.length === 0) continue;

      setSyncNotification(`Syncing trades from ${broker.name}...`);
      let totalSynced = 0;

      for (const conn of conns) {
        try {
          const res = await authFetch(`${broker.apiBase}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: conn.connectionId }),
          });
          const data = await res.json();
          totalSynced += data.synced || 0;
        } catch {
          setSyncNotification(`Failed to sync ${broker.name}`);
        }
      }

      if (totalSynced > 0) {
        setSyncNotification(`Synced ${totalSynced} new trade${totalSynced !== 1 ? 's' : ''} from ${broker.name}`);
        anyNewTrades = true;
      } else {
        setSyncNotification(`${broker.name} is up to date`);
      }
    }
    if (anyNewTrades) triggerReload();
    setTimeout(() => setSyncNotification(null), 4000);
  };

  const openForm = () => setIsFormOpen(true);
  const openFormWithDate = (dateKey) => { setPrefillDate(dateKey); setIsFormOpen(true); };
  const openEditForm = (trade) => { setEditingTrade(trade); setIsFormOpen(true); };

  const filteredTrades = selectedAccounts.length === 0
    ? trades
    : (trades || []).filter(t => selectedAccounts.includes(t.account || 'Manual'));

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage trades={filteredTrades} onOpenForm={openForm} onOpenImport={() => setCsvImportOpen(true)} onManualSync={handleManualSync} brokerStatuses={brokerStatuses} onOpenAddTrade={openFormWithDate} onEditTrade={openEditForm} dailyNotes={dailyNotes} onSaveNote={handleSaveNote} onDeleteNote={handleDeleteNote} tags={tags} strategyRules={strategyRules} evalFilter={evalFilter} setEvalFilter={setEvalFilter} sidebarCollapsed={sidebarCollapsed} />;
      case 'trades':
        return (
          <TradeListPage
            trades={filteredTrades}
            triggerReload={triggerReload}
            onEdit={(trade) => { setEditingTrade(trade); setIsFormOpen(true); }}
           
            onOpenForm={openForm}
            onOpenImport={() => setCsvImportOpen(true)}
            tags={tags}
            strategyRules={strategyRules}
          />
        );
      case 'analytics':
        return <AnalyticsPage trades={filteredTrades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />;
      case 'strategy':
        return <StrategyPage trades={filteredTrades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />;
      case 'premarket':
        return <PreMarketPage trades={filteredTrades} />;
      case 'backtesting':
        return <BacktestingPage />;
      case 'settings':
        return <SettingsPage onSyncComplete={triggerReload} onNavigate={setCurrentPage} theme={theme} onThemeChange={handleThemeChange} customColors={customColors} tags={tags} triggerReload={triggerReload} />;
      case 'syncer':
        return <TradeSyncerPage />;
      default:
        return <DashboardPage trades={filteredTrades} onOpenForm={openForm} onOpenImport={() => setCsvImportOpen(true)} onManualSync={handleManualSync} brokerStatuses={brokerStatuses} onOpenAddTrade={openFormWithDate} onEditTrade={openEditForm} dailyNotes={dailyNotes} onSaveNote={handleSaveNote} onDeleteNote={handleDeleteNote} tags={tags} strategyRules={strategyRules} evalFilter={evalFilter} setEvalFilter={setEvalFilter} sidebarCollapsed={sidebarCollapsed} />;
    }
  };

  return (
    <SidePanelContext.Provider value={setSidePanelOffset}>
    <DotGrid />
    <div className="flex min-h-screen relative z-[1]">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        onCollapsedChange={setSidebarCollapsed}
        onWidthChange={setSidebarWidth}
        trades={trades}
        selectedAccounts={selectedAccounts}
        setSelectedAccounts={setSelectedAccounts}
        accountBrokers={accountBrokers}
      />
      <main className="flex-1 min-h-screen transition-[margin] duration-200 max-lg:!ml-0" style={{ marginLeft: sidebarWidth, paddingRight: sidePanelOffset }}>
        <div className="p-6 lg:p-8">
          {syncNotification && (
            <div className="flex items-center gap-2 bg-info/10 border border-info/30 rounded-lg px-4 py-3 mb-6 text-info text-sm">
              <Icons.RefreshCw className="w-4 h-4 animate-spin" />
              {syncNotification}
            </div>
          )}
          {renderPage()}
        </div>
      </main>

      <TradeFormPopup
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTrade(null); setPrefillDate(null); }}
        triggerReload={triggerReload}
        editingTrade={editingTrade}
        prefillDate={prefillDate}
        tags={tags}
        strategyRules={strategyRules}
        trades={trades}
        sidebarCollapsed={sidebarCollapsed}
      />
      <CSVImportModal isOpen={csvImportOpen} onClose={() => setCsvImportOpen(false)} triggerReload={triggerReload} onDuplicatesSkipped={(n) => setToast({ message: `${n} trade${n !== 1 ? 's were' : ' was'} already in your journal and ${n !== 1 ? 'were' : 'was'} not added again.` })} />
      <SyncPopup isOpen={syncPopupOpen} onClose={() => setSyncPopupOpen(false)} triggerReload={triggerReload} />
      <Toast toast={toast} onClose={() => setToast(null)} />

      {showOnboarding && (
        <OnboardingFlow
          onComplete={() => setShowOnboarding(false)}
          theme={theme}
          customColors={customColors}
          onThemeChange={handleThemeChange}
        />
      )}
    </div>
    </SidePanelContext.Provider>
  );
};

const init = () => {
  const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') {
      // Clean up OAuth hash fragments from URL
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      if (!session) {
        window.location = '/login';
        return;
      }
      listener.subscription.unsubscribe();
      const root = createRoot(document.getElementById('app'));
      root.render(<App />);
    }
  });
};

window.onload = init;
