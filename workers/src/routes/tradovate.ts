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

/**
 * GET /api/tradovate/connect?environment=demo|live
 * Initiates the Tradovate OAuth flow by redirecting to the Tradovate consent screen.
 * Public endpoint — the OAuth redirect does not carry auth headers.
 */
tradovate.get('/api/tradovate/connect', async (c) => {
  const clientId = c.env.TRADOVATE_CLIENT_ID;
  if (!clientId) {
    return c.text('Tradovate OAuth is not configured on this server.', 500);
  }

  const environment = c.req.query('environment') === 'live' ? 'live' : 'demo';
  const redirectUri = `${c.env.APP_URL}/api/tradovate/callback`;

  const authUrl =
    `https://trader.tradovate.com/oauth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${environment}`;

  return c.redirect(authUrl);
});

/**
 * GET /api/tradovate/callback?code=...&state=demo|live
 * Receives the OAuth authorization code from Tradovate and passes it to the SPA
 * via URL params, where the authenticated client will exchange it.
 * Public endpoint — called by Tradovate's redirect.
 */
tradovate.get('/api/tradovate/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code) {
    return c.redirect('/trades?tv_error=oauth_failed');
  }

  const env = state === 'live' ? 'live' : 'demo';
  return c.redirect(
    `/trades?tv_code=${encodeURIComponent(code)}&tv_env=${env}`,
  );
});

/**
 * POST /api/tradovate/exchange
 * Exchanges an OAuth authorization code for a Tradovate access token and stores it.
 * Called by the client after receiving the code from the callback redirect.
 */
tradovate.post('/api/tradovate/exchange', requiresLogin, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { code, environment } = body as { code?: string; environment?: string };

  if (!code || !environment) {
    return c.json({ error: 'Missing code or environment' }, 400);
  }

  const clientId = c.env.TRADOVATE_CLIENT_ID;
  const clientSecret = c.env.TRADOVATE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return c.json({ error: 'Tradovate OAuth is not configured on this server.' }, 500);
  }

  const redirectUri = `${c.env.APP_URL}/api/tradovate/callback`;

  try {
    const { accessToken, expiresIn } = await TradovateAPI.exchangeOAuthCode({
      code,
      environment,
      clientId,
      clientSecret,
      redirectUri,
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const serviceClient = createServiceClient(c.env);
    await profilesDb.updateById(serviceClient, user.id, {
      tradovateAccessToken: await encrypt(accessToken, c.env.ENCRYPTION_KEY),
      tradovateTokenExpiresAt: expiresAt,
      tradovateEnvironment: environment,
    });

    // Fetch accounts to display in the client after OAuth
    let accounts: Array<{ id: number; name: string; active: boolean }> = [];
    try {
      const api = new TradovateAPI(environment);
      const rawAccounts = (await api.getAccounts(accessToken)) as any[];
      accounts = rawAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        active: a.active !== false,
      }));
    } catch {
      // non-fatal — accounts list is best-effort
    }

    return c.json({ message: 'Tradovate connected successfully', accounts });
  } catch (err: any) {
    console.error('Tradovate OAuth exchange error:', err.message);
    return c.json({ error: `Failed to connect: ${err.message}` }, 400);
  }
});

