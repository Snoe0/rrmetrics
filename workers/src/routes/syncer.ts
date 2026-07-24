import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import { requiresLogin } from '../middleware/supabase-auth';
import { createServiceClient } from '../lib/supabase';
import { ensureFreshToken } from '../utils/tradovate-token';
import * as syncerDb from '../db/syncer';
import * as brokerDb from '../db/broker-connections';
import * as tvConnDb from '../db/tradovate-connections';
import { decrypt } from '../utils/crypto';
import { TradovateAPI } from '../services/TradovateAPI';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const syncer = new Hono<HonoEnv>();

// All syncer routes require login
syncer.use('/api/syncer/*', requiresLogin);

// ─── GET /api/syncer/config ──────────────────────────────────────────────────

syncer.get('/api/syncer/config', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const config = await syncerDb.getConfig(supabase, user.id);
    return c.json({ config });
  } catch (err: any) {
    console.error('syncer config get error:', err);
    return c.json({ error: 'Failed to fetch syncer config.' }, 500);
  }
});

// ─── PUT /api/syncer/config ──────────────────────────────────────────────────

syncer.put('/api/syncer/config', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json();

  const {
    leaderConnectionId = null,
    leaderAccountId = null,
    followerAccounts = [],
  } = body as {
    leaderConnectionId?: string | null;
    leaderAccountId?: number | null;
    followerAccounts?: Array<{ connectionId: string; accountId: number; multiplier: number }>;
  };

  try {
    const config = await syncerDb.upsertConfig(
      supabase,
      user.id,
      leaderConnectionId,
      leaderAccountId,
      followerAccounts,
    );
    return c.json({ config });
  } catch (err: any) {
    console.error('syncer config save error:', err);
    return c.json({ error: 'Failed to save syncer config.' }, 500);
  }
});

// ─── GET /api/syncer/accounts ────────────────────────────────────────────────
// List all Tradovate accounts across all connections for the DnD UI

syncer.get('/api/syncer/accounts', async (c) => {
  const user = c.get('user');
  const serviceClient = createServiceClient(c.env);

  try {
    const brokerConns = await brokerDb.findByOwnerAndBroker(serviceClient, user.id, 'tradovate');

    const allAccounts: Array<{
      connectionId: string;
      connectionLabel: string | null;
      environment: string;
      accountId: number;
      accountName: string;
    }> = [];

    for (const bc of brokerConns) {
      const tvConn = await tvConnDb.findByBrokerConnectionId(serviceClient, bc.id);
      if (!tvConn?.access_token) continue;

      try {
        const token = await decrypt(tvConn.access_token, c.env.ENCRYPTION_KEY);
        const api = new TradovateAPI(bc.environment);
        const rawAccounts = (await api.getAccounts(token)) as any[];

        for (const a of rawAccounts) {
          allAccounts.push({
            connectionId: bc.id,
            connectionLabel: bc.label,
            environment: bc.environment,
            accountId: a.id,
            accountName: a.name,
          });
        }
      } catch {
        // Skip connections with expired/invalid tokens
      }
    }

    return c.json({ accounts: allAccounts });
  } catch (err: any) {
    console.error('syncer accounts error:', err);
    return c.json({ error: 'Failed to fetch accounts.' }, 500);
  }
});

// ─── POST /api/syncer/start ──────────────────────────────────────────────────

syncer.post('/api/syncer/start', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const config = await syncerDb.getConfig(supabase, user.id);
    if (!config) {
      return c.json({ error: 'No syncer config found. Save a config first.' }, 400);
    }
    if (!config.leader_connection_id || !config.leader_account_id) {
      return c.json({ error: 'Leader account not configured.' }, 400);
    }
    if (!config.follower_accounts || config.follower_accounts.length === 0) {
      return c.json({ error: 'No follower accounts configured.' }, 400);
    }

    await syncerDb.setActive(supabase, config.id, true);
    return c.json({ ok: true, message: 'Syncer started.' });
  } catch (err: any) {
    console.error('syncer start error:', err);
    return c.json({ error: 'Failed to start syncer.' }, 500);
  }
});

