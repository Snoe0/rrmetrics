import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as brokerDb from '../db/broker-connections';
import * as rhConnDb from '../db/robinhood-connections';
import * as tradesDb from '../db/trades';
import { encrypt, decrypt } from '../utils/crypto';
import { RobinhoodAPI } from '../services/RobinhoodAPI';
import { buildRoundTrips } from '../utils/round-trip-builder';
import type { BrokerFill } from '../utils/round-trip-builder';
import { requiresLogin } from '../middleware/supabase-auth';
import { requiresDeveloper } from '../middleware/developer-auth';
import { checkSubscriptionStatus, requiresBrokerSync, BROKER_CONNECTION_LIMITS } from '../middleware/subscription';
import { createServiceClient } from '../lib/supabase';
import type { EffectivePlan } from '../middleware/subscription';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const robinhood = new Hono<HonoEnv>();

// ─── Token refresh helper ────────────────────────────────────────────────────

const RENEWAL_THRESHOLD_MS = 30 * 60 * 1000;

async function ensureFreshToken(
  env: Env,
  brokerConnectionId: string,
  encryptedToken: string,
  encryptedRefreshToken: string | null,
  expiresAt: string | null,
): Promise<string> {
  const token = await decrypt(encryptedToken, env.ENCRYPTION_KEY);
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  const now = Date.now();

  if (expiresAtMs - now > RENEWAL_THRESHOLD_MS) return token;

  if (!encryptedRefreshToken) {
    if (expiresAtMs > now) return token;
    throw new Error('Robinhood session expired. Please reconnect your account.');
  }

  try {
    const refreshToken = await decrypt(encryptedRefreshToken, env.ENCRYPTION_KEY);
    const result = await RobinhoodAPI.refreshAccessToken(refreshToken);
    const newExpiresAt = new Date(Date.now() + result.expiresIn * 1000).toISOString();
    const serviceClient = createServiceClient(env);
    await rhConnDb.updateByBrokerConnectionId(serviceClient, brokerConnectionId, {
      access_token: await encrypt(result.accessToken, env.ENCRYPTION_KEY),
      refresh_token: await encrypt(result.refreshToken, env.ENCRYPTION_KEY),
      token_expires_at: newExpiresAt,
    });
    return result.accessToken;
  } catch {
    if (expiresAtMs > now) return token;
    throw new Error('Robinhood session expired and refresh failed. Please reconnect your account.');
  }
}

// ─── POST /api/robinhood/connect ─────────────────────────────────────────────

robinhood.post(
  '/api/robinhood/connect',
  requiresLogin,
  requiresDeveloper,
  checkSubscriptionStatus,
  requiresBrokerSync,
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const serviceClient = createServiceClient(c.env);

    // Determine connection limit for user's plan
    const status = c.get('subscriptionStatus' as any) as { effectivePlan: EffectivePlan } | undefined;
    const plan = status?.effectivePlan || 'free';
    const limit = BROKER_CONNECTION_LIMITS[plan];

    try {
      // Generate a device token (UUID v4) for this connection
      const deviceToken = crypto.randomUUID();

      // Authenticate — credentials are used once and never stored
      const authResult = await RobinhoodAPI.authenticate(email, password, deviceToken);

      // Fetch accounts to get account number for label
      const accounts = await RobinhoodAPI.getAccounts(authResult.accessToken);
      const accountNumber = accounts.length > 0 ? accounts[0].account_number : 'Unknown';

      // Create parent broker_connection with limit check
      let connectionId: string;
      try {
        connectionId = await brokerDb.createWithLimitCheck(
          serviceClient,
          user.id,
          'robinhood',
          'live',
          `Robinhood \u2014 ${accountNumber}`,
          limit,
        );
      } catch (err: any) {
        if (err.message === 'CONNECTION_LIMIT_REACHED') {
          return c.json(
            {
              error: 'You have reached your broker connection limit. Upgrade your plan for more connections.',
              upgrade: true,
              limit,
            },
            402,
          );
        }
        throw err;
      }

      // Create child robinhood_connection with encrypted tokens
      const expiresAt = new Date(Date.now() + authResult.expiresIn * 1000).toISOString();
      await rhConnDb.create(serviceClient, connectionId, {
        access_token: await encrypt(authResult.accessToken, c.env.ENCRYPTION_KEY),
        refresh_token: await encrypt(authResult.refreshToken, c.env.ENCRYPTION_KEY),
        token_expires_at: expiresAt,
        account_id: accounts.length > 0 ? accounts[0].account_number : undefined,
        device_token: await encrypt(deviceToken, c.env.ENCRYPTION_KEY),
      });

      return c.json({ message: 'Connected successfully', connectionId, accounts });
    } catch (err: any) {
      console.error('Robinhood connect error:', err.message);
      return c.json({ error: `Failed to connect: ${err.message}` }, 400);
    }
  },
);

