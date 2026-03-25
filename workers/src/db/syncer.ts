import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncerConfigRow, SyncerOrderLogRow } from '../bindings';

export async function getConfig(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<SyncerConfigRow | null> {
  const { data, error } = await supabase
    .from('trade_syncer_configs')
    .select('*')
    .eq('owner', ownerId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch syncer config: ${error.message}`);
  }
  return (data as SyncerConfigRow) || null;
}

export async function upsertConfig(
  supabase: SupabaseClient,
  ownerId: string,
  leaderConnectionId: string | null,
  leaderAccountId: number | null,
  followerAccounts: Array<{ connectionId: string; accountId: number; multiplier: number }>,
): Promise<SyncerConfigRow> {
  const { data, error } = await supabase
    .from('trade_syncer_configs')
    .upsert(
      {
        owner: ownerId,
        leader_connection_id: leaderConnectionId,
        leader_account_id: leaderAccountId,
        follower_accounts: followerAccounts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner' },
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert syncer config: ${error.message}`);
  return data as SyncerConfigRow;
}

export async function setActive(
  supabase: SupabaseClient,
  configId: string,
  active: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('trade_syncer_configs')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', configId);

  if (error) throw new Error(`Failed to update syncer active state: ${error.message}`);
}

export async function logOrder(
  supabase: SupabaseClient,
  entry: {
    config_id: string;
    leader_order_id: number;
    leader_action?: string;
    leader_symbol?: string;
    leader_qty?: number;
    follower_account_id: number;
    follower_order_id?: number;
    follower_qty?: number;
    order_type?: string;
    status: string;
    error_message?: string;
  },
): Promise<SyncerOrderLogRow> {
  const { data, error } = await supabase
    .from('syncer_order_log')
    .upsert(entry, {
      onConflict: 'config_id,leader_order_id,follower_account_id',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to log syncer order: ${error.message}`);
  return data as SyncerOrderLogRow;
}

export async function getRecentLogs(
  supabase: SupabaseClient,
  configId: string,
  limit: number = 50,
): Promise<SyncerOrderLogRow[]> {
  const { data, error } = await supabase
    .from('syncer_order_log')
    .select('*')
    .eq('config_id', configId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch syncer logs: ${error.message}`);
  return (data || []) as SyncerOrderLogRow[];
}

export async function findFollowerOrders(
  supabase: SupabaseClient,
  configId: string,
  leaderOrderId: number,
): Promise<SyncerOrderLogRow[]> {
  const { data, error } = await supabase
    .from('syncer_order_log')
    .select('*')
    .eq('config_id', configId)
    .eq('leader_order_id', leaderOrderId)
    .eq('status', 'placed');

  if (error) throw new Error(`Failed to find follower orders: ${error.message}`);
  return (data || []) as SyncerOrderLogRow[];
}

export async function findExistingMirror(
  supabase: SupabaseClient,
  configId: string,
  leaderOrderId: number,
  followerAccountId: number,
): Promise<SyncerOrderLogRow | null> {
  const { data, error } = await supabase
    .from('syncer_order_log')
    .select('*')
    .eq('config_id', configId)
    .eq('leader_order_id', leaderOrderId)
    .eq('follower_account_id', followerAccountId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to check existing mirror: ${error.message}`);
  }
  return (data as SyncerOrderLogRow) || null;
}