// ─── POST /api/syncer/stop ───────────────────────────────────────────────────

syncer.post('/api/syncer/stop', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const config = await syncerDb.getConfig(supabase, user.id);
    if (!config) {
      return c.json({ error: 'No syncer config found.' }, 400);
    }

    await syncerDb.setActive(supabase, config.id, false);
    return c.json({ ok: true, message: 'Syncer stopped.' });
  } catch (err: any) {
    console.error('syncer stop error:', err);
    return c.json({ error: 'Failed to stop syncer.' }, 500);
  }
});

// ─── GET /api/syncer/token ───────────────────────────────────────────────────
// Returns decrypted leader token + WebSocket URL for the browser to connect.

syncer.get('/api/syncer/token', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const config = await syncerDb.getConfig(supabase, user.id);
    if (!config || !config.leader_connection_id || !config.leader_account_id) {
      return c.json({ error: 'Leader account not configured.' }, 400);
    }

    const { token, environment } = await ensureFreshToken(c.env, config.leader_connection_id);

    const wsUrl = environment === 'live'
      ? 'wss://live.tradovateapi.com/v1/websocket'
      : 'wss://demo.tradovateapi.com/v1/websocket';

    return c.json(
      { token, wsUrl, leaderAccountId: config.leader_account_id },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err: any) {
    console.error('syncer token error:', err);
    return c.json({ error: `Failed to get leader token: ${err.message}` }, 500);
  }
});

// ─── POST /api/syncer/mirror ─────────────────────────────────────────────────
// Handles mirror requests from the browser WebSocket client.
// Types: order, cancel, modify, position_sync

