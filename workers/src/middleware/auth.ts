import { createMiddleware } from 'hono/factory';
import type { Env, SessionData } from '../bindings';

/**
 * Requires an authenticated session. Redirects browser requests to /,
 * returns 401 for API requests.
 */
export const requiresLogin = createMiddleware<{
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
}>(async (c, next) => {
  const session = c.get('session');
  if (!session) {
    const accept = c.req.header('Accept') || '';
    if (accept.includes('application/json')) {
      return c.json({ error: 'Not authenticated' }, 401);
    }
    return c.redirect('/');
  }
  return next();
});

/**
 * Requires no active session (for login/signup pages).
 * Redirects to /trades if already logged in.
 */
export const requiresLogout = createMiddleware<{
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
}>(async (c, next) => {
  const session = c.get('session');
  if (session) {
    return c.redirect('/trades');
  }
  return next();
});
