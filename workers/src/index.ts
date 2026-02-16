import { Hono } from 'hono';
import type { Env, SessionData } from './bindings';
import { securityHeaders } from './middleware/security';
import { sessionMiddleware } from './middleware/session';
import accountRoutes from './routes/account';
import tradeRoutes from './routes/trade';
import tagRoutes from './routes/tag';
import dailyNoteRoutes from './routes/daily-note';
import tradovateRoutes from './routes/tradovate';
import stripeRoutes from './routes/stripe';
import pageRoutes from './routes/pages';

// Re-export the Durable Object class
export { SessionDO } from './session-do';

type HonoEnv = {
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
};

const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', securityHeaders);
app.use('*', sessionMiddleware);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// API routes (must be before page routes to take precedence)
app.route('/', accountRoutes);
app.route('/', tradeRoutes);
app.route('/', tagRoutes);
app.route('/', dailyNoteRoutes);
app.route('/', tradovateRoutes);
app.route('/', stripeRoutes);

// Page routes (HTML serving with auth guards)
app.route('/', pageRoutes);

export default app;
