import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebullConnectionRow } from '../bindings';

export async function findByBrokerConnectionId(
  supabase: SupabaseClient,
  brokerConnectionId: string,
): Promise<WebullConnectionRow | null> {
  const { data, error } = await supabase
    .from('webull_connections')
    .select('*')
    .eq('broker_connection_id', brokerConnectionId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch webull connection: ${error.message}`);
  }
  return (data as WebullConnectionRow) || null;
}

export async function create(
  supabase: SupabaseClient,
  brokerConnectionId: string,
  oauthNonce: string,
): Promise<WebullConnectionRow> {
  const { data, error } = await supabase
    .from('webull_connections')
    .insert({
      broker_connection_id: brokerConnectionId,
      oauth_nonce: oauthNonce,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create webull connection: ${error.message}`);
  return data as WebullConnectionRow;
}

export async function updateByBrokerConnectionId(
  supabase: SupabaseClient,
  brokerConnectionId: string,
  updates: Partial<Pick<WebullConnectionRow, 'access_token' | 'refresh_token' | 'token_expires_at' | 'oauth_nonce' | 'account_id'>>,
): Promise<void> {
  const { error } = await supabase
    .from('webull_connections')
    .update(updates)
    .eq('broker_connection_id', brokerConnectionId);

  if (error) throw new Error(`Failed to update webull connection: ${error.message}`);
}

export async function findExpiringSoon(
  supabase: SupabaseClient,
  thresholdIso: string,
): Promise<Array<WebullConnectionRow & { environment: string }>> {
  const { data, error } = await supabase
    .from('webull_connections')
    .select('*, broker_connections!inner(environment)')
    .not('access_token', 'is', null)
    .lte('token_expires_at', thresholdIso);

  if (error) throw new Error(`Failed to query expiring webull tokens: ${error.message}`);

  return (data || []).map((row: any) => ({
    ...row,
    environment: row.broker_connections?.environment || 'live',
    broker_connections: undefined,
  })) as Array<WebullConnectionRow & { environment: string }>;
}
