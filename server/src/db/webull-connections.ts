import type { Db } from './connection';
import type { WebullConnectionRow } from '../bindings';
import { generateId } from '../utils/id';

export async function findByBrokerConnectionId(
  db: Db,
  brokerConnectionId: string,
): Promise<WebullConnectionRow | null> {
  const row = db
    .prepare('SELECT * FROM webull_connections WHERE broker_connection_id = ?')
    .get(brokerConnectionId);
  return (row as WebullConnectionRow) || null;
}

export async function create(
  db: Db,
  brokerConnectionId: string,
  oauthNonce: string,
): Promise<WebullConnectionRow> {
  const id = generateId();
  try {
    db.prepare(
      `INSERT INTO webull_connections (id, broker_connection_id, oauth_nonce, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(id, brokerConnectionId, oauthNonce, new Date().toISOString());
  } catch (err: any) {
    throw new Error(`Failed to create webull connection: ${err.message}`);
  }

  const row = db.prepare('SELECT * FROM webull_connections WHERE id = ?').get(id);
  return row as WebullConnectionRow;
}

export async function updateByBrokerConnectionId(
  db: Db,
  brokerConnectionId: string,
  updates: Partial<Pick<WebullConnectionRow, 'access_token' | 'refresh_token' | 'token_expires_at' | 'oauth_nonce' | 'account_id'>>,
): Promise<void> {
  const allowed: Array<keyof typeof updates> = [
    'access_token', 'refresh_token', 'token_expires_at', 'oauth_nonce', 'account_id',
  ];
  const columns: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      columns.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }

  if (columns.length === 0) return;

  try {
    db.prepare(
      `UPDATE webull_connections SET ${columns.join(', ')} WHERE broker_connection_id = ?`,
    ).run(...values, brokerConnectionId);
  } catch (err: any) {
    throw new Error(`Failed to update webull connection: ${err.message}`);
  }
}

export async function findExpiringSoon(
  db: Db,
  thresholdIso: string,
): Promise<Array<WebullConnectionRow & { environment: string }>> {
  const rows = db
    .prepare(
      `SELECT wc.*, bc.environment AS environment
       FROM webull_connections wc
       JOIN broker_connections bc ON bc.id = wc.broker_connection_id
       WHERE wc.access_token IS NOT NULL AND wc.token_expires_at <= ?`,
    )
    .all(thresholdIso) as any[];

  return rows.map((row) => ({
    ...row,
    environment: row.environment || 'live',
  }));
}
