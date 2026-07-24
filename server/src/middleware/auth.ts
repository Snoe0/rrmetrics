import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { Env, AuthContext } from '../bindings';
import { getJwtSecret } from '../config';
import { getDb } from '../db/connection';
import * as profilesDb from '../db/profiles';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

/**
 * Auth middleware: reads the Authorization header, verifies the JWT (HS256,
 * signed with the server secret), loads the user's profile, and sets
 * user/accessToken/profile/db on context.
 */
export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verify(token, getJwtSecret(), 'HS256');
    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    if (!userId) {
      return next();
    }

    const db = getDb();
    const profile = await profilesDb.findById(db, userId);

    if (profile) {
      c.set('user', { id: profile.id, email: profile.email });
      c.set('accessToken', token);
      c.set('profile', profile);
      c.set('db', db);
    }
  } catch {
    // Invalid token — continue unauthenticated
  }

  return next();
});

/**
 * Requires an authenticated user. Returns 401 for API requests,
 * redirects browser requests to /.
 */
export const requiresLogin = createMiddleware<HonoEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) {
    const accept = c.req.header('Accept') || '';
    if (accept.includes('application/json')) {
      return c.json({ error: 'Not authenticated' }, 401);
    }
    return c.redirect('/');
  }
  return next();
});

/**
 * Requires no active session (for login page).
 * Redirects to /trades if authenticated.
 */
export const requiresLogout = createMiddleware<HonoEnv>(async (c, next) => {
  const user = c.get('user');
  if (user) {
    return c.redirect('/trades');
  }
  return next();
});
