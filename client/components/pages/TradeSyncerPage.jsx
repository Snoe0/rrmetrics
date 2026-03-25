const React = require('react');
const { useState, useEffect, useRef, useCallback } = React;
const { authFetch } = require('../../helper');
const Icons = require('../shared/Icons');
const TradovateWebSocket = require('../../services/TradovateWebSocket');

// ─── Account Card ────────────────────────────────────────────────────────────

const AccountCard = ({ account, multiplier, onMultiplierChange, onRemove, draggable = true }) => {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify(account));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      className="flex items-center gap-3 bg-bg-surface border border-border rounded-lg px-4 py-3 cursor-grab active:cursor-grabbing select-none hover:border-accent/40 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="text-text-primary text-sm font-medium truncate">{account.accountName}</div>
        <div className="text-text-muted text-xs truncate">
          {account.connectionLabel || account.environment} &middot; ID: {account.accountId}
        </div>
      </div>
      {multiplier !== undefined && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0.1"
            max="10"
            step="0.5"
            value={multiplier}
            onChange={(e) => onMultiplierChange?.(parseFloat(e.target.value) || 1)}
            className="w-14 px-2 py-1 bg-bg-input border border-border rounded text-text-primary text-xs text-center"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-text-muted text-xs">x</span>
        </div>
      )}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-text-muted hover:text-negative transition-colors"
          title="Remove"
        >
          <Icons.X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

// ─── Drop Zone ───────────────────────────────────────────────────────────────

const DropZone = ({ label, icon: Icon, children, onDrop, isEmpty, className = '' }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      onDrop?.(data);
    } catch {}
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-4 transition-colors ${
        dragOver
          ? 'border-accent bg-accent/5'
          : 'border-border'
      } ${className}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4 text-text-secondary" />}
        <span className="text-text-secondary text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      {isEmpty ? (
        <div className="text-text-muted text-sm text-center py-6">
          Drag an account here
        </div>
      ) : (
        <div className="space-y-2">
          {children}
        </div>
      )}
    </div>
  );
};

// ─── Connection Status Badge ─────────────────────────────────────────────────

const WS_STATUS_CONFIG = {
  disconnected: { color: 'text-text-muted', bg: '', label: 'Disconnected', pulse: false },
  connecting: { color: 'text-warning', bg: 'bg-warning', label: 'Connecting', pulse: true },
  connected: { color: 'text-accent', bg: 'bg-accent', label: 'Connected', pulse: false },
  subscribed: { color: 'text-positive', bg: 'bg-positive', label: 'Subscribed', pulse: false },
  reconnecting: { color: 'text-warning', bg: 'bg-warning', label: 'Reconnecting', pulse: true },
};

