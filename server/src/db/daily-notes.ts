import type { Db } from './connection';
import { generateId } from '../utils/id';

interface DailyNoteAPI {
  _id: string;
  date: string;
  content: string;
}

function rowToAPI(row: any): DailyNoteAPI {
  return { _id: row.id, date: row.date, content: row.content };
}

export async function getDailyNotes(
  db: Db,
  userId: string,
): Promise<DailyNoteAPI[]> {
  const rows = db
    .prepare('SELECT * FROM daily_notes WHERE user_id = ? ORDER BY date DESC')
    .all(userId);
  return rows.map(rowToAPI);
}

export async function upsertDailyNote(
  db: Db,
  userId: string,
  data: { date: string; content: string },
): Promise<DailyNoteAPI> {
  db.prepare(
    `INSERT INTO daily_notes (id, user_id, date, content)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET content = excluded.content`,
  ).run(generateId(), userId, data.date, data.content);

  const note = db
    .prepare('SELECT * FROM daily_notes WHERE user_id = ? AND date = ?')
    .get(userId, data.date);
  return rowToAPI(note);
}

export async function deleteDailyNote(
  db: Db,
  userId: string,
  date: string,
): Promise<void> {
  db.prepare('DELETE FROM daily_notes WHERE user_id = ? AND date = ?').run(userId, date);
}
