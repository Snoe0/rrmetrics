import { Hono } from 'hono';
import type { Env } from '../bindings';

type HonoEnv = {
  Bindings: Env;
};

const pages = new Hono<HonoEnv>();

/** Serve a static HTML page via the ASSETS binding */
async function servePage(env: Env, path: string): Promise<Response> {
  const url = new URL(path, 'https://placeholder');
  return env.ASSETS.fetch(new Request(url.toString()));
}

// All pages served publicly — client-side JS handles auth redirects
pages.get('/', (c) => servePage(c.env, '/index.html'));
pages.get('/login', (c) => servePage(c.env, '/login.html'));
pages.get('/trades', (c) => servePage(c.env, '/trades.html'));
pages.get('/changePass', (c) => servePage(c.env, '/changepass.html'));
pages.get('/upgrade', (c) => servePage(c.env, '/upgrade.html'));

export default pages;
