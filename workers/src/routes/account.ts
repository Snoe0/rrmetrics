import { Hono } from 'hono';
import type { Env, SessionData } from '../bindings';
import * as accountsDb from '../db/accounts';
import { generateHash, comparePassword } from '../utils/password';
import { sendEmail } from '../utils/email';
import { requiresLogin } from '../middleware/auth';
import { requiresLogout } from '../middleware/auth';
import { checkSubscriptionStatus } from '../middleware/subscription';
import { saveSession, destroySession, generateSessionId } from '../middleware/session';

type HonoEnv = {
  Bindings: Env;
  Variables: { session: SessionData | null; sessionId: string | null };
};

const account = new Hono<HonoEnv>();

// POST /login
account.post('/login', requiresLogout, async (c) => {
  const body = await c.req.json();
  const username = `${body.username || ''}`;
  const password = `${body.pass || ''}`;

  if (!username || !password) {
    return c.json({ error: 'All fields are required!' }, 400);
  }

  const row = await accountsDb.findByUsername(c.env.DB, username);
  if (!row) {
    return c.json({ error: 'Wrong username or password!' }, 401);
  }

  const match = await comparePassword(password, row.password);
  if (!match) {
    return c.json({ error: 'Wrong username or password!' }, 401);
  }

  const sessionId = generateSessionId();
  const sessionData: SessionData = { account: accountsDb.toAPI(row) };
  const cookie = await saveSession(c.env, sessionId, sessionData);

  c.header('Set-Cookie', cookie);
  return c.json({ redirect: '/trades' });
});

// POST /signup
account.post('/signup', requiresLogout, async (c) => {
  const body = await c.req.json();
  const username = `${body.username || ''}`;
  const pass = `${body.pass || ''}`;
  const pass2 = `${body.pass2 || ''}`;
  const email = body.email ? `${body.email}`.trim().toLowerCase() : null;

  if (!username || !pass || !pass2) {
    return c.json({ error: 'All fields are required!' }, 400);
  }

  if (pass !== pass2) {
    return c.json({ error: 'Passwords do not match!' }, 400);
  }

  // Validate username format
  if (!/^[A-Za-z0-9_\-.]{1,16}$/.test(username)) {
    return c.json({ error: 'Username must be 1-16 characters: letters, numbers, _, -, .' }, 400);
  }

  try {
    const hash = await generateHash(pass);
    const newAccount = await accountsDb.create(c.env.DB, {
      username,
      password: hash,
      email: email || null,
    });

    const sessionId = generateSessionId();
    const sessionData: SessionData = { account: accountsDb.toAPI(newAccount) };
    const cookie = await saveSession(c.env, sessionId, sessionData);

    c.header('Set-Cookie', cookie);
    return c.json({ redirect: '/trades' });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed') || err.message?.includes('accounts.username')) {
      return c.json({ error: 'Username already in use.' }, 400);
    }
    console.error('Signup error:', err);
    return c.json({ error: 'An error occurred.' }, 500);
  }
});

// GET /logout
account.get('/logout', requiresLogin, async (c) => {
  const sessionId = c.get('sessionId');
  if (sessionId) {
    const cookie = await destroySession(c.env, sessionId);
    c.header('Set-Cookie', cookie);
  }
  return c.redirect('/');
});

// POST /changePass
account.post('/changePass', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json();
  const oldPass = `${body.currentPass || ''}`;
  const newPass = `${body.pass || ''}`;
  const newPass2 = `${body.pass2 || ''}`;

  if (!oldPass || !newPass || !newPass2) {
    return c.json({ error: 'All fields are required!' }, 400);
  }

  if (newPass !== newPass2) {
    return c.json({ error: 'New passwords do not match!' }, 400);
  }

  const row = await accountsDb.findByUsername(c.env.DB, session.account.username);
  if (!row) {
    return c.json({ error: 'Account not found.' }, 404);
  }

  const match = await comparePassword(oldPass, row.password);
  if (!match) {
    return c.json({ error: 'Wrong password!' }, 401);
  }

  const hash = await generateHash(newPass);
  await accountsDb.updateById(c.env.DB, row.id, { password: hash });
  return c.json({ redirect: '/trades' });
});

