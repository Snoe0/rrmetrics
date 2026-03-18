import type { SupabaseClient } from '@supabase/supabase-js';
import type { TradovateConnectionRow } from '../bindings';

export async function findByBrokerConnectionId(
  supabase: SupabaseClient,
  brokerConnectionId: string,
): Promise<TradovateConnectionRow | null> {
  const { data, error } = await supabase
    .from('tradovate_connections')
    .select('*')
    .eq('broker_connection_id', brokerConnectionId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch tradovate connection: ${error.message}`);
  }
  return (data as TradovateConnectionRow) || null;
}

export async function create(
  supabase: SupabaseClient,
  brokerConnectionId: string,
  oauthNonce: string,
): Promise<TradovateConnectionRow> {
  const { data, error } = await supabase
    .from('tradovate_connections')
    .insert({
      broker_connection_id: brokerConnectionId,
      oauth_nonce: oauthNonce,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create tradovate connection: ${error.message}`);
  return data as TradovateConnectionRow;
}

export async function updateByBrokerConnectionId(
  supabase: SupabaseClient,
  brokerConnectionId: string,
  updates: Partial<Pick<TradovateConnectionRow, 'access_token' | 'token_expires_at' | 'oauth_nonce'>>,
): Promise<void> {
  const { error } = await supabase
    .from('tradovate_connections')
    .update(updates)
    .eq('broker_connection_id', brokerConnectionId);

  if (error) throw new Error(`Failed to update tradovate connection: ${error.message}`);
}

export async function findExpiringSoon(
  supabase: SupabaseClient,
  thresholdIso: string,
): Promise<Array<TradovateConnectionRow & { environment: string }>> {
  const { data, error } = await supabase
    .from('tradovate_connections')
    .select('*, broker_connections!inner(environment)')
    .not('access_token', 'is', null)
    .lte('token_expires_at', thresholdIso);

  if (error) throw new Error(`Failed to query expiring tradovate tokens: ${error.message}`);

  return (data || []).map((row: any) => ({
    ...row,
    environment: row.broker_connections?.environment || 'demo',
    broker_connections: undefined,
  })) as Array<TradovateConnectionRow & { environment: string }>;
}
