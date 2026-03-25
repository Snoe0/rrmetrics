import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../bindings';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

/**
 * Developer auth middleware.
 * Requires the logged-in user's profile to have role 'developer' or 'admin'.
 * Must run AFTER authMiddleware which populates c.get('profile').
 */
export const requiresDeveloper = createMiddleware<HonoEnv>(async (c, next) => {
  const profile = c.get('profile');
  if (!profile || !['developer', 'admin'].includes(profile.role)) {
    return c.json({ error: 'Developer access required.' }, 403);
  }
  return next();
});
