import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Env } from './bindings';

/**
 * Filesystem layout & runtime configuration for the self-hosted server.
 * All paths are relative to the process working directory (the repo root
 * when started via `npm start`).
 */

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
export const DB_PATH = path.join(DATA_DIR, 'rrmetrics.db');
export const SECRET_KEY_PATH = path.join(DATA_DIR, 'secret.key');
export const PUBLIC_DIR = path.join(process.cwd(), 'public');

export const DEFAULT_PORT = 8459;

export function getPort(): number {
  const parsed = parseInt(process.env.PORT || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

/** Creates the data directories if they don't exist yet. */
export function ensureDataDirs(): void {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let cachedSecretKey: string | null = null;

/**
 * Returns the server secret (64-char hex). Auto-generated on first boot and
 * persisted to data/secret.key. Used to sign JWTs and as the default
 * ENCRYPTION_KEY for broker credentials.
 */
export function getSecretKey(): string {
  if (cachedSecretKey) return cachedSecretKey;

  ensureDataDirs();
  if (fs.existsSync(SECRET_KEY_PATH)) {
    const existing = fs.readFileSync(SECRET_KEY_PATH, 'utf8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(existing)) {
      cachedSecretKey = existing;
      return existing;
    }
  }

  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_KEY_PATH, generated + '\n', { mode: 0o600 });
  cachedSecretKey = generated;
  return generated;
}

/** Secret used for JWT HS256 signing. */
export function getJwtSecret(): string {
  return getSecretKey();
}

/**
 * Builds the runtime environment/config object passed to the Hono app
 * (available in routes as `c.env`). Every value is optional with a sane
 * default; broker OAuth credentials are only needed for those integrations.
 */
export function getEnv(): Env {
  return {
    APP_URL: process.env.APP_URL || `http://localhost:${getPort()}`,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || getSecretKey(),
    TRADOVATE_CLIENT_ID: process.env.TRADOVATE_CLIENT_ID,
    TRADOVATE_CLIENT_SECRET: process.env.TRADOVATE_CLIENT_SECRET,
    WEBULL_APP_ID: process.env.WEBULL_APP_ID,
    WEBULL_APP_SECRET: process.env.WEBULL_APP_SECRET,
  };
}
