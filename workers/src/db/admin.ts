import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Customer stats ───────────────────────────────────────────────────────────

export interface CustomerStats {
  totalUsers: number;
  proUsers: number;
  eliteUsers: number;
  freeUsers: number;
  newUsersLast7Days: number;
  newUsersLast30Days: number;
}

export async function getCustomerStats(supabase: SupabaseClient): Promise<CustomerStats> {
  const now = new Date();
  const minus7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const minus30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('subscription_plan, created_at');

  if (error) throw error;

  const rows = profiles ?? [];

  return {
    totalUsers: rows.length,
    proUsers: rows.filter((r) => r.subscription_plan === 'pro').length,
    eliteUsers: rows.filter((r) => r.subscription_plan === 'elite').length,
    freeUsers: rows.filter((r) => !r.subscription_plan || r.subscription_plan === 'free').length,
    newUsersLast7Days: rows.filter((r) => r.created_at >= minus7).length,
    newUsersLast30Days: rows.filter((r) => r.created_at >= minus30).length,
  };
}

// ─── Suspicious accounts (multiple accounts same registration IP) ─────────────

export interface SuspiciousGroup {
  ip: string;
  count: number;
  accounts: Array<{ id: string; email: string; createdAt: string; plan: string }>;
}

export async function getSuspiciousAccounts(
  supabase: SupabaseClient,
  minCount = 2,
): Promise<SuspiciousGroup[]> {
  // Fetch all profiles that have a registration_ip
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, created_at, subscription_plan, registration_ip')
    .not('registration_ip', 'is', null);

  if (error) throw error;

  const rows = data ?? [];

  // Group by IP
  const byIp: Record<string, typeof rows> = {};
  for (const row of rows) {
    const ip = row.registration_ip as string;
    if (!byIp[ip]) byIp[ip] = [];
    byIp[ip].push(row);
  }

  return Object.entries(byIp)
    .filter(([, accounts]) => accounts.length >= minCount)
    .map(([ip, accounts]) => ({
      ip,
      count: accounts.length,
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        createdAt: a.created_at,
        plan: a.subscription_plan || 'free',
      })),
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── All users list (paginated) ───────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  plan: string;
  role: string;
  createdAt: string;
  registrationIp: string | null;
  stripeSubscriptionId: string | null;
}

export async function listUsers(
  supabase: SupabaseClient,
  page: number,
  pageSize: number,
): Promise<{ users: UserRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('profiles')
    .select('id, email, subscription_plan, role, created_at, registration_ip, stripe_subscription_id', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    users: (data ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      plan: r.subscription_plan || 'trial',
      role: r.role || 'user',
      createdAt: r.created_at,
      registrationIp: r.registration_ip,
      stripeSubscriptionId: r.stripe_subscription_id,
    })),
    total: count ?? 0,
  };
}

// ─── All user emails (for mass email) ────────────────────────────────────────

export async function getAllEmails(
  supabase: SupabaseClient,
  planFilter?: string,
  trialDays?: number,
): Promise<Array<{ email: string; id: string }>> {
  let query = supabase.from('profiles').select('email, id, created_at, subscription_plan');

  // Always exclude unsubscribed users
  query = query.eq('email_unsubscribed', false);

  if (planFilter === 'expired_trial') {
    // Free users whose trial has expired
    query = query.eq('subscription_plan', 'free');
  } else if (planFilter && planFilter !== 'all') {
    query = query.eq('subscription_plan', planFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = data ?? [];

  // For expired_trial, filter by trial expiry date
  if (planFilter === 'expired_trial' && trialDays !== undefined) {
    const now = Date.now();
    rows = rows.filter((r) => {
      const expiry = new Date(r.created_at).getTime() + trialDays * 24 * 60 * 60 * 1000;
      return now > expiry;
    });
  }

  return rows.map((r) => ({ email: r.email, id: r.id }));
}

// ─── Announcements ────────────────────────────────────────────────────────────

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  type: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getActiveAnnouncement(
  supabase: SupabaseClient,
): Promise<AnnouncementRow | null> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data as AnnouncementRow | null;
}

export async function listAnnouncements(
  supabase: SupabaseClient,
): Promise<AnnouncementRow[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AnnouncementRow[];
}

export async function createAnnouncement(
  supabase: SupabaseClient,
  title: string,
  body: string,
  type: string,
  active: boolean,
): Promise<AnnouncementRow> {
  const { data, error } = await supabase
    .from('announcements')
    .insert({ title, body, type, active })
    .select()
    .single();
  if (error) throw error;
  return data as AnnouncementRow;
}

export async function updateAnnouncement(
  supabase: SupabaseClient,
  id: string,
  fields: Partial<Pick<AnnouncementRow, 'title' | 'body' | 'type' | 'active'>>,
): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAnnouncement(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── Storage costs ───────────────────────────────────────────────────────────

export interface UserStorageCost {
  userId: string;
  storageMB: number;
  dbMB: number;
  estimatedCostCents: number;
}

const STORAGE_COST_PER_GB = 0.021; // $/GB/month
const DB_COST_PER_GB = 0.125;      // $/GB/month

export async function getUserStorageCosts(
  supabase: SupabaseClient,
): Promise<Record<string, UserStorageCost>> {
  const { data, error } = await supabase.rpc('get_user_storage_costs');
  if (error) throw error;

  const result: Record<string, UserStorageCost> = {};
  for (const row of data ?? []) {
    const storageMB = (row.storage_bytes || 0) / (1024 * 1024);
    const dbMB = (row.db_bytes || 0) / (1024 * 1024);
    const costDollars =
      (storageMB / 1024) * STORAGE_COST_PER_GB +
      (dbMB / 1024) * DB_COST_PER_GB;
    result[row.user_id] = {
      userId: row.user_id,
      storageMB: Math.round(storageMB * 100) / 100,
      dbMB: Math.round(dbMB * 100) / 100,
      estimatedCostCents: Math.round(costDollars * 100),
    };
  }
  return result;
}
