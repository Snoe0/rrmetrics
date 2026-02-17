import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env, SessionData } from '../bindings';
import { getUserDataStub } from '../utils/user-data';
import { requiresLogin } from '../middleware/auth';

type HonoEnv = {
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
};

const dailyNote = new Hono<HonoEnv>();

// GET /api/getDailyNotes
dailyNote.get('/api/getDailyNotes', requiresLogin, async (c) => {
  const session = c.get('session')!;
  try {
    const stub = getUserDataStub(c.env, session.account._id);
    const res = await stub.fetch(new Request('http://do/daily-notes'));
    const notes = await res.json();
    return c.json({ notes });
  } catch (err) {
    console.error('getDailyNotes error:', err);
    return c.json({ error: 'Failed to fetch notes' }, 500);
  }
});

// POST /api/saveDailyNote
dailyNote.post('/api/saveDailyNote', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();
  const { date, content } = body;

  if (!date || !content) {
    return c.json({ error: 'Date and content are required' }, 400);
  }

  try {
    const stub = getUserDataStub(c.env, session.account._id);
    const res = await stub.fetch(
      new Request('http://do/daily-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, content }),
      }),
    );

    if (!res.ok) {
      const err = await res.json() as any;
      return c.json({ error: err.error || 'Failed to save note' }, res.status as ContentfulStatusCode);
    }

    const result = await res.json();
    return c.json(result);
  } catch (err) {
    console.error('saveDailyNote error:', err);
    return c.json({ error: 'Failed to save note' }, 500);
  }
});

// POST /api/removeDailyNote
dailyNote.post('/api/removeDailyNote', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();
  const { date } = body;

  if (!date) {
    return c.json({ error: 'Date is required' }, 400);
  }

  try {
    const stub = getUserDataStub(c.env, session.account._id);
    const res = await stub.fetch(
      new Request('http://do/daily-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      }),
    );

    if (!res.ok) {
      const err = await res.json() as any;
      return c.json({ error: err.error || 'Failed to delete note' }, res.status as ContentfulStatusCode);
    }

    return c.json({ message: 'Note deleted' });
  } catch (err) {
    console.error('removeDailyNote error:', err);
    return c.json({ error: 'Failed to delete note' }, 500);
  }
});

export default dailyNote;
