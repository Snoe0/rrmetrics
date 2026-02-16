import type { TradeRow } from '../bindings';
import { generateId } from '../utils/id';
import { getTagIdsForTrades } from './trade-tags';

interface TradeWithTags {
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
  tags: string[];
  tradovateOrderId?: string | null;
  tradovateSource?: string;
}

function rowToAPI(row: TradeRow, tagIds: string[]): TradeWithTags {
  return {
    _id: row.id,
    ticker: row.ticker,
    enterTime: row.enter_time,
    exitTime: row.exit_time,
    enterPrice: row.enter_price,
    exitPrice: row.exit_price,
    quantity: row.quantity,
    manualPL: row.manual_pl,
    imageAttachments: JSON.parse(row.image_attachments || '[]'),
    screenshot: row.screenshot,
    comments: row.comments || '',
    tags: tagIds,
  };
}

export async function findByOwner(db: D1Database, owner: string): Promise<TradeWithTags[]> {
  const { results } = await db
    .prepare('SELECT * FROM trades WHERE owner = ?')
    .bind(owner)
    .all<TradeRow>();

  if (!results || results.length === 0) return [];

  const tradeIds = results.map((r) => r.id);
  const tagMap = await getTagIdsForTrades(db, tradeIds);

  return results.map((row) => rowToAPI(row, tagMap[row.id] || []));
}

export async function findById(db: D1Database, id: string, owner: string): Promise<TradeRow | null> {
  return db
    .prepare('SELECT * FROM trades WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .first<TradeRow>();
}

export async function create(
  db: D1Database,
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
    tags?: string[];
    tradovateOrderId?: string | null;
    tradovateSource?: string;
    owner: string;
  },
): Promise<TradeWithTags> {
  const id = generateId();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO trades (id, ticker, enter_time, exit_time, enter_price, exit_price, quantity, manual_pl, image_attachments, screenshot, comments, tradovate_order_id, tradovate_source, owner, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
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
      data.tradovateOrderId || null,
      data.tradovateSource || 'manual',
      data.owner,
      now,
    )
    .run();

  // Insert tags into junction table
  const tags = data.tags || [];
  if (tags.length > 0) {
    const stmts = tags.map((tagId) =>
      db.prepare('INSERT INTO trade_tags (trade_id, tag_id) VALUES (?, ?)').bind(id, tagId),
    );
    await db.batch(stmts);
  }

  return {
    _id: id,
    ticker: data.ticker,
    enterTime: data.enterTime,
    exitTime: data.exitTime,
    enterPrice: data.enterPrice,
    exitPrice: data.exitPrice,
    quantity: data.quantity,
    manualPL: data.manualPL ?? null,
    imageAttachments: data.imageAttachments || [],
    screenshot: data.screenshot || null,
    comments: data.comments || '',
    tags,
  };
}

export async function updateById(
  db: D1Database,
  id: string,
  owner: string,
  data: {
    ticker: string;
    enterTime: string;
    exitTime: string;
    enterPrice: number;
    exitPrice: number;
    quantity: number;
    manualPL?: number | null;
    screenshot?: string | null;
    comments?: string;
    tags?: string[];
  },
): Promise<TradeWithTags | null> {
  const existing = await findById(db, id, owner);
  if (!existing) return null;

  await db
    .prepare(
      `UPDATE trades SET ticker = ?, enter_time = ?, exit_time = ?, enter_price = ?, exit_price = ?, quantity = ?, manual_pl = ?, screenshot = ?, comments = ?
       WHERE id = ? AND owner = ?`,
    )
    .bind(
      data.ticker,
      data.enterTime,
      data.exitTime,
      data.enterPrice,
      data.exitPrice,
      data.quantity,
      data.manualPL ?? null,
      data.screenshot || null,
      data.comments || '',
      id,
      owner,
    )
    .run();

  // Update tags: delete old, insert new
  const tags = data.tags || [];
  const deleteStmt = db.prepare('DELETE FROM trade_tags WHERE trade_id = ?').bind(id);
  const insertStmts = tags.map((tagId) =>
    db.prepare('INSERT INTO trade_tags (trade_id, tag_id) VALUES (?, ?)').bind(id, tagId),
  );
  await db.batch([deleteStmt, ...insertStmts]);

  return {
    _id: id,
    ticker: data.ticker,
    enterTime: data.enterTime,
    exitTime: data.exitTime,
    enterPrice: data.enterPrice,
    exitPrice: data.exitPrice,
    quantity: data.quantity,
    manualPL: data.manualPL ?? null,
    imageAttachments: JSON.parse(existing.image_attachments || '[]'),
    screenshot: data.screenshot || null,
    comments: data.comments || '',
    tags,
  };
}

export async function deleteById(db: D1Database, id: string, owner: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM trades WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function bulkInsert(
  db: D1Database,
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
    owner: string;
  }>,
): Promise<number> {
  const BATCH_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    const batch = trades.slice(i, i + BATCH_SIZE);
    const stmts: D1PreparedStatement[] = [];
    const tagStmts: D1PreparedStatement[] = [];

    for (const t of batch) {
      const id = generateId();
      const now = new Date().toISOString();
      stmts.push(
        db
          .prepare(
            `INSERT INTO trades (id, ticker, enter_time, exit_time, enter_price, exit_price, quantity, manual_pl, image_attachments, screenshot, comments, tradovate_order_id, tradovate_source, owner, created_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            t.ticker,
            t.enterTime,
            t.exitTime,
            t.enterPrice,
            t.exitPrice,
            t.quantity,
            t.manualPL ?? null,
            '[]',
            null,
            t.comments || '',
            t.tradovateOrderId || null,
            t.tradovateSource || 'manual',
            t.owner,
            now,
          ),
      );

      // Tag associations
      const tags = t.tags || [];
      for (const tagId of tags) {
        tagStmts.push(
          db.prepare('INSERT INTO trade_tags (trade_id, tag_id) VALUES (?, ?)').bind(id, tagId),
        );
      }
    }

    await db.batch([...stmts, ...tagStmts]);
    totalInserted += batch.length;
  }

  return totalInserted;
}

export async function findByTradovateOrderIds(
  db: D1Database,
  orderIds: string[],
  owner: string,
): Promise<string[]> {
  if (orderIds.length === 0) return [];

  const placeholders = orderIds.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT tradovate_order_id FROM trades WHERE tradovate_order_id IN (${placeholders}) AND owner = ?`,
    )
    .bind(...orderIds, owner)
    .all<{ tradovate_order_id: string }>();

  return (results || []).map((r) => r.tradovate_order_id);
}
