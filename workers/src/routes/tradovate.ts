import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env, AuthContext } from '../bindings';
import * as brokerDb from '../db/broker-connections';
import * as tvConnDb from '../db/tradovate-connections';
import * as tradesDb from '../db/trades';
import { encrypt, decrypt } from '../utils/crypto';
import { TradovateAPI } from '../services/TradovateAPI';
import { requiresLogin } from '../middleware/supabase-auth';
import { checkSubscriptionStatus, requiresBrokerSync, BROKER_CONNECTION_LIMITS } from '../middleware/subscription';
import { createServiceClient } from '../lib/supabase';
import type { EffectivePlan } from '../middleware/subscription';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

/** All broker types that use the Tradovate OAuth + API infrastructure. */
const TRADOVATE_COMPATIBLE_BROKERS = ['tradovate', 'ninjatrader', 'alpha_futures', 'apex_trader_funding'] as const;
type TradovateBrokerType = typeof TRADOVATE_COMPATIBLE_BROKERS[number];

/** Human-readable labels for broker-aware messages. */
const BROKER_LABELS: Record<string, string> = {
  tradovate: 'Tradovate',
  ninjatrader: 'NinjaTrader',
  alpha_futures: 'Alpha Futures',
  apex_trader_funding: 'Apex Trader Funding',
};

function isValidTradovateBroker(broker: string): broker is TradovateBrokerType {
  return (TRADOVATE_COMPATIBLE_BROKERS as readonly string[]).includes(broker);
}

const tradovate = new Hono<HonoEnv>();

/** Threshold in ms — renew token if it expires within 30 minutes. */
const RENEWAL_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Ensures the stored Tradovate token is fresh. If the token expires within
 * 30 minutes, it is proactively renewed and the DB is updated.
 * Returns the decrypted, valid access token.
 * Throws if the token is already fully expired (past expiry and renewal fails).
 */
async function ensureFreshToken(
  env: Env,
  brokerConnectionId: string,
  encryptedToken: string,
  expiresAt: string | null,
  environment: string,
): Promise<string> {
  const token = await decrypt(encryptedToken, env.ENCRYPTION_KEY);
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  const now = Date.now();

  // Token still has plenty of time — use as-is
  if (expiresAtMs - now > RENEWAL_THRESHOLD_MS) {
    return token;
  }

  // Token is within the renewal window (or already expired) — attempt renewal
  const api = new TradovateAPI(environment);
  try {
    const { accessToken, expiresIn } = await api.renewAccessToken(token);
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const serviceClient = createServiceClient(env);
    await tvConnDb.updateByBrokerConnectionId(serviceClient, brokerConnectionId, {
      access_token: await encrypt(accessToken, env.ENCRYPTION_KEY),
      token_expires_at: newExpiresAt,
    });

    return accessToken;
  } catch (err: any) {
    // If renewal fails but token hasn't fully expired yet, use the existing one
    if (expiresAtMs > now) {
      return token;
    }
    throw new Error('Tradovate session expired and renewal failed. Please reconnect your account.');
  }
}

/**
 * Strips the CME expiry suffix (month code + 1–4 digit year) from a contract name.
 * "MNQH2026" → "MNQ", "MNQH26" → "MNQ", "MNQH6" → "MNQ"
 * "NQH6" → "NQ", "ESH6" → "ES", "CLJ6" → "CL"
 * CME month codes: F G H J K M N Q U V X Z
 * Returns the original string unchanged if no suffix matches.
 */
function rootSymbol(name: string): string {
  return name.replace(/[FGHJKMNQUVXZ]\d{1,4}$/, '') || name;
}

/** Generate a cryptographically random nonce for CSRF protection on OAuth. */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Core sync pipeline for a single Tradovate connection.
 * Fetches fill pairs → positions → contracts → round trips → dedup → insert.
 * Returns the number of new trades synced.
 */
