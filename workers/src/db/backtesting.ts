import type { SupabaseClient } from '@supabase/supabase-js';

export interface BacktestingSessionAPI {
  _id: string;
  name: string | null;
  ticker: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  // Aggregates (populated by getSessionsWithStats)
  tradeCount?: number;
  winCount?: number;
  lossCount?: number;
  winRate?: number;
  avgProfitFactor?: number;
}

export interface BacktestingTradeAPI {
  _id: string;
  sessionId: string;
  result: 'win' | 'loss';
  profitFactor: number;
  timeOfDay: string;
  createdAt: string;
}

function sessionRowToAPI(row: any): BacktestingSessionAPI {
  return {
    _id: row.id,
    name: row.name ?? null,
    ticker: row.ticker,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function tradeRowToAPI(row: any): BacktestingTradeAPI {
  return {
    _id: row.id,
    sessionId: row.session_id,
    result: row.result,
    profitFactor: row.profit_factor,
    timeOfDay: row.time_of_day,
    createdAt: row.created_at,
  };
}

// --- Sessions ---

export async function getSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<BacktestingSessionAPI[]> {
  const { data, error } = await supabase
    .from('backtesting_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(sessionRowToAPI);
}

export async function getSessionsWithStats(
  supabase: SupabaseClient,
  userId: string,
): Promise<BacktestingSessionAPI[]> {
  const sessions = await getSessions(supabase, userId);
  if (sessions.length === 0) return [];

  const { data: trades, error } = await supabase
    .from('backtesting_trades')
    .select('session_id, result, profit_factor')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  const statsBySession: Record<string, { wins: number; losses: number; pfSum: number }> = {};
  for (const t of trades || []) {
    if (!statsBySession[t.session_id]) {
      statsBySession[t.session_id] = { wins: 0, losses: 0, pfSum: 0 };
    }
    if (t.result === 'win') statsBySession[t.session_id].wins++;
    else statsBySession[t.session_id].losses++;
    statsBySession[t.session_id].pfSum += t.profit_factor;
  }

  return sessions.map(s => {
    const st = statsBySession[s._id];
    if (!st) return { ...s, tradeCount: 0, winCount: 0, lossCount: 0, winRate: 0, avgProfitFactor: 0 };
    const total = st.wins + st.losses;
    return {
      ...s,
      tradeCount: total,
      winCount: st.wins,
      lossCount: st.losses,
      winRate: total > 0 ? (st.wins / total) * 100 : 0,
      avgProfitFactor: total > 0 ? st.pfSum / total : 0,
    };
  });
}

export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  session: { name?: string; ticker: string; startDate: string },
): Promise<BacktestingSessionAPI> {
  // Deactivate any existing active session
  await supabase
    .from('backtesting_sessions')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true);

  const { data, error } = await supabase
    .from('backtesting_sessions')
    .insert({
      user_id: userId,
      name: session.name || null,
      ticker: session.ticker.toUpperCase(),
      start_date: session.startDate,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return sessionRowToAPI(data);
}

export async function endSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  endDate: string,
): Promise<BacktestingSessionAPI> {
  const { data, error } = await supabase
    .from('backtesting_sessions')
    .update({ is_active: false, end_date: endDate })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return sessionRowToAPI(data);
}

export async function continueSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<BacktestingSessionAPI> {
  // Deactivate any existing active session
  await supabase
    .from('backtesting_sessions')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true);

  const { data, error } = await supabase
    .from('backtesting_sessions')
    .update({ is_active: true, end_date: null })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return sessionRowToAPI(data);
}

export async function deleteSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from('backtesting_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

// --- Trades ---

export async function getTradesForSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<BacktestingTradeAPI[]> {
  const { data, error } = await supabase
    .from('backtesting_trades')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(tradeRowToAPI);
}

export async function addTrade(
  supabase: SupabaseClient,
  userId: string,
  trade: { sessionId: string; result: 'win' | 'loss'; profitFactor: number; timeOfDay: string },
): Promise<BacktestingTradeAPI> {
  const { data, error } = await supabase
    .from('backtesting_trades')
    .insert({
      session_id: trade.sessionId,
      user_id: userId,
      result: trade.result,
      profit_factor: trade.profitFactor,
      time_of_day: trade.timeOfDay,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return tradeRowToAPI(data);
}

export async function deleteTrade(
  supabase: SupabaseClient,
  userId: string,
  tradeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('backtesting_trades')
    .delete()
    .eq('id', tradeId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}
