const React = require('react');
const { useState } = React;
const Icons = require('./shared/Icons');
const { supabase } = require('../helper');

// =====================================================
// SIDEBAR
// =====================================================
const Sidebar = ({ currentPage, onNavigate, subscriptionStatus }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

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
      <nav className={`fixed top-0 left-0 h-full w-60 bg-bg-page border-r border-border flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="px-5 py-6 border-b border-border">
          <a
            href="/trades"
            className="flex items-center gap-3 no-underline"
            onClick={(e) => { e.preventDefault(); handleNav('dashboard'); }}
          >
            <img src="/assets/img/logo.svg" alt="RR Metrics" className="w-8 h-8 rounded-md flex-shrink-0" />
            <span className="text-text-primary font-semibold text-[15px] tracking-[3px] uppercase">RR Metrics</span>
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${
                  isActive
                    ? 'bg-bg-surface text-accent border-l-2 border-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
                }`}
                onClick={(e) => { e.preventDefault(); handleNav(item.id); }}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </a>
            );
          })}
        </div>

        {/* Upgrade box — show for trial and free users, not for paid */}
        {(!subscriptionStatus || (subscriptionStatus.plan !== 'pro' && subscriptionStatus.plan !== 'elite')) && (
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
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${
              currentPage === 'referral'
                ? 'bg-bg-surface text-accent border-l-2 border-accent'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
            }`}
            onClick={(e) => { e.preventDefault(); handleNav('referral'); }}
          >
            <Icons.Gift className="w-5 h-5" />
            Refer &amp; Earn
          </a>
        </div>

        {/* Guides link */}
        <div className="px-3 pb-2">
          <a
            href="/guides"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors no-underline"
          >
            <Icons.BookOpen className="w-5 h-5" />
            Guides
          </a>
        </div>

        {/* Account section */}
        <div className="px-3 pb-4 border-t border-border pt-3">
          <div className="relative">
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-surface transition-colors"
              onClick={(e) => { e.stopPropagation(); setAccountOpen(!accountOpen); }}
            >
              <div className="w-8 h-8 bg-bg-surface border border-border rounded-full flex items-center justify-center flex-shrink-0">
                <Icons.User className="w-4 h-4" />
              </div>
              <span className="flex-1 text-left text-text-primary text-sm">Account</span>
              {accountOpen ? <Icons.ChevronUp className="w-4 h-4" /> : <Icons.ChevronDown className="w-4 h-4" />}
            </button>
            {accountOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg-surface border border-border rounded-lg overflow-hidden shadow-lg">
                <a href="/upgrade" className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors no-underline">
                  <Icons.Zap className="w-4 h-4" />
                  Manage Subscription
                </a>
                <a href="/changePass" className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors no-underline">
                  <Icons.Lock className="w-4 h-4" />
                  Change Password
                </a>
                <button onClick={() => { supabase.auth.signOut().then(() => { window.location = '/'; }); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-input hover:text-text-primary transition-colors">
                  <Icons.LogOut className="w-4 h-4" />
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};

module.exports = Sidebar;
