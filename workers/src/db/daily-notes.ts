import type { DailyNoteRow } from '../bindings';
import { generateId } from '../utils/id';

interface DailyNoteAPI {
  _id: string;
  date: string;
  content: string;
  owner: string;
}

function rowToAPI(row: DailyNoteRow): DailyNoteAPI {
  return {
    _id: row.id,
    date: row.date,
    content: row.content,
    owner: row.owner,
  };
}

export async function findByOwner(db: D1Database, owner: string): Promise<DailyNoteAPI[]> {
  const { results } = await db
    .prepare('SELECT * FROM daily_notes WHERE owner = ?')
    .bind(owner)
    .all<DailyNoteRow>();
  return (results || []).map(rowToAPI);
}

export async function upsert(
  db: D1Database,
  data: { date: string; content: string; owner: string },
): Promise<DailyNoteAPI> {
  const existing = await db
    .prepare('SELECT * FROM daily_notes WHERE owner = ? AND date = ?')
    .bind(data.owner, data.date)
    .first<DailyNoteRow>();

  if (existing) {
    await db
      .prepare('UPDATE daily_notes SET content = ? WHERE id = ?')
      .bind(data.content, existing.id)
      .run();
    return { _id: existing.id, date: data.date, content: data.content, owner: data.owner };
  }

  const id = generateId();
  await db
    .prepare('INSERT INTO daily_notes (id, date, content, owner) VALUES (?, ?, ?, ?)')
    .bind(id, data.date, data.content, data.owner)
    .run();
  return { _id: id, date: data.date, content: data.content, owner: data.owner };
}

export async function deleteByOwnerAndDate(
  db: D1Database,
  owner: string,
  date: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM daily_notes WHERE owner = ? AND date = ?')
    .bind(owner, date)
    .run();
}
