import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Env, AuthContext } from './bindings';
import { securityHeaders } from './middleware/security';
import { authMiddleware } from './middleware/auth';
import uploadRoutes from './routes/uploads';
import accountRoutes from './routes/account';
import tradeRoutes from './routes/trade';
import tagRoutes from './routes/tag';
import dailyNoteRoutes from './routes/daily-note';
import tradovateRoutes from './routes/tradovate';
import projectxRoutes from './routes/projectx';
import premarketRoutes from './routes/premarket';
import strategyRoutes from './routes/strategy';
import backtestingRoutes from './routes/backtesting';
import syncerRoutes from './routes/syncer';
import robinhoodRoutes from './routes/robinhood';
import webullRoutes from './routes/webull';
import pageRoutes from './routes/pages';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', securityHeaders);
app.use('*', authMiddleware);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// API routes (must be before page routes to take precedence)
app.route('/', uploadRoutes);
app.route('/', accountRoutes);
app.route('/', tradeRoutes);
app.route('/', tagRoutes);
app.route('/', dailyNoteRoutes);
app.route('/', tradovateRoutes);
app.route('/', projectxRoutes);
app.route('/', premarketRoutes);
app.route('/', strategyRoutes);
app.route('/', backtestingRoutes);
app.route('/', syncerRoutes);
app.route('/', robinhoodRoutes);
app.route('/', webullRoutes);

// Static assets from public/ (bundles, css, manifest, service worker, ...)
app.use('/*', serveStatic({ root: './public' }));

// Page routes (HTML serving)
app.route('/', pageRoutes);

export default app;
