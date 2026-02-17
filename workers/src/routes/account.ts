import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as profilesDb from '../db/profiles';
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

// GET /api/subscriptionStatus
account.get(
  '/api/subscriptionStatus',
  requiresLogin,
  checkSubscriptionStatus,
  async (c) => {
    const status = c.get('subscriptionStatus' as any);
    if (!status) {
      return c.json({ error: 'Subscription status not available' }, 500);
    }
    return c.json({
      isPremium: status.isPremium,
      isTrialActive: status.isTrialActive,
      trialDaysRemaining: status.trialDaysRemaining,
    });
  },
);

// GET /api/pricing (public)
account.get('/api/pricing', async (c) => {
  return c.json({
    pro: c.env.PRICE_PRO || '19',
    elite: c.env.PRICE_ELITE || '24',
    trialDays: c.env.TRIAL_DAYS || '14',
    plans: {
      trial: {
        name: 'Trial',
        features: [
          'Up to 50 trades',
          'Advanced analytics',
          'Manual trade entry',
          'Custom tags',
          'Premarket prep'
        ],
      },
      pro: {
        name: 'Pro',
        features: [
          'Everything in trial',
          'Unlimited trades',
          '3 Broker connections',
          'Custom themes',
          'CSV Import/Export'
        ],
      },
      elite: {
        name: 'Elite',
        features: [
          'Everything in Pro',
          'Multiple screenshots per trade',
          'Unlimited broker connections',
          'Custom analysis formulas',
          'Discord news alerts',
        ],
      },
    },
    featureGates: {
      customThemes: ['pro', 'elite'],
      discordWebhook: ['elite'],
      unlimitedTrades: ['pro', 'elite'],
      brokerConnections: ['pro', 'elite'],
      exportCsv: ['pro', 'elite'],
      // aiInsights: ['elite'],
      multipleScreenshots: ['elite'],
      unlimitedBrokers: ['elite'],
    },
  });
});

export default account;
