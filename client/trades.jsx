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
const FreeBanner = require('./components/shared/FreeBanner');

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
const UpgradePage = require('./components/pages/UpgradePage');
const ReferralPage = require('./components/pages/ReferralPage');
const DotGrid = require('./components/shared/DotGrid');

const AnnouncementBanner = ({ announcement, onDismiss }) => {
  if (!announcement) return null;
  const typeStyles = {
    info: 'bg-info/15 border-info/30 text-info',
    warning: 'bg-warning/15 border-warning/30 text-warning',
    success: 'bg-positive/15 border-positive/30 text-positive',
  };
  const style = typeStyles[announcement.type] || typeStyles.info;
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full mx-4 border rounded-xl p-4 shadow-lg ${style}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="font-semibold text-sm">{announcement.title}</div>
          <div className="text-sm mt-0.5 opacity-90">{announcement.body}</div>
        </div>
        <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100 text-lg leading-none">&times;</button>
      </div>
    </div>
  );
};

const App = () => {
  const [currentPage, setCurrentPage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tv_code') || params.get('tv_error')) return 'settings';
    if (params.get('tab')) return params.get('tab');
    if (params.get('connect')) return 'referral';
    return 'dashboard';
  });
  const [reloadTrades, setReloadTrades] = useState(false);
  const [trades, setTrades] = useState([]);
  const [tags, setTags] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [syncPopupOpen, setSyncPopupOpen] = useState(false);
  const [brokerStatuses, setBrokerStatuses] = useState([]);
  const [toast, setToast] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [syncNotification, setSyncNotification] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [customColors, setCustomColors] = useState(() => {
    try { return JSON.parse(localStorage.getItem('customColors')) || {}; } catch { return {}; }
  });
  const [dailyNotes, setDailyNotes] = useState([]);
  const [pricing, setPricing] = useState({ pro: '12', elite: '18' });
  const [strategyRules, setStrategyRules] = useState([]);
  const [sidePanelOffset, setSidePanelOffset] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );
  const [announcement, setAnnouncement] = useState(null);
  const [evalFilter, setEvalFilterState] = useState(() => {
    const stored = localStorage.getItem('evalFilter');
    return ['all', 'exclude', 'only'].includes(stored) ? stored : 'exclude';
  });

  const setEvalFilter = (val) => {
    setEvalFilterState(val);
    localStorage.setItem('evalFilter', val);
  };

  const triggerReload = () => setReloadTrades(!reloadTrades);

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
    } else {
      root.style.removeProperty('--accent');
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
        const bgHex = customColors.bgPage || '#0B0E14';
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
      if (data.trades && data.trades.length === 0 && !localStorage.getItem('rrmetrics_onboarded')) {
        setShowWelcome(true);
      }
    };
    loadTradesFromServer();
  }, [reloadTrades]);

  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem('rrmetrics_onboarded', '1');
  };

  const handleDismissAnnouncement = () => {
    if (announcement) {
      localStorage.setItem(`announcement-dismissed-${announcement.id}`, '1');
    }
    setAnnouncement(null);
  };

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
    const fetchSubscriptionStatus = async () => {
      try {
        const response = await authFetch('/api/subscriptionStatus');
        const data = await response.json();
        setSubscriptionStatus(data);
      } catch (err) {
        console.error('Failed to fetch subscription status:', err);
      }
    };
    fetchSubscriptionStatus();
    fetch('/api/pricing').then(r => r.json()).then(setPricing).catch(() => {});
    authFetch('/api/strategy/rules')
      .then(r => r.json())
      .then(data => { if (data.rules) setStrategyRules(data.rules); })
      .catch(() => {});
    // Fetch active announcement (non-blocking — never prevent app load)
    fetch('/api/announcement/active')
      .then((r) => r.json())
      .then((data) => {
        if (data.announcement) {
          const dismissed = localStorage.getItem(`announcement-dismissed-${data.announcement.id}`);
          if (!dismissed) setAnnouncement(data.announcement);
        }
      })
      .catch(() => {}); // silently ignore
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

  // Auto-sync brokers on mount
  useEffect(() => {
    const autoSync = async () => {
      const statuses = [];
      try {
        const statusRes = await authFetch('/api/tradovate/status');
        const status = await statusRes.json();
        if (status.configured) {
          statuses.push({ name: 'Tradovate', apiPrefix: 'tradovate', ...status });
          setSyncNotification('Syncing trades from Tradovate...');
          const syncRes = await authFetch('/api/tradovate/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const syncData = await syncRes.json();
          if (syncData.synced > 0) {
            setSyncNotification(`Synced ${syncData.synced} new trade${syncData.synced !== 1 ? 's' : ''} from Tradovate`);
            triggerReload();
          } else {
            setSyncNotification(null);
          }
          setTimeout(() => setSyncNotification(null), 4000);
        }
      } catch (err) {
        console.error('Auto-sync failed:', err);
      }

      // Auto-sync ProjectX
      try {
        const pxStatusRes = await authFetch('/api/projectx/status');
        const pxStat = await pxStatusRes.json();
        if (pxStat.configured && pxStat.selectedAccounts?.length > 0) {
          statuses.push({ name: 'Topstep', apiPrefix: 'projectx', ...pxStat });
          setSyncNotification('Syncing trades from Topstep...');
          const pxSyncRes = await authFetch('/api/projectx/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const pxSyncData = await pxSyncRes.json();
          if (pxSyncData.synced > 0) {
            setSyncNotification(`Synced ${pxSyncData.synced} new trade${pxSyncData.synced !== 1 ? 's' : ''} from Topstep`);
            triggerReload();
          } else {
            setSyncNotification(null);
          }
          setTimeout(() => setSyncNotification(null), 4000);
        }
      } catch (err) {
        console.error('ProjectX auto-sync failed:', err);
      }
      setBrokerStatuses(statuses);
    };
    autoSync();
  }, []);

  const handleManualSync = async () => {
    const hasExpired = brokerStatuses.some(b => b.expired);
    if (hasExpired) {
      setSyncPopupOpen(true);
      return;
    }
    for (const broker of brokerStatuses) {
      setSyncNotification(`Syncing trades from ${broker.name}...`);
      try {
        const res = await authFetch(`/api/${broker.apiPrefix}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.synced > 0) {
          setSyncNotification(`Synced ${data.synced} new trade${data.synced !== 1 ? 's' : ''} from ${broker.name}`);
          triggerReload();
        } else {
          setSyncNotification(`${broker.name} is up to date`);
        }
      } catch {
        setSyncNotification(`Failed to sync ${broker.name}`);
      }
    }
    setTimeout(() => setSyncNotification(null), 4000);
  };

  const openForm = () => setIsFormOpen(true);
  const openFormWithDate = (dateKey) => { setPrefillDate(dateKey); setIsFormOpen(true); };
  const openEditForm = (trade) => { setEditingTrade(trade); setIsFormOpen(true); };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage trades={trades} subscriptionStatus={subscriptionStatus} onOpenForm={openForm} onOpenImport={() => setCsvImportOpen(true)} onManualSync={handleManualSync} brokerStatuses={brokerStatuses} onOpenAddTrade={openFormWithDate} onEditTrade={openEditForm} dailyNotes={dailyNotes} onSaveNote={handleSaveNote} onDeleteNote={handleDeleteNote} tags={tags} strategyRules={strategyRules} evalFilter={evalFilter} setEvalFilter={setEvalFilter} sidebarCollapsed={sidebarCollapsed} />;
      case 'trades':
        return (
          <TradeListPage
            trades={trades}
            triggerReload={triggerReload}
            onEdit={(trade) => { setEditingTrade(trade); setIsFormOpen(true); }}
            subscriptionStatus={subscriptionStatus}
            onOpenForm={openForm}
            onOpenImport={() => setCsvImportOpen(true)}
            tags={tags}
            strategyRules={strategyRules}
          />
        );
      case 'analytics':
        return <AnalyticsPage trades={trades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />;
      case 'strategy':
        return <StrategyPage subscriptionStatus={subscriptionStatus} trades={trades} evalFilter={evalFilter} setEvalFilter={setEvalFilter} />;
      case 'premarket':
        return <PreMarketPage subscriptionStatus={subscriptionStatus} trades={trades} />;
      case 'backtesting':
        return <BacktestingPage subscriptionStatus={subscriptionStatus} />;
      case 'settings':
        return <SettingsPage onSyncComplete={triggerReload} onNavigate={setCurrentPage} theme={theme} onThemeChange={handleThemeChange} customColors={customColors} tags={tags} triggerReload={triggerReload} subscriptionStatus={subscriptionStatus} />;
      case 'upgrade':
        return <UpgradePage pricing={pricing} />;
      case 'referral':
        return <ReferralPage />;
      default:
        return <DashboardPage trades={trades} subscriptionStatus={subscriptionStatus} onOpenForm={openForm} onOpenImport={() => setCsvImportOpen(true)} onManualSync={handleManualSync} brokerStatuses={brokerStatuses} onOpenAddTrade={openFormWithDate} onEditTrade={openEditForm} dailyNotes={dailyNotes} onSaveNote={handleSaveNote} onDeleteNote={handleDeleteNote} tags={tags} strategyRules={strategyRules} evalFilter={evalFilter} setEvalFilter={setEvalFilter} sidebarCollapsed={sidebarCollapsed} />;
    }
  };

  return (
    <SidePanelContext.Provider value={setSidePanelOffset}>
    <DotGrid />
    <AnnouncementBanner announcement={announcement} onDismiss={handleDismissAnnouncement} />
    <div className="flex min-h-screen relative z-[1]">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        subscriptionStatus={subscriptionStatus}
        onCollapsedChange={setSidebarCollapsed}
      />
      <main className={`flex-1 min-h-screen transition-[margin] duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'}`} style={{ paddingRight: sidePanelOffset }}>
        <div className="p-6 lg:p-8">
          <FreeBanner subscriptionStatus={subscriptionStatus} proPrice={pricing.pro} />
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
        subscriptionStatus={subscriptionStatus}
        trades={trades}
        sidebarCollapsed={sidebarCollapsed}
      />
      <CSVImportModal isOpen={csvImportOpen} onClose={() => setCsvImportOpen(false)} triggerReload={triggerReload} onDuplicatesSkipped={(n) => setToast({ message: `${n} trade${n !== 1 ? 's were' : ' was'} already in your journal and ${n !== 1 ? 'were' : 'was'} not added again.` })} />
      <SyncPopup isOpen={syncPopupOpen} onClose={() => setSyncPopupOpen(false)} triggerReload={triggerReload} />
      <Toast toast={toast} onClose={() => setToast(null)} />

      {showWelcome && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={dismissWelcome}>
          <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-sm w-full mx-4 px-6 py-5 text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-text-primary text-base font-semibold mb-2">Welcome to RR Metrics!</h3>
            <p className="text-text-secondary text-sm mb-4">New here? Check out our quick start guide to get up and running.</p>
            <a
              href="/guides/getting-started"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 transition-opacity no-underline"
            >
              <Icons.BookOpen className="w-4 h-4" />
              Quick Start Guide
            </a>
            <button onClick={dismissWelcome} className="text-text-muted text-xs hover:text-text-secondary transition-colors mt-4 cursor-pointer block mx-auto">Dismiss</button>
          </div>
        </div>
      )}
    </div>
    </SidePanelContext.Provider>
  );
};

const init = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location = '/login';
    return;
  }
  const root = createRoot(document.getElementById('app'));
  root.render(<App />);
};

window.onload = init;
