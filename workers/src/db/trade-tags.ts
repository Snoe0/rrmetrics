export async function setTagsForTrade(
  db: D1Database,
  tradeId: string,
  tagIds: string[],
): Promise<void> {
  const deleteStmt = db.prepare('DELETE FROM trade_tags WHERE trade_id = ?').bind(tradeId);
  const insertStmts = tagIds.map((tagId) =>
    db.prepare('INSERT INTO trade_tags (trade_id, tag_id) VALUES (?, ?)').bind(tradeId, tagId),
  );
  await db.batch([deleteStmt, ...insertStmts]);
}

export async function getTagIdsForTrades(
  db: D1Database,
  tradeIds: string[],
): Promise<Record<string, string[]>> {
  if (tradeIds.length === 0) return {};

  const placeholders = tradeIds.map(() => '?').join(',');
  const { results } = await db
    .prepare(`SELECT trade_id, tag_id FROM trade_tags WHERE trade_id IN (${placeholders})`)
    .bind(...tradeIds)
    .all<{ trade_id: string; tag_id: string }>();

  const map: Record<string, string[]> = {};
  for (const row of results || []) {
    if (!map[row.trade_id]) map[row.trade_id] = [];
    map[row.trade_id].push(row.tag_id);
  }
  return map;
}

export async function removeTagFromAllTrades(db: D1Database, tagId: string): Promise<void> {
  await db.prepare('DELETE FROM trade_tags WHERE tag_id = ?').bind(tagId).run();
}
