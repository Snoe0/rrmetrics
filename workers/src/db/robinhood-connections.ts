import type { SupabaseClient } from '@supabase/supabase-js';
import type { RobinhoodConnectionRow } from '../bindings';

export async function findByBrokerConnectionId(
  supabase: SupabaseClient,
  brokerConnectionId: string,
): Promise<RobinhoodConnectionRow | null> {
  const { data, error } = await supabase
    .from('robinhood_connections')
    .select('*')
    .eq('broker_connection_id', brokerConnectionId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch robinhood connection: ${error.message}`);
  }
  return (data as RobinhoodConnectionRow) || null;
}

export async function create(
  supabase: SupabaseClient,
  brokerConnectionId: string,
  data: {
    access_token: string;
    refresh_token?: string;
    token_expires_at: string;
    account_id?: string;
    device_token?: string;
  },
): Promise<RobinhoodConnectionRow> {
  const { data: row, error } = await supabase
    .from('robinhood_connections')
    .insert({
      broker_connection_id: brokerConnectionId,
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      token_expires_at: data.token_expires_at,
      account_id: data.account_id || null,
      device_token: data.device_token || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create robinhood connection: ${error.message}`);
  return row as RobinhoodConnectionRow;
}

export async function updateByBrokerConnectionId(
  supabase: SupabaseClient,
  brokerConnectionId: string,
  updates: Partial<Pick<RobinhoodConnectionRow, 'access_token' | 'refresh_token' | 'token_expires_at' | 'account_id' | 'device_token'>>,
): Promise<void> {
  const { error } = await supabase
    .from('robinhood_connections')
    .update(updates)
    .eq('broker_connection_id', brokerConnectionId);

  if (error) throw new Error(`Failed to update robinhood connection: ${error.message}`);
}

export async function findExpiringSoon(
  supabase: SupabaseClient,
  thresholdIso: string,
): Promise<Array<RobinhoodConnectionRow & { environment: string }>> {
  const { data, error } = await supabase
    .from('robinhood_connections')
    .select('*, broker_connections!inner(environment)')
    .not('access_token', 'is', null)
    .lte('token_expires_at', thresholdIso);

  if (error) throw new Error(`Failed to query expiring robinhood tokens: ${error.message}`);

  return (data || []).map((row: any) => ({
    ...row,
    environment: row.broker_connections?.environment || 'live',
    broker_connections: undefined,
  })) as Array<RobinhoodConnectionRow & { environment: string }>;
}