// POST /api/tradovate/sync
tradovate.post('/api/tradovate/sync', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  const body = await c.req.json().catch(() => ({})) as {
    accountId?: number;
    startDate?: string;
    endDate?: string;
  };
  const accountId = typeof body.accountId === 'number' && Number.isFinite(body.accountId)
    ? body.accountId
    : undefined;
  const { startDate, endDate } = body;

  try {
    const serviceClient = createServiceClient(c.env);
    const profile = await profilesDb.findById(serviceClient, user.id);

    if (!profile || !profile.tradovate_access_token) {
      return c.json({ error: 'Tradovate not connected' }, 400);
    }

    if (
      profile.tradovate_token_expires_at &&
      new Date(profile.tradovate_token_expires_at) < new Date()
    ) {
      return c.json(
        { error: 'Tradovate session expired. Please reconnect your account.', expired: true },
        401,
      );
    }

    const token = await decrypt(profile.tradovate_access_token, c.env.ENCRYPTION_KEY);
    const api = new TradovateAPI(profile.tradovate_environment);

    let fills = accountId
      ? await api.getFillsByAccount(token, accountId)
      : await api.getFills(token);

    // Apply optional date range filter (client-side — Tradovate has no server-side filter)
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate + 'T00:00:00.000Z') : null;
      // endDate is inclusive — include fills up to the end of that calendar day
      const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : null;
      fills = fills.filter((fill) => {
        const t = new Date(fill.timestamp);
        if (start && t < start) return false;
        if (end && t > end) return false;
        return true;
      });
    }

    if (!fills || fills.length === 0) {
      await profilesDb.updateById(serviceClient, user.id, {
        tradovateLastSyncTime: new Date().toISOString(),
      });
      return c.json({ message: 'No fills found', synced: 0 });
    }

    const source = `tradovate_${profile.tradovate_environment}` as
      | 'tradovate_demo'
      | 'tradovate_live';

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

    // Step 1: Aggregate partial fills into orders (keyed by orderId)
    interface OrderData {
      orderId: string;
      contractId: number;
      action: string;
      qty: number;
      price: number; // weighted average
      timestamp: string;
    }
    const orderMap: Record<string, OrderData> = {};
    for (const fill of fills) {
      const orderId = String(fill.orderId || fill.id);
      if (!orderMap[orderId]) {
        orderMap[orderId] = {
          orderId,
          contractId: fill.contractId,
          action: (fill.action || 'Buy').toLowerCase() === 'sell' ? 'Sell' : 'Buy',
          qty: 0,
          price: 0,
          timestamp: fill.timestamp,
        };
      }
      const order = orderMap[orderId];
      const fillQty = fill.qty || 0;
      // Weighted average price across partial fills
      order.price = (order.price * order.qty + (fill.price || 0) * fillQty) / (order.qty + fillQty || 1);
      order.qty += fillQty;
      // Use earliest timestamp
      if (new Date(fill.timestamp) < new Date(order.timestamp)) {
        order.timestamp = fill.timestamp;
      }
    }

    // Step 2: Group orders by contractId, sort chronologically
    const ordersByContract: Record<number, OrderData[]> = {};
    for (const order of Object.values(orderMap)) {
      if (!ordersByContract[order.contractId]) ordersByContract[order.contractId] = [];
      ordersByContract[order.contractId].push(order);
    }
    for (const orders of Object.values(ordersByContract)) {
      orders.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    // Step 3: FIFO matching — pair buy orders with sell orders to form round-trip trades
    // tradovateOrderId = "entryOrderId_exitOrderId" (unique per completed trade)
    interface RoundTrip {
      ticker: string;
      enterTime: string;
      exitTime: string;
      enterPrice: number;
      exitPrice: number;
      quantity: number;
      tradovateOrderId: string;
    }
    const roundTrips: RoundTrip[] = [];

    for (const [contractIdStr, orders] of Object.entries(ordersByContract)) {
      const ticker = String(contractNames[Number(contractIdStr)]).toUpperCase().trim();
      type Lot = { orderId: string; qty: number; price: number; timestamp: string };
      const openLongs: Lot[] = [];
      const openShorts: Lot[] = [];

      for (const order of orders) {
        let remaining = order.qty;

        if (order.action === 'Buy') {
          // Close any open short positions first (FIFO)
          while (remaining > 0 && openShorts.length > 0) {
            const short = openShorts[0];
            const matched = Math.min(remaining, short.qty);
            roundTrips.push({
              ticker,
              enterTime: short.timestamp,
              exitTime: order.timestamp,
              enterPrice: short.price,
              exitPrice: order.price,
              quantity: matched,
              tradovateOrderId: `${short.orderId}_${order.orderId}`,
            });
            short.qty -= matched;
            remaining -= matched;
            if (short.qty === 0) openShorts.shift();
          }
          if (remaining > 0) {
            openLongs.push({ orderId: order.orderId, qty: remaining, price: order.price, timestamp: order.timestamp });
          }
        } else {
          // Close any open long positions first (FIFO)
          while (remaining > 0 && openLongs.length > 0) {
            const long = openLongs[0];
            const matched = Math.min(remaining, long.qty);
            roundTrips.push({
              ticker,
              enterTime: long.timestamp,
              exitTime: order.timestamp,
              enterPrice: long.price,
              exitPrice: order.price,
              quantity: matched,
              tradovateOrderId: `${long.orderId}_${order.orderId}`,
            });
            long.qty -= matched;
            remaining -= matched;
            if (long.qty === 0) openLongs.shift();
          }
          if (remaining > 0) {
            openShorts.push({ orderId: order.orderId, qty: remaining, price: order.price, timestamp: order.timestamp });
          }
        }
      }
    }

    // Step 4: Filter out already-synced round-trip trades
    const allCompositeIds = roundTrips.map((t) => t.tradovateOrderId);
    const existingOrderIds = await tradesDb.findByTradovateOrderIds(supabase, user.id, allCompositeIds);
    const existingIds = new Set(existingOrderIds);

    const newTrades = roundTrips
      .filter((t) => !existingIds.has(t.tradovateOrderId))
      .map((t) => ({ ...t, tradovateSource: source }));

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

    const hasToken = !!profile.tradovate_access_token;
    const tokenExpired =
      hasToken && profile.tradovate_token_expires_at
        ? new Date(profile.tradovate_token_expires_at) < new Date()
        : false;

    return c.json({
      configured: hasToken && !tokenExpired,
      expired: tokenExpired,
      environment: profile.tradovate_environment || 'demo',
      lastSyncTime: profile.tradovate_last_sync_time || null,
    });
  } catch (err: any) {
    console.error('Tradovate status error:', err.message);
    return c.json({ error: 'Failed to get Tradovate status' }, 500);
  }
});

