import { Hono } from 'hono';
import type { Env, AuthContext } from './bindings';
import { securityHeaders } from './middleware/security';
import { authMiddleware } from './middleware/supabase-auth';
import { createServiceClient } from './lib/supabase';
import { decrypt } from './utils/crypto';
import * as premarketDb from './db/premarket';
import accountRoutes from './routes/account';
import tradeRoutes from './routes/trade';
import tagRoutes from './routes/tag';
import dailyNoteRoutes from './routes/daily-note';
import tradovateRoutes from './routes/tradovate';
import stripeRoutes from './routes/stripe';
import premarketRoutes from './routes/premarket';
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
app.route('/', stripeRoutes);
app.route('/', premarketRoutes);

// Page routes (HTML serving)
app.route('/', pageRoutes);

/**
 * Fetch today's economic releases from FRED and store in Supabase.
 * Called by Cloudflare Cron Trigger at 05:00 UTC (midnight EST).
 */
async function fetchFredReleases(env: Env): Promise<void> {
  const fredApiKey = env.FRED_API_KEY;
  if (!fredApiKey) {
    console.log('FRED_API_KEY not set, skipping economic events fetch');
    return;
  }

  const supabase = createServiceClient(env);

  // Get today's date in EST (UTC-5)
  const now = new Date();
  const estOffset = -5 * 60;
  const estTime = new Date(now.getTime() + estOffset * 60 * 1000);
  const today = estTime.toISOString().slice(0, 10);

  try {
    const url = `https://api.stlouisfed.org/fred/releases/dates?api_key=${fredApiKey}&file_type=json&realtime_start=${today}&realtime_end=${today}&include_release_dates_with_no_data=true`;
    const resp = await fetch(url);

    if (!resp.ok) {
      throw new Error(`FRED API returned ${resp.status}`);
    }

    const data: any = await resp.json();
    const releaseDates = data.release_dates || [];

    const events = releaseDates.map((r: any) => ({
      eventName: r.release_name,
      eventTime: null as string | null,
      releaseId: r.release_id,
    }));

    // Replace today's events and clean up old ones
    await premarketDb.replaceEconomicEvents(supabase, today, events);
    await premarketDb.deleteOldEvents(supabase, today);

    console.log(`Fetched ${events.length} FRED releases for ${today}`);
  } catch (err) {
    console.error('Cron: FRED fetch failed:', err);
  }
}

/**
 * Get the current hour (HH:00) in a given IANA timezone.
 */
function getCurrentHourInTimezone(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    });
    const hour = formatter.format(new Date());
    return hour.padStart(2, '0') + ':00';
  } catch {
    return '00:00';
  }
}

/**
 * Get today's date string in a given IANA timezone.
 */
function getTodayInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  return formatter.format(new Date());
}

/**
 * Send Discord notifications to users whose reset time matches the current hour.
 * Runs every hour via cron. Each user receives their notification at their
 * configured reset_time in their configured timezone.
 */
async function sendDiscordNotifications(env: Env): Promise<void> {
  const supabase = createServiceClient(env);

  try {
    const webhookSettings = await premarketDb.getAllWebhookSettings(supabase);

    if (webhookSettings.length === 0) return;

    // Filter to users whose reset time matches the current hour in their timezone
    const dueUsers = webhookSettings.filter((ws) => {
      const currentHour = getCurrentHourInTimezone(ws.timezone);
      return currentHour === ws.resetTime;
    });

    if (dueUsers.length === 0) return;

    // Get today's date (use first due user's timezone for the query — all same date)
    const today = getTodayInTimezone(dueUsers[0].timezone);
    const events = await premarketDb.getEconomicEvents(supabase, today);

    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      timeZone: 'America/New_York',
    });

    let description: string;
    if (events.length === 0) {
      description = 'No economic releases scheduled for today.';
    } else {
      description = events
        .map((e) => {
          const time = e.eventTime ? `**${e.eventTime}** — ` : '';
          return `${time}${e.eventName}`;
        })
        .join('\n');
    }

    const payload = {
      embeds: [{
        title: `Economic Calendar — ${dateLabel}`,
        description,
        color: 0x5865F2,
        footer: { text: 'RR Metrics Pre-Market' },
        timestamp: now.toISOString(),
      }],
    };

    const results = await Promise.allSettled(
      dueUsers.map(async (ws) => {
        try {
          const webhookUrl = await decrypt(ws.discordWebhookUrl, env.ENCRYPTION_KEY);
          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!resp.ok) {
            console.error(`Discord webhook failed for user ${ws.userId}: ${resp.status}`);
          }
        } catch (err) {
          console.error(`Discord webhook error for user ${ws.userId}:`, err);
        }
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`Sent Discord notifications to ${sent}/${dueUsers.length} due users`);
  } catch (err) {
    console.error('Cron: Discord notifications failed:', err);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Runs every hour. At 05:00 UTC (midnight EST) also fetch FRED data.
    ctx.waitUntil(sendDiscordNotifications(env));
    if (event.cron === '0 5 * * *') {
      ctx.waitUntil(fetchFredReleases(env));
    }
  },
};
