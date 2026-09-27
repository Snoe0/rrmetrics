import type { Db } from './connection';
import { generateId } from '../utils/id';

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
    isActive: !!row.is_active,
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
  db: Db,
  userId: string,
): Promise<BacktestingSessionAPI[]> {
  const rows = db
    .prepare('SELECT * FROM backtesting_sessions WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
  return rows.map(sessionRowToAPI);
}

export async function getSessionsWithStats(
  db: Db,
  userId: string,
): Promise<BacktestingSessionAPI[]> {
  const sessions = await getSessions(db, userId);
  if (sessions.length === 0) return [];

  const trades = db
    .prepare('SELECT session_id, result, profit_factor FROM backtesting_trades WHERE user_id = ?')
    .all(userId) as Array<{ session_id: string; result: string; profit_factor: number }>;

  const statsBySession: Record<string, { wins: number; losses: number; pfSum: number }> = {};
  for (const t of trades) {
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
  db: Db,
  userId: string,
  session: { name?: string; ticker: string; startDate: string },
): Promise<BacktestingSessionAPI> {
  const id = generateId();

  const run = db.transaction(() => {
    // Deactivate any existing active session
    db.prepare('UPDATE backtesting_sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1')
      .run(userId);

    db.prepare(
      `INSERT INTO backtesting_sessions (id, user_id, name, ticker, start_date, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    ).run(
      id,
      userId,
      session.name || null,
      session.ticker.toUpperCase(),
      session.startDate,
      new Date().toISOString(),
    );
  });
  run();

  const row = db
    .prepare('SELECT * FROM backtesting_sessions WHERE id = ? AND user_id = ?')
    .get(id, userId);
  return sessionRowToAPI(row);
}

export async function endSession(
  db: Db,
  userId: string,
  sessionId: string,
  endDate: string,
): Promise<BacktestingSessionAPI> {
  const result = db
    .prepare(
      'UPDATE backtesting_sessions SET is_active = 0, end_date = ? WHERE id = ? AND user_id = ?',
    )
    .run(endDate, sessionId, userId);
  if (result.changes === 0) throw new Error('Session not found');

  const row = db
    .prepare('SELECT * FROM backtesting_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId);
  return sessionRowToAPI(row);
}

export async function continueSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<BacktestingSessionAPI> {
  const run = db.transaction(() => {
    // Deactivate any existing active session
    db.prepare('UPDATE backtesting_sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1')
      .run(userId);

    const result = db
      .prepare(
        'UPDATE backtesting_sessions SET is_active = 1, end_date = NULL WHERE id = ? AND user_id = ?',
      )
      .run(sessionId, userId);
    if (result.changes === 0) throw new Error('Session not found');
  });
  run();

  const row = db
    .prepare('SELECT * FROM backtesting_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId);
  return sessionRowToAPI(row);
}

export async function deleteSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<void> {
  db.prepare('DELETE FROM backtesting_sessions WHERE id = ? AND user_id = ?')
    .run(sessionId, userId);
}

// --- Trades ---

export async function getTrades(
  db: Db,
  userId: string,
): Promise<BacktestingTradeAPI[]> {
  const rows = db
    .prepare(
      `SELECT * FROM backtesting_trades
       WHERE user_id = ?
       ORDER BY created_at ASC`,
    )
    .all(userId);
  return rows.map(tradeRowToAPI);
}

export async function getTradesForSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<BacktestingTradeAPI[]> {
  const rows = db
    .prepare(
      `SELECT * FROM backtesting_trades
       WHERE user_id = ? AND session_id = ?
       ORDER BY created_at ASC`,
    )
    .all(userId, sessionId);
  return rows.map(tradeRowToAPI);
}

export async function addTrade(
  db: Db,
  userId: string,
  trade: { sessionId: string; result: 'win' | 'loss'; profitFactor: number; timeOfDay: string },
): Promise<BacktestingTradeAPI> {
  const id = generateId();
  db.prepare(
    `INSERT INTO backtesting_trades (id, session_id, user_id, result, profit_factor, time_of_day, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    trade.sessionId,
    userId,
    trade.result,
    trade.profitFactor,
    trade.timeOfDay,
    new Date().toISOString(),
  );

  const row = db
    .prepare('SELECT * FROM backtesting_trades WHERE id = ? AND user_id = ?')
    .get(id, userId);
  return tradeRowToAPI(row);
}

export async function deleteTrade(
  db: Db,
  userId: string,
  tradeId: string,
): Promise<void> {
  db.prepare('DELETE FROM backtesting_trades WHERE id = ? AND user_id = ?')
    .run(tradeId, userId);
}
