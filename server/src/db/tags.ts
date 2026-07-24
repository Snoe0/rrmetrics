import type { Db } from './connection';
import { generateId } from '../utils/id';

interface TagAPI {
  _id: string;
  name: string;
  color: string;
}

function rowToAPI(row: any): TagAPI {
  return { _id: row.id, name: row.name, color: row.color };
}

export async function getTags(db: Db, userId: string): Promise<TagAPI[]> {
  const rows = db
    .prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name')
    .all(userId);
  return rows.map(rowToAPI);
}

export async function createTag(
  db: Db,
  userId: string,
  data: { name: string; color: string },
): Promise<TagAPI> {
  const id = generateId();
  try {
    db.prepare('INSERT INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)')
      .run(id, userId, data.name, data.color);
  } catch (err: any) {
    if (String(err.message).includes('UNIQUE')) {
      throw new Error('A tag with this name already exists');
    }
    throw new Error(err.message);
  }

  const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(id, userId);
  return rowToAPI(tag);
}

export async function updateTag(
  db: Db,
  userId: string,
  data: { _id: string; name?: string; color?: string },
): Promise<TagAPI> {
  const columns: string[] = [];
  const values: unknown[] = [];
  if (data.name) {
    columns.push('name = ?');
    values.push(data.name);
  }
  if (data.color) {
    columns.push('color = ?');
    values.push(data.color);
  }

  if (columns.length > 0) {
    const result = db
      .prepare(`UPDATE tags SET ${columns.join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...values, data._id, userId);
    if (result.changes === 0) throw new Error('Tag not found');
  }

  const tag = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(data._id, userId);
  if (!tag) throw new Error('Tag not found');
  return rowToAPI(tag);
}

export async function deleteTag(
  db: Db,
  userId: string,
  tagId: string,
): Promise<void> {
  db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(tagId, userId);
}
