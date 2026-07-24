import { Hono } from 'hono';
import type { Env, AuthContext } from '../bindings';
import * as profilesDb from '../db/profiles';
import { requiresLogin } from '../middleware/supabase-auth';

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
  let { theme, customColors } = body;

  if (!theme || !['dark', 'light', 'custom'].includes(theme)) {
    return c.json({ error: 'Invalid theme.' }, 400);
  }

  try {
    const updateData: Record<string, unknown> = { theme };
    const validHex = /^#[0-9A-Fa-f]{6}$/;

    if (customColors) {
      if (customColors.accent === null) {
        updateData.customColorsAccent = null;
      } else if (customColors.accent && validHex.test(customColors.accent)) {
        updateData.customColorsAccent = customColors.accent;
      }

      if (theme === 'custom') {
        const customFields: Array<[string, string]> = [
          ['bgPage', 'customColorsBgPage'],
          ['bgSurface', 'customColorsBgSurface'],
          ['textPrimary', 'customColorsTextPrimary'],
          ['positive', 'customColorsPositive'],
          ['negative', 'customColorsNegative'],
        ];
        for (const [clientKey, dbKey] of customFields) {
          if (customColors[clientKey] === null) {
            updateData[dbKey] = null;
          } else if (customColors[clientKey] && validHex.test(customColors[clientKey])) {
            updateData[dbKey] = customColors[clientKey];
          }
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

// POST /api/account/onboarding-complete
account.post('/api/account/onboarding-complete', requiresLogin, async (c) => {
  const profile = c.get('profile');
  const supabase = c.get('supabase');
  try {
    await profilesDb.updateById(supabase, profile.id, { onboardingCompleted: true });
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: 'Failed to mark onboarding complete' }, 500);
  }
});

export default account;
