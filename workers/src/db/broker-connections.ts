import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrokerConnectionRow } from '../bindings';

export async function findByOwner(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<BrokerConnectionRow[]> {
  const { data, error } = await supabase
    .from('broker_connections')
    .select('*')
    .eq('owner', ownerId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch broker connections: ${error.message}`);
  return (data || []) as BrokerConnectionRow[];
}

export async function findByOwnerAndBroker(
  supabase: SupabaseClient,
  ownerId: string,
  broker: string,
): Promise<BrokerConnectionRow[]> {
  const { data, error } = await supabase
    .from('broker_connections')
    .select('*')
    .eq('owner', ownerId)
    .eq('broker', broker)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch broker connections: ${error.message}`);
  return (data || []) as BrokerConnectionRow[];
}

export async function findById(
  supabase: SupabaseClient,
  id: string,
): Promise<BrokerConnectionRow | null> {
  const { data, error } = await supabase
    .from('broker_connections')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch broker connection: ${error.message}`);
  }
  return (data as BrokerConnectionRow) || null;
}

export async function countByOwner(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('broker_connections')
    .select('*', { count: 'exact', head: true })
    .eq('owner', ownerId);

  if (error) throw new Error(`Failed to count broker connections: ${error.message}`);
  return count || 0;
}

export async function createWithLimitCheck(
  supabase: SupabaseClient,
  owner: string,
  broker: string,
  environment: string,
  label: string | null,
  limit: number,
): Promise<string> {
  const rpcLimit = limit === Infinity ? 0 : limit;

  const { data, error } = await supabase.rpc('create_broker_connection', {
    p_owner: owner,
    p_broker: broker,
    p_environment: environment,
    p_label: label,
    p_limit: rpcLimit,
  });

  if (error) {
    if (error.message.includes('CONNECTION_LIMIT_REACHED')) {
      throw new Error('CONNECTION_LIMIT_REACHED');
    }
    throw new Error(`Failed to create broker connection: ${error.message}`);
  }

  // RPC returns the UUID directly
  return data as string;
}

export async function updateById(
  supabase: SupabaseClient,
  id: string,
  data: Partial<Pick<BrokerConnectionRow, 'label' | 'last_sync_time' | 'is_eval'>>,
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('broker_connections')
    .update(updateData)
    .eq('id', id);

  if (error) throw new Error(`Failed to update broker connection: ${error.message}`);
}

export async function deleteById(
  supabase: SupabaseClient,
  id: string,
  ownerId: string,
): Promise<void> {
  const { error } = await supabase
    .from('broker_connections')
    .delete()
    .eq('id', id)
    .eq('owner', ownerId);

  if (error) throw new Error(`Failed to delete broker connection: ${error.message}`);
}

export async function cleanupPending(
  supabase: SupabaseClient,
  thresholdIso: string,
): Promise<number> {
  // Find broker_connections where the child tradovate_connections has null access_token
  // (pending OAuth that was never completed)
  const { data: pendingConnections, error: fetchError } = await supabase
    .from('tradovate_connections')
    .select('broker_connection_id')
    .is('access_token', null);

  if (fetchError) throw new Error(`Failed to query pending connections: ${fetchError.message}`);
  if (!pendingConnections || pendingConnections.length === 0) return 0;

  const brokerConnectionIds = pendingConnections.map((r: any) => r.broker_connection_id);

  const { data, error } = await supabase
    .from('broker_connections')
    .delete()
    .in('id', brokerConnectionIds)
    .lt('created_at', thresholdIso)
    .select('id');

  if (error) throw new Error(`Failed to cleanup pending connections: ${error.message}`);
  return data?.length || 0;
}
