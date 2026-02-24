import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as profilesDb from '../db/profiles';
import * as tradesDb from '../db/trades';
import * as projectxDb from '../db/projectx';
import { encrypt, decrypt } from '../utils/crypto';
import { ProjectXAPI } from '../services/ProjectXAPI';
import { requiresLogin } from '../middleware/supabase-auth';
import { createServiceClient } from '../lib/supabase';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const projectx = new Hono<HonoEnv>();

/**
 * POST /api/projectx/connect
 * Verify credentials, authenticate, fetch accounts, store encrypted keys.
 */
projectx.post('/api/projectx/connect', requiresLogin, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { username, apiKey } = body as { username?: string; apiKey?: string };

  if (!username || !apiKey) {
    return c.json({ error: 'Username and API key are required' }, 400);
  }

  try {
    const api = new ProjectXAPI();
    const token = await api.authenticate(username, apiKey);

    // Fetch accounts to return to client
    const accounts = await api.getAccounts(token);

    // Store encrypted credentials
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const serviceClient = createServiceClient(c.env);
    await profilesDb.updateById(serviceClient, user.id, {
      projectxUsername: username,
      projectxApiKey: await encrypt(apiKey, c.env.ENCRYPTION_KEY),
      projectxToken: await encrypt(token, c.env.ENCRYPTION_KEY),
      projectxTokenExpiresAt: expiresAt,
    });

    return c.json({ message: 'Connected successfully', accounts });
  } catch (err: any) {
    console.error('ProjectX connect error:', err.message);
    return c.json({ error: `Failed to connect: ${err.message}` }, 400);
  }
});

/**
 * GET /api/projectx/status
 * Return connection status, selected accounts, copytrade config, and account list.
 */
projectx.get('/api/projectx/status', requiresLogin, async (c) => {
  const user = c.get('user');

  try {
    const serviceClient = createServiceClient(c.env);
    const profile = await profilesDb.findById(serviceClient, user.id);
    if (!profile) return c.json({ error: 'Account not found' }, 404);

    const hasToken = !!profile.projectx_token;
    const tokenExpired =
      hasToken && profile.projectx_token_expires_at
        ? new Date(profile.projectx_token_expires_at) < new Date()
        : false;

    const configured = hasToken && !tokenExpired;
    let accounts: any[] = [];

    // If connected, try to fetch current accounts
    if (configured) {
      try {
        const api = new ProjectXAPI();
        let token = await decrypt(profile.projectx_token!, c.env.ENCRYPTION_KEY);

        // Re-auth if expired
        if (tokenExpired && profile.projectx_username && profile.projectx_api_key) {
          const apiKey = await decrypt(profile.projectx_api_key, c.env.ENCRYPTION_KEY);
          token = await api.authenticate(profile.projectx_username, apiKey);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          await profilesDb.updateById(serviceClient, user.id, {
            projectxToken: await encrypt(token, c.env.ENCRYPTION_KEY),
            projectxTokenExpiresAt: expiresAt,
          });
        }

        accounts = await api.getAccounts(token);
      } catch {
        // If fetching accounts fails, still return status
      }
    }

    return c.json({
      configured,
      expired: hasToken && tokenExpired,
      selectedAccounts: profile.projectx_selected_accounts
        ? JSON.parse(profile.projectx_selected_accounts)
        : [],
      copytradeConfig: profile.projectx_copytrade_config
        ? JSON.parse(profile.projectx_copytrade_config)
        : null,
      lastSyncTime: profile.projectx_last_sync_time || null,
      accounts,
    });
  } catch (err: any) {
    console.error('ProjectX status error:', err.message);
    return c.json({ error: 'Failed to get ProjectX status' }, 500);
  }
});

/**
 * POST /api/projectx/accounts
 * Save selected accounts and copytrade configuration.
 */
projectx.post('/api/projectx/accounts', requiresLogin, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { selectedAccounts, copytradeConfig } = body as {
    selectedAccounts?: number[];
    copytradeConfig?: { leadAccountId: number; multiplier: number } | null;
  };

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
    const serviceClient = createServiceClient(c.env);
    await profilesDb.updateById(serviceClient, user.id, {
      projectxSelectedAccounts: JSON.stringify(selectedAccounts),
      projectxCopytradeConfig: copytradeConfig ? JSON.stringify(copytradeConfig) : null,
    });

    return c.json({ message: 'Account settings saved' });
  } catch (err: any) {
    console.error('ProjectX accounts save error:', err.message);
    return c.json({ error: 'Failed to save account settings' }, 500);
  }
});

/**
 * POST /api/projectx/sync
 * Incremental trade sync from ProjectX.
 */
