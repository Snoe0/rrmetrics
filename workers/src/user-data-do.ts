import { generateId } from './utils/id';

interface TradeData {
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
}

/**
 * Per-user Durable Object with SQLite storage.
 * Each user gets their own DO instance (keyed by account ID)
 * containing their trades, tags, trade_tags, and daily_notes.
 */
export class UserDataDO implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    state.blockConcurrencyWhile(async () => {
      this.initSchema();
    });
  }

  private get sql() {
    return (this.state.storage as any).sql as SqlStorage;
  }

  private initSchema(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      enter_time TEXT NOT NULL,
      exit_time TEXT NOT NULL,
      enter_price REAL NOT NULL,
      exit_price REAL NOT NULL,
      quantity REAL NOT NULL,
      manual_pl REAL DEFAULT NULL,
      image_attachments TEXT NOT NULL DEFAULT '[]',
      screenshot TEXT DEFAULT NULL,
      comments TEXT DEFAULT '',
      tradovate_order_id TEXT DEFAULT NULL,
      tradovate_source TEXT NOT NULL DEFAULT 'manual',
      created_date TEXT NOT NULL
    )`);

    this.sql.exec(`CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL
    )`);

    this.sql.exec(`CREATE TABLE IF NOT EXISTS trade_tags (
      trade_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (trade_id, tag_id)
    )`);

    this.sql.exec(`CREATE TABLE IF NOT EXISTS daily_notes (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL
    )`);

    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_trades_tradovate_order_id ON trades(tradovate_order_id)`,
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Trades
      if (path === '/trades') {
        if (method === 'GET') return this.getTrades();
        if (method === 'POST') return this.createTrade(await request.json());
        if (method === 'PUT') return this.updateTrade(await request.json());
        if (method === 'DELETE') return this.deleteTrade(await request.json());
      }
      if (path === '/trades/bulk' && method === 'POST') {
        return this.bulkInsertTrades(await request.json());
      }
      if (path === '/trades/tradovate-order-ids' && method === 'POST') {
        return this.findByTradovateOrderIds(await request.json());
      }

      // Tags
      if (path === '/tags') {
        if (method === 'GET') return this.getTags();
        if (method === 'POST') return this.createTag(await request.json());
        if (method === 'PUT') return this.updateTag(await request.json());
        if (method === 'DELETE') return this.deleteTag(await request.json());
      }

      // Daily Notes
      if (path === '/daily-notes') {
        if (method === 'GET') return this.getDailyNotes();
        if (method === 'POST') return this.upsertDailyNote(await request.json());
        if (method === 'DELETE') return this.deleteDailyNote(await request.json());
      }

      return new Response('Not found', { status: 404 });
    } catch (err: any) {
      console.error('UserDataDO error:', err);
      const status = err.message?.includes('UNIQUE constraint') ? 400 : 500;
      return Response.json({ error: err.message }, { status });
    }
  }

  // === TRADES ===

  private getTrades(): Response {
    const trades = this.sql
      .exec('SELECT * FROM trades ORDER BY created_date DESC')
      .toArray();

    if (trades.length === 0) return Response.json([]);

    const tradeTags = this.sql
      .exec('SELECT trade_id, tag_id FROM trade_tags')
      .toArray();
    const tagMap: Record<string, string[]> = {};
    for (const tt of tradeTags) {
      const tid = tt.trade_id as string;
      if (!tagMap[tid]) tagMap[tid] = [];
      tagMap[tid].push(tt.tag_id as string);
    }

    return Response.json(
      trades.map((row) => ({
        _id: row.id,
        ticker: row.ticker,
        enterTime: row.enter_time,
        exitTime: row.exit_time,
        enterPrice: row.enter_price,
        exitPrice: row.exit_price,
        quantity: row.quantity,
        manualPL: row.manual_pl,
        imageAttachments: JSON.parse((row.image_attachments as string) || '[]'),
        screenshot: row.screenshot,
        comments: row.comments || '',
        tags: tagMap[row.id as string] || [],
      })),
    );
  }

  private createTrade(data: TradeData): Response {
    const id = generateId();
    const now = new Date().toISOString();

    this.sql.exec(
      `INSERT INTO trades (id, ticker, enter_time, exit_time, enter_price, exit_price, quantity, manual_pl, image_attachments, screenshot, comments, tradovate_order_id, tradovate_source, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      now,
    );

    const tags = data.tags || [];
    for (const tagId of tags) {
      this.sql.exec(
        'INSERT INTO trade_tags (trade_id, tag_id) VALUES (?, ?)',
        id,
        tagId,
      );
    }

    return Response.json(
      {
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
      },
      { status: 201 },
    );
  }

  private updateTrade(data: TradeData & { _id: string }): Response {
    const existing = this.sql
      .exec('SELECT id, image_attachments FROM trades WHERE id = ?', data._id)
      .toArray();
    if (existing.length === 0) {
      return Response.json({ error: 'Trade not found!' }, { status: 404 });
    }

    this.sql.exec(
      `UPDATE trades SET ticker = ?, enter_time = ?, exit_time = ?, enter_price = ?, exit_price = ?, quantity = ?, manual_pl = ?, screenshot = ?, comments = ?
       WHERE id = ?`,
      data.ticker,
      data.enterTime,
      data.exitTime,
      data.enterPrice,
      data.exitPrice,
      data.quantity,
      data.manualPL ?? null,
      data.screenshot || null,
      data.comments || '',
      data._id,
    );

    // Update tags: delete old, insert new
    this.sql.exec('DELETE FROM trade_tags WHERE trade_id = ?', data._id);
    const tags = data.tags || [];
    for (const tagId of tags) {
      this.sql.exec(
        'INSERT INTO trade_tags (trade_id, tag_id) VALUES (?, ?)',
        data._id,
        tagId,
      );
    }

    return Response.json({
      _id: data._id,
      ticker: data.ticker,
      enterTime: data.enterTime,
      exitTime: data.exitTime,
      enterPrice: data.enterPrice,
      exitPrice: data.exitPrice,
      quantity: data.quantity,
      manualPL: data.manualPL ?? null,
      imageAttachments: JSON.parse(
        (existing[0].image_attachments as string) || '[]',
      ),
      screenshot: data.screenshot || null,
      comments: data.comments || '',
      tags,
    });
  }

  private deleteTrade(data: { _id: string }): Response {
    const existing = this.sql
      .exec('SELECT id FROM trades WHERE id = ?', data._id)
      .toArray();
    if (existing.length === 0) {
      return Response.json({ error: 'Trade not found!' }, { status: 404 });
    }

    this.sql.exec('DELETE FROM trade_tags WHERE trade_id = ?', data._id);
    this.sql.exec('DELETE FROM trades WHERE id = ?', data._id);

    return Response.json({ message: 'Trade deleted successfully!' });
  }

  private bulkInsertTrades(data: { trades: TradeData[] }): Response {
    let count = 0;
    for (const t of data.trades) {
      const id = generateId();
      const now = new Date().toISOString();

      this.sql.exec(
        `INSERT INTO trades (id, ticker, enter_time, exit_time, enter_price, exit_price, quantity, manual_pl, image_attachments, screenshot, comments, tradovate_order_id, tradovate_source, created_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        now,
      );

      const tags = t.tags || [];
      for (const tagId of tags) {
        this.sql.exec(
          'INSERT INTO trade_tags (trade_id, tag_id) VALUES (?, ?)',
          id,
          tagId,
        );
      }
      count++;
    }

    return Response.json({ imported: count }, { status: 201 });
  }

  private findByTradovateOrderIds(data: { orderIds: string[] }): Response {
    if (!data.orderIds || data.orderIds.length === 0) {
      return Response.json([]);
    }

    const placeholders = data.orderIds.map(() => '?').join(',');
    const results = this.sql
      .exec(
        `SELECT tradovate_order_id FROM trades WHERE tradovate_order_id IN (${placeholders})`,
        ...data.orderIds,
      )
      .toArray();

    return Response.json(
      results.map((r) => r.tradovate_order_id as string),
    );
  }

  // === TAGS ===

  private getTags(): Response {
    const tags = this.sql
      .exec('SELECT * FROM tags ORDER BY name ASC')
      .toArray();
    return Response.json(
      tags.map((row) => ({
        _id: row.id,
        name: row.name,
        color: row.color,
      })),
    );
  }

  private createTag(data: { name: string; color: string }): Response {
    const id = generateId();
    this.sql.exec(
      'INSERT INTO tags (id, name, color) VALUES (?, ?, ?)',
      id,
      data.name.trim(),
      data.color,
    );
    return Response.json(
      { _id: id, name: data.name.trim(), color: data.color },
      { status: 201 },
    );
  }

  private updateTag(data: {
    _id: string;
    name?: string;
    color?: string;
  }): Response {
    const existing = this.sql
      .exec('SELECT * FROM tags WHERE id = ?', data._id)
      .toArray();
    if (existing.length === 0) {
      return Response.json({ error: 'Tag not found!' }, { status: 404 });
    }

    const row = existing[0];
    const newName =
      data.name !== undefined ? data.name.trim() : (row.name as string);
    const newColor =
      data.color !== undefined ? data.color : (row.color as string);

    this.sql.exec(
      'UPDATE tags SET name = ?, color = ? WHERE id = ?',
      newName,
      newColor,
      data._id,
    );

    return Response.json({ _id: data._id, name: newName, color: newColor });
  }

  private deleteTag(data: { _id: string }): Response {
    const existing = this.sql
      .exec('SELECT id FROM tags WHERE id = ?', data._id)
      .toArray();
    if (existing.length === 0) {
      return Response.json({ error: 'Tag not found!' }, { status: 404 });
    }

    this.sql.exec('DELETE FROM trade_tags WHERE tag_id = ?', data._id);
    this.sql.exec('DELETE FROM tags WHERE id = ?', data._id);

    return Response.json({ message: 'Tag deleted successfully!' });
  }

  // === DAILY NOTES ===

  private getDailyNotes(): Response {
    const notes = this.sql.exec('SELECT * FROM daily_notes').toArray();
    return Response.json(
      notes.map((row) => ({
        _id: row.id,
        date: row.date,
        content: row.content,
      })),
    );
  }

  private upsertDailyNote(data: { date: string; content: string }): Response {
    const existing = this.sql
      .exec('SELECT * FROM daily_notes WHERE date = ?', data.date)
      .toArray();

    if (existing.length > 0) {
      this.sql.exec(
        'UPDATE daily_notes SET content = ? WHERE id = ?',
        data.content,
        existing[0].id,
      );
      return Response.json({
        note: {
          _id: existing[0].id,
          date: data.date,
          content: data.content,
        },
      });
    }

    const id = generateId();
    this.sql.exec(
      'INSERT INTO daily_notes (id, date, content) VALUES (?, ?, ?)',
      id,
      data.date,
      data.content,
    );
    return Response.json({
      note: { _id: id, date: data.date, content: data.content },
    });
  }

  private deleteDailyNote(data: { date: string }): Response {
    this.sql.exec('DELETE FROM daily_notes WHERE date = ?', data.date);
    return Response.json({ message: 'Note deleted' });
  }
}
