import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as brokerDb from '../db/broker-connections';
import * as pxConnDb from '../db/projectx-connections';
import * as tradesDb from '../db/trades';
import { encrypt, decrypt } from '../utils/crypto';
import { ProjectXAPI } from '../services/ProjectXAPI';
import { requiresLogin } from '../middleware/auth';
import { getDb } from '../db/connection';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const projectx = new Hono<HonoEnv>();

/**
 * POST /api/projectx/connect
 * Authenticate with ProjectX, create broker_connection + projectx_connection,
 * store encrypted credentials.
 */
projectx.post(
  '/api/projectx/connect',
  requiresLogin,
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const { username, apiKey } = body as { username?: string; apiKey?: string };

    if (!username || !apiKey) {
      return c.json({ error: 'Username and API key are required' }, 400);
    }

    const serviceClient = getDb();

    const limit = Infinity;

    try {
      const api = new ProjectXAPI();
      const token = await api.authenticate(username, apiKey);

      // Fetch accounts to return to client
      const accounts = await api.getAccounts(token);

      // Create parent broker_connection with limit check (returns UUID string)
      const connectionId = await brokerDb.createWithLimitCheck(
        serviceClient,
        user.id,
        'projectx',
        'live', // ProjectX is always live
        `ProjectX — ${username}`,
        limit,
      );

      // Create child projectx_connection with encrypted credentials
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await pxConnDb.create(serviceClient, connectionId, {
        username,
        api_key: await encrypt(apiKey, c.env.ENCRYPTION_KEY),
        access_token: await encrypt(token, c.env.ENCRYPTION_KEY),
        token_expires_at: expiresAt,
      });

      return c.json({ message: 'Connected successfully', accounts, connectionId });
    } catch (err: any) {
      console.error('ProjectX connect error:', err.message);
      return c.json({ error: `Failed to connect: ${err.message}` }, 400);
    }
  },
);

/**
 * GET /api/projectx/status
 * Returns all ProjectX connections for the user with their status,
 * plus overall connection usage and limits.
 */
projectx.get(
  '/api/projectx/status',
  requiresLogin,
  async (c) => {
    const user = c.get('user');
    const serviceClient = getDb();

    try {
      // Fetch all ProjectX connections for user
      const brokerConns = await brokerDb.findByOwnerAndBroker(serviceClient, user.id, 'projectx');

      // Total count across ALL brokers for limit tracking
      const totalCount = await brokerDb.countByOwner(serviceClient, user.id);


      // Build status for each connection
      const connections = [];
      for (const bc of brokerConns) {
        const pxConn = await pxConnDb.findByBrokerConnectionId(serviceClient, bc.id);
        const hasToken = !!pxConn?.access_token;

        let tokenExpired = false;
        if (hasToken && pxConn?.token_expires_at) {
          tokenExpired = new Date(pxConn.token_expires_at) < new Date();
        }

        let accounts: any[] = [];
        const configured = hasToken && !tokenExpired;

        // If connected (or expired but has credentials), try to fetch accounts
        if (hasToken && pxConn) {
          try {
            const api = new ProjectXAPI();
            let token = await decrypt(pxConn.access_token!, c.env.ENCRYPTION_KEY);

            // Re-auth if expired and we have stored credentials
            if (tokenExpired && pxConn.username && pxConn.api_key) {
              const apiKey = await decrypt(pxConn.api_key, c.env.ENCRYPTION_KEY);
              token = await api.authenticate(pxConn.username, apiKey);
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              await pxConnDb.updateByBrokerConnectionId(serviceClient, bc.id, {
                access_token: await encrypt(token, c.env.ENCRYPTION_KEY),
                token_expires_at: expiresAt,
              });
              tokenExpired = false;
            }

            accounts = await api.getAccounts(token);
          } catch {
            // If fetching accounts fails, still return status
          }
        }

        connections.push({
          connectionId: bc.id,
          environment: bc.environment,
          label: bc.label,
          isEval: bc.is_eval,
          configured: hasToken && !tokenExpired,
          expired: hasToken && tokenExpired,
          selectedAccounts: pxConn?.selected_accounts || [],
          copytradeConfig: pxConn?.copytrade_config || null,
          lastSyncTime: bc.last_sync_time,
          accounts,
        });
      }

      return c.json({
        connections,
        connectionsUsed: totalCount,
        connectionLimit: null,
        canUseBrokerSync: true,
      });
    } catch (err: any) {
      console.error('ProjectX status error:', err.message);
      return c.json({ error: 'Failed to get ProjectX status' }, 500);
    }
  },
);

/**
 * POST /api/projectx/accounts
 * Save selected accounts and copytrade configuration for a connection.
 */