// ─── GET /api/robinhood/status ───────────────────────────────────────────────

robinhood.get(
  '/api/robinhood/status',
  requiresLogin,
  requiresDeveloper,
  checkSubscriptionStatus,
  async (c) => {
    const user = c.get('user');
    const serviceClient = createServiceClient(c.env);

    try {
      // Fetch all Robinhood connections for user
      const brokerConns = await brokerDb.findByOwnerAndBroker(serviceClient, user.id, 'robinhood');

      // Total count across ALL brokers for limit tracking
      const totalCount = await brokerDb.countByOwner(serviceClient, user.id);

      // Determine plan and limits
      const subStatus = c.get('subscriptionStatus' as any) as { effectivePlan: EffectivePlan } | undefined;
      const plan = subStatus?.effectivePlan || 'free';
      const limit = BROKER_CONNECTION_LIMITS[plan];
      const canUseBrokerSync = plan === 'pro' || plan === 'elite';

      // Build status for each connection
      const connections = [];
      for (const bc of brokerConns) {
        const rhConn = await rhConnDb.findByBrokerConnectionId(serviceClient, bc.id);
        const hasToken = !!rhConn?.access_token;

        let tokenExpired = false;
        if (hasToken && rhConn?.token_expires_at) {
          tokenExpired = new Date(rhConn.token_expires_at) < new Date();
        }

        // Try to refresh if expiring soon
        let tokenFresh = hasToken && !tokenExpired;
        if (hasToken && rhConn) {
          try {
            await ensureFreshToken(
              c.env,
              bc.id,
              rhConn.access_token!,
              rhConn.refresh_token || null,
              rhConn.token_expires_at,
            );
            tokenFresh = true;
            tokenExpired = false;
          } catch {
            // Token refresh failed, report current state
          }
        }

        connections.push({
          connectionId: bc.id,
          environment: bc.environment,
          label: bc.label,
          configured: tokenFresh,
          expired: hasToken && tokenExpired,
          accountId: rhConn?.account_id || null,
          lastSyncTime: bc.last_sync_time,
        });
      }

      return c.json({
        connections,
        connectionsUsed: totalCount,
        connectionLimit: limit === Infinity ? null : limit,
        plan,
        canUseBrokerSync,
      });
    } catch (err: any) {
      console.error('Robinhood status error:', err.message);
      return c.json({ error: 'Failed to get Robinhood status' }, 500);
    }
  },
);

// ─── POST /api/robinhood/sync ────────────────────────────────────────────────

