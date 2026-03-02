import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as profilesDb from '../db/profiles';
import * as tradesDb from '../db/trades';
import { requiresLogin } from '../middleware/supabase-auth';
import { checkSubscriptionStatus } from '../middleware/subscription';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const account = new Hono<HonoEnv>();

// GET /api/account
account.get('/api/account', requiresLogin, async (c) => {
  const profile = c.get('profile');
  return c.json({ account: profilesDb.toAPI(profile) });
});

// POST /api/preferences/theme
account.post('/api/preferences/theme', requiresLogin, async (c) => {
  const profile = c.get('profile');
  const supabase = c.get('supabase');
  const body = await c.req.json();
  const { theme, customColors } = body;

  if (!theme || !['dark', 'light', 'custom'].includes(theme)) {
    return c.json({ error: 'Invalid theme.' }, 400);
  }

  try {
    const updateData: Record<string, unknown> = { theme };

    if (theme === 'custom' && customColors) {
      const validHex = /^#[0-9A-Fa-f]{6}$/;
      const fields: Array<[string, string]> = [
        ['bgPage', 'customColorsBgPage'],
        ['bgSurface', 'customColorsBgSurface'],
        ['textPrimary', 'customColorsTextPrimary'],
        ['accent', 'customColorsAccent'],
        ['positive', 'customColorsPositive'],
        ['negative', 'customColorsNegative'],
      ];
      for (const [clientKey, dbKey] of fields) {
        if (customColors[clientKey] && validHex.test(customColors[clientKey])) {
          updateData[dbKey] = customColors[clientKey];
        }
      }
    }

    await profilesDb.updateById(supabase, profile.id, updateData);

    const updatedProfile = await profilesDb.findById(supabase, profile.id);
    if (updatedProfile) {
      return c.json({
        theme: updatedProfile.theme,
        customColors: {
          bgPage: updatedProfile.custom_colors_bg_page,
          bgSurface: updatedProfile.custom_colors_bg_surface,
          textPrimary: updatedProfile.custom_colors_text_primary,
          accent: updatedProfile.custom_colors_accent,
          positive: updatedProfile.custom_colors_positive,
          negative: updatedProfile.custom_colors_negative,
        },
      });
    }

    return c.json({ theme });
  } catch (err) {
    console.error('Theme update error:', err);
    return c.json({ error: 'Failed to update theme.' }, 500);
  }
});

// POST /api/account/complete-registration — records the IP at signup time (fraud flagging only)
// Only writes once; subsequent calls are no-ops so this can be called safely at any time.
account.post('/api/account/complete-registration', requiresLogin, async (c) => {
  const profile = c.get('profile');
  const supabase = c.get('supabase');

  if (profile.registration_ip) {
    return c.json({ ok: true });
  }

  const ip = c.req.header('CF-Connecting-IP')
    ?? c.req.header('X-Forwarded-For')?.split(',')[0].trim()
    ?? null;

  if (ip) {
    try {
      await profilesDb.updateById(supabase, profile.id, { registrationIp: ip });
    } catch (err) {
      console.error('complete-registration IP capture error:', err);
    }
  }

  return c.json({ ok: true });
});

// GET /api/subscriptionStatus
account.get(
  '/api/subscriptionStatus',
  requiresLogin,
  checkSubscriptionStatus,
  async (c) => {
    const status = c.get('subscriptionStatus' as any);
    const profile = c.get('profile');
    if (!status) {
      return c.json({ error: 'Subscription status not available' }, 500);
    }
    const responseData: Record<string, unknown> = {
      isPremium: status.isPremium,
      plan: status.effectivePlan,
    };

    if (status.hasTradeLimit) {
      const trialDays = parseInt(c.env.TRIAL_DAYS || '14', 10);
      const createdAt = new Date(profile.created_at);
      const trialEndsAt = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
      const supabase = c.get('supabase');
      const tradeCount = await tradesDb.countTrades(supabase, profile.id);
      responseData.trialEndsAt = trialEndsAt.toISOString();
      responseData.tradeCount = tradeCount;
    }

    return c.json(responseData);
  },
);

// GET /api/pricing (public)
account.get('/api/pricing', async (c) => {
  return c.json({
    pro: c.env.PRICE_PRO || '12',
    elite: c.env.PRICE_ELITE || '18',
    proYearly: c.env.PRICE_PRO_YEARLY || '120',
    eliteYearly: c.env.PRICE_ELITE_YEARLY || '180',
    trialDays: 14,
    plans: {
      trial: {
        name: 'Trial',
        features: [
          'Most Pro features for 14 days',
          'Up to 50 trades',
        ],
      },
      pro: {
        name: 'Pro',
        features: [
          'Unlimited trades',
          '2 broker connections',
          'CSV Import/Export',
          'Strategy & rule tracking',
          'Premarket prep',
          '1 Backtesting session',
        ],
      },
      elite: {
        name: 'Elite',
        features: [
          'Everything in Pro',
          'Attach and annotate screenshots',
          'Unlimited broker connections',
          'Custom themes',
          'Unlimited Backtesting',
        ],
      },
    },
    featureGates: {
      customThemes: ['elite'],
      backtesting: ['pro', 'elite'],
      unlimitedTrades: ['pro', 'elite'],
      brokerConnections: ['pro', 'elite'],
      exportCsv: ['pro', 'elite'],
      multipleScreenshots: ['elite'],
      unlimitedBrokers: ['elite'],
      strategyRules: ['pro', 'elite'],
      premarket: ['pro', 'elite'],
    },
  });
});

export default account;