async function syncConnection(
  env: Env,
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  options?: { accountIds?: number[]; startDate?: string; endDate?: string },
): Promise<number> {
  const serviceClient = createServiceClient(env);

  // Load connection data
  const brokerConn = await brokerDb.findById(serviceClient, connectionId);
  if (!brokerConn || brokerConn.owner !== userId) {
    throw new Error('Connection not found');
  }

  const tvConn = await tvConnDb.findByBrokerConnectionId(serviceClient, connectionId);
  if (!tvConn || !tvConn.access_token) {
    throw new Error('Tradovate not connected for this connection');
  }

  // Ensure fresh token
  const token = await ensureFreshToken(
    env,
    connectionId,
    tvConn.access_token,
    tvConn.token_expires_at,
    brokerConn.environment,
  );

  const api = new TradovateAPI(brokerConn.environment);

  // Step 1: Get all fill pairs — each FillPair is one completed buy+sell round-trip
  const allFillPairs = await api.getFillPairs(token);

  if (allFillPairs.length === 0) {
    await brokerDb.updateById(serviceClient, connectionId, {
      last_sync_time: new Date().toISOString(),
    });
    return 0;
  }

  // Step 2: Batch-fetch the positions referenced by those fill pairs.
  const uniquePositionIds = [...new Set(allFillPairs.map((fp) => fp.positionId))];
  const allPositions = await api.getPositionItems(token, uniquePositionIds);

  // Filter positions by selected account IDs
  // Priority: explicit accountIds from request > saved selected_accounts > all accounts
  const accountIds = options?.accountIds || tvConn.selected_accounts || [];
  const positions = accountIds.length > 0
    ? allPositions.filter((p) => accountIds.includes(p.accountId))
    : allPositions;

  const positionIdSet = new Set(positions.map((p) => p.id));

  // Keep only fill pairs that belong to the selected account(s)
  const targetedPairs = allFillPairs.filter((fp) => positionIdSet.has(fp.positionId));

  if (targetedPairs.length === 0) {
    await brokerDb.updateById(serviceClient, connectionId, {
      last_sync_time: new Date().toISOString(),
    });
    return 0;
  }

  // Step 3: Batch-fetch fills to get entry/exit timestamps and orderId for dedup key.
  const allFillIds = [...new Set(targetedPairs.flatMap((fp) => [fp.buyFillId, fp.sellFillId]))];
  const fills = (await api.getFillItems(token, allFillIds)) as any[];
  const fillMap = new Map(fills.map((f: any) => [f.id, f]));

  // Build a contractId → ticker map from any embedded name fields in raw fill responses
  const contractNameFromFill: Record<number, string> = {};
  for (const f of fills) {
    const cid: number | undefined = f.contractId;
    if (cid !== undefined && !contractNameFromFill[cid]) {
      const embedded: string | undefined =
        f.contractName ?? f.ticker ?? f.symbol ?? f.contract?.name ?? f.contract?.ticker;
      if (embedded) contractNameFromFill[cid] = embedded;
    }
  }

  // Step 4: Batch-fetch contract names from ContractLibrary.
  const contractIds = [...new Set(positions.map((p) => p.contractId))];
  const contractNameMap = new Map<number, string>(
    Object.entries(contractNameFromFill).map(([k, v]) => [Number(k), v]),
  );
  try {
    const contracts = await api.getContractItems(token, contractIds);
    for (const ct of contracts) {
      if (ct.name) contractNameMap.set(Number(ct.id), ct.name);
    }
  } catch {
    // Contract name lookup failed — fall back to fill-embedded names or numeric IDs
  }

  const posContractMap = new Map(positions.map((p) => [p.id, p.contractId]));

  // Build positionId → accountId map so we can tag trades with their source account
  const posAccountMap = new Map(positions.map((p) => [p.id, p.accountId as number]));

  // Fetch account names for labeling
  const accountNameMap = new Map<number, string>();
  try {
    const rawAccounts = (await api.getAccounts(token)) as any[];
    for (const a of rawAccounts) {
      if (a.id && a.name) accountNameMap.set(a.id, a.name);
    }
  } catch {
    // non-fatal — fall back to numeric account IDs
  }

  const source = `${brokerConn.broker}_${brokerConn.environment}`;

  // Step 5: Map each fillPair to a round-trip trade record
  interface RoundTrip {
    ticker: string;
    enterTime: string;
    exitTime: string;
    enterPrice: number;
    exitPrice: number;
    quantity: number;
    tradovateOrderId: string;
    comments?: string;
    account?: string | null;
  }
  const roundTrips: RoundTrip[] = [];

  for (const fp of targetedPairs) {
    const contractId = posContractMap.get(fp.positionId);
    const contractName =
      contractId !== undefined
        ? (contractNameMap.get(contractId) ?? String(contractId))
        : 'UNKNOWN';
    const ticker = rootSymbol(contractName.toUpperCase().trim());

    const buyFill = fillMap.get(fp.buyFillId);
    const sellFill = fillMap.get(fp.sellFillId);

    if (!buyFill || !sellFill) continue;

    const buyTime = new Date(buyFill.timestamp).getTime();
    const sellTime = new Date(sellFill.timestamp).getTime();

    const isLong = buyTime <= sellTime;
    const entryFill = isLong ? buyFill : sellFill;
    const exitFill = isLong ? sellFill : buyFill;

    const tradovateOrderId = `${entryFill.orderId}_${exitFill.orderId}`;

    const acctId = posAccountMap.get(fp.positionId);
    const acctLabel = acctId !== undefined
      ? (accountNameMap.get(acctId) ?? String(acctId))
      : undefined;

    roundTrips.push({
      ticker,
      enterTime: entryFill.timestamp,
      exitTime: exitFill.timestamp,
      enterPrice: isLong ? fp.buyPrice : fp.sellPrice,
      exitPrice: isLong ? fp.sellPrice : fp.buyPrice,
      quantity: isLong ? fp.qty : -fp.qty,
      tradovateOrderId,
      account: acctLabel || null,
    });
  }

  // Step 5b: Merge trades with entry/exit times within 2 seconds and same account.
  // Combines quantities and averages prices (quantity-weighted).
  const MERGE_THRESHOLD_MS = 2000;
  const mergeGroups = new Map<string, RoundTrip[]>();
  for (const t of roundTrips) {
    const enterMs = new Date(t.enterTime).getTime();
    const exitMs = new Date(t.exitTime).getTime();
    const acct = t.account ?? '';
    let merged = false;
    // Try to find an existing group this trade belongs to
    for (const [, group] of mergeGroups) {
      const ref = group[0];
      if ((ref.account ?? '') !== acct) continue;
      const refEnterMs = new Date(ref.enterTime).getTime();
      const refExitMs = new Date(ref.exitTime).getTime();
      if (Math.abs(enterMs - refEnterMs) <= MERGE_THRESHOLD_MS &&
          Math.abs(exitMs - refExitMs) <= MERGE_THRESHOLD_MS) {
        group.push(t);
        merged = true;
        break;
      }
    }
    if (!merged) {
      mergeGroups.set(`${enterMs}|${exitMs}|${acct}|${mergeGroups.size}`, [t]);
    }
  }
  const mergedTrips: RoundTrip[] = [];
  for (const group of mergeGroups.values()) {
    if (group.length === 1) {
      mergedTrips.push(group[0]);
    } else {
      const totalQty = group.reduce((s, t) => s + Math.abs(t.quantity), 0);
      const avgExitPrice = totalQty > 0
        ? group.reduce((s, t) => s + t.exitPrice * Math.abs(t.quantity), 0) / totalQty
        : group.reduce((s, t) => s + t.exitPrice, 0) / group.length;
      const avgEnterPrice = totalQty > 0
        ? group.reduce((s, t) => s + t.enterPrice * Math.abs(t.quantity), 0) / totalQty
        : group.reduce((s, t) => s + t.enterPrice, 0) / group.length;
      const combinedOrderId = group.map(t => t.tradovateOrderId).sort().join('+');
      const sumQty = group.reduce((s, t) => s + t.quantity, 0);
      mergedTrips.push({
        ...group[0],
        enterPrice: avgEnterPrice,
        exitPrice: avgExitPrice,
        quantity: sumQty,
        tradovateOrderId: combinedOrderId,
      });
    }
  }

  // Step 6: Apply optional date range filter on entry time
  let filteredTrips = mergedTrips;
  const { startDate, endDate } = options || {};
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate + 'T00:00:00.000Z') : null;
    const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : null;
    filteredTrips = roundTrips.filter((t) => {
      const entryTime = new Date(t.enterTime);
      if (start && entryTime < start) return false;
      if (end && entryTime > end) return false;
      return true;
    });
  }

  if (filteredTrips.length === 0) {
    await brokerDb.updateById(serviceClient, connectionId, {
      last_sync_time: new Date().toISOString(),
    });
    return 0;
  }

  // Step 7: Skip already-synced trades
  const allCompositeIds = filteredTrips.map((t) => t.tradovateOrderId);
  const existingOrderIds = await tradesDb.findByTradovateOrderIds(supabase, userId, allCompositeIds);
  const existingIds = new Set(existingOrderIds);

  const newTrades = filteredTrips
    .filter((t) => !existingIds.has(t.tradovateOrderId))
    .map((t) => ({
      ...t,
      tradovateSource: source,
      brokerConnectionId: connectionId,
    }));

  let syncedCount = 0;
  if (newTrades.length > 0) {
    const result = await tradesDb.bulkInsertTrades(supabase, userId, newTrades);
    syncedCount = result.imported;
  }

  await brokerDb.updateById(serviceClient, connectionId, {
    last_sync_time: new Date().toISOString(),
  });

  return syncedCount;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/tradovate/connect
 * Initiates the Tradovate OAuth flow. Creates a pending broker_connection +
 * tradovate_connection with a CSRF nonce, then returns the auth URL for the
 * client to redirect to.
 */
