import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectXConnectionRow } from '../bindings';

export async function findByBrokerConnectionId(
  supabase: SupabaseClient,
  brokerConnectionId: string,
): Promise<ProjectXConnectionRow | null> {
  const { data, error } = await supabase
    .from('projectx_connections')
    .select('*')
    .eq('broker_connection_id', brokerConnectionId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch projectx connection: ${error.message}`);
  }
  return (data as ProjectXConnectionRow) || null;
}

export async function create(
  supabase: SupabaseClient,
  brokerConnectionId: string,
  fields: {
    username: string;
    api_key: string;
    access_token: string;
    token_expires_at: string;
  },
): Promise<ProjectXConnectionRow> {
  const { data, error } = await supabase
    .from('projectx_connections')
    .insert({
      broker_connection_id: brokerConnectionId,
      ...fields,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create projectx connection: ${error.message}`);
  return data as ProjectXConnectionRow;
}

export async function updateByBrokerConnectionId(
  supabase: SupabaseClient,
  brokerConnectionId: string,
  updates: Partial<Pick<ProjectXConnectionRow, 'username' | 'api_key' | 'access_token' | 'token_expires_at' | 'selected_accounts' | 'copytrade_config'>>,
): Promise<void> {
  const { error } = await supabase
    .from('projectx_connections')
    .update(updates)
    .eq('broker_connection_id', brokerConnectionId);

  if (error) throw new Error(`Failed to update projectx connection: ${error.message}`);
}

export async function findExpiringSoon(
  supabase: SupabaseClient,
  thresholdIso: string,
): Promise<ProjectXConnectionRow[]> {
  const { data, error } = await supabase
    .from('projectx_connections')
    .select('*')
    .not('api_key', 'is', null)
    .lte('token_expires_at', thresholdIso);

  if (error) throw new Error(`Failed to query expiring projectx tokens: ${error.message}`);
  return (data || []) as ProjectXConnectionRow[];
}

export async function findByProjectXTradeIds(
  supabase: SupabaseClient,
  userId: string,
  tradeIds: string[],
): Promise<string[]> {
  if (tradeIds.length === 0) return [];

  const { data } = await supabase
    .from('trades')
    .select('projectx_trade_id')
    .eq('user_id', userId)
    .in('projectx_trade_id', tradeIds);

  return (data || []).map((row: any) => row.projectx_trade_id).filter(Boolean);
}
