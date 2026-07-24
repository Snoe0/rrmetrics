import type { Db } from './connection';
import { generateId } from '../utils/id';

interface TradeAPI {
  _id: string;
  ticker: string;
  enterTime: string;
  exitTime: string;
  enterPrice: number;
  exitPrice: number;
  quantity: number;
  manualPL: number | null;
  imageAttachments: string[];
  screenshot: string | null;
  comments: string;
  isEval: boolean;
  tradovateOrderId: string | null;
  tradovateSource: string;
  projectxTradeId: string | null;
  projectxSource: string | null;
  brokerConnectionId: string | null;
  account: string | null;
  createdDate: string;
  tags: string[];
}

function parseJsonArray(value: unknown): string[] {
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

function rowToAPI(row: any, tagIds: string[] = []): TradeAPI {
  return {
    _id: row.id,
    ticker: row.ticker,
    enterTime: row.enter_time,
    exitTime: row.exit_time,
    enterPrice: row.enter_price,
    exitPrice: row.exit_price,
    quantity: row.quantity,
    manualPL: row.manual_pl,
    imageAttachments: parseJsonArray(row.image_attachments),
    screenshot: row.screenshot,
    comments: row.comments || '',
    isEval: !!row.is_eval,
    tradovateOrderId: row.tradovate_order_id,
    tradovateSource: row.tradovate_source,
    projectxTradeId: row.projectx_trade_id || null,
    projectxSource: row.projectx_source || null,
    brokerConnectionId: row.broker_connection_id || null,
    account: row.account || null,
    createdDate: row.created_date,
    tags: tagIds,
  };
}

/** Splits an array into chunks so IN (...) lists stay under SQLite limits. */
function chunk<T>(items: T[], size = 500): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

export async function countTrades(db: Db, userId: string): Promise<number> {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM trades WHERE user_id = ?')
    .get(userId) as { count: number };
  return row.count || 0;
}

export async function getTrades(db: Db, userId: string): Promise<TradeAPI[]> {
  const trades = db
    .prepare('SELECT * FROM trades WHERE user_id = ? ORDER BY created_date DESC')
    .all(userId) as any[];

  if (trades.length === 0) return [];

  // Owner-scoped fetch of all tag assignments for this user's trades
  const tradeTags = db
    .prepare(
      `SELECT tt.trade_id, tt.tag_id
       FROM trade_tags tt
       JOIN trades t ON t.id = tt.trade_id
       WHERE t.user_id = ?`,
    )
    .all(userId) as Array<{ trade_id: string; tag_id: string }>;

  const tagMap: Record<string, string[]> = {};
  for (const tt of tradeTags) {
    if (!tagMap[tt.trade_id]) tagMap[tt.trade_id] = [];
    tagMap[tt.trade_id].push(tt.tag_id);
  }

  return trades.map((row) => rowToAPI(row, tagMap[row.id] || []));
}

export async function createTrade(
  db: Db,
  userId: string,
  data: {
    ticker: string;
    enterTime: string;
    exitTime: string;
    enterPrice: number;
    exitPrice: number;
    quantity: number;
    manualPL?: number | null;
    imageAttachments?: string[];
    screenshot?: string | null;
    comments?: string;
    isEval?: boolean;
    account?: string | null;
    tags?: string[];
  },
): Promise<TradeAPI> {
  const id = generateId();
  const tags = data.tags || [];

  const insertTradeTag = db.prepare(
    'INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)',
  );

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO trades (
         id, user_id, ticker, enter_time, exit_time, enter_price, exit_price,
         quantity, manual_pl, image_attachments, screenshot, comments, is_eval,
         account, created_date
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      data.ticker,
      data.enterTime,
      data.exitTime,
      data.enterPrice,
      data.exitPrice,
      data.quantity,
      data.manualPL ?? null,
      JSON.stringify(data.imageAttachments || []),
      data.screenshot || null,
      data.comments || '',
      data.isEval ? 1 : 0,
      data.account || 'Manual',
      new Date().toISOString(),
    );

    for (const tagId of tags) {
      insertTradeTag.run(id, tagId);
    }
  });
  run();

  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  return rowToAPI(trade, tags);
}

