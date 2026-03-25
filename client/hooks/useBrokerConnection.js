const { useState, useCallback } = require('react');
const { authFetch } = require('../helper.js');

const TRADOVATE_BROKERS = [
  { key: 'tradovate', label: 'Tradovate', icon: '/assets/img/tradovate.png', subtitle: 'Futures trading platform', color: '#3b82f6' },
  { key: 'ninjatrader', label: 'NinjaTrader', icon: '/assets/img/ninjatrader.jpeg', subtitle: 'Advanced charting & trading', color: '#f59e0b' },
  { key: 'alpha_futures', label: 'Alpha Futures', icon: '/assets/img/alphafutures.png', subtitle: 'Prop trading firm (Tradovate)', color: '#e63946' },
  { key: 'apex_trader_funding', label: 'Apex Trader Funding', icon: '/assets/img/apex.png', subtitle: 'Prop trading firm (Tradovate)', color: '#ff6b00' },
];

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

  const config = TRADOVATE_BROKERS.find(b => b.key === brokerType);
  const label = config?.label || brokerType;

  const fetchStatus = useCallback(async () => {
    try {
      const response = await authFetch(`/api/tradovate/status?broker=${brokerType}`);
      const data = await response.json();
      setConnections(data.connections || []);
      setConnectionsUsed(data.connectionsUsed || 0);
      setConnectionLimit(data.connectionLimit || 0);
      setCanUseBrokerSync(data.canUseBrokerSync || false);
    } catch (err) {
      console.error(`Failed to fetch ${label} status:`, err);
    }
  }, [brokerType]);

  const handleConnect = async () => {
    setConnecting(true);
    setMessage?.(null);
    try {
      const response = await authFetch('/api/tradovate/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment, broker: brokerType }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage?.({ type: 'error', text: data.error });
        setConnecting(false);
      } else if (data.authUrl) {
        window.location.href = data.authUrl;
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
      const response = await authFetch('/api/tradovate/sync', {
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
    setSyncingId('all');
    setMessage?.(null);
    try {
      const response = await authFetch('/api/tradovate/sync-all', {
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
      const response = await authFetch(`/api/tradovate/connections/${connectionId}`, { method: 'DELETE' });
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
      const response = await authFetch('/api/tradovate/sync', {
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
      const response = await authFetch('/api/tradovate/accounts', {
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
    config, label,
    fetchStatus,
    handleConnect, handleSync, handleSyncAll, handleDisconnect,
    handleImportNow, toggleAcctSelection, handleEnableDisable,
  };
};

module.exports = { useBrokerConnection, TRADOVATE_BROKERS };