const ConnectionStatus = ({ status }) => {
  const cfg = WS_STATUS_CONFIG[status] || WS_STATUS_CONFIG.disconnected;
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-3 w-3">
        {cfg.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.bg} opacity-75`}></span>
        )}
        <span className={`relative inline-flex rounded-full h-3 w-3 ${cfg.bg || 'bg-text-muted'}`}></span>
      </span>
      <span className={`${cfg.color} text-sm font-medium`}>{cfg.label}</span>
    </div>
  );
};

// ─── Order Log ───────────────────────────────────────────────────────────────

const OrderLog = ({ logs }) => {
  if (!logs || logs.length === 0) return null;

  const statusColor = {
    filled: 'text-positive',
    placed: 'text-positive',
    pending: 'text-warning',
    failed: 'text-negative',
    cancelled: 'text-text-muted',
  };

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-4 mt-4">
      <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Order Log</h3>
      <div className="max-h-60 overflow-y-auto space-y-1">
        {logs.map((log, i) => (
          <div key={log.id || i} className="text-xs py-1.5 border-b border-border/30 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-text-muted font-mono w-16 shrink-0">
                {new Date(log.created_at).toLocaleTimeString()}
              </span>
              <span className={`font-semibold w-16 shrink-0 ${statusColor[log.status] || 'text-text-secondary'}`}>
                {log.status}
              </span>
              {log.order_type && (
                <span className="text-text-muted w-14 shrink-0">{log.order_type}</span>
              )}
              <span className="text-text-secondary">
                {log.leader_action} {log.leader_symbol} x{log.leader_qty}
                {log.follower_qty && log.follower_qty !== log.leader_qty ? ` (-> x${log.follower_qty})` : ''}
                {' -> '}
                Acct {log.follower_account_id}
              </span>
            </div>
            {log.error_message && (
              <div className="text-negative mt-1 break-all font-mono text-[10px]">{log.error_message}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const TradeSyncerPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [leader, setLeader] = useState(null);
  const [followers, setFollowers] = useState([]);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [accountStatuses, setAccountStatuses] = useState([]);
  const [sessionActions, setSessionActions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const logsIntervalRef = useRef(null);
  const configLoadedRef = useRef(false);
  const hasConnectedRef = useRef(false);

  // Client-side dedup: tracks mirrored leader orders with their last known state
  // Map<leaderOrderId, { price, stopPrice, orderQty }>
  const mirroredOrdersRef = useRef(new Map());

  // Leader positions tracked from WebSocket events
  // Map<contractId, netPos>
  const leaderPositionsRef = useRef(new Map());

  // Sequential mirror request queue
  const mirrorQueueRef = useRef(Promise.resolve());

  // ── Enqueue a mirror request (sequential processing) ─────────────────────

  const enqueueMirror = useCallback((payload) => {
    mirrorQueueRef.current = mirrorQueueRef.current.then(async () => {
      try {
        const res = await authFetch('/api/syncer/mirror', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.actions && data.actions.length > 0) {
          setSessionActions((prev) => [
            ...data.actions.map((a) => ({ ...a, timestamp: new Date().toISOString() })),
            ...prev,
          ].slice(0, 100));
        }
        if (data.error) {
          setError(data.error);
        }
      } catch (err) {
        console.error('Mirror request failed:', err);
      }
    });
  }, []);

  // ── Fetch leader token for WebSocket connection ──────────────────────────

  const fetchToken = useCallback(async () => {
    const res = await authFetch('/api/syncer/token');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }, []);

  // ── WebSocket event handlers ─────────────────────────────────────────────

  const handleWsOrder = useCallback((entity) => {
    const orderId = entity.id;
    const ordStatus = entity.ordStatus;
    const workingStatuses = ['Working', 'Accepted', 'PendingNew'];

    console.log('[Syncer WS] order event:', JSON.stringify(entity));

    if (workingStatuses.includes(ordStatus)) {
      // Extract prices — Tradovate WS may use various field names
      const price = entity.price ?? entity.limitPrice ?? undefined;
      const stopPrice = entity.stopPrice ?? entity.triggerPrice ?? undefined;
      const orderQty = entity.orderQty ?? entity.qty ?? 1;

      // Determine order type from explicit ordType first, then infer from prices
      let orderType = entity.ordType || entity.orderType;
      if (!orderType) {
        if (price != null && stopPrice != null) orderType = 'StopLimit';
        else if (stopPrice != null) orderType = 'Stop';
        else if (price != null) orderType = 'Limit';
        else orderType = 'Market';
      }

      // Skip market orders — they execute instantly, position sync handles them
      if (orderType === 'Market') return;

      const existing = mirroredOrdersRef.current.get(orderId);
      if (existing) {
        // Check if the order was modified
        const priceChanged = price !== existing.price;
        const stopPriceChanged = stopPrice !== existing.stopPrice;
        const qtyChanged = orderQty !== existing.orderQty;

        if (priceChanged || stopPriceChanged || qtyChanged) {
          // Modification detected
          const payload = { type: 'modify', leaderOrderId: orderId };
          if (priceChanged && price != null) payload.price = price;
          if (stopPriceChanged && stopPrice != null) payload.stopPrice = stopPrice;
          if (qtyChanged) payload.orderQty = orderQty;
          enqueueMirror(payload);

          // Update tracked state
          mirroredOrdersRef.current.set(orderId, { price, stopPrice, orderQty });
        }
        // Else: no change, ignore
      } else {
        // New order — mirror it
        const payload = {
          type: 'order',
          leaderOrderId: orderId,
          action: entity.action,
          contractId: entity.contractId,
          orderType,
          orderQty,
        };
        if (price != null) payload.price = price;
        if (stopPrice != null) payload.stopPrice = stopPrice;
        enqueueMirror(payload);

        // Track it
        mirroredOrdersRef.current.set(orderId, { price, stopPrice, orderQty });
      }
    } else if (ordStatus === 'Canceled') {
      if (mirroredOrdersRef.current.has(orderId)) {
        enqueueMirror({ type: 'cancel', leaderOrderId: orderId });
        mirroredOrdersRef.current.delete(orderId);
      }
    } else if (ordStatus === 'Filled') {
      mirroredOrdersRef.current.delete(orderId);
      // Trigger position sync to reconcile
      const positions = Array.from(leaderPositionsRef.current.entries())
        .map(([contractId, netPos]) => ({ contractId, netPos }));
      if (positions.length > 0) {
        enqueueMirror({ type: 'position_sync', positions });
      }
    }
  }, [enqueueMirror]);

  const handleWsPosition = useCallback((entity) => {
    leaderPositionsRef.current.set(entity.contractId, entity.netPos);
  }, []);

  const handleWsStatus = useCallback((status) => {
    setWsStatus(status);
    // On reconnect after initial connection, do a position sync to catch missed events
    if (status === 'subscribed' && hasConnectedRef.current) {
      const positions = Array.from(leaderPositionsRef.current.entries())
        .map(([contractId, netPos]) => ({ contractId, netPos }));
      if (positions.length > 0) {
        enqueueMirror({ type: 'position_sync', positions });
      }
    }
    if (status === 'subscribed') {
      hasConnectedRef.current = true;
    }
  }, [enqueueMirror]);

  const handleWsError = useCallback((err) => {
    setError(`WebSocket: ${err.message || 'Connection error'}`);
  }, []);

  // ── Load accounts and saved config on mount ──────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const [accountsRes, configRes] = await Promise.all([
          authFetch('/api/syncer/accounts'),
          authFetch('/api/syncer/config'),
        ]);
        const accountsData = await accountsRes.json();
        const configData = await configRes.json();

        setAccounts(accountsData.accounts || []);

        if (configData.config) {
          const cfg = configData.config;
          if (cfg.leader_connection_id && cfg.leader_account_id) {
            const leaderAccount = (accountsData.accounts || []).find(
              (a) => a.connectionId === cfg.leader_connection_id && a.accountId === cfg.leader_account_id,
            );
            if (leaderAccount) setLeader(leaderAccount);
          }
          if (cfg.follower_accounts && cfg.follower_accounts.length > 0) {
            const restoredFollowers = cfg.follower_accounts
              .map((f) => {
                const acct = (accountsData.accounts || []).find(
                  (a) => a.connectionId === f.connectionId && a.accountId === f.accountId,
                );
                return acct ? { ...acct, multiplier: f.multiplier || 1 } : null;
              })
              .filter(Boolean);
            setFollowers(restoredFollowers);
          }
          // On page load/refresh, always deactivate syncer — must be manually re-enabled
          if (cfg.is_active) {
            authFetch('/api/syncer/stop', { method: 'POST' }).catch(() => {});
          }
          // Always start as inactive — user must click Start
          setIsActive(false);
        }
        configLoadedRef.current = true;
      } catch (err) {
        setError('Failed to load syncer data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Persist config when leader/followers change ──────────────────────────

  const saveConfig = useCallback(async (newLeader, newFollowers) => {
    if (!configLoadedRef.current) return;
    try {
      await authFetch('/api/syncer/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderConnectionId: newLeader?.connectionId || null,
          leaderAccountId: newLeader?.accountId || null,
          followerAccounts: newFollowers.map((f) => ({
            connectionId: f.connectionId,
            accountId: f.accountId,
            multiplier: f.multiplier || 1,
          })),
        }),
      });
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }, []);

  // ── Available accounts = all minus leader and followers ──────────────────

  const usedAccountIds = new Set();
  if (leader) usedAccountIds.add(`${leader.connectionId}:${leader.accountId}`);
  followers.forEach((f) => usedAccountIds.add(`${f.connectionId}:${f.accountId}`));
  const availableAccounts = accounts.filter(
    (a) => !usedAccountIds.has(`${a.connectionId}:${a.accountId}`),
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSetLeader = (account) => {
    const newLeader = account;
    setLeader(newLeader);
    const newFollowers = followers.filter(
      (f) => !(f.connectionId === account.connectionId && f.accountId === account.accountId),
    );
    setFollowers(newFollowers);
    saveConfig(newLeader, newFollowers);
  };

  const handleAddFollower = (account) => {
    if (leader && leader.connectionId === account.connectionId && leader.accountId === account.accountId) {
      return;
    }
    if (followers.some((f) => f.connectionId === account.connectionId && f.accountId === account.accountId)) {
      return;
    }
    const newFollowers = [...followers, { ...account, multiplier: 1 }];
    setFollowers(newFollowers);
    saveConfig(leader, newFollowers);
  };

  const handleRemoveLeader = () => {
    setLeader(null);
    saveConfig(null, followers);
  };

  const handleRemoveFollower = (index) => {
    const newFollowers = followers.filter((_, i) => i !== index);
    setFollowers(newFollowers);
    saveConfig(leader, newFollowers);
  };

  const handleMultiplierChange = (index, value) => {
    const newFollowers = followers.map((f, i) => (i === index ? { ...f, multiplier: value } : f));
    setFollowers(newFollowers);
    saveConfig(leader, newFollowers);
  };

  // ── Start/Stop syncing ───────────────────────────────────────────────────

  const handleStart = async () => {
    try {
      // 1. Mark active in DB
      const res = await authFetch('/api/syncer/start', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to start.');
        return;
      }
      setIsActive(true);
      setError(null);

      // 2. Get leader token + WS URL
      const tokenData = await fetchToken();

      // 3. Reset client state
      mirroredOrdersRef.current.clear();
      leaderPositionsRef.current.clear();
      hasConnectedRef.current = false;
      setSessionActions([]);

      // 4. Create WebSocket connection
      const ws = new TradovateWebSocket({
        wsUrl: tokenData.wsUrl,
        accessToken: tokenData.token,
        leaderAccountId: tokenData.leaderAccountId,
        refreshToken: fetchToken,
        onOrder: handleWsOrder,
        onPosition: handleWsPosition,
        onStatus: handleWsStatus,
        onError: handleWsError,
      });
      ws.connect();
      wsRef.current = ws;
    } catch (err) {
      setError(`Failed to start syncer: ${err.message}`);
    }
  };

  const handleStop = async () => {
    try {
      // 1. Disconnect WebSocket
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
      setWsStatus('disconnected');

      // 2. Mark inactive in DB
      const res = await authFetch('/api/syncer/stop', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to stop.');
        return;
      }
      setIsActive(false);
    } catch (err) {
      setError('Failed to stop syncer.');
    }
  };

  // ── Cleanup WebSocket on unmount ─────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
    };
  }, []);

  // ── Fetch account statuses (positions + balances) — 5s interval ──────────

  const fetchAccountStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/syncer/account-status');
      const data = await res.json();
      if (data.accounts) setAccountStatuses(data.accounts);
    } catch (err) {
      console.error('Account status error:', err);
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      return;
    }

    fetchAccountStatus();
    statusIntervalRef.current = setInterval(fetchAccountStatus, 5000);

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
    };
  }, [isActive, fetchAccountStatus]);

  // ── Fetch server logs periodically ───────────────────────────────────────

  const fetchLogs = useCallback(async () => {
    try {
      const res = await authFetch('/api/syncer/logs');
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
    } catch (err) {
      console.error('Logs fetch error:', err);
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
      return;
    }

    fetchLogs();
    logsIntervalRef.current = setInterval(fetchLogs, 10000);

    return () => {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
    };
  }, [isActive, fetchLogs]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Icons.RefreshCw className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Trade Syncer</h1>
          <p className="text-text-secondary text-sm mt-1">
            Mirror orders from a leader account to follower accounts in real-time via WebSocket.
          </p>
          <p className="text-text-muted text-xs mt-1">
            This page must remain open. For best results, keep the RR Metrics tab focused.
          </p>
        </div>
        {isActive && <ConnectionStatus status={wsStatus} />}
      </div>

      {error && (
        <div className="bg-negative/10 border border-negative/30 rounded-lg px-4 py-3 mb-4 text-negative text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Leader Zone */}
      <DropZone
        label="Leader Account"
        icon={Icons.Star}
        onDrop={handleSetLeader}
        isEmpty={!leader}
        className="mb-4"
      >
        {leader && (
          <AccountCard
            account={leader}
            onRemove={handleRemoveLeader}
            draggable={false}
          />
        )}
      </DropZone>

      {/* Followers Zone */}
      <DropZone
        label="Follower Accounts"
        icon={Icons.Users}
        onDrop={handleAddFollower}
        isEmpty={followers.length === 0}
        className="mb-4"
      >
        {followers.map((f, i) => (
          <AccountCard
            key={`${f.connectionId}:${f.accountId}`}
            account={f}
            multiplier={f.multiplier}
            onMultiplierChange={(val) => handleMultiplierChange(i, val)}
            onRemove={() => handleRemoveFollower(i)}
            draggable={false}
          />
        ))}
      </DropZone>

      {/* Total Multiplier Display */}
      {leader && followers.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">Total Quantity Multiplier</span>
            <span className="text-lg font-bold text-accent">
              {1 + followers.reduce((sum, f) => sum + (f.multiplier || 1), 0)}x
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Synced trades from the leader will have quantity multiplied to account for all follower accounts.
          </p>
        </div>
      )}

      {/* Available Accounts */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icons.Briefcase className="w-4 h-4 text-text-secondary" />
          <span className="text-text-secondary text-xs font-semibold uppercase tracking-wider">Available Accounts</span>
        </div>
        {availableAccounts.length === 0 ? (
          <p className="text-text-muted text-sm">
            {accounts.length === 0
              ? 'No Tradovate accounts found. Connect a Tradovate account in Settings first.'
              : 'All accounts are assigned.'}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {availableAccounts.map((a) => (
              <AccountCard
                key={`${a.connectionId}:${a.accountId}`}
                account={a}
              />
            ))}
          </div>
        )}
      </div>

      {/* Start/Stop Button */}
      <div className="flex justify-center mb-6">
        {isActive ? (
          <button
            onClick={handleStop}
            className="px-8 py-3 bg-negative text-white font-semibold rounded-lg text-sm hover:brightness-110 transition-all"
          >
            Stop Syncing
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!leader || followers.length === 0}
            className="px-8 py-3 bg-accent text-accent-text font-semibold rounded-lg text-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Syncing
          </button>
        )}
      </div>

      {/* Active Status */}
      {isActive && (sessionActions.length > 0 || accountStatuses.length > 0) && (
        <div className="bg-bg-surface border border-border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider">Live Status</h3>
            <span className="text-text-muted text-xs font-mono">
              {mirroredOrdersRef.current.size} tracked order{mirroredOrdersRef.current.size !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Per-account status cards */}
          {accountStatuses.length > 0 && (
            <div className="space-y-2 mb-3">
              {accountStatuses.map((acct) => (
                <div
                  key={acct.accountId}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                    acct.role === 'leader' ? 'border-accent/30 bg-accent/5' : 'border-border bg-bg-input/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary text-sm font-medium truncate">{acct.name}</span>
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                        acct.role === 'leader' ? 'bg-accent/20 text-accent' : 'bg-bg-input text-text-muted'
                      }`}>
                        {acct.role}
                      </span>
                    </div>
                    {acct.positions.length > 0 && (
                      <div className="text-text-muted text-xs mt-0.5">
                        {acct.positions.map((p) => `${p.netPos > 0 ? '+' : ''}${p.netPos}`).join(', ')} open
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {acct.cashBalance != null && (
                      <div className={`text-sm font-mono font-semibold ${acct.cashBalance >= 0 ? 'text-positive' : 'text-negative'}`}>
                        ${acct.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                    {acct.cashBalance == null && (
                      <div className="text-text-muted text-xs">--</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Session actions (from mirror responses) */}
          {sessionActions.length > 0 && (
            <div className="border-t border-border pt-3 space-y-1">
              <div className="text-text-muted text-xs font-semibold mb-1">Recent Actions</div>
              {sessionActions.slice(0, 20).map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted font-mono w-16 shrink-0">
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`font-semibold shrink-0 ${a.error ? 'text-negative' : a.type === 'cancel' ? 'text-warning' : a.type === 'modify' ? 'text-accent' : 'text-positive'}`}>
                    {a.type}
                  </span>
                  <span className="text-text-secondary">
                    {a.detail} {a.followerAccountId ? `-> Acct ${a.followerAccountId}` : ''}
                  </span>
                  {a.error && <span className="text-negative break-all">{a.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Order Log (from server) */}
      <OrderLog logs={logs} />
    </div>
  );
};

module.exports = TradeSyncerPage;
