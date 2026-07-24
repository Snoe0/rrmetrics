import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as tradesDb from '../db/trades';
import * as brokerDb from '../db/broker-connections';
import { requiresLogin } from '../middleware/supabase-auth';
import { createServiceClient } from '../lib/supabase';

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

    // Build account → broker mapping from broker_connections
    const accountBrokers: Record<string, string> = {};
    try {
      const serviceClient = createServiceClient(c.env);
      const conns = await brokerDb.findByOwner(serviceClient, user.id);

      // Step 1: Direct match — parse account name from each connection's label
      // Label format: "Alpha Futures Demo — AFZEROQA202602139428"
      const labelMatches: Array<{ name: string; broker: string }> = [];
      for (const conn of conns) {
        if (conn.label) {
          const dashIdx = conn.label.indexOf('—');
          if (dashIdx !== -1) {
            const acctName = conn.label.substring(dashIdx + 1).trim();
            if (acctName) {
              accountBrokers[acctName] = conn.broker;
              labelMatches.push({ name: acctName, broker: conn.broker });
            }
          }
        }
      }

      // Step 2: For unmatched trade accounts, match by shared prefix with
      // a label-matched account (e.g. AFZEROEV... shares prefix with AFZEROQA...)
      const allAccounts = [...new Set(trades.map((t: any) => t.account).filter(Boolean))];
      const unmatched = allAccounts.filter((a: string) => !accountBrokers[a]);
      if (unmatched.length > 0 && labelMatches.length > 0) {
        for (const acct of unmatched) {
          let bestMatch = '';
          let bestBroker = '';
          for (const lm of labelMatches) {
            // Find longest common prefix
            let i = 0;
            while (i < acct.length && i < lm.name.length && acct[i] === lm.name[i]) i++;
            if (i >= 4 && i > bestMatch.length) {
              bestMatch = acct.substring(0, i);
              bestBroker = lm.broker;
            }
          }
          if (bestBroker) accountBrokers[acct] = bestBroker;
        }
      }
    } catch {
      // non-fatal — account icons are best-effort
    }

    return c.json({ trades, accountBrokers });
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
