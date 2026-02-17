import type { SupabaseClient } from '@supabase/supabase-js';

interface TradeAPI {
  _id: string;
  ticker: string;
  enterTime: string;
  exitTime: string;
  enterPrice: number;
  exitPrice: number;
  quantity: number;
  manualPL: number | null;
  imageAttachments: string[];
  screenshot: string | null;
  comments: string;
  tradovateOrderId: string | null;
  tradovateSource: string;
  createdDate: string;
  tags: string[];
}

function rowToAPI(row: any, tagIds: string[] = []): TradeAPI {
  return {
    _id: row.id,
    ticker: row.ticker,
    enterTime: row.enter_time,
    exitTime: row.exit_time,
    enterPrice: row.enter_price,
    exitPrice: row.exit_price,
    quantity: row.quantity,
    manualPL: row.manual_pl,
    imageAttachments: Array.isArray(row.image_attachments) ? row.image_attachments : [],
    screenshot: row.screenshot,
    comments: row.comments || '',
    tradovateOrderId: row.tradovate_order_id,
    tradovateSource: row.tradovate_source,
    createdDate: row.created_date,
    tags: tagIds,
  };
}

export async function getTrades(supabase: SupabaseClient, userId: string): Promise<TradeAPI[]> {
  const { data: trades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('created_date', { ascending: false });

  if (error || !trades || trades.length === 0) return [];

  // Get all trade_tags for these trades
  const tradeIds = trades.map((t: any) => t.id);
  const { data: tradeTags } = await supabase
    .from('trade_tags')
    .select('trade_id, tag_id')
    .in('trade_id', tradeIds);

  const tagMap: Record<string, string[]> = {};
  if (tradeTags) {
    for (const tt of tradeTags) {
      if (!tagMap[tt.trade_id]) tagMap[tt.trade_id] = [];
      tagMap[tt.trade_id].push(tt.tag_id);
    }
  }

  return trades.map((row: any) => rowToAPI(row, tagMap[row.id] || []));
}

export async function createTrade(
  supabase: SupabaseClient,
  userId: string,
  data: {
    ticker: string;
    enterTime: string;
    exitTime: string;
    enterPrice: number;
    exitPrice: number;
    quantity: number;
    manualPL?: number | null;
    imageAttachments?: string[];
    screenshot?: string | null;
    comments?: string;
    tags?: string[];
  },
): Promise<TradeAPI> {
  const { data: trade, error } = await supabase
    .from('trades')
    .insert({
      user_id: userId,
      ticker: data.ticker,
      enter_time: data.enterTime,
      exit_time: data.exitTime,
      enter_price: data.enterPrice,
      exit_price: data.exitPrice,
      quantity: data.quantity,
      manual_pl: data.manualPL || null,
      image_attachments: data.imageAttachments || [],
      screenshot: data.screenshot || null,
      comments: data.comments || '',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Insert trade_tags
  const tags = data.tags || [];
  if (tags.length > 0) {
    await supabase.from('trade_tags').insert(
      tags.map((tagId: string) => ({ trade_id: trade.id, tag_id: tagId })),
    );
  }

  return rowToAPI(trade, tags);
}

export async function updateTrade(
  supabase: SupabaseClient,
  userId: string,
  data: {
    _id: string;
    ticker: string;
    enterTime: string;
    exitTime: string;
    enterPrice: number;
    exitPrice: number;
    quantity: number;
    manualPL?: number | null;
    screenshot?: string | null;
    comments?: string;
    tags?: string[];
  },
): Promise<TradeAPI> {
  const { data: trade, error } = await supabase
    .from('trades')
    .update({
      ticker: data.ticker,
      enter_time: data.enterTime,
      exit_time: data.exitTime,
      enter_price: data.enterPrice,
      exit_price: data.exitPrice,
      quantity: data.quantity,
      manual_pl: data.manualPL || null,
      screenshot: data.screenshot || null,
      comments: data.comments || '',
    })
    .eq('id', data._id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Replace trade_tags
  await supabase.from('trade_tags').delete().eq('trade_id', data._id);
  const tags = data.tags || [];
  if (tags.length > 0) {
    await supabase.from('trade_tags').insert(
      tags.map((tagId: string) => ({ trade_id: data._id, tag_id: tagId })),
    );
  }

  return rowToAPI(trade, tags);
}

export async function deleteTrade(
  supabase: SupabaseClient,
  userId: string,
  tradeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('trades')
    .delete()
    .eq('id', tradeId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function bulkInsertTrades(
  supabase: SupabaseClient,
  userId: string,
  trades: Array<{
    ticker: string;
    enterTime: string;
    exitTime: string;
    enterPrice: number;
    exitPrice: number;
    quantity: number;
    manualPL?: number | null;
    comments?: string;
    tags?: string[];
    tradovateOrderId?: string | null;
    tradovateSource?: string;
  }>,
): Promise<{ imported: number }> {
  const rows = trades.map((t) => ({
    user_id: userId,
    ticker: t.ticker,
    enter_time: t.enterTime,
    exit_time: t.exitTime,
    enter_price: t.enterPrice,
    exit_price: t.exitPrice,
    quantity: t.quantity,
    manual_pl: t.manualPL || null,
    comments: t.comments || '',
    tradovate_order_id: t.tradovateOrderId || null,
    tradovate_source: t.tradovateSource || 'manual',
  }));

  const { data: inserted, error } = await supabase
    .from('trades')
    .insert(rows)
    .select('id');

  if (error) throw new Error(error.message);

  // Insert trade_tags for trades that have tags
  const tagInserts: Array<{ trade_id: string; tag_id: string }> = [];
  if (inserted) {
    for (let i = 0; i < inserted.length; i++) {
      const tags = trades[i].tags || [];
      for (const tagId of tags) {
        tagInserts.push({ trade_id: inserted[i].id, tag_id: tagId });
      }
    }
  }

  if (tagInserts.length > 0) {
    await supabase.from('trade_tags').insert(tagInserts);
  }

  return { imported: inserted?.length || 0 };
}

export async function findByTradovateOrderIds(
  supabase: SupabaseClient,
  userId: string,
  orderIds: string[],
): Promise<string[]> {
  const { data } = await supabase
    .from('trades')
    .select('tradovate_order_id')
    .eq('user_id', userId)
    .in('tradovate_order_id', orderIds);

  return (data || []).map((row: any) => row.tradovate_order_id).filter(Boolean);
}
