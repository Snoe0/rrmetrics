import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env, SessionData } from '../bindings';
import { getUserDataStub } from '../utils/user-data';
import { requiresLogin } from '../middleware/auth';

type HonoEnv = {
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
};

const tag = new Hono<HonoEnv>();

// GET /api/getTags
tag.get('/api/getTags', requiresLogin, async (c) => {
  const session = c.get('session')!;
  try {
    const stub = getUserDataStub(c.env, session.account._id);
    const res = await stub.fetch(new Request('http://do/tags'));
    const tags = await res.json();
    return c.json({ tags });
  } catch (err) {
    console.error('getTags error:', err);
    return c.json({ error: 'Error retrieving tags!' }, 500);
  }
});

// POST /api/makeTag
tag.post('/api/makeTag', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();

  if (!body.name || !body.color) {
    return c.json({ error: 'Name and color are required!' }, 400);
  }

  try {
    const stub = getUserDataStub(c.env, session.account._id);
    const res = await stub.fetch(
      new Request('http://do/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.name.trim(), color: body.color }),
      }),
    );

    if (!res.ok) {
      const err = await res.json() as any;
      return c.json(
        { error: err.error || 'An error occurred' },
        res.status as ContentfulStatusCode,
      );
    }

    const newTag = await res.json();
    return c.json(newTag, 201);
  } catch (err: any) {
    console.error('makeTag error:', err);
    return c.json({ error: 'An error occurred' }, 500);
  }
});

// POST /api/updateTag
tag.post('/api/updateTag', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();

  if (!body._id) {
    return c.json({ error: 'Tag ID is required!' }, 400);
  }

  try {
    const updateData: { _id: string; name?: string; color?: string } = { _id: body._id };
    if (body.name) updateData.name = body.name.trim();
    if (body.color) updateData.color = body.color;

    const stub = getUserDataStub(c.env, session.account._id);
    const res = await stub.fetch(
      new Request('http://do/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      }),
    );

    if (!res.ok) {
      const err = await res.json() as any;
      return c.json(
        { error: err.error || 'An error occurred while updating the tag!' },
        res.status as ContentfulStatusCode,
      );
    }

    const updated = await res.json();
    return c.json(updated);
  } catch (err: any) {
    console.error('updateTag error:', err);
    return c.json({ error: 'An error occurred while updating the tag!' }, 500);
  }
});

// POST /api/removeTag
tag.post('/api/removeTag', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();

  if (!body._id) {
    return c.json({ error: 'Tag ID is required to delete!' }, 400);
  }

  try {
    const stub = getUserDataStub(c.env, session.account._id);
    const res = await stub.fetch(
      new Request('http://do/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: body._id }),
      }),
    );

    if (!res.ok) {
      const err = await res.json() as any;
      return c.json(
        { error: err.error || 'Tag not found!' },
        res.status as ContentfulStatusCode,
      );
    }

    return c.json({ message: 'Tag deleted successfully!' });
  } catch (err) {
    console.error('removeTag error:', err);
    return c.json({ error: 'An error occurred while deleting the tag!' }, 500);
  }
});

export default tag;
