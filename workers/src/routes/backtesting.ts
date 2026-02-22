import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as db from '../db/backtesting';
import { requiresLogin } from '../middleware/supabase-auth';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const backtesting = new Hono<HonoEnv>();

// GET /api/backtesting/sessions — list all sessions with stats
backtesting.get('/api/backtesting/sessions', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  try {
    const sessions = await db.getSessionsWithStats(supabase, user.id);
    return c.json({ sessions });
  } catch (err) {
    console.error('getSessions error:', err);
    return c.json({ error: 'Failed to fetch sessions' }, 500);
  }
});

// POST /api/backtesting/sessions — start a new session
backtesting.post('/api/backtesting/sessions', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();
  const { name, ticker, startDate } = body;

  if (!ticker || !startDate) {
    return c.json({ error: 'ticker and startDate are required' }, 400);
  }

  try {
    const session = await db.createSession(supabase, user.id, { name, ticker, startDate });
    return c.json(session);
  } catch (err) {
    console.error('createSession error:', err);
    return c.json({ error: 'Failed to create session' }, 500);
  }
});

// POST /api/backtesting/sessions/:id/end — end a session
backtesting.post('/api/backtesting/sessions/:id/end', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const sessionId = c.req.param('id');
  const body = await c.req.json();
  const { endDate } = body;

  if (!endDate) {
    return c.json({ error: 'endDate is required' }, 400);
  }

  try {
    const session = await db.endSession(supabase, user.id, sessionId, endDate);
    return c.json(session);
  } catch (err) {
    console.error('endSession error:', err);
    return c.json({ error: 'Failed to end session' }, 500);
  }
});

// POST /api/backtesting/sessions/:id/continue — re-activate a session
backtesting.post('/api/backtesting/sessions/:id/continue', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const sessionId = c.req.param('id');

  try {
    const session = await db.continueSession(supabase, user.id, sessionId);
    return c.json(session);
  } catch (err) {
    console.error('continueSession error:', err);
    return c.json({ error: 'Failed to continue session' }, 500);
  }
});

// DELETE /api/backtesting/sessions/:id — delete a session and its trades
backtesting.delete('/api/backtesting/sessions/:id', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const sessionId = c.req.param('id');

  try {
    await db.deleteSession(supabase, user.id, sessionId);
    return c.json({ message: 'Session deleted' });
  } catch (err) {
    console.error('deleteSession error:', err);
    return c.json({ error: 'Failed to delete session' }, 500);
  }
});

// GET /api/backtesting/sessions/:id/trades — list trades for a session
backtesting.get('/api/backtesting/sessions/:id/trades', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const sessionId = c.req.param('id');

  try {
    const trades = await db.getTradesForSession(supabase, user.id, sessionId);
    return c.json({ trades });
  } catch (err) {
    console.error('getTradesForSession error:', err);
    return c.json({ error: 'Failed to fetch trades' }, 500);
  }
});

// POST /api/backtesting/trades — add a trade to the active session
backtesting.post('/api/backtesting/trades', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();
  const { sessionId, result, profitFactor, timeOfDay } = body;

  if (!sessionId || !result || profitFactor == null || !timeOfDay) {
    return c.json({ error: 'sessionId, result, profitFactor, and timeOfDay are required' }, 400);
  }
  if (result !== 'win' && result !== 'loss') {
    return c.json({ error: 'result must be "win" or "loss"' }, 400);
  }

  try {
    const trade = await db.addTrade(supabase, user.id, { sessionId, result, profitFactor, timeOfDay });
    return c.json(trade);
  } catch (err) {
    console.error('addTrade error:', err);
    return c.json({ error: 'Failed to add trade' }, 500);
  }
});

// DELETE /api/backtesting/trades/:id — delete a trade
backtesting.delete('/api/backtesting/trades/:id', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const tradeId = c.req.param('id');

  try {
    await db.deleteTrade(supabase, user.id, tradeId);
    return c.json({ message: 'Trade deleted' });
  } catch (err) {
    console.error('deleteTrade error:', err);
    return c.json({ error: 'Failed to delete trade' }, 500);
  }
});

export default backtesting;