robinhood.post(
  '/api/robinhood/sync',
  requiresLogin,
  requiresDeveloper,
  checkSubscriptionStatus,
  requiresBrokerSync,
  async (c) => {
    const user = c.get('user');
    const supabase = c.get('supabase');
    const body = await c.req.json();
    const { connectionId } = body as { connectionId?: string };

    if (!connectionId) {
      return c.json({ error: 'Missing connectionId' }, 400);
    }

    try {
      const serviceClient = createServiceClient(c.env);

      // Load connection data
      const brokerConn = await brokerDb.findById(serviceClient, connectionId);
      if (!brokerConn || brokerConn.owner !== user.id) {
        return c.json({ error: 'Connection not found' }, 404);
      }

      const rhConn = await rhConnDb.findByBrokerConnectionId(serviceClient, connectionId);
      if (!rhConn || !rhConn.access_token) {
        return c.json({ error: 'Robinhood not connected for this connection' }, 400);
      }

      // Ensure fresh token
      const token = await ensureFreshToken(
        c.env,
        connectionId,
        rhConn.access_token,
        rhConn.refresh_token || null,
        rhConn.token_expires_at,
      );

      // Fetch filled orders since last sync
      const updatedSince = brokerConn.last_sync_time || undefined;
      const orders = await RobinhoodAPI.getOrders(token, updatedSince);

      if (orders.length === 0) {
        await brokerDb.updateById(serviceClient, connectionId, {
          last_sync_time: new Date().toISOString(),
        });
        return c.json({ message: 'No new trades found', synced: 0 });
      }

      // Resolve instrument URLs to ticker symbols (batch + cache)
      const instrumentCache = new Map<string, string>();
      const uniqueInstrumentUrls = [...new Set(orders.map((o) => o.instrument))];

      await Promise.all(
        uniqueInstrumentUrls.map(async (url) => {
          try {
            const instrument = await RobinhoodAPI.getInstrument(token, url);
            instrumentCache.set(url, instrument.symbol);
          } catch {
            // Fall back to URL as identifier
            instrumentCache.set(url, url);
          }
        }),
      );

      // Convert orders to BrokerFill[] for round-trip matching
      const fills: BrokerFill[] = [];
      for (const order of orders) {
        const ticker = instrumentCache.get(order.instrument) || 'UNKNOWN';

        if (order.executions && order.executions.length > 0) {
          // Use individual executions for accurate fill prices/quantities
          for (const exec of order.executions) {
            fills.push({
              timestamp: exec.timestamp,
              side: order.side,
              qty: parseFloat(exec.quantity),
              price: parseFloat(exec.price),
              orderId: order.id,
              ticker,
            });
          }
        } else {
          // Fallback: use order-level data
          const price = order.average_price || order.price;
          if (!price) continue;

          fills.push({
            timestamp: order.last_transaction_at || order.updated_at || order.created_at,
            side: order.side,
            qty: parseFloat(order.cumulative_quantity || order.quantity),
            price: parseFloat(price),
            orderId: order.id,
            ticker,
          });
        }
      }

      // Build round-trip trades via FIFO matching
      const roundTrips = buildRoundTrips(fills);

      if (roundTrips.length === 0) {
        await brokerDb.updateById(serviceClient, connectionId, {
          last_sync_time: new Date().toISOString(),
        });
        return c.json({ message: 'No completed round-trip trades found', synced: 0 });
      }

      // Dedup: check which robinhood order IDs already exist
      const orderIds = roundTrips.map((rt) => rt.brokerOrderId);
      const existingIds = new Set(
        await tradesDb.findByRobinhoodOrderIds(supabase, user.id, orderIds),
      );

      const newRoundTrips = roundTrips.filter((rt) => !existingIds.has(rt.brokerOrderId));

      if (newRoundTrips.length === 0) {
        await brokerDb.updateById(serviceClient, connectionId, {
          last_sync_time: new Date().toISOString(),
        });
        return c.json({ message: 'No new trades found', synced: 0 });
      }

      // Build trade objects for bulk insert
      const tradesToInsert = newRoundTrips.map((rt) => ({
        ticker: rt.ticker,
        enterTime: rt.enterTime,
        exitTime: rt.exitTime,
        enterPrice: rt.enterPrice,
        exitPrice: rt.exitPrice,
        quantity: rt.quantity,
        robinhoodOrderId: rt.brokerOrderId,
        brokerConnectionId: connectionId,
      }));

      const result = await tradesDb.bulkInsertTrades(supabase, user.id, tradesToInsert);

      await brokerDb.updateById(serviceClient, connectionId, {
        last_sync_time: new Date().toISOString(),
      });

      return c.json({ message: `Synced ${result.imported} new trades`, synced: result.imported });
    } catch (err: any) {
      console.error('Robinhood sync error:', err.message);
      return c.json({ error: `Sync failed: ${err.message}` }, 500);
    }
  },
);

// ─── DELETE /api/robinhood/connections/:id ────────────────────────────────────

robinhood.delete(
  '/api/robinhood/connections/:id',
  requiresLogin,
  requiresDeveloper,
  async (c) => {
    const user = c.get('user');
    const connectionId = c.req.param('id');
    const serviceClient = createServiceClient(c.env);

    try {
      await brokerDb.deleteById(serviceClient, connectionId, user.id);
      return c.json({ message: 'Connection deleted' });
    } catch (err: any) {
      return c.json({ error: `Failed to delete connection: ${err.message}` }, 500);
    }
  },
);

export default robinhood;
