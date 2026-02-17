import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as profilesDb from '../db/profiles';
import * as tradesDb from '../db/trades';
import { encrypt, decrypt } from '../utils/crypto';
import { TradovateAPI } from '../services/TradovateAPI';
import { requiresLogin } from '../middleware/supabase-auth';
import { createServiceClient } from '../lib/supabase';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const tradovate = new Hono<HonoEnv>();

// POST /api/tradovate/credentials
tradovate.post('/api/tradovate/credentials', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
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

    // Encrypt and save using service client (bypasses RLS for encrypted field updates)
    const serviceClient = createServiceClient(c.env);
    const encKey = c.env.ENCRYPTION_KEY;
    await profilesDb.updateById(serviceClient, user.id, {
      tradovateUsername: await encrypt(username, encKey),
      tradovatePassword: await encrypt(password, encKey),
      tradovateCid: await encrypt(cid, encKey),
      tradovateSecret: await encrypt(secret, encKey),
      tradovateEnvironment: environment || 'demo',
    });

    return c.json({ message: 'Tradovate credentials saved and validated' });
  } catch (err: any) {
    console.error('Tradovate credential save error:', err.message);
    return c.json({ error: `Failed to validate credentials: ${err.message}` }, 400);
  }
});

// POST /api/tradovate/sync
tradovate.post('/api/tradovate/sync', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const serviceClient = createServiceClient(c.env);
    const profile = await profilesDb.findById(serviceClient, user.id);
    if (!profile || !profile.tradovate_username) {
      return c.json({ error: 'Tradovate credentials not configured' }, 400);
    }

    const encKey = c.env.ENCRYPTION_KEY;
    const credentials = {
      username: await decrypt(profile.tradovate_username, encKey),
      password: await decrypt(profile.tradovate_password!, encKey),
      cid: await decrypt(profile.tradovate_cid!, encKey),
      secret: await decrypt(profile.tradovate_secret!, encKey),
    };

    const api = new TradovateAPI(profile.tradovate_environment);
    const authData = await api.authenticate(credentials);
    const token = authData.accessToken;

    const fills = await api.getFills(token);

    if (!fills || fills.length === 0) {
      await profilesDb.updateById(serviceClient, user.id, {
        tradovateLastSyncTime: new Date().toISOString(),
      });
      return c.json({ message: 'No fills found', synced: 0 });
    }

    // Group fills by orderId
    const fillsByOrder: Record<string, typeof fills> = {};
    for (const fill of fills) {
      const orderId = String(fill.orderId || fill.id);
      if (!fillsByOrder[orderId]) fillsByOrder[orderId] = [];
      fillsByOrder[orderId].push(fill);
    }

    const source = `tradovate_${profile.tradovate_environment}` as 'tradovate_demo' | 'tradovate_live';

    // Check which orders are already synced
    const orderIds = Object.keys(fillsByOrder);
    const existingOrderIds = await tradesDb.findByTradovateOrderIds(supabase, user.id, orderIds);
    const existingIds = new Set(existingOrderIds);

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
        };
      });

    let syncedCount = 0;
    if (newTrades.length > 0) {
      const result = await tradesDb.bulkInsertTrades(supabase, user.id, newTrades);
      syncedCount = result.imported;
    }

    await profilesDb.updateById(serviceClient, user.id, {
      tradovateLastSyncTime: new Date().toISOString(),
    });

    return c.json({ message: `Synced ${syncedCount} new trades`, synced: syncedCount });
  } catch (err: any) {
    console.error('Tradovate sync error:', err.message);
    return c.json({ error: `Sync failed: ${err.message}` }, 500);
  }
});

// GET /api/tradovate/status
tradovate.get('/api/tradovate/status', requiresLogin, async (c) => {
  const user = c.get('user');
  try {
    const serviceClient = createServiceClient(c.env);
    const profile = await profilesDb.findById(serviceClient, user.id);
    if (!profile) return c.json({ error: 'Account not found' }, 404);

    return c.json({
      configured: !!profile.tradovate_username,
      environment: profile.tradovate_environment || 'demo',
      lastSyncTime: profile.tradovate_last_sync_time || null,
    });
  } catch (err: any) {
    console.error('Tradovate status error:', err.message);
    return c.json({ error: 'Failed to get Tradovate status' }, 500);
  }
});

// DELETE /api/tradovate/credentials
tradovate.delete('/api/tradovate/credentials', requiresLogin, async (c) => {
  const user = c.get('user');

  try {
    const serviceClient = createServiceClient(c.env);
    await profilesDb.updateById(serviceClient, user.id, {
      tradovateUsername: null,
      tradovatePassword: null,
      tradovateCid: null,
      tradovateSecret: null,
      tradovateEnvironment: 'demo',
      tradovateLastSyncTime: null,
    });

    return c.json({ message: 'Tradovate credentials removed' });
  } catch (err: any) {
    console.error('Tradovate delete error:', err.message);
    return c.json({ error: 'Failed to delete credentials' }, 500);
  }
});

export default tradovate;
