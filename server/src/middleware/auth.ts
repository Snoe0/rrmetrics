import { createMiddleware } from 'hono/factory';
import type { Env, AuthContext } from '../bindings';
import { getDb } from '../db/connection';
import * as profilesDb from '../db/profiles';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

/**
 * Local-user middleware: this app is self-hosted and single-user, so there is
 * no authentication. Every request is attached to the one implicit local user
 * (resolved/created by `ensureLocalUser`), setting user/profile/db on context.
 * All owner-scoped queries continue to work unchanged.
 */
export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const db = getDb();
  const profile = await profilesDb.ensureLocalUser(db);

  c.set('user', { id: profile.id, email: profile.email });
  c.set('accessToken', '');
  c.set('profile', profile);
  c.set('db', db);

  return next();
});

/**
 * Kept so existing route definitions (`route.get(path, requiresLogin, ...)`)
 * keep working. With the local user always present there is nothing to gate.
 */
export const requiresLogin = createMiddleware<HonoEnv>(async (c, next) => next());
