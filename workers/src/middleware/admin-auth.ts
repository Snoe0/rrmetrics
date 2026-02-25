import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../bindings';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

/**
 * Admin auth middleware.
 * Checks Authorization: Bearer <ADMIN_SECRET>.
 * Returns 401 if secret is missing or wrong.
 */
export const requiresAdmin = createMiddleware<HonoEnv>(async (c, next) => {
  const adminSecret = c.env.ADMIN_SECRET;
  if (!adminSecret) {
    return c.json({ error: 'Admin not configured.' }, 503);
  }

  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || token !== adminSecret) {
    return c.json({ error: 'Unauthorized.' }, 401);
  }

  return next();
});