// GET /api/tradovate/accounts
tradovate.get('/api/tradovate/accounts', requiresLogin, async (c) => {
  const user = c.get('user');
  try {
    const serviceClient = createServiceClient(c.env);
    const profile = await profilesDb.findById(serviceClient, user.id);

    if (!profile || !profile.tradovate_access_token) {
      return c.json({ error: 'Tradovate not connected' }, 400);
    }

    if (
      profile.tradovate_token_expires_at &&
      new Date(profile.tradovate_token_expires_at) < new Date()
    ) {
      return c.json({ error: 'Tradovate session expired', expired: true }, 401);
    }

    const token = await decrypt(profile.tradovate_access_token, c.env.ENCRYPTION_KEY);
    const api = new TradovateAPI(profile.tradovate_environment);
    const rawAccounts = (await api.getAccounts(token)) as any[];
    const accounts = rawAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      active: a.active !== false,
    }));

    return c.json({ accounts });
  } catch (err: any) {
    console.error('Tradovate accounts error:', err.message);
    return c.json({ error: 'Failed to fetch accounts' }, 500);
  }
});

// DELETE /api/tradovate/credentials
tradovate.delete('/api/tradovate/credentials', requiresLogin, async (c) => {
  const user = c.get('user');

  try {
    const serviceClient = createServiceClient(c.env);
    await profilesDb.updateById(serviceClient, user.id, {
      tradovateAccessToken: null,
      tradovateTokenExpiresAt: null,
      tradovateEnvironment: 'demo',
      tradovateLastSyncTime: null,
    });

    return c.json({ message: 'Tradovate disconnected' });
  } catch (err: any) {
    console.error('Tradovate disconnect error:', err.message);
    return c.json({ error: 'Failed to disconnect' }, 500);
  }
});

export default tradovate;
