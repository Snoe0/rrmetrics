const React = require('react');
const { useState, useEffect, useCallback } = React;
const { createRoot } = require('react-dom/client');
require('./styles/globals.css');
const { supabase } = require('./supabase');

// ─── API helpers ─────────────────────────────────────────────────────────────

const adminFetch = (token, path, options = {}) => {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
};

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: 'stats', label: 'Stats' },
  { key: 'users', label: 'Users' },
  { key: 'suspicious', label: 'Suspicious IPs' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'email', label: 'Mass Email' },
  { key: 'payouts', label: 'Payouts' },
];

const Nav = ({ view, setView, onLogout }) => (
  <nav className="w-52 min-h-screen bg-bg-surface border-r border-border flex flex-col p-4 gap-1">
    <div className="text-text-primary font-bold text-sm tracking-widest uppercase mb-6 px-3">RR Admin</div>
    {NAV_ITEMS.map((item) => (
      <button
        key={item.key}
        type="button"
        onClick={() => setView(item.key)}
        className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          view === item.key
            ? 'bg-accent text-accent-text'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-input'
        }`}
      >
        {item.label}
      </button>
    ))}
    <button
      type="button"
      onClick={onLogout}
      className="mt-auto px-3 py-2 text-left text-sm text-negative hover:bg-bg-input rounded-lg"
    >
      Logout
    </button>
  </nav>
);

// ─── Stats view ───────────────────────────────────────────────────────────────

const StatsView = ({ token }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminFetch(token, '/api/admin/stats')
      .then((r) => r.json())
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => { setError('Failed to load stats'); setLoading(false); });
  }, [token]);

  if (loading) return <div className="p-8 text-text-secondary">Loading...</div>;
  if (error) return <div className="p-8 text-negative">{error}</div>;

  const cards = [
    { label: 'Total Users', value: stats.totalUsers },
    { label: 'Pro', value: stats.proUsers },
    { label: 'Elite', value: stats.eliteUsers },
    { label: 'Free', value: stats.freeUsers },
    { label: 'Trial', value: stats.trialUsers },
    { label: 'New (7d)', value: stats.newUsersLast7Days },
    { label: 'New (30d)', value: stats.newUsersLast30Days },
  ];

  return (
    <div className="p-8">
      <h2 className="text-lg font-bold text-text-primary mb-6">Customer Stats</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-bg-surface border border-border rounded-xl p-5">
            <div className="text-text-secondary text-xs uppercase tracking-wider mb-1">{c.label}</div>
            <div className="text-text-primary font-mono text-3xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Users view ───────────────────────────────────────────────────────────────

const UsersView = ({ token }) => {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [managingUser, setManagingUser] = useState(null);

  const load = useCallback((p) => {
    setLoading(true);
    adminFetch(token, `/api/admin/users?page=${p}&pageSize=50`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(page); }, [page, load]);

  const planBadge = (plan) => {
    const colors = { pro: 'text-info', elite: 'text-accent', free: 'text-text-muted', trial: 'text-warning' };
    return <span className={`font-mono text-xs ${colors[plan] || 'text-text-secondary'}`}>{plan}</span>;
  };

  return (
    <div className="p-8">
      <h2 className="text-lg font-bold text-text-primary mb-4">Users {data && `(${data.total} total)`}</h2>
      {loading && <div className="text-text-secondary">Loading...</div>}
      {data && (
        <>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Plan</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Joined</th>
                <th className="pb-2 font-medium">IP</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-bg-surface/50">
                  <td className="py-2 text-text-primary">{u.email}</td>
                  <td className="py-2">{planBadge(u.plan)}</td>
                  <td className="py-2 text-text-secondary font-mono text-xs">{u.role || 'user'}</td>
                  <td className="py-2 text-text-secondary font-mono text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 text-text-muted font-mono text-xs">{u.registrationIp || '—'}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => setManagingUser(u)}
                      className="text-xs px-3 py-1.5 border border-border rounded-lg text-text-secondary hover:text-text-primary"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="px-4 py-2 text-sm bg-bg-surface border border-border rounded-lg text-text-secondary disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-sm text-text-muted">Page {page}</span>
            <button
              type="button"
              disabled={data.users.length < 50}
              onClick={() => setPage(page + 1)}
              className="px-4 py-2 text-sm bg-bg-surface border border-border rounded-lg text-text-secondary disabled:opacity-40"
            >
              Next
            </button>
          </div>
          {managingUser && (
            <ManageUserModal
              user={managingUser}
              token={token}
              onClose={() => setManagingUser(null)}
              onRefresh={() => { load(page); setManagingUser(null); }}
            />
          )}
        </>
      )}
    </div>
  );
};

// ─── Suspicious IPs view ──────────────────────────────────────────────────────

const SuspiciousView = ({ token }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch(token, '/api/admin/suspicious')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [token]);

  if (loading) return <div className="p-8 text-text-secondary">Loading...</div>;

  return (
    <div className="p-8">
      <h2 className="text-lg font-bold text-text-primary mb-2">Suspicious Accounts</h2>
      <p className="text-text-secondary text-sm mb-6">Multiple accounts registered from the same IP address.</p>
      {data.groups.length === 0 && <div className="text-text-muted">No suspicious groups found.</div>}
      {data.groups.map((g) => (
        <div key={g.ip} className="mb-6 bg-bg-surface border border-warning/40 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-warning text-sm">{g.ip}</span>
            <span className="text-text-muted text-xs">{g.count} accounts</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Plan</th>
                <th className="pb-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {g.accounts.map((a) => (
                <tr key={a.id} className="border-b border-border/30">
                  <td className="py-2 text-text-primary">{a.email}</td>
                  <td className="py-2 text-text-secondary font-mono text-xs">{a.plan}</td>
                  <td className="py-2 text-text-muted font-mono text-xs">{new Date(a.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

// ─── Announcements view ───────────────────────────────────────────────────────

const AnnouncementsView = ({ token }) => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', body: '', type: 'info', active: false });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    adminFetch(token, '/api/admin/announcements')
      .then((r) => r.json())
      .then((d) => { setAnnouncements(d.announcements); setLoading(false); });
  }, [token]);

  useEffect(load, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await adminFetch(token, '/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (data.announcement) {
      setMsg('Created!');
      setForm({ title: '', body: '', type: 'info', active: false });
      load();
    } else {
      setMsg(data.error || 'Error');
    }
  };

  const toggleActive = async (a) => {
    await adminFetch(token, `/api/admin/announcements/${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !a.active }),
    });
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    await adminFetch(token, `/api/admin/announcements/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-lg font-bold text-text-primary mb-6">Announcements</h2>

      <form onSubmit={handleCreate} className="bg-bg-surface border border-border rounded-xl p-5 mb-8">
        <h3 className="text-text-primary font-semibold mb-4 text-sm">New Announcement</h3>
        {msg && <p className="text-sm text-accent mb-3">{msg}</p>}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary text-sm"
            required
          />
          <textarea
            placeholder="Body (plain text or HTML)"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={3}
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary text-sm resize-y"
            required
          />
          <div className="flex gap-3 items-center">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
            </select>
            <label className="flex items-center gap-2 text-text-secondary text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Publish immediately
            </label>
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 px-6 py-2 bg-accent text-accent-text text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Create'}
        </button>
      </form>

      {loading && <div className="text-text-secondary">Loading...</div>}
      <div className="space-y-3">
        {announcements.map((a) => (
          <div key={a.id} className={`bg-bg-surface border rounded-xl p-4 ${a.active ? 'border-positive' : 'border-border'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-text-primary text-sm">{a.title}</div>
                <div className="text-text-secondary text-xs mt-1 line-clamp-2">{a.body}</div>
                <div className="flex gap-2 mt-2">
                  <span className={`text-xs font-mono ${a.active ? 'text-positive' : 'text-text-muted'}`}>
                    {a.active ? 'ACTIVE' : 'inactive'}
                  </span>
                  <span className="text-xs text-text-muted">· {a.type}</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleActive(a)}
                  className="text-xs px-3 py-1.5 border border-border rounded-lg text-text-secondary hover:text-text-primary"
                >
                  {a.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  className="text-xs px-3 py-1.5 border border-negative/40 rounded-lg text-negative hover:bg-negative/10"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Mass email view ──────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = [
  { name: 'Custom', subject: '', text: '', html: '' },
  {
    name: 'New Feature Announcement',
    subject: 'New on RR Metrics: [Feature Name]',
    text: 'Hey there,\n\nWe just shipped something new: [Feature Name].\n\n[Brief description of the feature and how it helps traders.]\n\nCheck it out: https://rrmetrics.com/trades\n\n— The RR Metrics Team',
    html: '<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Something new just dropped</h1>\n<p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">[Brief description of the feature and how it helps traders.]</p>',
  },
  {
    name: 'General Update',
    subject: 'RR Metrics Update',
    text: 'Hey there,\n\n[Your update here.]\n\n— The RR Metrics Team',
    html: '<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Quick Update</h1>\n<p style="margin:0 0 20px;font-size:15px;color:#d1d5db;line-height:1.6;">[Your update here.]</p>',
  },
];

const EmailView = ({ token }) => {
  const [form, setForm] = useState({ subject: '', text: '', html: '', planFilter: 'all' });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState('Custom');

  const handleTemplateChange = (e) => {
    const tpl = EMAIL_TEMPLATES.find((t) => t.name === e.target.value);
    if (tpl) {
      setSelectedTemplate(tpl.name);
      if (tpl.name !== 'Custom') {
        setForm({ ...form, subject: tpl.subject, text: tpl.text, html: tpl.html });
      }
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Send email to ALL users matching filter "${form.planFilter}"? This cannot be undone.`)) return;
    setSending(true);
    setResult(null);
    const res = await adminFetch(token, '/api/admin/email/send', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSending(false);
    setResult(data);
  };

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-lg font-bold text-text-primary mb-2">Mass Email</h2>
      <p className="text-text-secondary text-sm mb-6">Sends via Resend. Unsubscribed users are automatically excluded.</p>

      {result && (
        <div className={`mb-6 p-4 rounded-xl border ${result.error ? 'border-negative/40 bg-negative/10' : 'border-positive/40 bg-positive/10'}`}>
          {result.error
            ? <p className="text-negative text-sm">{result.error}</p>
            : <p className="text-positive text-sm">Sent {result.sent}/{result.total} emails. {result.errors?.length > 0 && `${result.errors.length} failed.`}</p>
          }
        </div>
      )}

      <form onSubmit={handleSend} className="bg-bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-text-secondary mb-2">Send to</label>
            <select
              value={form.planFilter}
              onChange={(e) => setForm({ ...form, planFilter: e.target.value })}
              className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm"
            >
              <option value="all">All users</option>
              <option value="pro">Pro only</option>
              <option value="elite">Elite only</option>
              <option value="free">Free only</option>
              <option value="trial">Trial only</option>
              <option value="expired_trial">Expired trial</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm text-text-secondary mb-2">Template</label>
            <select
              value={selectedTemplate}
              onChange={handleTemplateChange}
              className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm"
            >
              {EMAIL_TEMPLATES.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-2">Subject</label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-2">Plain text body</label>
          <textarea
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            rows={4}
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary text-sm resize-y font-mono"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-2">HTML body</label>
          <textarea
            value={form.html}
            onChange={(e) => setForm({ ...form, html: e.target.value })}
            rows={6}
            className="w-full px-4 py-3 bg-bg-input border border-border rounded-lg text-text-primary text-sm resize-y font-mono"
            required
          />
        </div>
        <p className="text-xs text-text-secondary">Unsubscribe link is automatically appended to every email.</p>
        <button
          type="submit"
          disabled={sending}
          className="px-6 py-3 bg-negative text-white font-semibold rounded-lg text-sm disabled:opacity-50 hover:brightness-110"
        >
          {sending ? 'Sending...' : 'Send to All Matching Users'}
        </button>
      </form>
    </div>
  );
};

// ─── Payouts view ─────────────────────────────────────────────────────────────

const PAYOUT_STATUS_STYLES = {
  pending_transfer: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  completed: 'bg-positive/20 text-positive border-positive/40',
  failed: 'bg-negative/20 text-negative border-negative/40',
};

const PAYOUT_STATUS_LABELS = {
  pending_transfer: 'Pending Transfer',
  completed: 'Completed',
  failed: 'Failed',
};

const PayoutsView = ({ token }) => {
  const [payouts, setPayouts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback((status) => {
    setLoading(true);
    const qs = status === 'all' ? '' : `?status=${status}`;
    adminFetch(token, `/api/admin/payouts${qs}`)
      .then((r) => r.json())
      .then((d) => { setPayouts(d.payouts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(statusFilter); }, [statusFilter, load]);

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'pending_transfer', label: 'Pending Transfer' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
  ];

  return (
    <div className="p-8">
      <h2 className="text-lg font-bold text-text-primary mb-4">Payout History</h2>

      {/* Filter bar */}
      <div className="flex gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-accent text-accent-text'
                : 'bg-bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-text-secondary">Loading...</div>}

      {!loading && payouts.length === 0 && (
        <div className="text-text-muted text-sm">No payout requests found.</div>
      )}

      {!loading && payouts.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="pb-3 font-medium pr-4">Date</th>
              <th className="pb-3 font-medium pr-4">User</th>
              <th className="pb-3 font-medium pr-4">Amount</th>
              <th className="pb-3 font-medium pr-4">Status</th>
              <th className="pb-3 font-medium">Transfer ID</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-bg-surface/50">
                <td className="py-3 pr-4 text-text-secondary font-mono text-xs">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="py-3 pr-4 text-text-primary text-xs">{p.email}</td>
                <td className="py-3 pr-4 text-text-primary font-mono font-semibold">
                  ${(p.amount_cents / 100).toFixed(2)}
                </td>
                <td className="py-3 pr-4">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PAYOUT_STATUS_STYLES[p.status] || 'border-border text-text-secondary'}`}>
                    {PAYOUT_STATUS_LABELS[p.status] || p.status}
                  </span>
                </td>
                <td className="py-3 text-text-muted font-mono text-xs">
                  {p.stripe_transfer_id || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ─── Manage user modal ────────────────────────────────────────────────────────

const PLAN_BORDER = {
  free: 'border-border text-text-secondary',
  pro: 'border-info text-info',
  elite: 'border-accent text-accent',
};

const ManageUserModal = ({ user, token, onClose, onRefresh }) => {
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState(null);
  const [months, setMonths] = useState(1);

  const setPlan = async (plan) => {
    if (plan === 'free') {
      if (!window.confirm(`Downgrade ${user.email} to Free? This will cancel their Stripe subscription.`)) return;
    }
    setWorking(true);
    setMsg(null);
    const res = await adminFetch(token, `/api/admin/users/${user.id}/subscription`, {
      method: 'PATCH',
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    setWorking(false);
    if (data.ok) {
      setMsg(`Plan set to ${plan}.`);
      onRefresh();
    } else {
      setMsg(data.error || 'Error setting plan.');
    }
  };

  const addMonths = async () => {
    setWorking(true);
    setMsg(null);
    const res = await adminFetch(token, `/api/admin/users/${user.id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ months }),
    });
    const data = await res.json();
    setWorking(false);
    if (data.ok) {
      const date = new Date(data.trialEnd * 1000).toLocaleDateString();
      setMsg(`Added ${months} month(s). Next billing: ${date}`);
    } else {
      setMsg(data.error || 'Error extending subscription.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-text-primary font-semibold text-sm">{user.email}</div>
            <div className="text-text-muted text-xs mt-1">
              Current plan: <span className="font-mono">{user.plan}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none">×</button>
        </div>

        {msg && <p className="text-sm text-accent mb-4">{msg}</p>}

        <div className="mb-5">
          <div className="text-text-secondary text-xs uppercase tracking-wider mb-3">Set Role</div>
          <div className="flex gap-2">
            {['user', 'developer'].map((r) => (
              <button
                key={r}
                type="button"
                disabled={working || (user.role || 'user') === r}
                onClick={async () => {
                  setWorking(true);
                  setMsg(null);
                  const res = await adminFetch(token, `/api/admin/users/${user.id}/role`, {
                    method: 'PATCH',
                    body: JSON.stringify({ role: r }),
                  });
                  const data = await res.json();
                  setWorking(false);
                  if (data.ok) { setMsg(`Role set to ${r}.`); onRefresh(); }
                  else { setMsg(data.error || 'Error setting role.'); }
                }}
                className={`flex-1 py-2 rounded-lg border text-sm font-semibold capitalize transition-all disabled:opacity-50 ${
                  (user.role || 'user') === r
                    ? 'bg-accent/20 border-accent text-accent cursor-default'
                    : 'border-border text-text-secondary hover:brightness-110'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <div className="text-text-secondary text-xs uppercase tracking-wider mb-3">Set Plan</div>
          <div className="flex gap-2">
            {['free', 'pro', 'elite'].map((p) => (
              <button
                key={p}
                type="button"
                disabled={working || user.plan === p}
                onClick={() => setPlan(p)}
                className={`flex-1 py-2 rounded-lg border text-sm font-semibold capitalize transition-all disabled:opacity-50 ${
                  user.plan === p
                    ? 'bg-accent/20 border-accent text-accent cursor-default'
                    : `${PLAN_BORDER[p] || 'border-border text-text-secondary'} hover:brightness-110`
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-text-secondary text-xs uppercase tracking-wider mb-3">Add Free Months</div>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min="1"
              max="12"
              value={months}
              onChange={(e) => setMonths(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)))}
              className="w-20 px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary text-sm text-center"
            />
            <button
              type="button"
              disabled={working || !user.stripeSubscriptionId}
              onClick={addMonths}
              title={!user.stripeSubscriptionId ? 'No Stripe subscription' : undefined}
              className="flex-1 py-2 bg-positive/20 border border-positive/40 text-positive rounded-lg text-sm font-semibold disabled:opacity-40 hover:brightness-110"
            >
              Add Month{months !== 1 ? 's' : ''}
            </button>
          </div>
          {!user.stripeSubscriptionId && (
            <p className="text-text-muted text-xs mt-2">No Stripe subscription — cannot extend billing period.</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Dashboard shell ──────────────────────────────────────────────────────────

const Dashboard = ({ token, onLogout }) => {
  const [view, setView] = useState('stats');

  const renderView = () => {
    switch (view) {
      case 'stats': return <StatsView token={token} />;
      case 'users': return <UsersView token={token} />;
      case 'suspicious': return <SuspiciousView token={token} />;
      case 'announcements': return <AnnouncementsView token={token} />;
      case 'email': return <EmailView token={token} />;
      case 'payouts': return <PayoutsView token={token} />;
      default: return null;
    }
  };

  return (
    <div className="flex min-h-screen">
      <Nav view={view} setView={setView} onLogout={onLogout} />
      <main className="flex-1 overflow-auto bg-bg-page">
        {renderView()}
      </main>
    </div>
  );
};

// ─── App root ─────────────────────────────────────────────────────────────────

const App = () => {
  const [token, setToken] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'unauthorized' | 'ready'

  useEffect(() => {
    let cancelled = false;
    let authSub;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        window.location.href = '/login';
        return;
      }
      const res = await adminFetch(session.access_token, '/api/admin/stats');
      if (cancelled) return;
      if (res.status === 401) {
        setStatus('unauthorized');
        return;
      }
      setToken(session.access_token);
      setStatus('ready');
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        window.location.href = '/login';
        return;
      }
      // Only update token if already verified as admin — never promote from unauthorized/loading
      setToken((prev) => (prev !== null ? session.access_token : prev));
    });
    authSub = data.subscription;

    return () => {
      cancelled = true;
      authSub?.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-page">
        <div className="text-text-secondary text-sm">Loading...</div>
      </div>
    );
  }
  if (status === 'unauthorized') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-page">
        <div className="text-text-primary text-sm">Unauthorized. This account does not have admin access.</div>
      </div>
    );
  }
  return <Dashboard token={token} onLogout={handleLogout} />;
};

const init = () => {
  const root = createRoot(document.getElementById('content'));
  root.render(<App />);
};

window.onload = init;
