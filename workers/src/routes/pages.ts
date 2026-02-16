import { Hono } from 'hono';
import type { Env, SessionData } from '../bindings';
import { requiresLogin } from '../middleware/auth';
import { requiresLogout } from '../middleware/auth';

type HonoEnv = {
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
};

const pages = new Hono<HonoEnv>();

/** Serve a static HTML page via the ASSETS binding */
async function servePage(env: Env, path: string): Promise<Response> {
  const url = new URL(path, 'https://placeholder');
  return env.ASSETS.fetch(new Request(url.toString()));
}

// Landing page (public) - redirect to /trades if logged in
pages.get('/', async (c) => {
  const session = c.get('session');
  if (session) {
    return c.redirect('/trades');
  }
  return servePage(c.env, '/index.html');
});

// Login page - requires logout
pages.get('/login', requiresLogout, async (c) => {
  return servePage(c.env, '/login.html');
});

// Trades page - requires login
pages.get('/trades', requiresLogin, async (c) => {
  return servePage(c.env, '/trades.html');
});

// Change password page - requires login
pages.get('/changePass', requiresLogin, async (c) => {
  return servePage(c.env, '/changepass.html');
});

// Upgrade page - requires login
pages.get('/upgrade', requiresLogin, async (c) => {
  return servePage(c.env, '/upgrade.html');
});

export default pages;
