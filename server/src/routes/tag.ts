import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as tagsDb from '../db/tags';
import { requiresLogin } from '../middleware/auth';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const tag = new Hono<HonoEnv>();

// GET /api/getTags
tag.get('/api/getTags', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  try {
    const tags = await tagsDb.getTags(db, user.id);
    return c.json({ tags });
  } catch (err) {
    console.error('getTags error:', err);
    return c.json({ error: 'Error retrieving tags!' }, 500);
  }
});

// POST /api/makeTag
tag.post('/api/makeTag', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();

  if (!body.name || !body.color) {
    return c.json({ error: 'Name and color are required!' }, 400);
  }

  try {
    const newTag = await tagsDb.createTag(db, user.id, {
      name: body.name.trim(),
      color: body.color,
    });
    return c.json(newTag, 201);
  } catch (err: any) {
    console.error('makeTag error:', err);
    if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
      return c.json({ error: 'A tag with that name already exists!' }, 400);
    }
    return c.json({ error: 'An error occurred' }, 500);
  }
});

// POST /api/updateTag
tag.post('/api/updateTag', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();

  if (!body._id) {
    return c.json({ error: 'Tag ID is required!' }, 400);
  }

  try {
    const updated = await tagsDb.updateTag(db, user.id, {
      _id: body._id,
      name: body.name?.trim(),
      color: body.color,
    });
    return c.json(updated);
  } catch (err) {
    console.error('updateTag error:', err);
    return c.json({ error: 'An error occurred while updating the tag!' }, 500);
  }
});

// POST /api/removeTag
tag.post('/api/removeTag', requiresLogin, async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const body = await c.req.json();

  if (!body._id) {
    return c.json({ error: 'Tag ID is required to delete!' }, 400);
  }

  try {
    await tagsDb.deleteTag(db, user.id, body._id);
    return c.json({ message: 'Tag deleted successfully!' });
  } catch (err) {
    console.error('removeTag error:', err);
    return c.json({ error: 'An error occurred while deleting the tag!' }, 500);
  }
});

export default tag;
