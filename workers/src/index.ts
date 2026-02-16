import { Hono } from 'hono';
import type { Env } from './bindings';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ status: 'ok' }));

export default app;
