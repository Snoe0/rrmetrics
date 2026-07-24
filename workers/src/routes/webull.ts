import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as brokerDb from '../db/broker-connections';
import * as wbConnDb from '../db/webull-connections';
import * as tradesDb from '../db/trades';
import { encrypt, decrypt } from '../utils/crypto';
import { WebullAPI } from '../services/WebullAPI';
import { buildRoundTrips } from '../utils/round-trip-builder';
import type { BrokerFill } from '../utils/round-trip-builder';
import { requiresLogin } from '../middleware/supabase-auth';
import { createServiceClient } from '../lib/supabase';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const webull = new Hono<HonoEnv>();

/** Generate a cryptographically random nonce for CSRF protection on OAuth. */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Threshold in ms — renew token if it expires within 30 minutes. */
const RENEWAL_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Ensures the stored Webull token is fresh. If the token expires within
 * 30 minutes, it is proactively refreshed using the refresh token and the
 * DB is updated. Returns the decrypted, valid access token.
 * Throws if the token is already fully expired and refresh fails.
 */
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

  // Token still has plenty of time — use as-is
  if (expiresAtMs - now > RENEWAL_THRESHOLD_MS) {
    return token;
  }

  // Token is within the renewal window (or already expired) — attempt refresh
  if (!encryptedRefreshToken || !env.WEBULL_APP_ID || !env.WEBULL_APP_SECRET) {
    if (expiresAtMs > now) return token;
    throw new Error('Webull session expired. Please reconnect your account.');
  }

  try {
    const refreshToken = await decrypt(encryptedRefreshToken, env.ENCRYPTION_KEY);
    const result = await WebullAPI.refreshAccessToken({
      appId: env.WEBULL_APP_ID,
      appSecret: env.WEBULL_APP_SECRET,
      refreshToken,
    });

    const newExpiresAt = new Date(Date.now() + result.expiresIn * 1000).toISOString();
    const serviceClient = createServiceClient(env);
    await wbConnDb.updateByBrokerConnectionId(serviceClient, brokerConnectionId, {
      access_token: await encrypt(result.accessToken, env.ENCRYPTION_KEY),
      refresh_token: await encrypt(result.refreshToken, env.ENCRYPTION_KEY),
      token_expires_at: newExpiresAt,
    });

    return result.accessToken;
  } catch {
    // If refresh fails but token hasn't fully expired yet, use the existing one
    if (expiresAtMs > now) return token;
    throw new Error('Webull session expired and refresh failed. Please reconnect your account.');
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/webull/connect
 * Initiates the Webull OAuth flow. Creates a pending broker_connection +
 * webull_connection with a CSRF nonce, then returns the auth URL for the
 * client to redirect to.
 */
webull.post(
  '/api/webull/connect',
  requiresLogin,
  async (c) => {
    const user = c.get('user');

    const appId = c.env.WEBULL_APP_ID;
    if (!appId) {
      return c.json({ error: 'Webull OAuth is not configured on this server.' }, 500);
    }

    const serviceClient = createServiceClient(c.env);

    const limit = Infinity;

    try {
      // Create parent broker_connection with limit check (returns UUID string)
      const connectionId = await brokerDb.createWithLimitCheck(
        serviceClient,
        user.id,
        'webull',
        'live',
        null, // label auto-generated after exchange
        limit,
      );

      // Generate CSRF nonce and create child webull_connection
      const nonce = generateNonce();
      await wbConnDb.create(serviceClient, connectionId, nonce);

      // Build state: base64(connectionId:nonce)
      const state = btoa(connectionId + ':' + nonce);
      const redirectUri = `${c.env.APP_URL}/api/webull/callback`;
      const authUrl = WebullAPI.getAuthUrl(appId, redirectUri, state);

      return c.json({ authUrl, connectionId });
    } catch (err: any) {
      throw err;
    }
  },
);

/**
 * GET /api/webull/callback?code=...&state=...
 * Receives the OAuth authorization code from Webull.
 * Public endpoint — called by Webull's redirect (no auth context).
 * Validates the CSRF nonce, then redirects to the SPA with code + connectionId.
 */
webull.get('/api/webull/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.redirect('/trades?wb_error=oauth_failed');
  }

  // Decode state -> connectionId:nonce
  let connectionId: string;
  let nonce: string;
  try {
    const decoded = atob(state);
    const separatorIdx = decoded.indexOf(':');
    if (separatorIdx === -1) throw new Error('Invalid state format');
    connectionId = decoded.substring(0, separatorIdx);
    nonce = decoded.substring(separatorIdx + 1);
  } catch {
    return c.redirect('/trades?wb_error=invalid_state');
  }

  // Use service client (no auth context on callback)
  const serviceClient = createServiceClient(c.env);

  // Verify nonce matches
  const wbConn = await wbConnDb.findByBrokerConnectionId(serviceClient, connectionId);
  if (!wbConn || wbConn.oauth_nonce !== nonce) {
    return c.redirect('/trades?wb_error=invalid_nonce');
  }

  // Clear the nonce (one-time use)
  await wbConnDb.updateByBrokerConnectionId(serviceClient, connectionId, {
    oauth_nonce: null,
  });

  return c.redirect(
    `/trades?webull_code=${encodeURIComponent(code)}&webull_connection=${encodeURIComponent(connectionId)}`,
  );
});

