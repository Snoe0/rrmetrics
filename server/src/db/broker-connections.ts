import type { Db } from './connection';
import type { BrokerConnectionRow } from '../bindings';
import { generateId } from '../utils/id';

function rowFromDb(row: any): BrokerConnectionRow {
  return {
    ...row,
    is_eval: !!row.is_eval,
  } as BrokerConnectionRow;
}

export async function findByOwner(
  db: Db,
  ownerId: string,
): Promise<BrokerConnectionRow[]> {
  const rows = db
    .prepare('SELECT * FROM broker_connections WHERE owner = ? ORDER BY created_at DESC')
    .all(ownerId);
  return rows.map(rowFromDb);
}

export async function findByOwnerAndBroker(
  db: Db,
  ownerId: string,
  broker: string,
): Promise<BrokerConnectionRow[]> {
  const rows = db
    .prepare(
      'SELECT * FROM broker_connections WHERE owner = ? AND broker = ? ORDER BY created_at DESC',
    )
    .all(ownerId, broker);
  return rows.map(rowFromDb);
}

export async function findById(
  db: Db,
  id: string,
): Promise<BrokerConnectionRow | null> {
  const row = db.prepare('SELECT * FROM broker_connections WHERE id = ?').get(id);
  return row ? rowFromDb(row) : null;
}

export async function countByOwner(
  db: Db,
  ownerId: string,
): Promise<number> {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM broker_connections WHERE owner = ?')
    .get(ownerId) as { count: number };
  return row.count || 0;
}

/**
 * Creates a broker connection inside a transaction. The self-hosted build has
 * no connection limit — the `limit` argument is accepted for signature
 * compatibility but ignored.
 */
export async function createWithLimitCheck(
  db: Db,
  owner: string,
  broker: string,
  environment: string,
  label: string | null,
  _limit: number,
): Promise<string> {
  const id = generateId();
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO broker_connections (id, owner, broker, environment, label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, owner, broker, environment, label, now, now);
  });

  try {
    run();
  } catch (err: any) {
    throw new Error(`Failed to create broker connection: ${err.message}`);
  }

  return id;
}

export async function updateById(
  db: Db,
  id: string,
  data: Partial<Pick<BrokerConnectionRow, 'label' | 'last_sync_time' | 'is_eval'>>,
): Promise<void> {
  const columns: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];

  if (data.label !== undefined) {
    columns.push('label = ?');
    values.push(data.label);
  }
  if (data.last_sync_time !== undefined) {
    columns.push('last_sync_time = ?');
    values.push(data.last_sync_time);
  }
  if (data.is_eval !== undefined) {
    columns.push('is_eval = ?');
    values.push(data.is_eval ? 1 : 0);
  }

  try {
    db.prepare(`UPDATE broker_connections SET ${columns.join(', ')} WHERE id = ?`)
      .run(...values, id);
  } catch (err: any) {
    throw new Error(`Failed to update broker connection: ${err.message}`);
  }
}

export async function deleteById(
  db: Db,
  id: string,
  ownerId: string,
): Promise<void> {
  try {
    db.prepare('DELETE FROM broker_connections WHERE id = ? AND owner = ?').run(id, ownerId);
  } catch (err: any) {
    throw new Error(`Failed to delete broker connection: ${err.message}`);
  }
}

export async function cleanupPending(
  db: Db,
  thresholdIso: string,
): Promise<number> {
  // Delete broker_connections whose child tradovate_connections has a null
  // access_token (pending OAuth that was never completed) and that are older
  // than the threshold.
  const result = db
    .prepare(
      `DELETE FROM broker_connections
       WHERE created_at < ?
         AND id IN (
           SELECT broker_connection_id FROM tradovate_connections
           WHERE access_token IS NULL
         )`,
    )
    .run(thresholdIso);
  return result.changes;
}
