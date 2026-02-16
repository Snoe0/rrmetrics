import { Hono } from 'hono';
import type { Env, SessionData } from '../bindings';
import * as accountsDb from '../db/accounts';
import * as tradesDb from '../db/trades';
import { encrypt, decrypt } from '../utils/crypto';
import { TradovateAPI } from '../services/TradovateAPI';
import { requiresLogin } from '../middleware/auth';
import { saveSession } from '../middleware/session';

type HonoEnv = {
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
};

const tradovate = new Hono<HonoEnv>();

// POST /api/tradovate/credentials
tradovate.post('/api/tradovate/credentials', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const sessionId = c.get('sessionId')!;
  const body = await c.req.json();
  const { username, password, cid, secret, environment } = body;

  if (!username || !password || !cid || !secret) {
    return c.json({ error: 'All Tradovate credential fields are required' }, 400);
  }

  if (environment && !['demo', 'live'].includes(environment)) {
    return c.json({ error: 'Environment must be demo or live' }, 400);
  }

  try {
    // Validate credentials by attempting auth
    const api = new TradovateAPI(environment || 'demo');
    await api.authenticate({ username, password, cid, secret });

    // Encrypt and save
    const account = await accountsDb.findById(c.env.DB, session.account._id);
    if (!account) return c.json({ error: 'Account not found' }, 404);

    const encKey = c.env.ENCRYPTION_KEY;
    await accountsDb.updateById(c.env.DB, account.id, {
      tradovateUsername: await encrypt(username, encKey),
      tradovatePassword: await encrypt(password, encKey),
      tradovateCid: await encrypt(cid, encKey),
      tradovateSecret: await encrypt(secret, encKey),
      tradovateEnvironment: environment || 'demo',
    });

    // Refresh session
    const updatedRow = await accountsDb.findById(c.env.DB, account.id);
    if (updatedRow) {
      const newSession: SessionData = { account: accountsDb.toAPI(updatedRow) };
      const cookie = await saveSession(c.env, sessionId, newSession);
      c.header('Set-Cookie', cookie);
    }

    return c.json({ message: 'Tradovate credentials saved and validated' });
  } catch (err: any) {
    console.error('Tradovate credential save error:', err.message);
    return c.json({ error: `Failed to validate credentials: ${err.message}` }, 400);
  }
});

