import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import { createServiceClient } from '../lib/supabase';
import * as adminDb from '../db/admin';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const announcement = new Hono<HonoEnv>();

// GET /api/announcement/active — public, no auth required
announcement.get('/api/announcement/active', async (c) => {
  const supabase = createServiceClient(c.env);
  try {
    const active = await adminDb.getActiveAnnouncement(supabase);
    if (!active) return c.json({ announcement: null });
    return c.json({
      announcement: {
        id: active.id,
        title: active.title,
        body: active.body,
        type: active.type,
      },
    });
  } catch (err) {
    console.error('announcement error:', err);
    return c.json({ announcement: null }); // never break the app for this
  }
});

export default announcement;