tradovate.post(
  '/api/tradovate/connect',
  requiresLogin,
  checkSubscriptionStatus,
  requiresBrokerSync,
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({})) as { environment?: string; broker?: string };
    const environment = body.environment === 'live' ? 'live' : 'demo';
    const broker = body.broker && isValidTradovateBroker(body.broker) ? body.broker : 'tradovate';

    const clientId = c.env.TRADOVATE_CLIENT_ID;
    if (!clientId) {
      return c.json({ error: 'Tradovate OAuth is not configured on this server.' }, 500);
    }

    const serviceClient = createServiceClient(c.env);

    // Determine connection limit for user's plan
    const status = c.get('subscriptionStatus' as any) as { effectivePlan: EffectivePlan } | undefined;
    const plan = status?.effectivePlan || 'free';
    const limit = BROKER_CONNECTION_LIMITS[plan];

    try {
      // Create parent broker_connection with limit check (returns UUID string)
      const connectionId = await brokerDb.createWithLimitCheck(
        serviceClient,
        user.id,
        broker,
        environment,
        null, // label auto-generated after exchange
        limit,
      );

      // Generate CSRF nonce and create child tradovate_connection
      const nonce = generateNonce();
      await tvConnDb.create(serviceClient, connectionId, nonce);

      // Build state: base64(connectionId:nonce)
      const state = btoa(connectionId + ':' + nonce);
      const redirectUri = `${c.env.APP_URL}/api/tradovate/callback`;

      const authUrl =
        `https://trader.tradovate.com/oauth` +
        `?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`;

      return c.json({ authUrl, connectionId });
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
  },
);

