import { Hono } from 'hono';
import type { Env, AuthContext } from './bindings';
import { securityHeaders } from './middleware/security';
import { authMiddleware } from './middleware/supabase-auth';
import { refreshExpiringBrokerTokens } from './scheduled/broker-refresh';
import accountRoutes from './routes/account';
import tradeRoutes from './routes/trade';
import tagRoutes from './routes/tag';
import dailyNoteRoutes from './routes/daily-note';
import tradovateRoutes from './routes/tradovate';
import projectxRoutes from './routes/projectx';
import stripeRoutes from './routes/stripe';
import premarketRoutes from './routes/premarket';
import strategyRoutes from './routes/strategy';
import referralRoutes from './routes/referral';
import backtestingRoutes from './routes/backtesting';
import adminRoutes from './routes/admin';
import syncerRoutes from './routes/syncer';
import announcementRoutes from './routes/announcement';
import emailRoutes from './routes/email';
import robinhoodRoutes from './routes/robinhood';
import webullRoutes from './routes/webull';
import { processEmailDrips } from './scheduled/email-drips';
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
app.route('/', accountRoutes);
app.route('/', tradeRoutes);
app.route('/', tagRoutes);
app.route('/', dailyNoteRoutes);
app.route('/', tradovateRoutes);
app.route('/', projectxRoutes);
app.route('/', stripeRoutes);
app.route('/', premarketRoutes);
app.route('/', strategyRoutes);
app.route('/', referralRoutes);
app.route('/', backtestingRoutes);
app.route('/', adminRoutes);
app.route('/', syncerRoutes);
app.route('/', announcementRoutes);
app.route('/', emailRoutes);
app.route('/', robinhoodRoutes);
app.route('/', webullRoutes);

// Page routes (HTML serving)
app.route('/', pageRoutes);

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshExpiringBrokerTokens(env));
    if (event.cron === '0 5 * * *') {
      ctx.waitUntil(processEmailDrips(env));
    }
  },
};
