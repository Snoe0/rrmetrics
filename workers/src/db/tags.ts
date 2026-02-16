import type { TagRow } from '../bindings';
import { generateId } from '../utils/id';

interface TagAPI {
  _id: string;
  name: string;
  color: string;
  owner: string;
}

function rowToAPI(row: TagRow): TagAPI {
  return {
    _id: row.id,
    name: row.name,
    color: row.color,
    owner: row.owner,
  };
}

export async function findByOwner(db: D1Database, owner: string): Promise<TagAPI[]> {
  const { results } = await db
    .prepare('SELECT * FROM tags WHERE owner = ? ORDER BY name ASC')
    .bind(owner)
    .all<TagRow>();
  return (results || []).map(rowToAPI);
}

export async function create(
  db: D1Database,
  data: { name: string; color: string; owner: string },
): Promise<TagAPI> {
  const id = generateId();
  await db
    .prepare('INSERT INTO tags (id, name, color, owner) VALUES (?, ?, ?, ?)')
    .bind(id, data.name.trim(), data.color, data.owner)
    .run();
  return { _id: id, name: data.name.trim(), color: data.color, owner: data.owner };
}

export async function updateById(
  db: D1Database,
  id: string,
  owner: string,
  data: { name?: string; color?: string },
): Promise<TagAPI | null> {
  const existing = await db
    .prepare('SELECT * FROM tags WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .first<TagRow>();
  if (!existing) return null;

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    setClauses.push('name = ?');
    values.push(data.name.trim());
  }
  if (data.color !== undefined) {
    setClauses.push('color = ?');
    values.push(data.color);
  }

  if (setClauses.length === 0) return rowToAPI(existing);

  values.push(id, owner);
  await db
    .prepare(`UPDATE tags SET ${setClauses.join(', ')} WHERE id = ? AND owner = ?`)
    .bind(...values)
    .run();

  const updated = await db
    .prepare('SELECT * FROM tags WHERE id = ?')
    .bind(id)
    .first<TagRow>();
  return updated ? rowToAPI(updated) : null;
}

export async function deleteById(db: D1Database, id: string, owner: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM tags WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
