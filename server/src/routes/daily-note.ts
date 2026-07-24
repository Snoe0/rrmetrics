import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as dailyNotesDb from '../db/daily-notes';
import { requiresLogin } from '../middleware/auth';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const dailyNote = new Hono<HonoEnv>();

// GET /api/getDailyNotes
dailyNote.get('/api/getDailyNotes', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  try {
    const notes = await dailyNotesDb.getDailyNotes(db, user.id);
    return c.json({ notes });
  } catch (err) {
    console.error('getDailyNotes error:', err);
    return c.json({ error: 'Failed to fetch notes' }, 500);
  }
});

// POST /api/saveDailyNote
dailyNote.post('/api/saveDailyNote', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();
  const { date, content } = body;

  if (!date || !content) {
    return c.json({ error: 'Date and content are required' }, 400);
  }

  try {
    const result = await dailyNotesDb.upsertDailyNote(db, user.id, { date, content });
    return c.json(result);
  } catch (err) {
    console.error('saveDailyNote error:', err);
    return c.json({ error: 'Failed to save note' }, 500);
  }
});

// POST /api/removeDailyNote
dailyNote.post('/api/removeDailyNote', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();
  const { date } = body;

  if (!date) {
    return c.json({ error: 'Date is required' }, 400);
  }

  try {
    await dailyNotesDb.deleteDailyNote(db, user.id, date);
    return c.json({ message: 'Note deleted' });
  } catch (err) {
    console.error('removeDailyNote error:', err);
    return c.json({ error: 'Failed to delete note' }, 500);
  }
});

export default dailyNote;