syncer.post('/api/syncer/mirror', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const config = await syncerDb.getConfig(supabase, user.id);
    if (!config || !config.is_active) {
      return c.json({ error: 'Syncer not active.' }, 400);
    }

    const followers = config.follower_accounts || [];
    if (followers.length === 0) {
      return c.json({ error: 'No followers configured.' }, 400);
    }

    const body = await c.req.json();

    // Get fresh tokens for all follower connections
    const connectionIds = new Set<string>();
    for (const f of followers) connectionIds.add(f.connectionId);

    const tokenMap = new Map<string, { token: string; api: TradovateAPI }>();
    for (const connId of connectionIds) {
      try {
        const result = await ensureFreshToken(c.env, connId);
        tokenMap.set(connId, { token: result.token, api: result.api });
      } catch {
        // Skip connections with token issues
      }
    }

    // Resolve account specs (account name for placeOrder)
    const accountSpecMap = new Map<number, string>();
    for (const [, auth] of tokenMap) {
      try {
        const rawAccounts = (await auth.api.getAccounts(auth.token)) as any[];
        for (const a of rawAccounts) accountSpecMap.set(a.id, a.name);
      } catch { /* non-fatal */ }
    }

    // Symbol resolver using leader token
    const symbolCache = new Map<number, string>();
    const resolveSymbol = async (contractId: number): Promise<string> => {
      if (body.symbol) return body.symbol;
      if (symbolCache.has(contractId)) return symbolCache.get(contractId)!;
      try {
        const leaderResult = await ensureFreshToken(c.env, config.leader_connection_id!);
        const contracts = await leaderResult.api.getContractItems(leaderResult.token, [contractId]);
        const name = contracts.length > 0 ? contracts[0].name : String(contractId);
        symbolCache.set(contractId, name);
        return name;
      } catch {
        return String(contractId);
      }
    };

    const actions: Array<{ type: string; followerAccountId: number; detail: string; error?: string }> = [];

    switch (body.type) {
      // ═════════════════════════════════════════════════════════════════════
      // ORDER: Mirror a new working order to all followers
      // ═════════════════════════════════════════════════════════════════════
      case 'order': {
        const symbol = await resolveSymbol(body.contractId);

        // If the client didn't provide price fields (WS event may omit them),
        // fetch full order details from Tradovate REST API as fallback
        let { price, stopPrice, orderType, orderQty } = body;
        const needsStop = (orderType === 'Stop' || orderType === 'StopLimit') && stopPrice == null;
        const needsLimit = (orderType === 'Limit' || orderType === 'StopLimit') && price == null;

        if (needsStop || needsLimit) {
          try {
            const leaderResult = await ensureFreshToken(c.env, config.leader_connection_id!);
            const fullOrder = await leaderResult.api.getOrderItem(leaderResult.token, body.leaderOrderId);
            if (stopPrice == null) stopPrice = fullOrder.stopPrice ?? fullOrder.triggerPrice;
            if (price == null) price = fullOrder.price ?? fullOrder.limitPrice;
            if (!orderQty) orderQty = fullOrder.orderQty ?? fullOrder.qty;
            // Re-derive orderType from actual data if needed
            if (!orderType || orderType === 'Market') {
              if (price != null && stopPrice != null) orderType = 'StopLimit';
              else if (stopPrice != null) orderType = 'Stop';
              else if (price != null) orderType = 'Limit';
            }
          } catch {
            // Fall through with what we have
          }
        }

        // Final validation: skip if required price fields are still missing
        if ((orderType === 'Stop' || orderType === 'StopLimit') && stopPrice == null) {
          return c.json({
            actions: [],
            error: `Cannot mirror ${orderType} order ${body.leaderOrderId}: stopPrice unavailable`,
          });
        }
        if ((orderType === 'Limit' || orderType === 'StopLimit') && price == null) {
          return c.json({
            actions: [],
            error: `Cannot mirror ${orderType} order ${body.leaderOrderId}: price unavailable`,
          });
        }

        for (const follower of followers) {
          // Dedup: check if we already mirrored this order
          const existing = await syncerDb.findExistingMirror(
            supabase, config.id, body.leaderOrderId, follower.accountId,
          );
          if (existing && existing.status !== 'failed') continue;

          const followerAuth = tokenMap.get(follower.connectionId);
          if (!followerAuth) continue;

          const accountSpec = accountSpecMap.get(follower.accountId) || String(follower.accountId);
          const mirroredQty = Math.max(1, Math.floor(Number(orderQty || 1) * Number(follower.multiplier || 1)));

          try {
            const orderParams: any = {
              accountSpec,
              accountId: follower.accountId,
              action: body.action,
              symbol,
              orderQty: mirroredQty,
              orderType,
              isAutomated: true,
            };
            if (price != null) orderParams.price = price;
            if (stopPrice != null) orderParams.stopPrice = stopPrice;

            const result = await followerAuth.api.placeOrder(followerAuth.token, orderParams);

            await syncerDb.logOrder(supabase, {
              config_id: config.id,
              leader_order_id: body.leaderOrderId,
              leader_action: body.action,
              leader_symbol: symbol,
              leader_qty: Number(orderQty || 1),
              follower_account_id: follower.accountId,
              follower_order_id: result.id,
              follower_qty: mirroredQty,
              order_type: orderType,
              status: 'placed',
            });

            actions.push({
              type: 'order',
              followerAccountId: follower.accountId,
              detail: `${orderType} ${body.action} ${mirroredQty} ${symbol}`,
            });
          } catch (err: any) {
            await syncerDb.logOrder(supabase, {
              config_id: config.id,
              leader_order_id: body.leaderOrderId,
              leader_action: body.action,
              leader_symbol: symbol,
              leader_qty: Number(orderQty || 1),
              follower_account_id: follower.accountId,
              follower_qty: mirroredQty,
              order_type: orderType,
              status: 'failed',
              error_message: err.message,
            });

            actions.push({
              type: 'order',
              followerAccountId: follower.accountId,
              detail: `${orderType} ${body.action} ${symbol}`,
              error: err.message,
            });
          }
        }
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // CANCEL: Cancel follower orders matching a leader order
      // ═════════════════════════════════════════════════════════════════════
      case 'cancel': {
        const followerOrders = await syncerDb.findFollowerOrders(
          supabase, config.id, body.leaderOrderId,
        );

        for (const log of followerOrders) {
          const follower = followers.find((f) => f.accountId === log.follower_account_id);
          if (!follower) continue;

          const followerAuth = tokenMap.get(follower.connectionId);
          if (!followerAuth || !log.follower_order_id) continue;

          try {
            await followerAuth.api.cancelOrder(followerAuth.token, log.follower_order_id);

            await syncerDb.logOrder(supabase, {
              config_id: config.id,
              leader_order_id: body.leaderOrderId,
              follower_account_id: log.follower_account_id,
              status: 'cancelled',
            });

            actions.push({
              type: 'cancel',
              followerAccountId: log.follower_account_id,
              detail: `Cancelled follower order ${log.follower_order_id}`,
            });
          } catch (err: any) {
            actions.push({
              type: 'cancel',
              followerAccountId: log.follower_account_id,
              detail: `Cancel failed for order ${log.follower_order_id}`,
              error: err.message,
            });
          }
        }
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // MODIFY: Modify follower orders matching a leader order
      // ═════════════════════════════════════════════════════════════════════
      case 'modify': {
        const followerOrders = await syncerDb.findFollowerOrders(
          supabase, config.id, body.leaderOrderId,
        );

        for (const log of followerOrders) {
          const follower = followers.find((f) => f.accountId === log.follower_account_id);
          if (!follower) continue;

          const followerAuth = tokenMap.get(follower.connectionId);
          if (!followerAuth || !log.follower_order_id) continue;

          const modifyParams: Partial<{ orderQty: number; price: number; stopPrice: number }> = {};
          if (body.price != null) modifyParams.price = body.price;
          if (body.stopPrice != null) modifyParams.stopPrice = body.stopPrice;
          if (body.orderQty != null) {
            modifyParams.orderQty = Math.max(1, Math.floor(Number(body.orderQty) * Number(follower.multiplier || 1)));
          }

          try {
            await followerAuth.api.modifyOrder(followerAuth.token, log.follower_order_id, modifyParams);

            actions.push({
              type: 'modify',
              followerAccountId: log.follower_account_id,
              detail: `Modified follower order ${log.follower_order_id}`,
            });
          } catch (err: any) {
            actions.push({
              type: 'modify',
              followerAccountId: log.follower_account_id,
              detail: `Modify failed for order ${log.follower_order_id}`,
              error: err.message,
            });
          }
        }
        break;
      }

      // ═════════════════════════════════════════════════════════════════════
      // POSITION_SYNC: Ensure followers match leader positions * multiplier
      // ═════════════════════════════════════════════════════════════════════
      case 'position_sync': {
        // body.positions: [{ contractId, netPos }]
        const leaderPosMap = new Map<number, number>();
        for (const p of (body.positions || [])) {
          leaderPosMap.set(p.contractId, p.netPos);
        }

        for (const follower of followers) {
          const followerAuth = tokenMap.get(follower.connectionId);
          if (!followerAuth) continue;

          const followerPositions = await followerAuth.api.getPositionsByAccount(
            followerAuth.token, follower.accountId,
          );

          const followerPosMap = new Map<number, number>();
          for (const p of followerPositions) {
            followerPosMap.set(p.contractId, p.netPos);
          }

          const allContractIds = new Set([...leaderPosMap.keys(), ...followerPosMap.keys()]);

          for (const contractId of allContractIds) {
            const leaderPos = leaderPosMap.get(contractId) || 0;
            const targetPos = Math.round(leaderPos * Number(follower.multiplier || 1));
            const followerPos = followerPosMap.get(contractId) || 0;
            const delta = targetPos - followerPos;

            if (delta === 0) continue;

            const symbol = await resolveSymbol(contractId);
            const accountSpec = accountSpecMap.get(follower.accountId) || String(follower.accountId);
            const action = delta > 0 ? 'Buy' : 'Sell';
            const qty = Math.abs(delta);

            try {
              await followerAuth.api.placeOrder(followerAuth.token, {
                accountSpec,
                accountId: follower.accountId,
                action: action as 'Buy' | 'Sell',
                symbol,
                orderQty: qty,
                orderType: 'Market',
                isAutomated: true,
              });

              actions.push({
                type: 'position',
                followerAccountId: follower.accountId,
                detail: `Market ${action} ${qty} ${symbol} (pos: ${followerPos} -> ${targetPos})`,
              });
            } catch (err: any) {
              actions.push({
                type: 'position',
                followerAccountId: follower.accountId,
                detail: `Market ${action} ${qty} ${symbol}`,
                error: err.message,
              });
            }
          }
        }
        break;
      }

      default:
        return c.json({ error: `Unknown mirror type: ${body.type}` }, 400);
    }

    return c.json({ actions });
  } catch (err: any) {
    console.error('syncer mirror error:', err);
    return c.json({ error: `Mirror failed: ${err.message}` }, 500);
  }
});

