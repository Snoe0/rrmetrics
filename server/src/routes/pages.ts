import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { Env } from '../bindings';
import { PUBLIC_DIR } from '../config';

type HonoEnv = {
  Bindings: Env;
};

const pages = new Hono<HonoEnv>();

/** Serve a static HTML page from the public/ directory */
async function servePage(filename: string): Promise<string> {
  return fs.promises.readFile(path.join(PUBLIC_DIR, filename), 'utf8');
}

// All pages served publicly — client-side JS handles auth redirects
pages.get('/', (c) => c.redirect('/login'));
pages.get('/login', async (c) => c.html(await servePage('login.html')));
pages.get('/trades', async (c) => c.html(await servePage('trades.html')));
pages.get('/changePass', async (c) => c.html(await servePage('changepass.html')));

export default pages;
