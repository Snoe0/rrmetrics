import type { Db } from './connection';
import type { SyncerConfigRow, SyncerOrderLogRow } from '../bindings';
import { generateId } from '../utils/id';

function parseFollowerAccounts(value: unknown): SyncerConfigRow['follower_accounts'] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function configRowFromDb(row: any): SyncerConfigRow {
  return {
    ...row,
    follower_accounts: parseFollowerAccounts(row.follower_accounts),
    is_active: !!row.is_active,
  } as SyncerConfigRow;
}

export async function getConfig(
  db: Db,
  ownerId: string,
): Promise<SyncerConfigRow | null> {
  const row = db.prepare('SELECT * FROM trade_syncer_configs WHERE owner = ?').get(ownerId);
  return row ? configRowFromDb(row) : null;
}

export async function upsertConfig(
  db: Db,
  ownerId: string,
  leaderConnectionId: string | null,
  leaderAccountId: number | null,
  followerAccounts: Array<{ connectionId: string; accountId: number; multiplier: number }>,
): Promise<SyncerConfigRow> {
  const now = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO trade_syncer_configs (
         id, owner, leader_connection_id, leader_account_id, follower_accounts, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner) DO UPDATE SET
         leader_connection_id = excluded.leader_connection_id,
         leader_account_id = excluded.leader_account_id,
         follower_accounts = excluded.follower_accounts,
         updated_at = excluded.updated_at`,
    ).run(
      generateId(),
      ownerId,
      leaderConnectionId,
      leaderAccountId,
      JSON.stringify(followerAccounts),
      now,
      now,
    );
  } catch (err: any) {
    throw new Error(`Failed to upsert syncer config: ${err.message}`);
  }

  const config = await getConfig(db, ownerId);
  if (!config) throw new Error('Failed to upsert syncer config');
  return config;
}

export async function setActive(
  db: Db,
  configId: string,
  active: boolean,
): Promise<void> {
  try {
    db.prepare('UPDATE trade_syncer_configs SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(active ? 1 : 0, new Date().toISOString(), configId);
  } catch (err: any) {
    throw new Error(`Failed to update syncer active state: ${err.message}`);
  }
}

export async function logOrder(
  db: Db,
  entry: {
    config_id: string;
    leader_order_id: number;
    leader_action?: string;
    leader_symbol?: string;
    leader_qty?: number;
    follower_account_id: number;
    follower_order_id?: number;
    follower_qty?: number;
    order_type?: string;
    status: string;
    error_message?: string;
  },
): Promise<SyncerOrderLogRow> {
  try {
    db.prepare(
      `INSERT INTO syncer_order_log (
         id, config_id, leader_order_id, leader_action, leader_symbol, leader_qty,
         follower_account_id, follower_order_id, follower_qty, order_type,
         status, error_message, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(config_id, leader_order_id, follower_account_id) DO UPDATE SET
         leader_action = COALESCE(excluded.leader_action, syncer_order_log.leader_action),
         leader_symbol = COALESCE(excluded.leader_symbol, syncer_order_log.leader_symbol),
         leader_qty = COALESCE(excluded.leader_qty, syncer_order_log.leader_qty),
         follower_order_id = COALESCE(excluded.follower_order_id, syncer_order_log.follower_order_id),
         follower_qty = COALESCE(excluded.follower_qty, syncer_order_log.follower_qty),
         order_type = COALESCE(excluded.order_type, syncer_order_log.order_type),
         status = excluded.status,
         error_message = excluded.error_message`,
    ).run(
      generateId(),
      entry.config_id,
      entry.leader_order_id,
      entry.leader_action ?? null,
      entry.leader_symbol ?? null,
      entry.leader_qty ?? null,
      entry.follower_account_id,
      entry.follower_order_id ?? null,
      entry.follower_qty ?? null,
      entry.order_type ?? null,
      entry.status,
      entry.error_message ?? null,
      new Date().toISOString(),
    );
  } catch (err: any) {
    throw new Error(`Failed to log syncer order: ${err.message}`);
  }

  const row = db
    .prepare(
      `SELECT * FROM syncer_order_log
       WHERE config_id = ? AND leader_order_id = ? AND follower_account_id = ?`,
    )
    .get(entry.config_id, entry.leader_order_id, entry.follower_account_id);
  return row as SyncerOrderLogRow;
}

export async function getRecentLogs(
  db: Db,
  configId: string,
  limit: number = 50,
): Promise<SyncerOrderLogRow[]> {
  const rows = db
    .prepare('SELECT * FROM syncer_order_log WHERE config_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(configId, limit);
  return rows as SyncerOrderLogRow[];
}

export async function findFollowerOrders(
  db: Db,
  configId: string,
  leaderOrderId: number,
): Promise<SyncerOrderLogRow[]> {
  const rows = db
    .prepare(
      `SELECT * FROM syncer_order_log
       WHERE config_id = ? AND leader_order_id = ? AND status = 'placed'`,
    )
    .all(configId, leaderOrderId);
  return rows as SyncerOrderLogRow[];
}

export async function findExistingMirror(
  db: Db,
  configId: string,
  leaderOrderId: number,
  followerAccountId: number,
): Promise<SyncerOrderLogRow | null> {
  const row = db
    .prepare(
      `SELECT * FROM syncer_order_log
       WHERE config_id = ? AND leader_order_id = ? AND follower_account_id = ?`,
    )
    .get(configId, leaderOrderId, followerAccountId);
  return (row as SyncerOrderLogRow) || null;
}