projectx.post(
  '/api/projectx/accounts',
  requiresLogin,
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const { connectionId, selectedAccounts, copytradeConfig } = body as {
      connectionId?: string;
      selectedAccounts?: number[];
      copytradeConfig?: { leadAccountId: number; multiplier: number } | null;
    };

    if (!connectionId) {
      return c.json({ error: 'Missing connectionId' }, 400);
    }

    if (!selectedAccounts || !Array.isArray(selectedAccounts) || selectedAccounts.length === 0) {
      return c.json({ error: 'Select at least one account' }, 400);
    }

    // Validate copytrade config if provided
    if (copytradeConfig) {
      if (!selectedAccounts.includes(copytradeConfig.leadAccountId)) {
        return c.json({ error: 'Lead account must be one of the selected accounts' }, 400);
      }
      if (!copytradeConfig.multiplier || copytradeConfig.multiplier < 1) {
        return c.json({ error: 'Multiplier must be at least 1' }, 400);
      }
    }

    try {
      const serviceClient = getDb();

      // Verify connection ownership
      const brokerConn = await brokerDb.findById(serviceClient, connectionId);
      if (!brokerConn || brokerConn.owner !== user.id) {
        return c.json({ error: 'Connection not found' }, 404);
      }

      await pxConnDb.updateByBrokerConnectionId(serviceClient, connectionId, {
        selected_accounts: selectedAccounts as any,
        copytrade_config: copytradeConfig as any,
      });

      return c.json({ message: 'Account settings saved' });
    } catch (err: any) {
      console.error('ProjectX accounts save error:', err.message);
      return c.json({ error: 'Failed to save account settings' }, 500);
    }
  },
);

/**
 * POST /api/projectx/eval
 * Toggle the is_eval flag on a ProjectX broker connection.
 */
projectx.post(
  '/api/projectx/eval',
  requiresLogin,
  async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const { connectionId, isEval } = body as {
      connectionId?: string;
      isEval?: boolean;
    };

    if (!connectionId || typeof isEval !== 'boolean') {
      return c.json({ error: 'Missing connectionId or isEval' }, 400);
    }

    const serviceClient = getDb();
    const connection = await brokerDb.findById(serviceClient, connectionId);
    if (!connection || connection.owner !== user.id) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    await brokerDb.updateById(serviceClient, connectionId, { is_eval: isEval });

    return c.json({ message: `Eval ${isEval ? 'enabled' : 'disabled'}` });
  },
);

/**
 * POST /api/projectx/sync
 * Incremental trade sync from ProjectX for a single connection.
 */