// POST /api/tradovate/sync
tradovate.post('/api/tradovate/sync', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const sessionId = c.get('sessionId')!;

  try {
    const account = await accountsDb.findById(c.env.DB, session.account._id);
    if (!account || !account.tradovate_username) {
      return c.json({ error: 'Tradovate credentials not configured' }, 400);
    }

    const encKey = c.env.ENCRYPTION_KEY;
    const credentials = {
      username: await decrypt(account.tradovate_username, encKey),
      password: await decrypt(account.tradovate_password!, encKey),
      cid: await decrypt(account.tradovate_cid!, encKey),
      secret: await decrypt(account.tradovate_secret!, encKey),
    };

    const api = new TradovateAPI(account.tradovate_environment);
    const authData = await api.authenticate(credentials);
    const token = authData.accessToken;

    const fills = await api.getFills(token);

    if (!fills || fills.length === 0) {
      await accountsDb.updateById(c.env.DB, account.id, {
        tradovateLastSyncTime: new Date().toISOString(),
      });
      const updatedRow = await accountsDb.findById(c.env.DB, account.id);
      if (updatedRow) {
        const cookie = await saveSession(c.env, sessionId, { account: accountsDb.toAPI(updatedRow) });
        c.header('Set-Cookie', cookie);
      }
      return c.json({ message: 'No fills found', synced: 0 });
    }

    // Group fills by orderId
    const fillsByOrder: Record<string, typeof fills> = {};
    for (const fill of fills) {
      const orderId = String(fill.orderId || fill.id);
      if (!fillsByOrder[orderId]) fillsByOrder[orderId] = [];
      fillsByOrder[orderId].push(fill);
    }

    const source = `tradovate_${account.tradovate_environment}` as 'tradovate_demo' | 'tradovate_live';

    // Check which orders are already synced
    const orderIds = Object.keys(fillsByOrder);
    const existingIds = new Set(
      await tradesDb.findByTradovateOrderIds(c.env.DB, orderIds, account.id),
    );

    // Resolve contract names
    const uniqueContractIds = [...new Set(fills.map((f) => f.contractId))];
    const contractNames: Record<number, string> = {};
    await Promise.all(
      uniqueContractIds.map(async (contractId) => {
        try {
          const contract = await api.getContract(token, contractId);
          contractNames[contractId] = contract.name || `Contract-${contractId}`;
        } catch {
          contractNames[contractId] = `Contract-${contractId}`;
        }
      }),
    );

    // Build new trades
    const newTrades = Object.entries(fillsByOrder)
      .filter(([orderId]) => !existingIds.has(orderId))
      .map(([orderId, orderFills]) => {
        const fill = orderFills[0];
        const ticker = contractNames[fill.contractId];
        const qty = orderFills.reduce((sum, f) => sum + (f.qty || 0), 0);
        const avgPrice =
          orderFills.reduce((sum, f) => sum + (f.price || 0) * (f.qty || 1), 0) / (qty || 1);
        const fillTime = new Date(fill.timestamp).toISOString();

        return {
          ticker,
          enterTime: fillTime,
          exitTime: fillTime,
          enterPrice: avgPrice,
          exitPrice: avgPrice,
          quantity: Math.abs(qty),
          tradovateOrderId: orderId,
          tradovateSource: source,
          owner: account.id,
        };
      });

    let syncedCount = 0;
    if (newTrades.length > 0) {
      syncedCount = await tradesDb.bulkInsert(c.env.DB, newTrades);
    }

    await accountsDb.updateById(c.env.DB, account.id, {
      tradovateLastSyncTime: new Date().toISOString(),
    });
    const updatedRow = await accountsDb.findById(c.env.DB, account.id);
    if (updatedRow) {
      const cookie = await saveSession(c.env, sessionId, { account: accountsDb.toAPI(updatedRow) });
      c.header('Set-Cookie', cookie);
    }

    return c.json({ message: `Synced ${syncedCount} new trades`, synced: syncedCount });
  } catch (err: any) {
    console.error('Tradovate sync error:', err.message);
    return c.json({ error: `Sync failed: ${err.message}` }, 500);
  }
});

// GET /api/tradovate/status
tradovate.get('/api/tradovate/status', requiresLogin, async (c) => {
  const session = c.get('session')!;
  try {
    const account = await accountsDb.findById(c.env.DB, session.account._id);
    if (!account) return c.json({ error: 'Account not found' }, 404);

    return c.json({
      configured: !!account.tradovate_username,
      environment: account.tradovate_environment || 'demo',
      lastSyncTime: account.tradovate_last_sync_time || null,
    });
  } catch (err: any) {
    console.error('Tradovate status error:', err.message);
    return c.json({ error: 'Failed to get Tradovate status' }, 500);
  }
});

// DELETE /api/tradovate/credentials
tradovate.delete('/api/tradovate/credentials', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const sessionId = c.get('sessionId')!;

  try {
    const account = await accountsDb.findById(c.env.DB, session.account._id);
    if (!account) return c.json({ error: 'Account not found' }, 404);

    await accountsDb.updateById(c.env.DB, account.id, {
      tradovateUsername: null,
      tradovatePassword: null,
      tradovateCid: null,
      tradovateSecret: null,
      tradovateEnvironment: 'demo',
      tradovateLastSyncTime: null,
    });

    const updatedRow = await accountsDb.findById(c.env.DB, account.id);
    if (updatedRow) {
      const cookie = await saveSession(c.env, sessionId, { account: accountsDb.toAPI(updatedRow) });
      c.header('Set-Cookie', cookie);
    }

    return c.json({ message: 'Tradovate credentials removed' });
  } catch (err: any) {
    console.error('Tradovate delete error:', err.message);
    return c.json({ error: 'Failed to delete credentials' }, 500);
  }
});

export default tradovate;
