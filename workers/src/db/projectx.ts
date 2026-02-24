import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Find which ProjectX trade IDs already exist for a user (for deduplication).
 */
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