projectx.post(
  '/api/projectx/sync',
  requiresLogin,
  async (c) => {
    const user = c.get('user');
    const db = c.get('db');
    const body = await c.req.json();
    const { connectionId } = body as { connectionId?: string };

    if (!connectionId) {
      return c.json({ error: 'Missing connectionId' }, 400);
    }

    try {
      const serviceClient = getDb();

      // Load connection data
      const brokerConn = await brokerDb.findById(serviceClient, connectionId);
      if (!brokerConn || brokerConn.owner !== user.id) {
        return c.json({ error: 'Connection not found' }, 404);
      }

      const pxConn = await pxConnDb.findByBrokerConnectionId(serviceClient, connectionId);
      if (!pxConn || !pxConn.access_token) {
        return c.json({ error: 'ProjectX not connected for this connection' }, 400);
      }

      const selectedAccounts: number[] = pxConn.selected_accounts || [];
      if (selectedAccounts.length === 0) {
        return c.json({ error: 'No accounts selected for sync' }, 400);
      }

      const copytradeConfig = pxConn.copytrade_config;

      // Decrypt token and re-auth if expired
      const api = new ProjectXAPI();
      let token: string;

      try {
        token = await decrypt(pxConn.access_token, c.env.ENCRYPTION_KEY);

        // Check if token is expired and re-authenticate
        if (
          pxConn.token_expires_at &&
          new Date(pxConn.token_expires_at) < new Date()
        ) {
          if (!pxConn.username || !pxConn.api_key) {
            return c.json(
              { error: 'ProjectX session expired. Please reconnect your account.', expired: true },
              401,
            );
          }
          const apiKey = await decrypt(pxConn.api_key, c.env.ENCRYPTION_KEY);
          token = await api.authenticate(pxConn.username, apiKey);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          await pxConnDb.updateByBrokerConnectionId(serviceClient, connectionId, {
            access_token: await encrypt(token, c.env.ENCRYPTION_KEY),
            token_expires_at: expiresAt,
          });
        }
      } catch {
        return c.json(
          { error: 'ProjectX session expired. Please reconnect your account.', expired: true },
          401,
        );
      }

      // Determine which accounts to sync
      let accountsToSync = selectedAccounts;
      if (copytradeConfig) {
        // Only sync the lead account when copytrading
        accountsToSync = [copytradeConfig.leadAccountId];
      }

      // Resolve account IDs to names
      const accounts = await api.getAccounts(token);
      const accountNameMap = new Map(accounts.map((a: any) => [a.id, a.name]));

      // Fetch trades from each account
      const startTimestamp = brokerConn.last_sync_time || '2020-01-01T00:00:00Z';
      const allTrades: Array<{
        id: number;
        contractId: string;
        creationTimestamp: string;
        price: number;
        profitAndLoss: number;
        fees: number | null;
        side: number;
        size: number;
        orderId: number;
      }> = [];

      const tradeAccountMap = new Map<number, number>();

      for (const accountId of accountsToSync) {
        const trades = await api.searchTrades(token, accountId, startTimestamp);
        // Filter: only completed trades (non-null P&L) and not voided
        const completedTrades = trades.filter((t) => t.profitAndLoss !== null && !t.voided);
        for (const t of completedTrades) {
          tradeAccountMap.set(t.id, accountId);
        }
        allTrades.push(...(completedTrades as any[]));
      }

      if (allTrades.length === 0) {
        await brokerDb.updateById(serviceClient, connectionId, {
          last_sync_time: new Date().toISOString(),
        });
        return c.json({ message: 'No new trades found', synced: 0 });
      }

      // Dedup: check which trade IDs already exist
      const tradeIds = allTrades.map((t) => String(t.id));
      const existingIds = new Set(
        await pxConnDb.findByProjectXTradeIds(db, user.id, tradeIds),
      );

      const newTrades = allTrades.filter((t) => !existingIds.has(String(t.id)));

      if (newTrades.length === 0) {
        await brokerDb.updateById(serviceClient, connectionId, {
          last_sync_time: new Date().toISOString(),
        });
        return c.json({ message: 'No new trades found', synced: 0 });
      }

      // Resolve contract IDs to ticker names
      const uniqueContractIds = [...new Set(newTrades.map((t) => t.contractId))];
      const contractNames: Record<string, string> = {};
      await Promise.all(
        uniqueContractIds.map(async (contractId) => {
          try {
            const contract = await api.searchContract(token, contractId);
            if (contract) {
              // Extract base symbol (e.g., "NQU5" -> "NQ", "MESU5" -> "MES")
              const name = contract.name || contractId;
              // Strip trailing expiration code (letter + digit(s))
              const ticker = name.replace(/[A-Z]\d+$/i, '').toUpperCase();
              contractNames[contractId] = ticker || name.toUpperCase();
            } else {
              contractNames[contractId] = contractId;
            }
          } catch {
            contractNames[contractId] = contractId;
          }
        }),
      );

      // Apply copytrade multiplier
      const multiplier = copytradeConfig ? copytradeConfig.multiplier : 1;

      // Build trade objects for bulk insert
      const tradesToInsert = newTrades.map((t) => {
        const acctName = accountNameMap.get(tradeAccountMap.get(t.id) || 0) || 'Topstep';
        return {
          ticker: contractNames[t.contractId] || t.contractId,
          enterTime: new Date(t.creationTimestamp).toISOString(),
          exitTime: new Date(t.creationTimestamp).toISOString(),
          enterPrice: t.price,
          exitPrice: t.price,
          quantity: t.size * multiplier,
          manualPL: t.profitAndLoss * multiplier,
          projectxTradeId: String(t.id),
          projectxSource: 'projectx',
          brokerConnectionId: connectionId,
          account: acctName,
          isEval: brokerConn.is_eval || /EV/i.test(acctName),
        };
      });

      const result = await tradesDb.bulkInsertTrades(db, user.id, tradesToInsert);

      await brokerDb.updateById(serviceClient, connectionId, {
        last_sync_time: new Date().toISOString(),
      });

      return c.json({ message: `Synced ${result.imported} new trades`, synced: result.imported });
    } catch (err: any) {
      console.error('ProjectX sync error:', err.message);
      return c.json({ error: `Sync failed: ${err.message}` }, 500);
    }
  },
);

/**
 * DELETE /api/projectx/connections/:connectionId
 * Deletes a broker connection and its child projectx_connection (cascade).
 */
projectx.delete('/api/projectx/connections/:connectionId', requiresLogin, async (c) => {
  const user = c.get('user');
  const connectionId = c.req.param('connectionId');
  const serviceClient = getDb();

  try {
    await brokerDb.deleteById(serviceClient, connectionId, user.id);
    return c.json({ message: 'Connection deleted' });
  } catch (err: any) {
    return c.json({ error: `Failed to delete connection: ${err.message}` }, 500);
  }
});

export default projectx;
