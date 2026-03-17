const React = require('react');
const { useState, useEffect } = React;
const { authFetch, supabase } = require('../../helper.js');
const { TAG_COLOR_PRESETS } = require('../../utils/tagConstants');
const Icons = require('../shared/Icons');

const SettingsPage = ({ onSyncComplete, onNavigate, theme, onThemeChange, customColors, tags, triggerReload, subscriptionStatus }) => {
  const [activeTab, setActiveTab] = useState('brokers');
  const [tvEnvironment, setTvEnvironment] = useState('demo');
  const [tvStatus, setTvStatus] = useState(null);
  const [tvAccounts, setTvAccounts] = useState([]);
  const [tvAccountsLoading, setTvAccountsLoading] = useState(false);
  const [tvShowImportPrompt, setTvShowImportPrompt] = useState(false);
  const [tvSelectedAccounts, setTvSelectedAccounts] = useState([]); // rows checked for bulk action
  const [tvEnabledAccounts, setTvEnabledAccounts] = useState([]); // accounts enabled for sync (Active)
  const [tvSyncStartDate, setTvSyncStartDate] = useState('');
  const [tvSyncEndDate, setTvSyncEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [pxStatus, setPxStatus] = useState(null);
  const [pxAccounts, setPxAccounts] = useState([]);
  const [pxUsername, setPxUsername] = useState('');
  const [pxApiKey, setPxApiKey] = useState('');
  const [pxSelectedAccounts, setPxSelectedAccounts] = useState([]);
  const [pxCopytradeEnabled, setPxCopytradeEnabled] = useState(false);
  const [pxLeadAccount, setPxLeadAccount] = useState(null);
  const [pxMultiplier, setPxMultiplier] = useState(1);
  const [pxConnecting, setPxConnecting] = useState(false);
  const [pxSyncing, setPxSyncing] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_PRESETS[0]);
  const [editingTagId, setEditingTagId] = useState(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('');

  useEffect(() => { fetchStatus(); fetchPxStatus(); }, []);

  // Handle OAuth callback: exchange code when redirected back from Tradovate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('tv_code');
    const env = params.get('tv_env');
    const error = params.get('tv_error');

    // Clear OAuth params from URL immediately
    if (code || error) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (error) {
      setMessage({ type: 'error', text: 'Tradovate OAuth failed. Please try again.' });
      return;
    }

    if (!code) return;

    const exchangeCode = async () => {
      setSaving(true);
      setMessage(null);
      try {
        const response = await authFetch('/api/tradovate/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, environment: env || 'demo' }),
        });
        const data = await response.json();
        if (data.error) {
          setMessage({ type: 'error', text: data.error });
        } else {
          setMessage({ type: 'success', text: 'Tradovate connected successfully!' });
          if (data.accounts) {
            setTvAccounts(data.accounts);
            setTvEnabledAccounts(data.accounts.map(a => a.id));
          }
          setTvShowImportPrompt(true);
          setExpandedBroker('tradovate');
          fetchStatus();
        }
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to connect Tradovate' });
      }
      setSaving(false);
    };
    exchangeCode();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await authFetch('/api/tradovate/status');
      const data = await response.json();
      setTvStatus(data);
      if (data.environment) setTvEnvironment(data.environment);
    } catch (err) {
      console.error('Failed to fetch Tradovate status:', err);
    }
  };

  const handleConnect = () => {
    window.location.href = `/api/tradovate/connect?environment=${tvEnvironment}`;
  };

  const handleSync = async ({ useDateRange = false } = {}) => {
    setSyncing(true);
    setMessage(null);
    let success = false;
    try {
      const body = {};
      if (tvEnabledAccounts.length > 0 && tvEnabledAccounts.length < tvAccounts.length) {
        body.accountIds = tvEnabledAccounts;
      }
      if (useDateRange) {
        if (tvSyncStartDate) body.startDate = tvSyncStartDate;
        if (tvSyncEndDate) body.endDate = tvSyncEndDate;
      }

      const response = await authFetch('/api/tradovate/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
        fetchStatus();
        if (onSyncComplete) onSyncComplete();
        success = true;
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Sync failed' });
    }
    setSyncing(false);
    return success;
  };

  const fetchTvAccounts = async () => {
    setTvAccountsLoading(true);
    try {
      const response = await authFetch('/api/tradovate/accounts');
      const data = await response.json();
      if (data.accounts) {
        setTvAccounts(data.accounts);
        setTvEnabledAccounts(data.accounts.map(a => a.id));
      }
    } catch (err) {
      console.error('Failed to fetch Tradovate accounts:', err);
    }
    setTvAccountsLoading(false);
  };

  const handleImportNow = async (todayOnly = false) => {
    if (todayOnly) {
      const today = new Date().toISOString().split('T')[0];
      setTvSyncStartDate(today);
      setTvSyncEndDate(today);
    } else {
      setTvSyncStartDate('');
      setTvSyncEndDate('');
    }
    const success = await handleSync({ useDateRange: todayOnly });
    if (success) setTvShowImportPrompt(false);
  };

  const handleDeleteCredentials = async () => {
    setMessage(null);
    try {
      const response = await authFetch('/api/tradovate/credentials', { method: 'DELETE' });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
        setTvAccounts([]);
        setTvShowImportPrompt(false);
        setTvSelectedAccounts([]);
        setTvEnabledAccounts([]);
        setTvSyncStartDate('');
        setTvSyncEndDate('');
        fetchStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete credentials' });
    }
  };

  const handleEnableSelected = () => {
    setTvEnabledAccounts(prev => [...new Set([...prev, ...tvSelectedAccounts])]);
    setTvSelectedAccounts([]);
  };

  const handleDisableSelected = () => {
    setTvEnabledAccounts(prev => prev.filter(id => !tvSelectedAccounts.includes(id)));
    setTvSelectedAccounts([]);
  };

  const fetchPxStatus = async () => {
    try {
      const response = await authFetch('/api/projectx/status');
      const data = await response.json();
      setPxStatus(data);
      if (data.accounts) setPxAccounts(data.accounts);
      if (data.selectedAccounts) setPxSelectedAccounts(data.selectedAccounts);
      if (data.copytradeConfig) {
        setPxCopytradeEnabled(true);
        setPxLeadAccount(data.copytradeConfig.leadAccountId);
        setPxMultiplier(data.copytradeConfig.multiplier);
      }
    } catch (err) {
      console.error('Failed to fetch ProjectX status:', err);
    }
  };

  const handlePxConnect = async () => {
    if (!pxUsername.trim() || !pxApiKey.trim()) {
      setMessage({ type: 'error', text: 'Username and API key are required' });
      return;
    }
    setPxConnecting(true);
    setMessage(null);
    try {
      const response = await authFetch('/api/projectx/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pxUsername.trim(), apiKey: pxApiKey.trim() }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: 'Connected to ProjectX!' });
        setPxAccounts(data.accounts || []);
        setPxApiKey('');
        fetchPxStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to connect to ProjectX' });
    }
    setPxConnecting(false);
  };

  const handlePxSaveAccounts = async () => {
    if (pxSelectedAccounts.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one account' });
      return;
    }
    setMessage(null);
    try {
      const copytradeConfig = pxCopytradeEnabled && pxLeadAccount
        ? { leadAccountId: pxLeadAccount, multiplier: pxMultiplier }
        : null;
      const response = await authFetch('/api/projectx/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAccounts: pxSelectedAccounts, copytradeConfig }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: 'Account settings saved' });
        fetchPxStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    }
  };

  const handlePxSync = async () => {
    setPxSyncing(true);
    setMessage(null);
    try {
      const response = await authFetch('/api/projectx/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
        fetchPxStatus();
        if (onSyncComplete) onSyncComplete();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Sync failed' });
    }
    setPxSyncing(false);
  };

  const handlePxDisconnect = async () => {
    setMessage(null);
    try {
      const response = await authFetch('/api/projectx/credentials', { method: 'DELETE' });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setMessage({ type: 'success', text: data.message });
        setPxStatus(null);
        setPxAccounts([]);
        setPxSelectedAccounts([]);
        setPxCopytradeEnabled(false);
        setPxLeadAccount(null);
        setPxMultiplier(1);
        fetchPxStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect' });
    }
  };

  const togglePxAccount = (accountId) => {
    setPxSelectedAccounts(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const response = await authFetch('/api/makeTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setNewTagName('');
        setNewTagColor(TAG_COLOR_PRESETS[0]);
        if (triggerReload) triggerReload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to create tag' });
    }
  };

  const handleEditTag = async (tagId) => {
    if (!editTagName.trim()) return;
    try {
      const response = await authFetch('/api/updateTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: tagId, name: editTagName.trim(), color: editTagColor }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        setEditingTagId(null);
        if (triggerReload) triggerReload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to update tag' });
    }
  };

  const handleDeleteTag = async (tagId) => {
    if (!confirm('Delete this tag? It will be removed from all trades.')) return;
    try {
      const response = await authFetch('/api/removeTag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: tagId }),
      });
      const data = await response.json();
      if (data.error) {
        setMessage({ type: 'error', text: data.error });
      } else {
        if (triggerReload) triggerReload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to delete tag' });
    }
  };

  const tabs = [
    { id: 'brokers', label: 'Broker Connections' },
    { id: 'tags', label: 'Tags' },
    { id: 'account', label: 'Account' },
    { id: 'preferences', label: 'Preferences' },
  ];

  const [expandedBroker, setExpandedBroker] = useState(null);

  useEffect(() => {
    if (expandedBroker === 'tradovate' && tvStatus?.configured && tvAccounts.length === 0) {
      fetchTvAccounts();
    }
  }, [expandedBroker, tvStatus, tvAccounts.length]);

  const toggleBroker = (id) => setExpandedBroker(expandedBroker === id ? null : id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary text-sm mt-1">Manage your account and integrations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-input rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-bg-surface text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Broker Connections tab */}
      {activeTab === 'brokers' && (
        <div className="space-y-6">
          {/* Message */}
          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === 'error'
                ? 'bg-negative/10 border border-negative/30 text-negative'
                : 'bg-positive/10 border border-positive/30 text-positive'
            }`}>
              {message.text}
            </div>
          )}

          {/* Tradovate */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => toggleBroker('tradovate')}
              className="w-full flex items-center justify-between p-5 hover:bg-bg-page/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <img src="/assets/img/tradovate.png" alt="Tradovate" className="w-10 h-10 rounded-lg object-contain" />
                <div className="text-left">
                  <h3 className="text-text-primary font-semibold text-sm">Tradovate</h3>
                  <p className="text-text-tertiary text-xs">Futures trading platform</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {tvStatus?.configured ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-positive/10 text-positive">
                    Connected
                  </div>
                ) : tvStatus?.expired ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
                    Expired
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-text-secondary/10 text-text-secondary">
                    Not Connected
                  </div>
                )}
                {expandedBroker === 'tradovate' ? <Icons.ChevronUp className="w-4 h-4 text-text-secondary" /> : <Icons.ChevronDown className="w-4 h-4 text-text-secondary" />}
              </div>
            </button>

            {expandedBroker === 'tradovate' && (
              <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
                {subscriptionStatus && subscriptionStatus.plan !== 'pro' && subscriptionStatus.plan !== 'elite' ? (
                  <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-center">
                    <p className="text-sm text-text-primary font-medium mb-1">Pro or Elite plan required</p>
                    <p className="text-xs text-text-secondary mb-3">Broker sync is available on Pro and Elite plans.</p>
                    <button
                      onClick={() => window.location.href = '/upgrade'}
                      className="px-4 py-2 bg-accent text-accent-text text-sm font-medium rounded-lg hover:brightness-110 transition-all"
                    >
                      Upgrade Now
                    </button>
                  </div>
                ) : !tvStatus?.configured ? (
                  <>
                    <div className="bg-bg-page/50 rounded-lg p-3">
                      <p className="text-xs text-text-secondary leading-relaxed">
                        {tvStatus?.expired
                          ? 'Your Tradovate session has expired. Reconnect to resume automatic trade sync.'
                          : 'Connect your Tradovate account to automatically sync your fills into RR Metrics.'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Environment</label>
                      <select
                        value={tvEnvironment}
                        onChange={(e) => setTvEnvironment(e.target.value)}
                        className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="demo">Demo</option>
                        <option value="live">Live</option>
                      </select>
                    </div>
                    <button
                      onClick={handleConnect}
                      disabled={saving}
                      className="px-4 py-2 bg-accent text-accent-text text-sm font-medium rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                    >
                      {saving ? 'Connecting...' : 'Connect with Tradovate'}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="bg-bg-page/50 rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">Environment</span>
                        <span className="text-text-primary font-medium capitalize">{tvStatus.environment}</span>
                      </div>
                      {tvStatus.lastSyncTime && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary">Last synced</span>
                          <span className="text-text-primary">{new Date(tvStatus.lastSyncTime).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {tvAccountsLoading ? (
                      <p className="text-xs text-text-secondary">Loading accounts...</p>
                    ) : tvAccounts.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-medium text-text-secondary">Accounts</h4>
                          {tvSelectedAccounts.length > 0 && (
                            <div className="flex gap-1">
                              <button
                                onClick={handleEnableSelected}
                                className="text-xs px-2 py-0.5 rounded bg-positive/10 text-positive hover:bg-positive/20 transition-colors"
                              >
                                Enable
                              </button>
                              <button
                                onClick={handleDisableSelected}
                                className="text-xs px-2 py-0.5 rounded bg-text-secondary/10 text-text-secondary hover:bg-text-secondary/20 transition-colors"
                              >
                                Disable
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {tvAccounts.map(account => {
                            const selected = tvSelectedAccounts.includes(account.id);
                            const enabled = tvEnabledAccounts.includes(account.id);
                            return (
                              <label
                                key={account.id}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors border ${
                                  selected
                                    ? 'bg-accent/10 border-accent/30'
                                    : 'bg-bg-page/50 border-border hover:border-border/80'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => setTvSelectedAccounts(prev =>
                                    selected ? prev.filter(id => id !== account.id) : [...prev, account.id]
                                  )}
                                  className="sr-only"
                                />
                                <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                                  selected ? 'bg-accent border-accent' : 'border-border bg-bg-input'
                                }`}>
                                  {selected && (
                                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                                <span className="text-sm text-text-primary flex-1">{account.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  enabled ? 'bg-positive/10 text-positive' : 'bg-text-secondary/10 text-text-secondary'
                                }`}>
                                  {enabled ? 'Active' : 'Inactive'}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {tvShowImportPrompt ? (
                      <div className="bg-info/5 border border-info/20 rounded-lg p-4">
                        <p className="text-sm text-text-primary font-medium mb-1">Import trades</p>
                        <p className="text-xs text-text-secondary mb-3">
                          Import all your past fills from Tradovate, or just today's trades.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleImportNow(false)}
                            disabled={syncing}
                            className="flex-1 px-3 py-2 bg-accent text-accent-text text-xs font-medium rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                          >
                            {syncing ? 'Importing...' : 'Import all trades'}
                          </button>
                          <button
                            onClick={() => handleImportNow(true)}
                            disabled={syncing}
                            className="flex-1 px-3 py-2 border border-border text-text-secondary text-xs font-medium rounded-lg hover:text-text-primary transition-colors disabled:opacity-50"
                          >
                            {syncing ? 'Importing...' : "Import today's trades"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSync()}
                          disabled={syncing}
                          className="flex-1 px-4 py-2 bg-accent text-accent-text text-sm font-medium rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                        >
                          {syncing ? 'Syncing...' : 'Sync Now'}
                        </button>
                        <button
                          onClick={handleDeleteCredentials}
                          className="px-4 py-2 border border-border text-text-secondary text-sm font-medium rounded-lg hover:border-negative hover:text-negative transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ProjectX / Topstep */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => toggleBroker('projectx')}
              className="w-full flex items-center justify-between p-5 hover:bg-bg-page/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <img src="/assets/img/topstep.png" alt="ProjectX" className="w-10 h-10 rounded-lg object-contain" />
                <div className="text-left">
                  <h3 className="text-text-primary font-semibold text-sm">ProjectX / Topstep</h3>
                  <p className="text-text-tertiary text-xs">Futures trading platform</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {pxStatus?.configured ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-positive/10 text-positive">
                    Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-text-secondary/10 text-text-secondary">
                    Not Connected
                  </div>
                )}
                {expandedBroker === 'projectx' ? <Icons.ChevronUp className="w-4 h-4 text-text-secondary" /> : <Icons.ChevronDown className="w-4 h-4 text-text-secondary" />}
              </div>
            </button>

            {expandedBroker === 'projectx' && (
              <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
                {pxStatus && !pxStatus.canUseBrokerSync ? (
                  <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-center">
                    <p className="text-sm text-text-primary font-medium mb-1">Pro or Elite plan required</p>
                    <p className="text-xs text-text-secondary mb-3">Broker sync is available on Pro (up to 3 accounts) and Elite (unlimited) plans.</p>
                    <button
                      onClick={() => window.location.href = '/upgrade'}
                      className="px-4 py-2 bg-accent text-accent-text text-sm font-medium rounded-lg hover:brightness-110 transition-all"
                    >
                      Upgrade Now
                    </button>
                  </div>
                ) : !pxStatus?.configured ? (
                  <>
                    <div className="bg-bg-page/50 rounded-lg p-3">
                      <p className="text-xs text-text-secondary leading-relaxed">
                        Connect your Topstep account via the ProjectX API to automatically sync trades. You'll need a paid API subscription from Topstep ($29/month).
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Username</label>
                        <input
                          type="text"
                          value={pxUsername}
                          onChange={(e) => setPxUsername(e.target.value)}
                          placeholder="Your Topstep username"
                          className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">API Key</label>
                        <input
                          type="password"
                          value={pxApiKey}
                          onChange={(e) => setPxApiKey(e.target.value)}
                          placeholder="Your ProjectX API key"
                          className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                        />
                      </div>
                      <button
                        onClick={handlePxConnect}
                        disabled={pxConnecting}
                        className="px-4 py-2 bg-accent text-accent-text text-sm font-medium rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                      >
                        {pxConnecting ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                    <a
                      href="https://help.topstep.com/en/articles/11187768-topstepx-api-access"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-accent text-xs hover:underline"
                    >
                      <Icons.FileText className="w-3.5 h-3.5" />
                      How to get your API key
                    </a>
                  </>
                ) : (
                  <>
                    {/* Account Selection */}
                    {pxAccounts.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-text-primary">Accounts</h4>
                          {pxStatus?.accountLimit !== Infinity && (
                            <span className="text-xs text-text-muted">
                              {pxSelectedAccounts.length} / {pxStatus?.accountLimit || 0} accounts
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {pxAccounts.map(account => (
                            <label key={account.id} className="flex items-center gap-3 p-2.5 bg-bg-page/50 rounded-lg cursor-pointer hover:bg-bg-page transition-colors">
                              <input
                                type="checkbox"
                                checked={pxSelectedAccounts.includes(account.id)}
                                onChange={() => togglePxAccount(account.id)}
                                disabled={!pxSelectedAccounts.includes(account.id) && pxStatus?.accountLimit !== Infinity && pxSelectedAccounts.length >= (pxStatus?.accountLimit || 0)}
                                className="w-4 h-4 rounded border-border text-accent focus:ring-accent disabled:opacity-40"
                              />
                              <div className="flex-1">
                                <span className="text-sm text-text-primary font-medium">{account.name}</span>
                                <span className="text-xs text-text-secondary ml-2">${account.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              {account.canTrade && (
                                <span className="text-xs text-positive bg-positive/10 px-2 py-0.5 rounded-full">Active</span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Copytrading Toggle */}
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pxCopytradeEnabled}
                          onChange={(e) => {
                            setPxCopytradeEnabled(e.target.checked);
                            if (!e.target.checked) {
                              setPxLeadAccount(null);
                              setPxMultiplier(1);
                            }
                          }}
                          className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                        />
                        <div>
                          <span className="text-sm text-text-primary font-medium">I am copytrading / tradesyncing</span>
                          <p className="text-xs text-text-secondary mt-0.5">Only sync from a lead account and multiply quantity and P&L</p>
                        </div>
                      </label>

                      {pxCopytradeEnabled && (
                        <div className="pl-7 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">Lead Account</label>
                            <select
                              value={pxLeadAccount || ''}
                              onChange={(e) => setPxLeadAccount(Number(e.target.value))}
                              className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                            >
                              <option value="">Select lead account</option>
                              {pxAccounts.filter(a => pxSelectedAccounts.includes(a.id)).map(account => (
                                <option key={account.id} value={account.id}>{account.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">Total Accounts (multiplier)</label>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={pxMultiplier}
                              onChange={(e) => setPxMultiplier(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-24 px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                            />
                            <p className="text-xs text-text-muted mt-1">Quantity and P&L will be multiplied by this number</p>
                          </div>
                          <a
                            href="/guides/copytrading"
                            className="inline-flex items-center gap-1.5 text-accent text-xs hover:underline"
                          >
                            <Icons.FileText className="w-3.5 h-3.5" />
                            Learn more about copytrading setup
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handlePxSaveAccounts}
                        className="px-4 py-2 bg-accent text-accent-text text-sm font-medium rounded-lg hover:brightness-110 transition-all"
                      >
                        Save Settings
                      </button>
                      <button
                        onClick={handlePxSync}
                        disabled={pxSyncing || pxSelectedAccounts.length === 0}
                        className="px-4 py-2 bg-bg-page border border-border text-text-primary text-sm font-medium rounded-lg hover:bg-bg-input transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <Icons.RefreshCw className={`w-4 h-4 ${pxSyncing ? 'animate-spin' : ''}`} />
                        {pxSyncing ? 'Syncing...' : 'Sync Now'}
                      </button>
                      <button
                        onClick={handlePxDisconnect}
                        className="px-4 py-2 text-negative text-sm font-medium hover:bg-negative/10 rounded-lg transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>

                    {/* Last Sync Time */}
                    {pxStatus?.lastSyncTime && (
                      <p className="text-xs text-text-muted">
                        Last synced: {new Date(pxStatus.lastSyncTime).toLocaleString()}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* NinjaTrader */}
          <div className="bg-bg-surface border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => toggleBroker('ninjatrader')}
              className="w-full flex items-center justify-between p-5 hover:bg-bg-page/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <img src="/assets/img/ninjatrader.jpeg" alt="NinjaTrader" className="w-10 h-10 rounded-lg object-contain" />
                <div className="text-left">
                  <h3 className="text-text-primary font-semibold text-sm">NinjaTrader</h3>
                  <p className="text-text-tertiary text-xs">Advanced charting &amp; trading platform</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
                  Coming Soon
                </div>
                {expandedBroker === 'ninjatrader' ? <Icons.ChevronUp className="w-4 h-4 text-text-secondary" /> : <Icons.ChevronDown className="w-4 h-4 text-text-secondary" />}
              </div>
            </button>

            {expandedBroker === 'ninjatrader' && (
              <div className="px-5 pb-5 border-t border-border pt-4">
                <div className="bg-bg-page/50 rounded-lg p-3 mb-3">
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Direct API sync is coming soon. In the meantime, you can export your trades as a CSV and import them using the generic CSV format.
                  </p>
                </div>
                <a
                  href="/guides/generic-csv"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent text-sm font-medium rounded-lg hover:bg-accent/20 transition-colors"
                >
                  <Icons.FileText className="w-4 h-4" />
                  CSV Format Reference
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags tab */}
      {activeTab === 'tags' && (
        <div className="space-y-6">
          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === 'error'
                ? 'bg-negative/10 border border-negative/30 text-negative'
                : 'bg-positive/10 border border-positive/30 text-positive'
            }`}>
              {message.text}
            </div>
          )}

          {/* Create tag form */}
          <div className="bg-bg-surface border border-border rounded-xl p-6">
            <h3 className="text-text-primary font-semibold mb-4">Create Tag</h3>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Tag Name</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g. Breakout, Scalp, News Play"
                  className="w-full px-3 py-2.5 bg-bg-input border border-border rounded-lg text-text-primary text-sm placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Color</label>
                <div className="flex gap-1.5">
                  {TAG_COLOR_PRESETS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        newTagColor === color ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewTagColor(color)}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
                onClick={handleCreateTag}
              >
                Add Tag
              </button>
            </div>
          </div>

          {/* Tag list */}
          <div className="bg-bg-surface border border-border rounded-xl p-6">
            <h3 className="text-text-primary font-semibold mb-4">Your Tags</h3>
            {(!tags || tags.length === 0) ? (
              <p className="text-text-tertiary text-sm">No tags yet. Create one above to get started.</p>
            ) : (
              <div className="space-y-2">
                {tags.map(tag => (
                  <div key={tag._id} className="flex items-center justify-between py-3 px-4 bg-bg-input border border-border rounded-lg">
                    {editingTagId === tag._id ? (
                      <div className="flex flex-wrap items-center gap-3 flex-1">
                        <input
                          type="text"
                          value={editTagName}
                          onChange={(e) => setEditTagName(e.target.value)}
                          className="px-3 py-1.5 bg-bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent transition-colors"
                        />
                        <div className="flex gap-1.5">
                          {TAG_COLOR_PRESETS.map(color => (
                            <button
                              key={color}
                              type="button"
                              className={`w-6 h-6 rounded-full border-2 transition-all ${
                                editTagColor === color ? 'border-white scale-110' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color }}
                              onClick={() => setEditTagColor(color)}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-accent text-accent-text text-xs font-semibold rounded-lg hover:brightness-110 transition-all"
                          onClick={() => handleEditTag(tag._id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 text-text-secondary text-xs hover:text-text-primary transition-colors"
                          onClick={() => setEditingTagId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }}></span>
                          <span className="text-text-primary text-sm font-medium">{tag.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-surface transition-colors"
                            onClick={() => { setEditingTagId(tag._id); setEditTagName(tag.name); setEditTagColor(tag.color); }}
                            title="Edit"
                          >
                            <Icons.Edit />
                          </button>
                          <button
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-negative hover:bg-negative/10 transition-colors"
                            onClick={() => handleDeleteTag(tag._id)}
                            title="Delete"
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Account tab */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {/* Subscription section */}
          <div className="bg-bg-surface border border-border rounded-xl p-6 space-y-6">
            <h3 className="text-text-primary font-semibold">Subscription</h3>
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                    subscriptionStatus && subscriptionStatus.isPremium
                      ? 'bg-accent/15 text-accent'
                      : 'bg-text-muted/15 text-text-secondary'
                  }`}>
                    {subscriptionStatus && subscriptionStatus.isPremium
                      ? (subscriptionStatus.plan || 'Pro')
                      : 'Free'}
                  </span>
                  {subscriptionStatus && subscriptionStatus.subscriptionStatus && (
                    <span className={`text-xs ${
                      subscriptionStatus.subscriptionStatus === 'active' ? 'text-positive'
                        : subscriptionStatus.subscriptionStatus === 'canceled' ? 'text-negative'
                          : 'text-warning'
                    }`}>
                      {subscriptionStatus.subscriptionStatus.charAt(0).toUpperCase() + subscriptionStatus.subscriptionStatus.slice(1)}
                    </span>
                  )}
                </div>
                {subscriptionStatus && subscriptionStatus.createdDate && (
                  <p className="text-text-muted text-xs mt-1">
                    Account created: {new Date(subscriptionStatus.createdDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              {subscriptionStatus && subscriptionStatus.isPremium ? (
                <button
                  className="flex items-center gap-2 px-4 py-2.5 bg-bg-input border border-border text-text-primary text-sm font-semibold rounded-lg hover:border-accent transition-all"
                  onClick={() => { window.location.href = '/upgrade'; }}
                >
                  <Icons.Settings className="w-4 h-4" />
                  Manage Subscription
                </button>
              ) : (
                <button
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-text text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
                  onClick={() => { window.location.href = '/upgrade'; }}
                >
                  <Icons.Zap className="w-4 h-4" />
                  Upgrade Now
                </button>
              )}
            </div>
          </div>

          {/* Account settings section */}
          <div className="bg-bg-surface border border-border rounded-xl p-6 space-y-4">
            <h3 className="text-text-primary font-semibold">Account Settings</h3>
            <div className="space-y-3">
              <a href="/changePass" className="flex items-center gap-3 px-4 py-3 bg-bg-input border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors no-underline">
                <Icons.Lock className="w-5 h-5" />
                <span className="text-sm">Change Password</span>
              </a>
              <button onClick={() => { supabase.auth.signOut().then(() => { window.location = '/'; }); }} className="flex items-center gap-3 px-4 py-3 bg-bg-input border border-border rounded-lg text-text-secondary hover:text-negative transition-colors w-full">
                <Icons.LogOut className="w-5 h-5" />
                <span className="text-sm">Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preferences tab */}
      {activeTab === 'preferences' && (
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <h3 className="text-text-primary font-semibold mb-4">Preferences</h3>

          {/* Dark / Light toggle */}
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-text-primary text-sm font-medium">Theme</div>
              <div className="text-text-tertiary text-xs mt-0.5">Choose your preferred appearance</div>
            </div>
            <div className="flex gap-1 bg-bg-input rounded-lg p-1">
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  (theme === 'dark' || theme === 'custom') ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => onThemeChange('dark', { accent: customColors.accent || null })}
              >
                Dark
              </button>
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  theme === 'light' ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => onThemeChange('light', { accent: customColors.accent || null })}
              >
                Light
              </button>
            </div>
          </div>

          {/* Accent color picker — all users */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="text-text-secondary text-sm font-medium">Accent Color</div>
              {customColors.accent && (
                <button
                  className="text-text-tertiary text-xs hover:text-text-secondary transition-colors"
                  onClick={() => {
                    const baseTheme = theme === 'custom' ? 'dark' : theme;
                    onThemeChange(baseTheme, { ...customColors, accent: null });
                  }}
                >
                  Reset to default
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={customColors.accent || (theme === 'light' ? '#10B981' : '#BFFF00')}
                onChange={(e) => {
                  const baseTheme = theme === 'custom' ? 'dark' : theme;
                  onThemeChange(baseTheme, { ...customColors, accent: e.target.value });
                }}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
              />
              <div>
                <div className="text-text-primary text-sm">Primary / Accent</div>
                <div className="text-text-muted text-xs font-mono">
                  {customColors.accent || (theme === 'light' ? '#10B981' : '#BFFF00')}
                </div>
              </div>
            </div>
          </div>

          {/* Full customization — Elite unlocked, blurred for others */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-text-secondary text-sm font-medium mb-3">Full Theme Customization</div>
            {subscriptionStatus && subscriptionStatus.plan === 'elite' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { key: 'bgPage', label: 'Background', defaultVal: '#0B0E14' },
                    { key: 'bgSurface', label: 'Elements', defaultVal: '#111111' },
                    { key: 'textPrimary', label: 'Text', defaultVal: '#FFFFFF' },
                    { key: 'positive', label: 'Bullish (Positive)', defaultVal: '#10B981' },
                    { key: 'negative', label: 'Bearish (Negative)', defaultVal: '#EF4444' },
                  ].map(({ key, label, defaultVal }) => (
                    <div key={key} className="flex items-center gap-3">
                      <input
                        type="color"
                        value={(customColors && customColors[key]) || defaultVal}
                        onChange={(e) => {
                          const updated = { ...customColors, [key]: e.target.value };
                          onThemeChange('custom', updated);
                        }}
                        className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
                      />
                      <div>
                        <div className="text-text-primary text-sm">{label}</div>
                        <div className="text-text-muted text-xs font-mono">{(customColors && customColors[key]) || defaultVal}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className="text-text-tertiary text-xs hover:text-text-secondary transition-colors"
                  onClick={() => {
                    const defaults = { bgPage: '#0B0E14', bgSurface: '#111111', textPrimary: '#FFFFFF', accent: customColors.accent, positive: '#10B981', negative: '#EF4444' };
                    onThemeChange('custom', defaults);
                  }}
                >
                  Reset colors to defaults
                </button>
              </div>
            ) : (
              <div
                className="relative group rounded-lg"
                aria-label="Upgrade to Elite for full theme customization"
              >
                <div className="filter blur-[2px] pointer-events-none select-none">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Background', color: '#0B0E14' },
                      { label: 'Elements', color: '#111111' },
                      { label: 'Text', color: '#FFFFFF' },
                      { label: 'Bullish (Positive)', color: '#10B981' },
                      { label: 'Bearish (Negative)', color: '#EF4444' },
                    ].map(({ label, color }) => (
                      <div key={label} className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg border border-border"
                          style={{ backgroundColor: color }}
                        />
                        <div>
                          <div className="text-text-primary text-sm">{label}</div>
                          <div className="text-text-muted text-xs font-mono">{color}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-bg-surface/60 rounded-lg">
                  <a
                    href="/upgrade"
                    className="text-accent text-sm font-medium hover:underline no-underline"
                  >
                    Upgrade to Elite for full customization &rarr;
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// =====================================================

module.exports = SettingsPage;