// POST /forgot-password
account.post('/forgot-password', requiresLogout, async (c) => {
  const body = await c.req.json();
  const username = `${body.username || ''}`.trim();

  if (!username) {
    return c.json({ error: 'Username is required.' }, 400);
  }

  try {
    const row = await accountsDb.findByUsername(c.env.DB, username);
    const genericMsg = 'If an account with that username exists and has an email on file, a reset link has been sent.';

    if (!row || !row.email) {
      return c.json({ message: genericMsg });
    }

    // Generate reset token
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Hash for storage
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(token),
    );
    const hashedToken = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await accountsDb.updateById(c.env.DB, row.id, {
      resetToken: hashedToken,
      resetExpires,
    });

    const resetUrl = `${c.env.APP_URL}/login?reset=${token}`;

    await sendEmail(
      {
        to: row.email,
        subject: 'RR Metrics - Password Reset',
        text: `You requested a password reset.\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
        html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to reset your password</a> (expires in 1 hour).</p><p>If you didn't request this, ignore this email.</p>`,
      },
      c.env.RESEND_API_KEY,
      c.env.RESEND_FROM_EMAIL,
    );

    return c.json({ message: 'Reset link sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return c.json({ error: 'An error occurred. Please try again.' }, 500);
  }
});

// POST /reset-password
account.post('/reset-password', requiresLogout, async (c) => {
  const body = await c.req.json();
  const { token, pass, pass2 } = body;

  if (!token || !pass || !pass2) {
    return c.json({ error: 'All fields are required.' }, 400);
  }

  if (pass !== pass2) {
    return c.json({ error: 'Passwords do not match.' }, 400);
  }

  try {
    // Hash the token to look up
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(token),
    );
    const hashedToken = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const row = await accountsDb.findByResetToken(c.env.DB, hashedToken);
    if (!row) {
      return c.json({ error: 'Invalid or expired reset link. Please request a new one.' }, 400);
    }

    const hash = await generateHash(pass);
    await accountsDb.updateById(c.env.DB, row.id, {
      password: hash,
      resetToken: null,
      resetExpires: null,
    });

    return c.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return c.json({ error: 'An error occurred. Please try again.' }, 500);
  }
});

// GET /api/account
account.get('/api/account', requiresLogin, async (c) => {
  const session = c.get('session')!;
  return c.json({ account: session.account });
});

// POST /api/preferences/theme
account.post('/api/preferences/theme', requiresLogin, async (c) => {
  const session = c.get('session')!;
  const sessionId = c.get('sessionId')!;
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

    await accountsDb.updateById(c.env.DB, session.account._id, updateData);

    // Refresh session
    const updatedRow = await accountsDb.findById(c.env.DB, session.account._id);
    if (updatedRow) {
      const newSessionData: SessionData = { account: accountsDb.toAPI(updatedRow) };
      const cookie = await saveSession(c.env, sessionId, newSessionData);
      c.header('Set-Cookie', cookie);

      return c.json({
        theme: updatedRow.theme,
        customColors: {
          bgPage: updatedRow.custom_colors_bg_page,
          bgSurface: updatedRow.custom_colors_bg_surface,
          textPrimary: updatedRow.custom_colors_text_primary,
          accent: updatedRow.custom_colors_accent,
          positive: updatedRow.custom_colors_positive,
          negative: updatedRow.custom_colors_negative,
        },
      });
    }

    return c.json({ theme });
  } catch (err) {
    console.error('Theme update error:', err);
    return c.json({ error: 'Failed to update theme.' }, 500);
  }
});

// GET /subscriptionStatus
account.get(
  '/subscriptionStatus',
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

export default account;
