const React = require('react');
const { useState, useMemo } = React;
const { Popover, PopoverTrigger, PopoverContent } = require('../ui/popover');
const { Avatar, AvatarFallback } = require('../ui/avatar');
const { Check, ChevronsUpDown } = require('lucide-react');
const { cn } = require('../../lib/utils');

const BROKER_ICONS = {
  tradovate:           { icon: '/assets/img/tradovate.png',    label: 'Tradovate' },
  ninjatrader:         { icon: '/assets/img/ninjatrader.jpeg', label: 'NinjaTrader' },
  alpha_futures:       { icon: '/assets/img/alphafutures.png', label: 'Alpha Futures' },
  apex_trader_funding: { icon: '/assets/img/apex.png',         label: 'Apex Trader Funding' },
  robinhood:           { icon: '/assets/img/robinhood.svg',    label: 'Robinhood' },
  webull:              { icon: '/assets/img/webull.svg',       label: 'Webull' },
  projectx:            { icon: '/assets/img/topstep.png',      label: 'TopstepX' },
};

const AccountSwitcher = ({ trades, selectedAccounts, setSelectedAccounts, collapsed }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const accounts = useMemo(() => {
    return [...new Set((trades || []).map(t => t.account || 'Manual'))].sort();
  }, [trades]);

  // Map account names to their broker key using tradovateSource/projectxSource
  const accountBrokerMap = useMemo(() => {
    const map = {};
    for (const t of (trades || [])) {
      const acct = t.account || 'Manual';
      if (map[acct]) continue;
      if (t.projectxSource) {
        // projectxSource format: "projectx_demo" or "projectx_live"
        map[acct] = 'projectx';
      } else if (t.tradovateSource && t.tradovateSource !== 'manual') {
        // tradovateSource format: "broker_environment" e.g. "alpha_futures_live", "tradovate_demo"
        const src = t.tradovateSource;
        // Match against known broker keys (longest match first to handle underscored names)
        const brokerKeys = Object.keys(BROKER_ICONS).sort((a, b) => b.length - a.length);
        for (const key of brokerKeys) {
          if (src.startsWith(key + '_') || src === key) {
            map[acct] = key;
            break;
          }
        }
      }
    }
    return map;
  }, [trades]);

  const filtered = useMemo(() => {
    if (!search) return accounts;
    return accounts.filter(a => a.toLowerCase().includes(search.toLowerCase()));
  }, [accounts, search]);

  const isAllSelected = selectedAccounts.length === 0;

  const toggleAccount = (acct) => {
    setSelectedAccounts(prev => {
      if (prev.includes(acct)) {
        const next = prev.filter(a => a !== acct);
        return next;
      }
      return [...prev, acct];
    });
  };

  const selectAll = () => {
    setSelectedAccounts([]);
    setOpen(false);
  };

  const label = isAllSelected
    ? 'All Accounts'
    : selectedAccounts.length === 1
      ? selectedAccounts[0]
      : `${selectedAccounts.length} of ${accounts.length} accounts`;

  if (accounts.length <= 1) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input/50 hover:bg-bg-input transition-colors text-sm text-left',
            collapsed && 'justify-center px-2'
          )}
        >
          {(() => {
            const singleAcct = !isAllSelected && selectedAccounts.length === 1 ? selectedAccounts[0] : null;
            const broker = singleAcct && accountBrokerMap[singleAcct] ? BROKER_ICONS[accountBrokerMap[singleAcct]] : null;
            return broker ? (
              <img src={broker.icon} alt={broker.label} className="h-6 w-6 flex-shrink-0 rounded-md object-contain" />
            ) : (
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarFallback className="text-[10px] font-semibold text-text-secondary bg-accent/15">
                  {isAllSelected ? 'A' : label.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            );
          })()}
          {!collapsed && (
            <>
              <span className="ml-2 flex-1 truncate text-text-primary font-medium">{label}</span>
              <ChevronsUpDown className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0 ml-1" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" side="right" sideOffset={8}>
        <div className="border-b border-border px-3 py-2">
          <p className="text-text-secondary text-xs font-medium uppercase tracking-wider">Accounts</p>
        </div>

        {accounts.length >= 5 && (
          <div className="border-b border-border px-3 py-2">
            <input
              type="text"
              placeholder="Search accounts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
            />
          </div>
        )}

        <div className="max-h-[280px] overflow-y-auto p-1">
          <button
            onClick={selectAll}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-2 rounded text-sm text-left transition-colors',
              'hover:bg-bg-input',
              isAllSelected && 'bg-bg-input text-accent'
            )}
          >
            <Avatar className="h-5 w-5 flex-shrink-0">
              <AvatarFallback className="text-[9px] font-bold bg-accent/15 text-accent">A</AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate font-medium">All Accounts</span>
            {isAllSelected && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
          </button>

          <div className="h-px bg-border my-1" />

          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-center text-text-tertiary text-xs">No accounts found</div>
          ) : (
            filtered.map(acct => {
              const isSelected = selectedAccounts.includes(acct);
              return (
                <button
                  key={acct}
                  onClick={() => toggleAccount(acct)}
                  className={cn(
                    'flex items-center gap-2 w-full px-2 py-2 rounded text-sm text-left transition-colors',
                    'hover:bg-bg-input',
                    isSelected && 'bg-bg-input'
                  )}
                >
                  {(() => {
                    const broker = accountBrokerMap[acct] ? BROKER_ICONS[accountBrokerMap[acct]] : null;
                    return broker ? (
                      <img src={broker.icon} alt={broker.label} className="h-5 w-5 flex-shrink-0 rounded object-contain" />
                    ) : (
                      <Avatar className="h-5 w-5 flex-shrink-0">
                        <AvatarFallback className="text-[9px] font-bold bg-bg-page text-text-secondary">
                          {acct.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    );
                  })()}
                  <span className={cn('flex-1 truncate', isSelected ? 'text-text-primary' : 'text-text-secondary')}>
                    {acct}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {selectedAccounts.length > 0 && (
          <div className="border-t border-border p-1">
            <button
              onClick={selectAll}
              className="w-full px-2 py-1.5 text-xs text-accent hover:bg-bg-input rounded transition-colors"
            >
              Clear filter
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

module.exports = AccountSwitcher;
