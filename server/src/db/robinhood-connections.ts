import type { Db } from './connection';
import type { RobinhoodConnectionRow } from '../bindings';
import { generateId } from '../utils/id';

export async function findByBrokerConnectionId(
  db: Db,
  brokerConnectionId: string,
): Promise<RobinhoodConnectionRow | null> {
  const row = db
    .prepare('SELECT * FROM robinhood_connections WHERE broker_connection_id = ?')
    .get(brokerConnectionId);
  return (row as RobinhoodConnectionRow) || null;
}

export async function create(
  db: Db,
  brokerConnectionId: string,
  data: {
    access_token: string;
    refresh_token?: string;
    token_expires_at: string;
    account_id?: string;
    device_token?: string;
  },
): Promise<RobinhoodConnectionRow> {
  const id = generateId();
  try {
    db.prepare(
      `INSERT INTO robinhood_connections (
         id, broker_connection_id, access_token, refresh_token,
         token_expires_at, account_id, device_token, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      brokerConnectionId,
      data.access_token,
      data.refresh_token || null,
      data.token_expires_at,
      data.account_id || null,
      data.device_token || null,
      new Date().toISOString(),
    );
  } catch (err: any) {
    throw new Error(`Failed to create robinhood connection: ${err.message}`);
  }

  const row = db.prepare('SELECT * FROM robinhood_connections WHERE id = ?').get(id);
  return row as RobinhoodConnectionRow;
}

export async function updateByBrokerConnectionId(
  db: Db,
  brokerConnectionId: string,
  updates: Partial<Pick<RobinhoodConnectionRow, 'access_token' | 'refresh_token' | 'token_expires_at' | 'account_id' | 'device_token'>>,
): Promise<void> {
  const allowed: Array<keyof typeof updates> = [
    'access_token', 'refresh_token', 'token_expires_at', 'account_id', 'device_token',
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
      `UPDATE robinhood_connections SET ${columns.join(', ')} WHERE broker_connection_id = ?`,
    ).run(...values, brokerConnectionId);
  } catch (err: any) {
    throw new Error(`Failed to update robinhood connection: ${err.message}`);
  }
}

export async function findExpiringSoon(
  db: Db,
  thresholdIso: string,
): Promise<Array<RobinhoodConnectionRow & { environment: string }>> {
  const rows = db
    .prepare(
      `SELECT rc.*, bc.environment AS environment
       FROM robinhood_connections rc
       JOIN broker_connections bc ON bc.id = rc.broker_connection_id
       WHERE rc.access_token IS NOT NULL AND rc.token_expires_at <= ?`,
    )
    .all(thresholdIso) as any[];

  return rows.map((row) => ({
    ...row,
    environment: row.environment || 'live',
  }));
}
