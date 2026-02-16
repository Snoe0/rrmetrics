import { Hono } from 'hono';
import type { Env, SessionData } from '../bindings';
import * as dailyNotesDb from '../db/daily-notes';
import { requiresLogin } from '../middleware/auth';

type HonoEnv = {
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
};

const dailyNote = new Hono<HonoEnv>();

// GET /getDailyNotes
dailyNote.get('/getDailyNotes', requiresLogin, async (c) => {
  const session = c.get('session')!;
  try {
    const notes = await dailyNotesDb.findByOwner(c.env.DB, session.account._id);
    return c.json({ notes });
  } catch (err) {
    console.error('getDailyNotes error:', err);
    return c.json({ error: 'Failed to fetch notes' }, 500);
  }
});

// POST /saveDailyNote
dailyNote.post('/saveDailyNote', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();
  const { date, content } = body;

  if (!date || !content) {
    return c.json({ error: 'Date and content are required' }, 400);
  }

  try {
    const note = await dailyNotesDb.upsert(c.env.DB, {
      date,
      content,
      owner: session.account._id,
    });
    return c.json({ note });
  } catch (err) {
    console.error('saveDailyNote error:', err);
    return c.json({ error: 'Failed to save note' }, 500);
  }
});

// POST /removeDailyNote
dailyNote.post('/removeDailyNote', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();
  const { date } = body;

  if (!date) {
    return c.json({ error: 'Date is required' }, 400);
  }

  try {
    await dailyNotesDb.deleteByOwnerAndDate(c.env.DB, session.account._id, date);
    return c.json({ message: 'Note deleted' });
  } catch (err) {
    console.error('removeDailyNote error:', err);
    return c.json({ error: 'Failed to delete note' }, 500);
  }
});

export default dailyNote;
