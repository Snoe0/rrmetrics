import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../bindings';

const ADMIN_EMAIL = 'maintainer@users.noreply.github.com';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

/**
 * Admin auth middleware.
 * Requires the logged-in Supabase user's email to match ADMIN_EMAIL.
 * Must run AFTER the global authMiddleware which populates c.get('user').
 */
export const requiresAdmin = createMiddleware<HonoEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user || user.email !== ADMIN_EMAIL) {
    return c.json({ error: 'Unauthorized.' }, 401);
  }
  return next();
});
