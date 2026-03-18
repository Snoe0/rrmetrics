const React = require('react');
const { useState, useEffect } = React;
const helper = require('../../helper.js');
const { authFetch } = helper;
const Icons = require('../shared/Icons');

const ConnectionRow = ({ name, connection, brokerType, onSync }) => {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await authFetch(`/api/${brokerType}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connection.connectionId }),
      });
      const data = await res.json();
      if (data.error) {
        setResult({ type: 'error', message: data.error });
      } else {
        const count = data.synced || 0;
        setResult({ type: 'success', message: count > 0 ? `Synced ${count} trade${count !== 1 ? 's' : ''}` : 'Already up to date' });
        if (count > 0) onSync();
      }
    } catch {
      setResult({ type: 'error', message: 'Sync failed' });
    }
    setSyncing(false);
  };

  const handleReconnect = async () => {
    try {
      const res = await authFetch(`/api/${brokerType}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: connection.environment }),
      });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      setResult({ type: 'error', message: 'Failed to reconnect' });
    }
  };

  const isConnected = connection.configured && !connection.expired;
  const isExpired = connection.expired;

  return (
    <div className="flex items-center justify-between p-4 bg-bg-page rounded-lg border border-border">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-bg-surface border border-border flex items-center justify-center text-text-secondary">
          <Icons.BarChart2 className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-text-primary">{name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {isConnected && (
              <span className="text-xs text-positive font-medium">Connected</span>
            )}
            {isExpired && (
              <span className="text-xs text-warning font-medium">Expired</span>
            )}
            {!connection.configured && !isExpired && (
              <span className="text-xs text-text-muted font-medium">Not connected</span>
            )}
            {connection.label && (
              <span className="text-xs text-text-tertiary">{connection.label}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {result && (
          <span className={`text-xs font-medium ${result.type === 'success' ? 'text-positive' : 'text-negative'}`}>
            {result.message}
          </span>
        )}
        {isConnected && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
          >
            <Icons.RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        )}
        {isExpired && brokerType === 'tradovate' && (
          <button
            onClick={handleReconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/15 text-warning text-xs font-semibold rounded-lg hover:bg-warning/25 transition-all cursor-pointer"
          >
            Reconnect
          </button>
        )}
        {!connection.configured && !isExpired && (
          <span className="text-xs text-text-muted">Set up in Settings</span>
        )}
      </div>
    </div>
  );
};

const SyncAllButton = ({ brokerType, label, onSync }) => {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleSyncAll = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await authFetch(`/api/${brokerType}/sync-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.error) {
        setResult({ type: 'error', message: data.error });
      } else {
        const total = data.results?.reduce((sum, r) => sum + (r.tradesImported || 0), 0) || 0;
        setResult({ type: 'success', message: total > 0 ? `Synced ${total} trade${total !== 1 ? 's' : ''}` : 'Already up to date' });
        if (total > 0) onSync();
      }
    } catch {
      setResult({ type: 'error', message: 'Sync failed' });
    }
    setSyncing(false);
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        {result && (
          <span className={`text-xs font-medium ${result.type === 'success' ? 'text-positive' : 'text-negative'}`}>
            {result.message}
          </span>
        )}
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 text-accent text-xs font-semibold rounded-lg hover:bg-accent/20 transition-all disabled:opacity-50"
        >
          <Icons.RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync All'}
        </button>
      </div>
    </div>
  );
};

const SyncPopup = ({ isOpen, onClose, triggerReload }) => {
  const [tvConnections, setTvConnections] = useState([]);
  const [pxConnections, setPxConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const fetchStatuses = async () => {
      try {
        const tvRes = await authFetch('/api/tradovate/status');
        const tvData = await tvRes.json();
        setTvConnections(tvData.connections || []);
      } catch { setTvConnections([]); }
      try {
        const pxRes = await authFetch('/api/projectx/status');
        const pxData = await pxRes.json();
        setPxConnections(pxData.connections || []);
      } catch { setPxConnections([]); }
      setLoading(false);
    };
    fetchStatuses();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeTvConnections = tvConnections.filter(c => c.configured || c.expired);
  const activePxConnections = pxConnections.filter(c => c.configured || c.expired);
  const hasAny = activeTvConnections.length > 0 || activePxConnections.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-surface border border-border rounded-xl shadow-2xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Sync Trades</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            <Icons.X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Icons.RefreshCw className="w-5 h-5 text-text-muted animate-spin" />
            </div>
          ) : !hasAny ? (
            <p className="text-text-secondary text-sm text-center py-4">No broker integrations found. Set up a connection in Settings.</p>
          ) : (
            <>
              {activeTvConnections.length > 0 && (
                <div className="space-y-2">
                  {activeTvConnections.length >= 2 && (
                    <SyncAllButton brokerType="tradovate" label="Tradovate" onSync={triggerReload} />
                  )}
                  {activeTvConnections.map((conn) => (
                    <ConnectionRow
                      key={conn.connectionId}
                      name="Tradovate"
                      connection={conn}
                      brokerType="tradovate"
                      onSync={triggerReload}
                    />
                  ))}
                </div>
              )}
              {activePxConnections.length > 0 && (
                <div className="space-y-2">
                  {activePxConnections.map((conn) => (
                    <ConnectionRow
                      key={conn.connectionId}
                      name="Topstep"
                      connection={conn}
                      brokerType="projectx"
                      onSync={triggerReload}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

module.exports = SyncPopup;