/**
 * POST /api/webull/exchange
 * Exchanges an OAuth authorization code for Webull access and refresh tokens.
 * Called by the client after receiving the code from the callback redirect.
 */
webull.post('/api/webull/exchange', requiresLogin, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { code, connectionId } = body as { code?: string; connectionId?: string };

  if (!code || !connectionId) {
    return c.json({ error: 'Missing code or connectionId' }, 400);
  }

  const appId = c.env.WEBULL_APP_ID;
  const appSecret = c.env.WEBULL_APP_SECRET;
  if (!appId || !appSecret) {
    return c.json({ error: 'Webull OAuth is not configured on this server.' }, 500);
  }

  const serviceClient = createServiceClient(c.env);

  // Verify connection ownership
  const brokerConn = await brokerDb.findById(serviceClient, connectionId);
  if (!brokerConn || brokerConn.owner !== user.id) {
    return c.json({ error: 'Connection not found' }, 404);
  }

  const redirectUri = `${c.env.APP_URL}/api/webull/callback`;

  try {
    const { accessToken, refreshToken, expiresIn } = await WebullAPI.exchangeOAuthCode({
      appId,
      appSecret,
      code,
      redirectUri,
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Encrypt and store tokens
    await wbConnDb.updateByBrokerConnectionId(serviceClient, connectionId, {
      access_token: await encrypt(accessToken, c.env.ENCRYPTION_KEY),
      refresh_token: await encrypt(refreshToken, c.env.ENCRYPTION_KEY),
      token_expires_at: expiresAt,
    });

    // Fetch accounts and store first account_id
    let accounts: Array<{ accountId: string; accountType: string; currency: string }> = [];
    try {
      accounts = await WebullAPI.getAccounts(accessToken);

      if (accounts.length > 0) {
        await wbConnDb.updateByBrokerConnectionId(serviceClient, connectionId, {
          account_id: accounts[0].accountId,
        });

        // Auto-generate label
        const label = `Webull — ${accounts[0].accountId}`;
        await brokerDb.updateById(serviceClient, connectionId, { label });
      }
    } catch {
      // non-fatal — account fetch is best-effort
    }

    return c.json({ message: 'Webull connected successfully', accounts, connectionId });
  } catch (err: any) {
    // Clean up the pending connection on failure
    try {
      await brokerDb.deleteById(serviceClient, connectionId, user.id);
    } catch {
      // cleanup is best-effort
    }
    return c.json({ error: `Failed to connect: ${err.message}` }, 400);
  }
});

/**
 * GET /api/webull/status
 * Returns all Webull connections for the user with their status,
 * plus overall connection usage and limits.
 */
webull.get(
  '/api/webull/status',
  requiresLogin,
  async (c) => {
    const user = c.get('user');
    const serviceClient = createServiceClient(c.env);

    // Fetch all Webull connections for user
    const brokerConns = await brokerDb.findByOwnerAndBroker(serviceClient, user.id, 'webull');

    // Total count across ALL brokers for limit tracking
    const totalCount = await brokerDb.countByOwner(serviceClient, user.id);


    // Build status for each connection
    const connections = [];
    for (const bc of brokerConns) {
      const wbConn = await wbConnDb.findByBrokerConnectionId(serviceClient, bc.id);
      const hasToken = !!wbConn?.access_token;

      // Token was cleared but connection still exists
      const wasExpired = !hasToken && !!wbConn?.token_expires_at;

      let tokenExpired = wasExpired;
      if (hasToken && wbConn) {
        try {
          await ensureFreshToken(
            c.env,
            bc.id,
            wbConn.access_token!,
            wbConn.refresh_token,
            wbConn.token_expires_at,
          );
        } catch {
          tokenExpired = true;
        }
      }

      // Fetch accounts for active connections
      let accounts: Array<{ accountId: string; accountType: string; currency: string }> = [];
      if (hasToken && !tokenExpired && wbConn) {
        try {
          const token = await decrypt(wbConn.access_token!, c.env.ENCRYPTION_KEY);
          accounts = await WebullAPI.getAccounts(token);
        } catch {
          // non-fatal — accounts list is best-effort
        }
      }

      connections.push({
        connectionId: bc.id,
        broker: bc.broker,
        environment: bc.environment,
        label: bc.label,
        configured: hasToken && !tokenExpired,
        expired: tokenExpired,
        lastSyncTime: bc.last_sync_time,
        createdAt: bc.created_at,
        accounts,
        accountId: wbConn?.account_id || null,
      });
    }

    return c.json({
      connections,
      connectionsUsed: totalCount,
      connectionLimit: null,
      canUseBrokerSync: true,
    });
  },
);

/**
 * POST /api/webull/sync
 * Syncs trades for a single Webull connection.
 * Fetches filled orders -> converts to BrokerFills -> builds round trips -> dedup -> insert.
 */
webull.post(
  '/api/webull/sync',
  requiresLogin,
  async (c) => {
    const user = c.get('user');
    const supabase = c.get('supabase');

    const body = await c.req.json().catch(() => ({})) as {
      connectionId?: string;
      startDate?: string;
    };

    const { connectionId, startDate } = body;
    if (!connectionId) {
      return c.json({ error: 'Missing connectionId' }, 400);
    }

    const serviceClient = createServiceClient(c.env);

    // Load connection data
    const brokerConn = await brokerDb.findById(serviceClient, connectionId);
    if (!brokerConn || brokerConn.owner !== user.id) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const wbConn = await wbConnDb.findByBrokerConnectionId(serviceClient, connectionId);
    if (!wbConn || !wbConn.access_token) {
      return c.json({ error: 'Webull not connected for this connection' }, 400);
    }

    try {
      // Ensure fresh token
      const token = await ensureFreshToken(
        c.env,
        connectionId,
        wbConn.access_token,
        wbConn.refresh_token,
        wbConn.token_expires_at,
      );

      const accountId = wbConn.account_id;
      if (!accountId) {
        return c.json({ error: 'No Webull account linked. Please reconnect.' }, 400);
      }

      // Fetch filled orders
      const orders = await WebullAPI.getOrders(token, accountId, startDate);

      if (orders.length === 0) {
        await brokerDb.updateById(serviceClient, connectionId, {
          last_sync_time: new Date().toISOString(),
        });
        return c.json({ message: 'Synced 0 new trades', synced: 0 });
      }

      // Convert orders to BrokerFill format for round-trip builder
      const fills: BrokerFill[] = orders.map((o) => ({
        timestamp: o.filledTime || o.createTime,
        side: o.side === 'BUY' ? 'buy' as const : 'sell' as const,
        qty: o.filledQty,
        price: o.avgFilledPrice,
        orderId: o.orderId,
        ticker: o.ticker.toUpperCase(),
      }));

      // Build round trips using FIFO matching
      const roundTrips = buildRoundTrips(fills);

      if (roundTrips.length === 0) {
        await brokerDb.updateById(serviceClient, connectionId, {
          last_sync_time: new Date().toISOString(),
        });
        return c.json({ message: 'Synced 0 new trades', synced: 0 });
      }

      // Dedup: check existing webull_order_ids
      const allOrderIds = roundTrips.map((rt) => rt.brokerOrderId);
      const existingOrderIds = await tradesDb.findByWebullOrderIds(supabase, user.id, allOrderIds);
      const existingIds = new Set(existingOrderIds);

      const newTrades = roundTrips
        .filter((rt) => !existingIds.has(rt.brokerOrderId))
        .map((rt) => ({
          ticker: rt.ticker,
          enterTime: rt.enterTime,
          exitTime: rt.exitTime,
          enterPrice: rt.enterPrice,
          exitPrice: rt.exitPrice,
          quantity: rt.quantity,
          webullOrderId: rt.brokerOrderId,
          brokerConnectionId: connectionId,
        }));

      let syncedCount = 0;
      if (newTrades.length > 0) {
        const result = await tradesDb.bulkInsertTrades(supabase, user.id, newTrades);
        syncedCount = result.imported;
      }

      await brokerDb.updateById(serviceClient, connectionId, {
        last_sync_time: new Date().toISOString(),
      });

      return c.json({ message: `Synced ${syncedCount} new trades`, synced: syncedCount });
    } catch (err: any) {
      if (err.message.includes('expired')) {
        return c.json({ error: err.message, expired: true }, 401);
      }
      return c.json({ error: `Sync failed: ${err.message}` }, 500);
    }
  },
);

/**
 * DELETE /api/webull/connections/:connectionId
 * Deletes a broker connection and its child webull_connection (cascade).
 */
webull.delete(
  '/api/webull/connections/:connectionId',
  requiresLogin,
  async (c) => {
    const user = c.get('user');
    const connectionId = c.req.param('connectionId');
    const serviceClient = createServiceClient(c.env);

    try {
      await brokerDb.deleteById(serviceClient, connectionId, user.id);
      return c.json({ message: 'Connection deleted' });
    } catch (err: any) {
      return c.json({ error: `Failed to delete connection: ${err.message}` }, 500);
    }
  },
);

export default webull;
