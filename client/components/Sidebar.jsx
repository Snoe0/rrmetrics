const React = require('react');
const { useState } = React;
const Icons = require('./shared/Icons');
const { supabase } = require('../helper');

// =====================================================
// SIDEBAR
// =====================================================
const Sidebar = ({ currentPage, onNavigate, subscriptionStatus, onCollapsedChange }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
    if (onCollapsedChange) onCollapsedChange(next);
  };

  const isCollapsed = collapsed && !sidebarOpen;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Home },
    { id: 'trades', label: 'Trades', icon: Icons.List },
    { id: 'analytics', label: 'Analytics', icon: Icons.BarChart },
    { id: 'strategy', label: 'Strategy', icon: Icons.Target },
    { id: 'premarket', label: 'Pre-Market', icon: Icons.Sunrise },
    { id: 'backtesting', label: 'Backtesting', icon: Icons.FlaskConical },
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
      <a href="/upgrade" className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors no-underline">
        <Icons.Zap className="w-4 h-4" />
        Manage Subscription
      </a>
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
      <nav className={`fixed top-0 left-0 h-full bg-bg-page border-r border-border flex flex-col z-50 transition-[width] duration-300 overflow-hidden lg:translate-x-0 ${isCollapsed ? 'w-16' : 'w-60'} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className={`border-b border-border flex items-center ${isCollapsed ? 'px-0 py-6 justify-center' : 'px-5 py-6'}`}>
          <a
            href="/trades"
            className="flex items-center gap-3 no-underline"
            onClick={(e) => { e.preventDefault(); handleNav('dashboard'); }}
          >
            <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md flex-shrink-0" />
            <span className={`text-text-primary font-semibold text-[15px] tracking-[3px] uppercase transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              RR Metrics
            </span>
          </a>
        </div>

        {/* Nav links */}
        <div className="flex-1 py-4 px-3 space-y-1">
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

        {/* Upgrade box — show for trial and free users, not for paid */}
        {!isCollapsed && (!subscriptionStatus || (subscriptionStatus.plan !== 'pro' && subscriptionStatus.plan !== 'elite')) && (
          <div className="px-4 pb-3">
            <div className="bg-bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icons.Zap className="w-4 h-4 text-accent" />
                <span className="text-text-primary text-sm font-semibold">Upgrade to Pro</span>
              </div>
              <p className="text-text-tertiary text-xs mb-3">Get auto syncing, unlimited trades, and more.</p>
              <button
                className="w-full py-2 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 transition-all"
                onClick={() => { window.location.href = '/upgrade'; }}
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {/* Refer & Earn link */}
        <div className="px-3 pb-0">
          <a
            href="#"
            title={isCollapsed ? 'Refer & Earn' : undefined}
            className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${isCollapsed ? 'justify-center gap-0' : 'gap-3'} ${
              currentPage === 'referral'
                ? 'bg-bg-surface text-accent border-l-2 border-accent'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
            }`}
            onClick={(e) => { e.preventDefault(); handleNav('referral'); }}
          >
            <Icons.Gift className="w-5 h-5 flex-shrink-0" />
            <span className={`transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              Refer &amp; Earn
            </span>
          </a>
        </div>

        {/* Guides link */}
        <div className="px-3 pb-2">
          <a
            href="/guides"
            title={isCollapsed ? 'Guides' : undefined}
            className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors no-underline ${isCollapsed ? 'justify-center gap-0' : 'gap-3'}`}
          >
            <Icons.BookOpen className="w-5 h-5 flex-shrink-0" />
            <span className={`transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              Guides
            </span>
          </a>
        </div>

        {/* Collapse toggle */}
        <div className="px-3 pb-2">
          <button
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors"
            onClick={toggleCollapsed}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <Icons.ChevronRight className="w-4 h-4" /> : <Icons.ChevronLeft className="w-4 h-4" />}
            <span className={`text-xs transition-opacity duration-200 whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              Collapse
            </span>
          </button>
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
            {accountOpen && isCollapsed && (
              <>
                {/* Backdrop — closes panel on outside click */}
                <div className="fixed inset-0 z-[59]" onClick={() => setAccountOpen(false)} />
                {/* Side panel — z-[60] sits above sidebar z-50 and backdrop z-[59] */}
                <div className="fixed left-16 bottom-4 w-48 bg-bg-surface border border-border rounded-lg overflow-hidden shadow-lg z-[60]">
                  {accountMenuContent}
                </div>
              </>
            )}
            {accountOpen && !isCollapsed && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg-surface border border-border rounded-lg overflow-hidden shadow-lg">
                {accountMenuContent}
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};

module.exports = Sidebar;