projectx.post('/api/projectx/sync', requiresLogin, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const serviceClient = createServiceClient(c.env);
    const profile = await profilesDb.findById(serviceClient, user.id);

    if (!profile || !profile.projectx_token) {
      return c.json({ error: 'ProjectX not connected' }, 400);
    }

    const selectedAccounts: number[] = profile.projectx_selected_accounts
      ? JSON.parse(profile.projectx_selected_accounts)
      : [];

    if (selectedAccounts.length === 0) {
      return c.json({ error: 'No accounts selected for sync' }, 400);
    }

    const copytradeConfig = profile.projectx_copytrade_config
      ? JSON.parse(profile.projectx_copytrade_config)
      : null;

    // Decrypt token and re-auth if expired
    const api = new ProjectXAPI();
    let token: string;

    try {
      token = await decrypt(profile.projectx_token, c.env.ENCRYPTION_KEY);

      // Check if token is expired and re-authenticate
      if (
        profile.projectx_token_expires_at &&
        new Date(profile.projectx_token_expires_at) < new Date()
      ) {
        if (!profile.projectx_username || !profile.projectx_api_key) {
          return c.json(
            { error: 'ProjectX session expired. Please reconnect your account.', expired: true },
            401,
          );
        }
        const apiKey = await decrypt(profile.projectx_api_key, c.env.ENCRYPTION_KEY);
        token = await api.authenticate(profile.projectx_username, apiKey);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await profilesDb.updateById(serviceClient, user.id, {
          projectxToken: await encrypt(token, c.env.ENCRYPTION_KEY),
          projectxTokenExpiresAt: expiresAt,
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

    // Fetch trades from each account
    const startTimestamp = profile.projectx_last_sync_time || '2020-01-01T00:00:00Z';
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

    for (const accountId of accountsToSync) {
      const trades = await api.searchTrades(token, accountId, startTimestamp);
      // Filter: only completed trades (non-null P&L) and not voided
      const completedTrades = trades.filter((t) => t.profitAndLoss !== null && !t.voided);
      allTrades.push(...(completedTrades as any[]));
    }

    if (allTrades.length === 0) {
      await profilesDb.updateById(serviceClient, user.id, {
        projectxLastSyncTime: new Date().toISOString(),
      });
      return c.json({ message: 'No new trades found', synced: 0 });
    }

    // Dedup: check which trade IDs already exist
    const tradeIds = allTrades.map((t) => String(t.id));
    const existingIds = new Set(
      await projectxDb.findByProjectXTradeIds(supabase, user.id, tradeIds),
    );

    const newTrades = allTrades.filter((t) => !existingIds.has(String(t.id)));

    if (newTrades.length === 0) {
      await profilesDb.updateById(serviceClient, user.id, {
        projectxLastSyncTime: new Date().toISOString(),
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
    const tradesToInsert = newTrades.map((t) => ({
      ticker: contractNames[t.contractId] || t.contractId,
      enterTime: new Date(t.creationTimestamp).toISOString(),
      exitTime: new Date(t.creationTimestamp).toISOString(),
      enterPrice: t.price,
      exitPrice: t.price,
      quantity: t.size * multiplier,
      manualPL: t.profitAndLoss * multiplier,
      projectxTradeId: String(t.id),
      projectxSource: 'projectx',
    }));

    const result = await tradesDb.bulkInsertTrades(supabase, user.id, tradesToInsert);

    await profilesDb.updateById(serviceClient, user.id, {
      projectxLastSyncTime: new Date().toISOString(),
    });

    return c.json({ message: `Synced ${result.imported} new trades`, synced: result.imported });
  } catch (err: any) {
    console.error('ProjectX sync error:', err.message);
    return c.json({ error: `Sync failed: ${err.message}` }, 500);
  }
});

/**
 * DELETE /api/projectx/credentials
 * Disconnect ProjectX — clear all projectx_ fields.
 */
projectx.delete('/api/projectx/credentials', requiresLogin, async (c) => {
  const user = c.get('user');

  try {
    const serviceClient = createServiceClient(c.env);
    await profilesDb.updateById(serviceClient, user.id, {
      projectxUsername: null,
      projectxApiKey: null,
      projectxToken: null,
      projectxTokenExpiresAt: null,
      projectxSelectedAccounts: null,
      projectxCopytradeConfig: null,
      projectxLastSyncTime: null,
    });

    return c.json({ message: 'ProjectX disconnected' });
  } catch (err: any) {
    console.error('ProjectX disconnect error:', err.message);
    return c.json({ error: 'Failed to disconnect' }, 500);
  }
});

export default projectx;
