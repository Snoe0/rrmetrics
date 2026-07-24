import type { Db } from './connection';
import type { TradovateConnectionRow } from '../bindings';
import { generateId } from '../utils/id';

function parseNumberArray(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function rowFromDb(row: any): TradovateConnectionRow {
  return {
    ...row,
    selected_accounts: parseNumberArray(row.selected_accounts),
    account_ids: parseNumberArray(row.account_ids),
  } as TradovateConnectionRow;
}

export async function findByBrokerConnectionId(
  db: Db,
  brokerConnectionId: string,
): Promise<TradovateConnectionRow | null> {
  const row = db
    .prepare('SELECT * FROM tradovate_connections WHERE broker_connection_id = ?')
    .get(brokerConnectionId);
  return row ? rowFromDb(row) : null;
}

export async function create(
  db: Db,
  brokerConnectionId: string,
  oauthNonce: string,
): Promise<TradovateConnectionRow> {
  const id = generateId();
  try {
    db.prepare(
      `INSERT INTO tradovate_connections (id, broker_connection_id, oauth_nonce, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(id, brokerConnectionId, oauthNonce, new Date().toISOString());
  } catch (err: any) {
    throw new Error(`Failed to create tradovate connection: ${err.message}`);
  }

  const row = db.prepare('SELECT * FROM tradovate_connections WHERE id = ?').get(id);
  return rowFromDb(row);
}

export async function updateByBrokerConnectionId(
  db: Db,
  brokerConnectionId: string,
  updates: Partial<Pick<TradovateConnectionRow, 'access_token' | 'token_expires_at' | 'oauth_nonce' | 'selected_accounts' | 'account_ids'>>,
): Promise<void> {
  const columns: string[] = [];
  const values: unknown[] = [];

  if (updates.access_token !== undefined) {
    columns.push('access_token = ?');
    values.push(updates.access_token);
  }
  if (updates.token_expires_at !== undefined) {
    columns.push('token_expires_at = ?');
    values.push(updates.token_expires_at);
  }
  if (updates.oauth_nonce !== undefined) {
    columns.push('oauth_nonce = ?');
    values.push(updates.oauth_nonce);
  }
  if (updates.selected_accounts !== undefined) {
    columns.push('selected_accounts = ?');
    values.push(updates.selected_accounts == null ? null : JSON.stringify(updates.selected_accounts));
  }
  if (updates.account_ids !== undefined) {
    columns.push('account_ids = ?');
    values.push(updates.account_ids == null ? null : JSON.stringify(updates.account_ids));
  }

  if (columns.length === 0) return;

  try {
    db.prepare(
      `UPDATE tradovate_connections SET ${columns.join(', ')} WHERE broker_connection_id = ?`,
    ).run(...values, brokerConnectionId);
  } catch (err: any) {
    throw new Error(`Failed to update tradovate connection: ${err.message}`);
  }
}

export async function findExpiringSoon(
  db: Db,
  thresholdIso: string,
): Promise<Array<TradovateConnectionRow & { environment: string }>> {
  const rows = db
    .prepare(
      `SELECT tc.*, bc.environment AS environment
       FROM tradovate_connections tc
       JOIN broker_connections bc ON bc.id = tc.broker_connection_id
       WHERE tc.access_token IS NOT NULL AND tc.token_expires_at <= ?`,
    )
    .all(thresholdIso) as any[];

  return rows.map((row) => ({
    ...rowFromDb(row),
    environment: row.environment || 'demo',
  }));
}

/**
 * Check if any of the given Tradovate account IDs already exist in another
 * connection for this user. Returns the IDs that overlap, or empty array.
 */
export async function findDuplicateAccountIds(
  db: Db,
  ownerId: string,
  accountIds: number[],
  excludeConnectionId: string,
): Promise<number[]> {
  if (accountIds.length === 0) return [];

  const rows = db
    .prepare(
      `SELECT tc.account_ids
       FROM tradovate_connections tc
       JOIN broker_connections bc ON bc.id = tc.broker_connection_id
       WHERE bc.owner = ?
         AND tc.account_ids IS NOT NULL
         AND tc.broker_connection_id != ?`,
    )
    .all(ownerId, excludeConnectionId) as Array<{ account_ids: string | null }>;

  const existingIds = new Set<number>();
  for (const row of rows) {
    const ids = parseNumberArray(row.account_ids);
    if (ids) ids.forEach((id) => existingIds.add(id));
  }

  return accountIds.filter(id => existingIds.has(id));
}
