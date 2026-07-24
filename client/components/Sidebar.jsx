const React = require('react');
const { useState, useRef, useEffect, useCallback } = React;
const Icons = require('./shared/Icons');
const AccountSwitcher = require('./shared/AccountSwitcher');
const { cn } = require('../lib/utils');
const { supabase } = require('../helper');

const MIN_WIDTH = 64;
const COLLAPSE_THRESHOLD = 140;
const DEFAULT_WIDTH = 240;

const Sidebar = ({ currentPage, onNavigate, onCollapsedChange, onWidthChange, trades, selectedAccounts, setSelectedAccounts, accountBrokers }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem('sidebar-width');
    return stored ? Number(stored) : DEFAULT_WIDTH;
  });
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const isCollapsed = width < COLLAPSE_THRESHOLD && !sidebarOpen;

  // Notify parent of collapsed state and width changes
  useEffect(() => {
    if (onCollapsedChange) onCollapsedChange(isCollapsed);
    if (onWidthChange) onWidthChange(isCollapsed ? MIN_WIDTH : width);
  }, [width, isCollapsed]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(MIN_WIDTH, Math.min(400, startWidth.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Snap to collapsed or expanded
      setWidth(prev => {
        const final = prev < COLLAPSE_THRESHOLD ? MIN_WIDTH : prev;
        localStorage.setItem('sidebar-width', String(final));
        return final;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Home },
    { id: 'analytics', label: 'Analytics', icon: Icons.BarChart },
    { id: 'strategy', label: 'Strategy', icon: Icons.Target },
    { id: 'premarket', label: 'Pre-Market', icon: Icons.Sunrise },
  ];

  const secondaryNavItems = [
    { id: 'trades', label: 'Trades', icon: Icons.List },
    { id: 'settings', label: 'Settings', icon: Icons.Settings },
  ];

  const handleNav = (id) => {
    onNavigate(id);
    setSidebarOpen(false);
  };

  const handleSignOut = () => {
    supabase.auth.signOut().then(() => { window.location.href = '/'; });
  };

  const accountMenuContent = (
    <>
      <a href="/changePass" className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors no-underline">
        <Icons.Lock className="w-4 h-4" />
        Change Password
      </a>
      <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors">
        <Icons.LogOut className="w-4 h-4" />
        Log Out
      </button>
    </>
  );

  const sidebarWidth = isCollapsed ? MIN_WIDTH : width;

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden w-10 h-10 flex items-center justify-center rounded-lg bg-bg-surface border border-border text-text-primary"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        <Icons.Menu />
      </button>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav
        className={`fixed top-0 left-0 h-full bg-bg-page border-r border-border flex flex-col z-50 overflow-hidden lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: sidebarWidth, transition: isDragging.current ? 'none' : 'width 0.2s ease' }}
      >
        {/* Logo */}
        <div className={cn('px-3 pt-4 pb-3 border-b border-border', isCollapsed && 'flex justify-center')}>
          <div className={cn('flex items-center gap-2.5 px-3', isCollapsed && 'px-0')}>
            <div
              className="w-8 h-8 flex-shrink-0 bg-accent rounded-md"
              style={{ WebkitMaskImage: 'url(/assets/img/logo.svg)', WebkitMaskSize: 'contain', maskImage: 'url(/assets/img/logo.svg)', maskSize: 'contain' }}
              role="img"
              aria-label="RR Metrics"
            />
            <span className={`text-text-primary font-semibold text-[15px] tracking-[3px] uppercase whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              RR Metrics
            </span>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex-1 py-4 px-3 flex flex-col">
          <div className={cn('px-3 mb-3', isCollapsed && 'px-2')}>
            <AccountSwitcher
              trades={trades}
              selectedAccounts={selectedAccounts}
              setSelectedAccounts={setSelectedAccounts}
              collapsed={isCollapsed}
              accountBrokers={accountBrokers}
            />
          </div>
          <div className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <a
                  key={item.id}
                  href="#"
                  title={isCollapsed ? item.label : undefined}
                  className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${isCollapsed ? 'justify-center gap-0' : 'gap-3'} ${
                    isActive
                      ? 'bg-bg-surface text-accent border-l-2 border-accent'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                  }`}
                  onClick={(e) => { e.preventDefault(); handleNav(item.id); }}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className={`transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                    {item.label}
                  </span>
                </a>
              );
            })}
          </div>

          <div className="mt-4">
            <div className="border-t border-border mx-2 mb-2" />
            <div className="space-y-1">
              {secondaryNavItems.map(item => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <a
                    key={item.id}
                    href="#"
                    title={isCollapsed ? item.label : undefined}
                    className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${isCollapsed ? 'justify-center gap-0' : 'gap-3'} ${
                      isActive
                        ? 'bg-bg-surface text-accent border-l-2 border-accent'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                    }`}
                    onClick={(e) => { e.preventDefault(); handleNav(item.id); }}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className={`transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                      {item.label}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Tools */}
          <div className="mt-4">
            <div className="border-t border-border mx-2 mb-2" />
            {!isCollapsed && (
              <div className="px-3 mb-1">
                <span className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">Tools</span>
              </div>
            )}
            <div className="space-y-1">
              {[
                { id: 'syncer', label: 'Trade Syncer', icon: Icons.RefreshCw },
                { id: 'backtesting', label: 'Backtesting', icon: Icons.FlaskConical },
              ].map(item => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <a
                    key={item.id}
                    href="#"
                    title={isCollapsed ? item.label : undefined}
                    className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${isCollapsed ? 'justify-center gap-0' : 'gap-3'} ${
                      isActive
                        ? 'bg-bg-surface text-accent border-l-2 border-accent'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                    }`}
                    onClick={(e) => { e.preventDefault(); handleNav(item.id); }}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className={`transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                      {item.label}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>

        </div>

        {/* Account section */}
        <div className="px-3 pb-4 border-t border-border pt-3">
          <div className="relative">
            <button
              className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-surface transition-colors ${isCollapsed ? 'justify-center gap-0' : 'gap-3'}`}
              onClick={(e) => { e.stopPropagation(); setAccountOpen(!accountOpen); }}
              title={isCollapsed ? 'Account' : undefined}
            >
              <div className="w-8 h-8 bg-bg-surface border border-border rounded-full flex items-center justify-center flex-shrink-0">
                <Icons.User className="w-4 h-4" />
              </div>
              <span className={`flex-1 text-left text-text-primary text-sm transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                Account
              </span>
              {!isCollapsed && (accountOpen ? <Icons.ChevronUp className="w-4 h-4" /> : <Icons.ChevronDown className="w-4 h-4" />)}
            </button>
            {accountOpen && !isCollapsed && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg-surface border border-border rounded-lg overflow-hidden shadow-lg">
                {accountMenuContent}
              </div>
            )}
          </div>
        </div>

        {/* Drag handle */}
        <div
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors hidden lg:block"
          onMouseDown={handleMouseDown}
        />
      </nav>

      {/* Account side panel — outside nav to escape CSS transform containing block */}
      {accountOpen && isCollapsed && (
        <>
          <div className="fixed inset-0 z-[59]" onClick={() => setAccountOpen(false)} />
          <div className="fixed left-16 bottom-4 w-48 bg-bg-surface border border-border rounded-lg overflow-hidden shadow-lg z-[60]">
            {accountMenuContent}
          </div>
        </>
      )}
    </>
  );
};

module.exports = Sidebar;
