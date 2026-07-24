import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './index';
import { ensureDataDirs, getEnv, getPort, getSecretKey } from './config';
import { initDb } from './db/connection';
import { refreshExpiringBrokerTokens } from './scheduled/broker-refresh';

const BROKER_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // hourly

const runBrokerRefresh = (env: ReturnType<typeof getEnv>) => {
  refreshExpiringBrokerTokens(env).catch((err) => {
    console.error('[Broker Cron] refresh run failed:', err);
  });
};

const main = () => {
  // Bootstrap: data dirs, server secret, database schema
  ensureDataDirs();
  getSecretKey();
  initDb();

  const env = getEnv();
  const port = getPort();

  serve({
    fetch: (request) => app.fetch(request, env),
    port,
  });

  console.log(`RR Metrics server listening on http://localhost:${port}`);

  // Hourly broker token refresh (replaces the Workers scheduled() cron)
  runBrokerRefresh(env);
  setInterval(() => runBrokerRefresh(env), BROKER_REFRESH_INTERVAL_MS);
};

main();