/**
 * GET /api/tradovate/callback?code=...&state=...
 * Receives the OAuth authorization code from Tradovate.
 * Public endpoint — called by Tradovate's redirect (no auth context).
 * Validates the CSRF nonce, then redirects to the SPA with code + connectionId.
 */
tradovate.get('/api/tradovate/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.redirect('/trades?tv_error=oauth_failed');
  }

  // Decode state → connectionId:nonce
  let connectionId: string;
  let nonce: string;
  try {
    const decoded = atob(state);
    const separatorIdx = decoded.indexOf(':');
    if (separatorIdx === -1) throw new Error('Invalid state format');
    connectionId = decoded.substring(0, separatorIdx);
    nonce = decoded.substring(separatorIdx + 1);
  } catch {
    return c.redirect('/trades?tv_error=invalid_state');
  }

  // Use service client (no auth context on callback)
  const serviceClient = createServiceClient(c.env);

  // Verify nonce matches
  const tvConn = await tvConnDb.findByBrokerConnectionId(serviceClient, connectionId);
  if (!tvConn || tvConn.oauth_nonce !== nonce) {
    return c.redirect('/trades?tv_error=invalid_nonce');
  }

  // Clear the nonce (one-time use)
  await tvConnDb.updateByBrokerConnectionId(serviceClient, connectionId, {
    oauth_nonce: null,
  });

  // Fetch broker type from the parent connection
  const brokerConn = await brokerDb.findById(serviceClient, connectionId);
  const broker = brokerConn?.broker || 'tradovate';

  return c.redirect(
    `/trades?tv_code=${encodeURIComponent(code)}&tv_conn=${encodeURIComponent(connectionId)}&tv_broker=${encodeURIComponent(broker)}`,
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
  const { code, connectionId } = body as { code?: string; connectionId?: string };

  if (!code || !connectionId) {
    return c.json({ error: 'Missing code or connectionId' }, 400);
  }

  const clientId = c.env.TRADOVATE_CLIENT_ID;
  const clientSecret = c.env.TRADOVATE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return c.json({ error: 'Tradovate OAuth is not configured on this server.' }, 500);
  }

  const serviceClient = createServiceClient(c.env);

  // Verify connection ownership
  const brokerConn = await brokerDb.findById(serviceClient, connectionId);
  if (!brokerConn || brokerConn.owner !== user.id) {
    return c.json({ error: 'Connection not found' }, 404);
  }

  const redirectUri = `${c.env.APP_URL}/api/tradovate/callback`;

  try {
    const { accessToken, expiresIn } = await TradovateAPI.exchangeOAuthCode({
      code,
      environment: brokerConn.environment,
      clientId,
      clientSecret,
      redirectUri,
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Fetch accounts and check for duplicates BEFORE storing the token
    const api = new TradovateAPI(brokerConn.environment);
    const rawAccounts = (await api.getAccounts(accessToken)) as any[];
    const accountIds = rawAccounts.map((a: any) => a.id as number);

    const duplicates = await tvConnDb.findDuplicateAccountIds(
      serviceClient, user.id, accountIds, connectionId,
    );
    if (duplicates.length > 0) {
      // Clean up the pending connection — no token was stored yet
      await brokerDb.deleteById(serviceClient, connectionId, user.id);
      const dupeNames = rawAccounts
        .filter((a: any) => duplicates.includes(a.id))
        .map((a: any) => a.name)
        .join(', ');
      return c.json({
        error: `Account${duplicates.length > 1 ? 's' : ''} already connected: ${dupeNames}`,
      }, 409);
    }

    // No duplicates — store encrypted token + account IDs
    await tvConnDb.updateByBrokerConnectionId(serviceClient, connectionId, {
      access_token: await encrypt(accessToken, c.env.ENCRYPTION_KEY),
      token_expires_at: expiresAt,
      account_ids: accountIds,
    });

    // Fetch balances and generate label (best-effort)
    let accounts: Array<{ id: number; name: string; active: boolean; balance: number | null }> = [];
    try {
      const balanceResults = await Promise.all(
        rawAccounts.map((a: any) => api.getCashBalance(accessToken, a.id)),
      );

      accounts = rawAccounts.map((a: any, i: number) => ({
        id: a.id,
        name: a.name,
        active: a.active !== false,
        balance: balanceResults[i]?.cashBalance ?? null,
      }));

      // Auto-generate label from environment + first account name
      if (accounts.length > 0) {
        const envLabel = brokerConn.environment === 'live' ? 'Live' : 'Demo';
        const brokerLabel = BROKER_LABELS[brokerConn.broker] || 'Tradovate';
        const label = `${brokerLabel} ${envLabel} — ${accounts[0].name}`;
        await brokerDb.updateById(serviceClient, connectionId, { label });
      }
    } catch {
      // non-fatal — balances/label are best-effort
      accounts = rawAccounts.map((a: any) => ({
        id: a.id,
        name: a.name,
        active: a.active !== false,
        balance: null,
      }));
    }

    const brokerLabel = BROKER_LABELS[brokerConn.broker] || 'Tradovate';
    return c.json({ message: `${brokerLabel} connected successfully`, accounts, connectionId, broker: brokerConn.broker });
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
 * GET /api/tradovate/status
 * Returns all Tradovate connections for the user with their status,
 * plus overall connection usage and limits.
 */
tradovate.get(
  '/api/tradovate/status',
  requiresLogin,
  checkSubscriptionStatus,
  async (c) => {
    const user = c.get('user');
    const serviceClient = createServiceClient(c.env);
    const broker = c.req.query('broker') || 'tradovate';

    // Fetch all connections for user matching the requested broker
    const brokerConns = await brokerDb.findByOwnerAndBroker(serviceClient, user.id, broker);

    // Total count across ALL brokers for limit tracking
    const totalCount = await brokerDb.countByOwner(serviceClient, user.id);

    // Determine plan and limits
    const status = c.get('subscriptionStatus' as any) as { effectivePlan: EffectivePlan } | undefined;
    const plan = status?.effectivePlan || 'free';
    const limit = BROKER_CONNECTION_LIMITS[plan];
    const canUseBrokerSync = plan === 'pro' || plan === 'elite';

    // Build status for each connection
    const connections = [];
    for (const bc of brokerConns) {
      const tvConn = await tvConnDb.findByBrokerConnectionId(serviceClient, bc.id);
      const hasToken = !!tvConn?.access_token;

      let tokenExpired = false;
      if (hasToken && tvConn) {
        try {
          await ensureFreshToken(
            c.env,
            bc.id,
            tvConn.access_token!,
            tvConn.token_expires_at,
            bc.environment,
          );
        } catch {
          tokenExpired = true;
        }
      }

      // Fetch accounts + balances for active connections
      let accounts: Array<{ id: number; name: string; active: boolean; balance: number | null }> = [];
      if (hasToken && !tokenExpired && tvConn) {
        try {
          const token = await decrypt(tvConn.access_token!, c.env.ENCRYPTION_KEY);
          const api = new TradovateAPI(bc.environment);
          const rawAccounts = (await api.getAccounts(token)) as any[];

          const balanceResults = await Promise.all(
            rawAccounts.map((a: any) => api.getCashBalance(token, a.id)),
          );

          accounts = rawAccounts.map((a: any, i: number) => ({
            id: a.id,
            name: a.name,
            active: a.active !== false,
            balance: balanceResults[i]?.cashBalance ?? null,
          }));

          // Auto-populate account_ids if missing (e.g. migrated connections)
          if (!tvConn.account_ids && accounts.length > 0) {
            await tvConnDb.updateByBrokerConnectionId(serviceClient, bc.id, {
              account_ids: accounts.map(a => a.id),
            });
          }
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
        selectedAccounts: tvConn?.selected_accounts || [],
      });
    }

    return c.json({
      connections,
      connectionsUsed: totalCount,
      connectionLimit: limit === Infinity ? null : limit,
      plan,
      canUseBrokerSync,
    });
  },
);

/**
 * POST /api/tradovate/accounts
 * Save which accounts are enabled for sync on a specific connection.
 */
tradovate.post(
  '/api/tradovate/accounts',
  requiresLogin,
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const { connectionId, selectedAccounts } = body as {
      connectionId?: string;
      selectedAccounts?: number[];
    };

    if (!connectionId) {
      return c.json({ error: 'Missing connectionId' }, 400);
    }

    if (!Array.isArray(selectedAccounts)) {
      return c.json({ error: 'selectedAccounts must be an array' }, 400);
    }

    const serviceClient = createServiceClient(c.env);
    const connection = await brokerDb.findById(serviceClient, connectionId);
    if (!connection || connection.owner !== user.id || !isValidTradovateBroker(connection.broker)) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    await tvConnDb.updateByBrokerConnectionId(serviceClient, connectionId, {
      selected_accounts: selectedAccounts,
    });

    return c.json({ message: 'Account settings saved' });
  },
);

/**
 * POST /api/tradovate/sync
 * Syncs trades for a single Tradovate connection.
 */
tradovate.post(
  '/api/tradovate/sync',
  requiresLogin,
  checkSubscriptionStatus,
  requiresBrokerSync,
  async (c) => {
    const user = c.get('user');
    const supabase = c.get('supabase');

    const body = await c.req.json().catch(() => ({})) as {
      connectionId?: string;
      accountIds?: number[];
      startDate?: string;
      endDate?: string;
    };

    const { connectionId, startDate, endDate } = body;
    if (!connectionId) {
      return c.json({ error: 'Missing connectionId' }, 400);
    }

    const accountIds = Array.isArray(body.accountIds)
      ? body.accountIds.filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
      : [];

    try {
      const synced = await syncConnection(c.env, supabase, user.id, connectionId, {
        accountIds: accountIds.length > 0 ? accountIds : undefined,
        startDate,
        endDate,
      });

      return c.json({ message: `Synced ${synced} new trades`, synced });
    } catch (err: any) {
      if (err.message === 'Connection not found') {
        return c.json({ error: 'Connection not found' }, 404);
      }
      if (err.message.includes('expired')) {
        return c.json({ error: err.message, expired: true }, 401);
      }
      return c.json({ error: `Sync failed: ${err.message}` }, 500);
    }
  },
);

/**
 * POST /api/tradovate/sync-all
 * Syncs trades for all Tradovate connections belonging to the user.
 */
tradovate.post(
  '/api/tradovate/sync-all',
  requiresLogin,
  checkSubscriptionStatus,
  requiresBrokerSync,
  async (c) => {
    const user = c.get('user');
    const supabase = c.get('supabase');
    const serviceClient = createServiceClient(c.env);
    const body = await c.req.json().catch(() => ({})) as { broker?: string };
    const broker = body.broker || 'tradovate';
    const brokerLabel = BROKER_LABELS[broker] || broker;

    const brokerConns = await brokerDb.findByOwnerAndBroker(serviceClient, user.id, broker);

    if (brokerConns.length === 0) {
      return c.json({ message: `No ${brokerLabel} connections found`, results: [] });
    }

    const results: Array<{
      connectionId: string;
      label: string | null;
      tradesImported: number;
      error?: string;
    }> = [];

    for (const bc of brokerConns) {
      try {
        const tradesImported = await syncConnection(c.env, supabase, user.id, bc.id);
        results.push({ connectionId: bc.id, label: bc.label, tradesImported });
      } catch (err: any) {
        results.push({ connectionId: bc.id, label: bc.label, tradesImported: 0, error: err.message });
      }
    }

    const totalImported = results.reduce((sum, r) => sum + r.tradesImported, 0);
    return c.json({
      message: `Synced ${totalImported} new trades across ${brokerConns.length} connection(s)`,
      results,
    });
  },
);

/**
 * DELETE /api/tradovate/connections/:connectionId
 * Deletes a broker connection and its child tradovate_connection (cascade).
 */
tradovate.delete('/api/tradovate/connections/:connectionId', requiresLogin, async (c) => {
  const user = c.get('user');
  const connectionId = c.req.param('connectionId');
  const serviceClient = createServiceClient(c.env);

  try {
    await brokerDb.deleteById(serviceClient, connectionId, user.id);
    return c.json({ message: 'Connection deleted' });
  } catch (err: any) {
    return c.json({ error: `Failed to delete connection: ${err.message}` }, 500);
  }
});

export default tradovate;
