import { Hono } from 'hono';
import type { Env, SessionData } from '../bindings';
import * as tagsDb from '../db/tags';
import { removeTagFromAllTrades } from '../db/trade-tags';
import { requiresLogin } from '../middleware/auth';

type HonoEnv = {
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
};

const tag = new Hono<HonoEnv>();

// GET /getTags
tag.get('/getTags', requiresLogin, async (c) => {
  const session = c.get('session')!;
  try {
    const tags = await tagsDb.findByOwner(c.env.DB, session.account._id);
    return c.json({ tags });
  } catch (err) {
    console.error('getTags error:', err);
    return c.json({ error: 'Error retrieving tags!' }, 500);
  }
});

// POST /makeTag
tag.post('/makeTag', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();

  if (!body.name || !body.color) {
    return c.json({ error: 'Name and color are required!' }, 400);
  }

  try {
    const newTag = await tagsDb.create(c.env.DB, {
      name: body.name.trim(),
      color: body.color,
      owner: session.account._id,
    });
    return c.json(newTag, 201);
  } catch (err: any) {
    console.error('makeTag error:', err);
    if (err.message?.includes('UNIQUE constraint')) {
      return c.json({ error: 'A tag with that name already exists!' }, 400);
    }
    return c.json({ error: 'An error occurred' }, 500);
  }
});

// POST /updateTag
tag.post('/updateTag', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();

  if (!body._id) {
    return c.json({ error: 'Tag ID is required!' }, 400);
  }

  try {
    const updateData: { name?: string; color?: string } = {};
    if (body.name) updateData.name = body.name.trim();
    if (body.color) updateData.color = body.color;

    const updated = await tagsDb.updateById(c.env.DB, body._id, session.account._id, updateData);

    if (!updated) {
      return c.json({ error: 'Tag not found!' }, 404);
    }

    return c.json(updated);
  } catch (err: any) {
    console.error('updateTag error:', err);
    if (err.message?.includes('UNIQUE constraint')) {
      return c.json({ error: 'A tag with that name already exists!' }, 400);
    }
    return c.json({ error: 'An error occurred while updating the tag!' }, 500);
  }
});

// POST /removeTag
tag.post('/removeTag', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();

  if (!body._id) {
    return c.json({ error: 'Tag ID is required to delete!' }, 400);
  }

  try {
    const deleted = await tagsDb.deleteById(c.env.DB, body._id, session.account._id);
    if (!deleted) {
      return c.json({ error: 'Tag not found!' }, 404);
    }

    // Remove tag from all trade associations
    await removeTagFromAllTrades(c.env.DB, body._id);

    return c.json({ message: 'Tag deleted successfully!' });
  } catch (err) {
    console.error('removeTag error:', err);
    return c.json({ error: 'An error occurred while deleting the tag!' }, 500);
  }
});

export default tag;