// ─── GET /api/syncer/account-status ───────────────────────────────────────────
// Returns positions + cash balance for all syncer accounts.
// Called on a slower interval (~5s) for unrealized P&L display.

syncer.get('/api/syncer/account-status', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const config = await syncerDb.getConfig(supabase, user.id);
    if (!config || !config.leader_connection_id || !config.leader_account_id) {
      return c.json({ accounts: [] });
    }

    const followers = config.follower_accounts || [];
    const allAccounts = [
      { connectionId: config.leader_connection_id, accountId: config.leader_account_id, role: 'leader' as const },
      ...followers.map((f) => ({ connectionId: f.connectionId, accountId: f.accountId, role: 'follower' as const })),
    ];

    // Collect unique connections and get tokens
    const connectionIds = [...new Set(allAccounts.map((a) => a.connectionId))];
    const tokenMap = new Map<string, { token: string; api: TradovateAPI }>();
    for (const connId of connectionIds) {
      try {
        const result = await ensureFreshToken(c.env, connId);
        tokenMap.set(connId, { token: result.token, api: result.api });
      } catch {
        // skip failed connections
      }
    }

    // Resolve account names
    const nameMap = new Map<number, string>();
    for (const [, auth] of tokenMap) {
      try {
        const rawAccounts = (await auth.api.getAccounts(auth.token)) as any[];
        for (const a of rawAccounts) {
          nameMap.set(a.id, a.name);
        }
      } catch {
        // non-fatal
      }
    }

    // Fetch positions + balances in parallel per account
    const accountStatuses = await Promise.all(
      allAccounts.map(async (acct) => {
        const auth = tokenMap.get(acct.connectionId);
        if (!auth) {
          return {
            accountId: acct.accountId,
            name: nameMap.get(acct.accountId) || String(acct.accountId),
            role: acct.role,
            positions: [],
            cashBalance: null,
          };
        }

        try {
          const [positions, balanceData] = await Promise.all([
            auth.api.getPositionsByAccount(auth.token, acct.accountId),
            auth.api.getCashBalance(auth.token, acct.accountId),
          ]);

          return {
            accountId: acct.accountId,
            name: nameMap.get(acct.accountId) || String(acct.accountId),
            role: acct.role,
            positions: positions.map((p) => ({ contractId: p.contractId, netPos: p.netPos })),
            cashBalance: balanceData?.cashBalance ?? null,
          };
        } catch {
          return {
            accountId: acct.accountId,
            name: nameMap.get(acct.accountId) || String(acct.accountId),
            role: acct.role,
            positions: [],
            cashBalance: null,
          };
        }
      }),
    );

    return c.json({ accounts: accountStatuses });
  } catch (err: any) {
    console.error('syncer account-status error:', err);
    return c.json({ error: 'Failed to fetch account status.' }, 500);
  }
});

// ─── GET /api/syncer/logs ────────────────────────────────────────────────────

syncer.get('/api/syncer/logs', async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const config = await syncerDb.getConfig(supabase, user.id);
    if (!config) {
      return c.json({ logs: [] });
    }

    const logs = await syncerDb.getRecentLogs(supabase, config.id, 100);
    return c.json({ logs });
  } catch (err: any) {
    console.error('syncer logs error:', err);
    return c.json({ error: 'Failed to fetch logs.' }, 500);
  }
});

export default syncer;