export async function updateTrade(
  db: Db,
  userId: string,
  data: {
    _id: string;
    ticker: string;
    enterTime: string;
    exitTime: string;
    enterPrice: number;
    exitPrice: number;
    quantity: number;
    manualPL?: number | null;
    screenshot?: string | null;
    comments?: string;
    isEval?: boolean;
    account?: string | null;
    tags?: string[];
  },
): Promise<TradeAPI> {
  const tags = data.tags || [];

  const insertTradeTag = db.prepare(
    'INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)',
  );

  const run = db.transaction(() => {
    const result = db.prepare(
      `UPDATE trades SET
         ticker = ?, enter_time = ?, exit_time = ?, enter_price = ?,
         exit_price = ?, quantity = ?, manual_pl = ?, screenshot = ?,
         comments = ?, is_eval = ?, account = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      data.ticker,
      data.enterTime,
      data.exitTime,
      data.enterPrice,
      data.exitPrice,
      data.quantity,
      data.manualPL ?? null,
      data.screenshot || null,
      data.comments || '',
      data.isEval ? 1 : 0,
      data.account || 'Manual',
      data._id,
      userId,
    );

    if (result.changes === 0) {
      throw new Error('Trade not found');
    }

    // Replace trade_tags
    db.prepare('DELETE FROM trade_tags WHERE trade_id = ?').run(data._id);
    for (const tagId of tags) {
      insertTradeTag.run(data._id, tagId);
    }
  });
  run();

  const trade = db
    .prepare('SELECT * FROM trades WHERE id = ? AND user_id = ?')
    .get(data._id, userId);
  return rowToAPI(trade, tags);
}

export async function deleteTrade(
  db: Db,
  userId: string,
  tradeId: string,
): Promise<void> {
  db.prepare('DELETE FROM trades WHERE id = ? AND user_id = ?').run(tradeId, userId);
}

export async function bulkInsertTrades(
  db: Db,
  userId: string,
  trades: Array<{
    ticker: string;
    enterTime: string;
    exitTime: string;
    enterPrice: number;
    exitPrice: number;
    quantity: number;
    manualPL?: number | null;
    comments?: string;
    tags?: string[];
    tradovateOrderId?: string | null;
    tradovateSource?: string;
    projectxTradeId?: string | null;
    projectxSource?: string | null;
    brokerConnectionId?: string | null;
    account?: string | null;
    isEval?: boolean;
  }>,
): Promise<{ imported: number; skipped: number }> {
  // Dedup: fetch existing trades that share any of the incoming enter_times
  const enterTimes = [...new Set(trades.map((t) => t.enterTime))];
  const existing: any[] = [];
  for (const group of chunk(enterTimes)) {
    const rows = db
      .prepare(
        `SELECT ticker, enter_time, exit_time, quantity, account
         FROM trades
         WHERE user_id = ? AND enter_time IN (${placeholders(group.length)})`,
      )
      .all(userId, ...group);
    existing.push(...rows);
  }

  // Normalize timestamps to second precision (strips ms + tz offset differences)
  const normalizeTime = (t: string) => new Date(t).toISOString().slice(0, 19);

  const tradeKey = (ticker: string, enterTime: string, exitTime: string, quantity: number, account?: string | null) =>
    `${ticker}|${normalizeTime(enterTime)}|${normalizeTime(exitTime)}|${Number(quantity).toFixed(0)}|${account || ''}`;

  const existingKeys = new Set<string>(
    existing.map((r: any) => tradeKey(r.ticker, r.enter_time, r.exit_time, r.quantity, r.account)),
  );

  const newTrades = trades.filter(
    (t) => !existingKeys.has(tradeKey(t.ticker, t.enterTime, t.exitTime, t.quantity, t.account)),
  );

  const skipped = trades.length - newTrades.length;

  if (newTrades.length === 0) return { imported: 0, skipped };

  const insertTrade = db.prepare(
    `INSERT INTO trades (
       id, user_id, ticker, enter_time, exit_time, enter_price, exit_price,
       quantity, manual_pl, comments, tradovate_order_id, tradovate_source,
       projectx_trade_id, projectx_source, broker_connection_id, account,
       is_eval, created_date
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertTradeTag = db.prepare(
    'INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)',
  );

  const now = new Date().toISOString();
  let imported = 0;

  const run = db.transaction(() => {
    for (const t of newTrades) {
      const id = generateId();
      insertTrade.run(
        id,
        userId,
        t.ticker,
        t.enterTime,
        t.exitTime,
        t.enterPrice,
        t.exitPrice,
        t.quantity,
        t.manualPL ?? null,
        t.comments || '',
        t.tradovateOrderId || null,
        t.tradovateSource || 'manual',
        t.projectxTradeId || null,
        t.projectxSource || null,
        t.brokerConnectionId || null,
        t.account || null,
        t.isEval ? 1 : 0,
        now,
      );
      imported++;

      for (const tagId of t.tags || []) {
        insertTradeTag.run(id, tagId);
      }
    }
  });
  run();

  return { imported, skipped };
}

export async function findByTradovateOrderIds(
  db: Db,
  userId: string,
  orderIds: string[],
): Promise<string[]> {
  if (orderIds.length === 0) return [];

  const found: string[] = [];
  for (const group of chunk(orderIds)) {
    const rows = db
      .prepare(
        `SELECT tradovate_order_id FROM trades
         WHERE user_id = ? AND tradovate_order_id IN (${placeholders(group.length)})`,
      )
      .all(userId, ...group) as Array<{ tradovate_order_id: string | null }>;
    for (const row of rows) {
      if (row.tradovate_order_id) found.push(row.tradovate_order_id);
    }
  }
  return found;
}

// The trades schema has no robinhood/webull order-id columns, so broker order
// IDs are not persisted for these brokers. Dedup falls back to the time-based
// key inside bulkInsertTrades; these lookups therefore never match.
export async function findByRobinhoodOrderIds(
  _db: Db,
  _userId: string,
  _orderIds: string[],
): Promise<string[]> {
  return [];
}

export async function findByWebullOrderIds(
  _db: Db,
  _userId: string,
  _orderIds: string[],
): Promise<string[]> {
  return [];
}

export async function bulkUpdateEval(
  db: Db,
  userId: string,
  tradeIds: string[],
  isEval: boolean,
): Promise<number> {
  let updated = 0;
  for (const group of chunk(tradeIds)) {
    const result = db
      .prepare(
        `UPDATE trades SET is_eval = ?
         WHERE user_id = ? AND id IN (${placeholders(group.length)})`,
      )
      .run(isEval ? 1 : 0, userId, ...group);
    updated += result.changes;
  }
  return updated;
}

export async function bulkAddTags(
  db: Db,
  userId: string,
  tradeIds: string[],
  tagIds: string[],
): Promise<number> {
  // Verify ownership of all trades
  const ownedIds = new Set<string>();
  for (const group of chunk(tradeIds)) {
    const rows = db
      .prepare(
        `SELECT id FROM trades
         WHERE user_id = ? AND id IN (${placeholders(group.length)})`,
      )
      .all(userId, ...group) as Array<{ id: string }>;
    for (const row of rows) ownedIds.add(row.id);
  }

  // Get existing trade_tags to avoid duplicates
  const existingSet = new Set<string>();
  for (const group of chunk(tradeIds)) {
    const rows = db
      .prepare(
        `SELECT trade_id, tag_id FROM trade_tags
         WHERE trade_id IN (${placeholders(group.length)})`,
      )
      .all(...group) as Array<{ trade_id: string; tag_id: string }>;
    for (const row of rows) existingSet.add(`${row.trade_id}|${row.tag_id}`);
  }

  const inserts: Array<{ trade_id: string; tag_id: string }> = [];
  for (const tradeId of tradeIds) {
    if (!ownedIds.has(tradeId)) continue;
    for (const tagId of tagIds) {
      if (!existingSet.has(`${tradeId}|${tagId}`)) {
        inserts.push({ trade_id: tradeId, tag_id: tagId });
      }
    }
  }

  if (inserts.length > 0) {
    const insertTradeTag = db.prepare(
      'INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)',
    );
    const run = db.transaction(() => {
      for (const pair of inserts) {
        insertTradeTag.run(pair.trade_id, pair.tag_id);
      }
    });
    run();
  }

  return inserts.length;
}

export async function bulkDeleteTrades(
  db: Db,
  userId: string,
  tradeIds: string[],
): Promise<number> {
  let deleted = 0;
  for (const group of chunk(tradeIds)) {
    const result = db
      .prepare(
        `DELETE FROM trades
         WHERE user_id = ? AND id IN (${placeholders(group.length)})`,
      )
      .run(userId, ...group);
    deleted += result.changes;
  }
  return deleted;
}
