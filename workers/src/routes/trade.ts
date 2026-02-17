import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as tradesDb from '../db/trades';
import { requiresLogin } from '../middleware/supabase-auth';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const trade = new Hono<HonoEnv>();

// GET /api/getTrades
trade.get('/api/getTrades', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  try {
    const trades = await tradesDb.getTrades(supabase, user.id);
    return c.json({ trades });
  } catch (err) {
    console.error('getTrades error:', err);
    return c.json({ error: 'Error retrieving trades!' }, 500);
  }
});

// POST /makeTrade and POST /trades
const makeTradeHandler = async (c: any) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();

  if (
    !body.ticker ||
    !body.enterTime ||
    !body.exitTime ||
    !body.enterPrice ||
    !body.exitPrice ||
    !body.quantity
  ) {
    return c.json(
      { error: 'Ticker, enter time, exit time, enter price, exit price, and quantity are required!' },
      400,
    );
  }

  try {
    const newTrade = await tradesDb.createTrade(supabase, user.id, {
      ticker: body.ticker,
      enterTime: body.enterTime,
      exitTime: body.exitTime,
      enterPrice: body.enterPrice,
      exitPrice: body.exitPrice,
      quantity: body.quantity,
      manualPL: body.manualPL || null,
      imageAttachments: body.imageAttachments || [],
      screenshot: body.screenshot || null,
      comments: body.comments || '',
      tags: body.tags || [],
    });

    return c.json(newTrade, 201);
  } catch (err: any) {
    console.error('makeTrade error:', err);
    return c.json({ error: err.message || 'An error occurred' }, 500);
  }
};
trade.post('/api/makeTrade', requiresLogin, makeTradeHandler);
trade.post('/api/trades', requiresLogin, makeTradeHandler);

// POST /api/removeTrade
trade.post('/api/removeTrade', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();

  if (!body._id) {
    return c.json({ error: 'Trade ID is required to delete!' }, 400);
  }

  try {
    await tradesDb.deleteTrade(supabase, user.id, body._id);
    return c.json({ message: 'Trade deleted successfully!' });
  } catch (err) {
    console.error('removeTrade error:', err);
    return c.json({ error: 'An error occurred while deleting the trade!' }, 500);
  }
});

// POST /api/updateTrade
trade.post('/api/updateTrade', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();

  if (!body._id) {
    return c.json({ error: 'Trade ID is required to update!' }, 400);
  }

  if (
    !body.ticker ||
    !body.enterTime ||
    !body.exitTime ||
    !body.enterPrice ||
    !body.exitPrice ||
    !body.quantity
  ) {
    return c.json(
      { error: 'Ticker, enter time, exit time, enter price, exit price, and quantity are required!' },
      400,
    );
  }

  try {
    const updated = await tradesDb.updateTrade(supabase, user.id, {
      _id: body._id,
      ticker: body.ticker,
      enterTime: body.enterTime,
      exitTime: body.exitTime,
      enterPrice: body.enterPrice,
      exitPrice: body.exitPrice,
      quantity: body.quantity,
      manualPL: body.manualPL || null,
      screenshot: body.screenshot || null,
      comments: body.comments || '',
      tags: body.tags || [],
    });

    return c.json(updated);
  } catch (err) {
    console.error('updateTrade error:', err);
    return c.json({ error: 'An error occurred while updating the trade!' }, 500);
  }
});

// POST /api/importTrades
trade.post('/api/importTrades', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();

  if (!body.trades || !Array.isArray(body.trades)) {
    return c.json({ error: 'An array of trades is required!' }, 400);
  }

  if (body.trades.length > 500) {
    return c.json({ error: 'Maximum 500 trades per import!' }, 400);
  }

  const required = ['ticker', 'enterTime', 'exitTime', 'enterPrice', 'exitPrice', 'quantity'];

  for (let i = 0; i < body.trades.length; i++) {
    const t = body.trades[i];
    const missingField = required.find((field) => !t[field] && t[field] !== 0);
    if (missingField) {
      return c.json(
        { error: `Trade ${i + 1} is missing required field: ${missingField}` },
        400,
      );
    }
  }

  try {
    const tradeDocs = body.trades.map((t: any) => ({
      ticker: String(t.ticker).toUpperCase().trim(),
      enterTime: new Date(t.enterTime).toISOString(),
      exitTime: new Date(t.exitTime).toISOString(),
      enterPrice: parseFloat(t.enterPrice),
      exitPrice: parseFloat(t.exitPrice),
      quantity: parseFloat(t.quantity),
      manualPL: t.manualPL ? parseFloat(t.manualPL) : null,
      comments: t.comments || '',
      tags: t.tags || [],
    }));

    const result = await tradesDb.bulkInsertTrades(supabase, user.id, tradeDocs);
    return c.json(result, 201);
  } catch (err) {
    console.error('importTrades error:', err);
    return c.json({ error: 'An error occurred during import' }, 500);
  }
});

export default trade;
