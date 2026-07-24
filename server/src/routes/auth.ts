import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import type { Env, AuthContext, ProfileRow } from '../bindings';
import { getJwtSecret } from '../config';
import { getDb } from '../db/connection';
import * as profilesDb from '../db/profiles';
import { requiresLogin } from '../middleware/auth';

type HonoEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

const auth = new Hono<HonoEnv>();

const BCRYPT_COST = 10;
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const userResponse = (profile: ProfileRow) => ({
  id: profile.id,
  email: profile.email,
  created_at: profile.created_at,
});

const signAccessToken = async (profile: ProfileRow): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: profile.id,
      email: profile.email,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    },
    getJwtSecret(),
    'HS256',
  );
};

const normalizeEmail = (email: unknown): string | null => {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
};

// POST /api/auth/signup {email, password, username?}
auth.post('/api/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email) {
    return c.json({ error: 'A valid email is required.' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters.' }, 400);
  }

  const db = getDb();

  const existing = await profilesDb.findByEmail(db, email);
  if (existing) {
    return c.json({ error: 'An account with this email already exists.' }, 400);
  }

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const profile = await profilesDb.createProfile(db, { email, passwordHash });
    const accessToken = await signAccessToken(profile);

    return c.json({ user: userResponse(profile), access_token: accessToken });
  } catch (err: any) {
    console.error('signup error:', err);
    return c.json({ error: 'Failed to create account.' }, 500);
  }
});

// POST /api/auth/login {email, password}
auth.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return c.json({ error: 'Email and password are required.' }, 400);
  }

  const db = getDb();
  const profile = await profilesDb.findByEmail(db, email);

  if (!profile || !(await bcrypt.compare(password, profile.password_hash))) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  const accessToken = await signAccessToken(profile);
  return c.json({ user: userResponse(profile), access_token: accessToken });
});

// GET /api/auth/session (Bearer)
auth.get('/api/auth/session', requiresLogin, async (c) => {
  const profile = c.get('profile');
  return c.json({ user: userResponse(profile) });
});

// POST /api/auth/logout (Bearer) — stateless JWT; the client discards its token
auth.post('/api/auth/logout', async (c) => {
  return c.json({ ok: true });
});

// POST /api/auth/change-password (Bearer) {currentPassword, newPassword}
auth.post('/api/auth/change-password', requiresLogin, async (c) => {
  const profile = c.get('profile');
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  // A stolen/unattended session must not be enough to take over the account
  if (!currentPassword || !(await bcrypt.compare(currentPassword, profile.password_hash))) {
    return c.json({ error: 'Current password is incorrect.' }, 401);
  }

  if (newPassword.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters.' }, 400);
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await profilesDb.updatePasswordHash(db, profile.id, passwordHash);
    return c.json({ ok: true });
  } catch (err: any) {
    console.error('change-password error:', err);
    return c.json({ error: 'Failed to change password.' }, 500);
  }
});

export default auth;
