const { useState, useCallback } = require('react');
const { authFetch } = require('../helper.js');

const BROKER_CONFIGS = {
  tradovate:           { key: 'tradovate',           label: 'Tradovate',           icon: '/assets/img/tradovate.png',    subtitle: 'Futures trading platform',      color: '#3b82f6',  apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  ninjatrader:         { key: 'ninjatrader',         label: 'NinjaTrader',         icon: '/assets/img/ninjatrader.jpeg',  subtitle: 'Advanced charting & trading',   color: '#f59e0b',  apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  alpha_futures:       { key: 'alpha_futures',       label: 'Alpha Futures',       icon: '/assets/img/alphafutures.png',  subtitle: 'Prop trading firm (Tradovate)', color: '#e63946',  apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  apex_trader_funding: { key: 'apex_trader_funding', label: 'Apex Trader Funding', icon: '/assets/img/apex.png',          subtitle: 'Prop trading firm (Tradovate)', color: '#ff6b00',  apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  tradeify:            { key: 'tradeify',            label: 'Tradeify',            icon: '/assets/img/tradeify.png',         subtitle: 'Prop trading firm (Tradovate)', color: '#7c3aed',  apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  my_funded_futures:   { key: 'my_funded_futures',   label: 'My Funded Futures',   icon: '/assets/img/myfundedfutures.png',  subtitle: 'Prop trading firm (Tradovate)', color: '#06b6d4', apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  lucid_trading:       { key: 'lucid_trading',       label: 'Lucid Trading',       icon: '/assets/img/lucidtrading.png',     subtitle: 'Prop trading firm (Tradovate)', color: '#1e3a5f',  apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  top_one_futures:     { key: 'top_one_futures',     label: 'Top One Futures',     icon: '/assets/img/toponefutures.png',    subtitle: 'Prop trading firm (Tradovate)', color: '#f97316',  apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  fundednext_futures:  { key: 'fundednext_futures',  label: 'FundedNext Futures',  icon: '/assets/img/fundednext.png',       subtitle: 'Prop trading firm (Tradovate)', color: '#2563eb',  apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  blue_guardian:       { key: 'blue_guardian',       label: 'Blue Guardian Futures', icon: '/assets/img/blueguardian.png',   subtitle: 'Prop trading firm (Tradovate)', color: '#3b82f6', apiBase: '/api/tradovate', authType: 'oauth', group: 'tradovate' },
  robinhood:           { key: 'robinhood',           label: 'Robinhood',           icon: '/assets/img/robinhood.svg',     subtitle: 'Stocks & options',              color: '#00C805',  apiBase: '/api/robinhood', authType: 'credentials', group: 'robinhood' },
  webull:              { key: 'webull',              label: 'Webull',              icon: '/assets/img/webull.svg',         subtitle: 'Stocks, options & futures',     color: '#E22028',  apiBase: '/api/webull',    authType: 'oauth', group: 'webull' },
};

// Backward-compatible array for Tradovate-family brokers
const TRADOVATE_BROKERS = Object.values(BROKER_CONFIGS).filter(b => b.group === 'tradovate');

const useBrokerConnection = (brokerType, { onSyncComplete, setMessage, setExpandedBroker } = {}) => {
  const [connections, setConnections] = useState([]);
  const [connectionsUsed, setConnectionsUsed] = useState(0);
  const [connectionLimit, setConnectionLimit] = useState(0);
  const [canUseBrokerSync, setCanUseBrokerSync] = useState(false);
  const [environment, setEnvironment] = useState('demo');
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [showImportPrompt, setShowImportPrompt] = useState(null);
  const [savingAccounts, setSavingAccounts] = useState(null);
  const [selectedAcctIds, setSelectedAcctIds] = useState([]);
  const [credentials, setCredentials] = useState({ email: '', password: '' });

  const config = BROKER_CONFIGS[brokerType];
  const label = config?.label || brokerType;
  const apiBase = config?.apiBase || '/api/tradovate';
  const isTradovateGroup = config?.group === 'tradovate';

  const fetchStatus = useCallback(async () => {
    try {
      const statusUrl = isTradovateGroup
        ? `${apiBase}/status?broker=${brokerType}`
        : `${apiBase}/status`;
      const response = await authFetch(statusUrl);
      const data = await response.json();
      setConnections(data.connections || []);
      setConnectionsUsed(data.connectionsUsed || 0);
      setConnectionLimit(data.connectionLimit || 0);
      setCanUseBrokerSync(data.canUseBrokerSync || false);
    } catch (err) {
      console.error(`Failed to fetch ${label} status:`, err);
    }
  }, [brokerType]);

  const handleConnect = async (connectCredentials) => {
    setConnecting(true);
    setMessage?.(null);
    try {
      if (config?.authType === 'credentials') {
        const creds = connectCredentials || credentials;
        const response = await authFetch(`${apiBase}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
        });
        const data = await response.json();
        if (data.error) {
          setMessage?.({ type: 'error', text: data.error });
        } else {
          setMessage?.({ type: 'success', text: `${label} connected successfully!` });
          setCredentials({ email: '', password: '' });
          fetchStatus();
        }
        setConnecting(false);
      } else {
        // OAuth flow
        const body = isTradovateGroup
          ? { environment, broker: brokerType }
          : {};
        const response = await authFetch(`${apiBase}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (data.error) {
          setMessage?.({ type: 'error', text: data.error });
          setConnecting(false);
        } else if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      }
    } catch (err) {
      setMessage?.({ type: 'error', text: `Failed to start ${label} connection` });
      setConnecting(false);
    }
  };

  const handleSync = async (connectionId) => {
    setSyncingId(connectionId);
    setMessage?.(null);
    try {
      const response = await authFetch(`${apiBase}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage?.({ type: 'error', text: data.error });
      } else {
        setMessage?.({ type: 'success', text: data.message || 'Sync complete' });
        fetchStatus();
        onSyncComplete?.();
      }
    } catch (err) {
      setMessage?.({ type: 'error', text: 'Sync failed' });
    }
    setSyncingId(null);
  };

  const handleSyncAll = async () => {
    if (!isTradovateGroup) return;
    setSyncingId('all');
    setMessage?.(null);
    try {
      const response = await authFetch(`${apiBase}/sync-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: brokerType }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage?.({ type: 'error', text: data.error });
      } else {
        const results = data.results || [];
        const total = results.reduce((sum, r) => sum + (r.tradesImported || 0), 0);
        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
          setMessage?.({ type: 'error', text: `Synced ${total} trades. ${errors.length} connection(s) had errors.` });
        } else {
          setMessage?.({ type: 'success', text: `Synced ${total} trades across ${results.length} connections.` });
        }
        fetchStatus();
        onSyncComplete?.();
      }
    } catch (err) {
      setMessage?.({ type: 'error', text: 'Sync all failed' });
    }
    setSyncingId(null);
  };

  const handleDisconnect = async (connectionId) => {
    if (!confirm(`Disconnect this ${label} connection?`)) return;
    setMessage?.(null);
    try {
      const response = await authFetch(`${apiBase}/connections/${connectionId}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.error) {
        setMessage?.({ type: 'error', text: data.error });
      } else {
        setMessage?.({ type: 'success', text: 'Connection removed' });
        fetchStatus();
      }
    } catch (err) {
      setMessage?.({ type: 'error', text: 'Failed to disconnect' });
    }
  };

  const handleImportNow = async (connectionId, todayOnly = false) => {
    setSyncingId(connectionId);
    setMessage?.(null);
    try {
      const body = { connectionId };
      if (todayOnly) {
        const today = new Date().toISOString().split('T')[0];
        body.startDate = today;
        body.endDate = today;
      }
      const response = await authFetch(`${apiBase}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.error) {
        setMessage?.({ type: 'error', text: data.error });
      } else {
        setMessage?.({ type: 'success', text: data.message || 'Import complete' });
        setShowImportPrompt(null);
        fetchStatus();
        onSyncComplete?.();
      }
    } catch (err) {
      setMessage?.({ type: 'error', text: 'Import failed' });
    }
    setSyncingId(null);
  };

  const toggleAcctSelection = (accountId) => {
    setSelectedAcctIds(prev =>
      prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId]
    );
  };

  const handleEnableDisable = async (connectionId, enable) => {
    if (!isTradovateGroup) return;
    if (selectedAcctIds.length === 0) return;
    const conn = connections.find(c => c.connectionId === connectionId);
    if (!conn) return;

    const allAccountIds = (conn.accounts || []).map(a => a.id);
    const currentEnabled = (!conn.selectedAccounts || conn.selectedAccounts.length === 0)
      ? allAccountIds
      : [...conn.selectedAccounts];

    let updated;
    if (enable) {
      updated = [...new Set([...currentEnabled, ...selectedAcctIds])];
    } else {
      updated = currentEnabled.filter(id => !selectedAcctIds.includes(id));
    }

    const toSave = updated.length === allAccountIds.length ? [] : updated;

    setSavingAccounts(connectionId);
    try {
      const response = await authFetch(`${apiBase}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, selectedAccounts: toSave }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage?.({ type: 'error', text: data.error });
      } else {
        setConnections(prev => prev.map(c =>
          c.connectionId === connectionId ? { ...c, selectedAccounts: toSave } : c
        ));
        setSelectedAcctIds([]);
        setMessage?.({ type: 'success', text: enable ? 'Accounts enabled' : 'Accounts disabled' });
      }
    } catch {
      setMessage?.({ type: 'error', text: 'Failed to update accounts' });
    }
    setSavingAccounts(null);
  };

  const atConnectionLimit = connectionsUsed >= connectionLimit && connectionLimit > 0;

  return {
    connections, connectionsUsed, connectionLimit, canUseBrokerSync,
    atConnectionLimit,
    environment, setEnvironment,
    connecting, setConnecting,
    syncingId, setSyncingId,
    showImportPrompt, setShowImportPrompt,
    savingAccounts,
    selectedAcctIds, setSelectedAcctIds,
    credentials, setCredentials,
    config, label, isTradovateGroup,
    fetchStatus,
    handleConnect, handleSync, handleSyncAll, handleDisconnect,
    handleImportNow, toggleAcctSelection, handleEnableDisable,
  };
};

module.exports = { useBrokerConnection, BROKER_CONFIGS, TRADOVATE_BROKERS };
