import type { Db } from './connection';
import type { ProfileRow, AccountAPI } from '../bindings';
import { generateId } from '../utils/id';

/** Converts a raw SQLite row (0/1 booleans) into the ProfileRow shape. */
function rowFromDb(row: any): ProfileRow {
  return {
    ...row,
    onboarding_completed: !!row.onboarding_completed,
  } as ProfileRow;
}

/** Maps a profile row to the client-compatible API shape (id -> _id) */
export function toAPI(row: ProfileRow): AccountAPI {
  return {
    _id: row.id,
    email: row.email,
    theme: row.theme || 'dark',
    customColors: {
      bgPage: row.custom_colors_bg_page || null,
      bgSurface: row.custom_colors_bg_surface || null,
      textPrimary: row.custom_colors_text_primary || null,
      accent: row.custom_colors_accent || null,
      positive: row.custom_colors_positive || null,
      negative: row.custom_colors_negative || null,
    },
    createdDate: row.created_at,
    hasPassword: true,
    role: row.role,
    onboardingCompleted: row.onboarding_completed ?? true,
  };
}

export async function findById(db: Db, id: string): Promise<ProfileRow | null> {
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  return row ? rowFromDb(row) : null;
}

/**
 * Resolves the single local user for this self-hosted install. Adopts the
 * oldest existing profile (preserving pre-existing single-user data) or creates
 * a default one. Used in place of authentication now that the app is local-only.
 */
export async function ensureLocalUser(db: Db): Promise<ProfileRow> {
  const existing = db
    .prepare('SELECT * FROM profiles ORDER BY created_at ASC LIMIT 1')
    .get();
  if (existing) return rowFromDb(existing);

  const id = generateId();
  db.prepare(
    `INSERT INTO profiles (id, email, password_hash, onboarding_completed, created_at)
     VALUES (?, ?, ?, 1, ?)`,
  ).run(id, 'local@localhost', '', new Date().toISOString());

  const row = await findById(db, id);
  if (!row) throw new Error('Failed to create local user');
  return row;
}

export async function updateById(
  db: Db,
  id: string,
  data: Partial<Record<string, unknown>>,
): Promise<void> {
  const fieldMap: Record<string, string> = {
    theme: 'theme',
    registrationIp: 'registration_ip',
    customColorsBgPage: 'custom_colors_bg_page',
    customColorsBgSurface: 'custom_colors_bg_surface',
    customColorsTextPrimary: 'custom_colors_text_primary',
    customColorsAccent: 'custom_colors_accent',
    customColorsPositive: 'custom_colors_positive',
    customColorsNegative: 'custom_colors_negative',
    onboardingCompleted: 'onboarding_completed',
  };

  const columns: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    const column = fieldMap[key];
    if (column) {
      columns.push(`${column} = ?`);
      const normalized = typeof value === 'boolean' ? (value ? 1 : 0) : value ?? null;
      values.push(normalized);
    }
  }

  if (columns.length === 0) return;

  try {
    db.prepare(`UPDATE profiles SET ${columns.join(', ')} WHERE id = ?`).run(...values, id);
  } catch (err: any) {
    throw new Error(`Profile update failed: ${err.message}`);
  }
}
