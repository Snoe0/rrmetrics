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
  const profile = c.get('profile');
  const body = await c.req.json();

  // Enforce 50 trade limit for trial and free users
  const plan = profile?.subscription_plan || 'free';
  if (plan !== 'pro' && plan !== 'elite') {
    const count = await tradesDb.countTrades(supabase, user.id);
    if (count >= 50) {
      return c.json({ error: 'Trade limit reached (50). Upgrade to Pro for unlimited trades.' }, 402);
    }
  }

  const hasPrices = body.enterPrice != null && body.enterPrice !== '' && body.exitPrice != null && body.exitPrice !== '';
  const hasPL = body.manualPL != null && body.manualPL !== '';

  if (!body.ticker || !body.enterTime || !body.exitTime || !body.quantity) {
    return c.json({ error: 'Ticker, enter time, exit time, and quantity are required!' }, 400);
  }
  if (!hasPrices && !hasPL) {
    return c.json({ error: 'Either enter/exit prices or a manual P/L is required!' }, 400);
  }

  try {
    const newTrade = await tradesDb.createTrade(supabase, user.id, {
      ticker: String(body.ticker).toUpperCase().trim(),
      enterTime: body.enterTime,
      exitTime: body.exitTime,
      enterPrice: hasPrices ? body.enterPrice : 0,
      exitPrice: hasPrices ? body.exitPrice : 0,
      quantity: body.quantity,
      manualPL: body.manualPL || null,
      imageAttachments: body.imageAttachments || [],
      screenshot: body.screenshot || null,
      comments: body.comments || '',
      isEval: body.isEval || false,
      account: body.account || null,
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

  const hasPricesU = body.enterPrice != null && body.enterPrice !== '' && body.exitPrice != null && body.exitPrice !== '';
  const hasPLU = body.manualPL != null && body.manualPL !== '';

  if (!body.ticker || !body.enterTime || !body.exitTime || !body.quantity) {
    return c.json({ error: 'Ticker, enter time, exit time, and quantity are required!' }, 400);
  }
  if (!hasPricesU && !hasPLU) {
    return c.json({ error: 'Either enter/exit prices or a manual P/L is required!' }, 400);
  }

  try {
    const updated = await tradesDb.updateTrade(supabase, user.id, {
      _id: body._id,
      ticker: String(body.ticker).toUpperCase().trim(),
      enterTime: body.enterTime,
      exitTime: body.exitTime,
      enterPrice: hasPricesU ? body.enterPrice : 0,
      exitPrice: hasPricesU ? body.exitPrice : 0,
      quantity: body.quantity,
      manualPL: body.manualPL || null,
      screenshot: body.screenshot || null,
      comments: body.comments || '',
      isEval: body.isEval || false,
      account: body.account || null,
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
  const profile = c.get('profile');
  const body = await c.req.json();

  if (!body.trades || !Array.isArray(body.trades)) {
    return c.json({ error: 'An array of trades is required!' }, 400);
  }

  if (body.trades.length > 500) {
    return c.json({ error: 'Maximum 500 trades per import!' }, 400);
  }

  // Enforce 50 trade limit for trial and free users
  const plan = profile?.subscription_plan || 'free';
  if (plan !== 'pro' && plan !== 'elite') {
    const currentCount = await tradesDb.countTrades(supabase, user.id);
    const remaining = 50 - currentCount;
    if (remaining <= 0) {
      return c.json({ error: 'Trade limit reached (50). Upgrade to Pro for unlimited trades.' }, 402);
    }
    if (body.trades.length > remaining) {
      return c.json({ error: `Import would exceed your 50 trade limit. You can import ${remaining} more trade(s).` }, 402);
    }
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
      manualPL: t.manualPL != null ? parseFloat(t.manualPL) : null,
      comments: t.comments || '',
      tags: t.tags || [],
      account: t.account || null,
    }));

    const result = await tradesDb.bulkInsertTrades(supabase, user.id, tradeDocs);
    return c.json(result, 201);
  } catch (err) {
    console.error('importTrades error:', err);
    return c.json({ error: 'An error occurred during import' }, 500);
  }
});

// POST /api/bulkUpdateTrades
trade.post('/api/bulkUpdateTrades', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();

  if (!body.tradeIds || !Array.isArray(body.tradeIds) || body.tradeIds.length === 0) {
    return c.json({ error: 'tradeIds array is required!' }, 400);
  }
  if (!body.action) {
    return c.json({ error: 'action is required!' }, 400);
  }

  try {
    if (body.action === 'markEval') {
      const count = await tradesDb.bulkUpdateEval(supabase, user.id, body.tradeIds, true);
      return c.json({ message: `${count} trade(s) marked as eval.` });
    }
    if (body.action === 'unmarkEval') {
      const count = await tradesDb.bulkUpdateEval(supabase, user.id, body.tradeIds, false);
      return c.json({ message: `${count} trade(s) unmarked as eval.` });
    }
    if (body.action === 'addTags') {
      if (!body.tags || !Array.isArray(body.tags) || body.tags.length === 0) {
        return c.json({ error: 'tags array is required for addTags action!' }, 400);
      }
      const count = await tradesDb.bulkAddTags(supabase, user.id, body.tradeIds, body.tags);
      return c.json({ message: `${count} tag assignment(s) added.` });
    }
    return c.json({ error: 'Invalid action. Use markEval, unmarkEval, or addTags.' }, 400);
  } catch (err: any) {
    console.error('bulkUpdateTrades error:', err);
    return c.json({ error: err.message || 'An error occurred during bulk update.' }, 500);
  }
});

// POST /api/bulkDeleteTrades
trade.post('/api/bulkDeleteTrades', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();

  if (!body.tradeIds || !Array.isArray(body.tradeIds) || body.tradeIds.length === 0) {
    return c.json({ error: 'tradeIds array is required!' }, 400);
  }

  try {
    const count = await tradesDb.bulkDeleteTrades(supabase, user.id, body.tradeIds);
    return c.json({ message: `${count} trade(s) deleted.` });
  } catch (err: any) {
    console.error('bulkDeleteTrades error:', err);
    return c.json({ error: err.message || 'An error occurred during bulk delete.' }, 500);
  }
});

export default trade;
