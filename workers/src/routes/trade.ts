import { Hono } from 'hono';
import type { Env, SessionData } from '../bindings';
import * as tradesDb from '../db/trades';
import { requiresLogin } from '../middleware/auth';

type HonoEnv = {
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
};

const trade = new Hono<HonoEnv>();

// GET /getTrades
trade.get('/getTrades', requiresLogin, async (c) => {
  const session = c.get('session')!;
  try {
    const trades = await tradesDb.findByOwner(c.env.DB, session.account._id);
    return c.json({ trades });
  } catch (err) {
    console.error('getTrades error:', err);
    return c.json({ error: 'Error retrieving trades!' }, 500);
  }
});

// POST /makeTrade and POST /trades (client form submits to /trades)
const makeTradeHandler = async (c: any) => {
  const session = c.get('session')!;
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
    const newTrade = await tradesDb.create(c.env.DB, {
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
      owner: session.account._id,
    });

    return c.json(newTrade, 201);
  } catch (err: any) {
    console.error('makeTrade error:', err);
    if (err.message?.includes('UNIQUE constraint')) {
      return c.json({ error: 'Trade already exists!' }, 400);
    }
    return c.json({ error: 'An error occurred' }, 500);
  }
};
trade.post('/makeTrade', requiresLogin, makeTradeHandler);
trade.post('/trades', requiresLogin, makeTradeHandler);

// POST /removeTrade
trade.post('/removeTrade', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();

  if (!body._id) {
    return c.json({ error: 'Trade ID is required to delete!' }, 400);
  }

  try {
    const deleted = await tradesDb.deleteById(c.env.DB, body._id, session.account._id);
    if (!deleted) {
      return c.json({ error: 'Trade not found!' }, 404);
    }
    return c.json({ message: 'Trade deleted successfully!' });
  } catch (err) {
    console.error('removeTrade error:', err);
    return c.json({ error: 'An error occurred while deleting the trade!' }, 500);
  }
});

// POST /updateTrade
trade.post('/updateTrade', requiresLogin, async (c) => {
  const session = c.get('session')!;
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
    const updated = await tradesDb.updateById(c.env.DB, body._id, session.account._id, {
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

    if (!updated) {
      return c.json({ error: 'Trade not found!' }, 404);
    }

    return c.json(updated);
  } catch (err) {
    console.error('updateTrade error:', err);
    return c.json({ error: 'An error occurred while updating the trade!' }, 500);
  }
});

// POST /importTrades
trade.post('/importTrades', requiresLogin, async (c) => {
  const session = c.get('session')!;
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
      owner: session.account._id,
    }));

    const imported = await tradesDb.bulkInsert(c.env.DB, tradeDocs);
    return c.json({ imported }, 201);
  } catch (err) {
    console.error('importTrades error:', err);
    return c.json({ error: 'An error occurred during import' }, 500);
  }
});

export default trade;
