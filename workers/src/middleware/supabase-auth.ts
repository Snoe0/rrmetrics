import { createMiddleware } from 'hono/factory';
import type { Env, ProfileRow, AuthContext } from '../bindings';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createUserClient } from '../lib/supabase';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

/**
 * Auth middleware: reads Authorization header, validates JWT with Supabase,
 * loads the user's profile, and sets user/accessToken/profile/supabase on context.
 */
export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const supabase = createUserClient(c.env, token);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return next();
    }

    // Load profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profile) {
      c.set('user', user);
      c.set('accessToken', token);
      c.set('profile', profile as ProfileRow);
      c.set('supabase', supabase);
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
