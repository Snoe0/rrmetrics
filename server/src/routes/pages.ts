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

// Single-user local app: the journal is the home page, no login/auth pages.
pages.get('/', (c) => c.redirect('/trades'));
pages.get('/trades', async (c) => c.html(await servePage('trades.html')));

export default pages;
