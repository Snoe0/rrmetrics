import type { AccountRow, AccountAPI } from '../bindings';
import { generateId } from '../utils/id';

/** Maps a D1 row to the client-compatible API shape (id → _id) */
export function toAPI(row: AccountRow): AccountAPI {
  return {
    _id: row.id,
    email: row.email,
    isPremium: !!row.is_premium,
    subscriptionPlan: row.subscription_plan || 'trial',
    subscriptionStatus: row.subscription_status || null,
    theme: row.theme || 'dark',
    customColors: {
      bgPage: row.custom_colors_bg_page || null,
      bgSurface: row.custom_colors_bg_surface || null,
      textPrimary: row.custom_colors_text_primary || null,
      accent: row.custom_colors_accent || null,
      positive: row.custom_colors_positive || null,
      negative: row.custom_colors_negative || null,
    },
    createdDate: row.created_date,
    hasPassword: !!row.password,
    tradovate: {
      configured: !!row.tradovate_username,
      environment: row.tradovate_environment || 'demo',
      lastSyncTime: row.tradovate_last_sync_time || null,
    },
  };
}

export async function findById(db: D1Database, id: string): Promise<AccountRow | null> {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first<AccountRow>();
}

export async function findByEmail(db: D1Database, email: string): Promise<AccountRow | null> {
  return db.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first<AccountRow>();
}

export async function findByResetToken(db: D1Database, hashedToken: string): Promise<AccountRow | null> {
  return db
    .prepare('SELECT * FROM accounts WHERE reset_token = ? AND reset_expires > datetime(\'now\')')
    .bind(hashedToken)
    .first<AccountRow>();
}

export async function findByStripeCustomerId(db: D1Database, customerId: string): Promise<AccountRow | null> {
  return db
    .prepare('SELECT * FROM accounts WHERE stripe_customer_id = ?')
    .bind(customerId)
    .first<AccountRow>();
}

export async function create(
  db: D1Database,
  data: { email: string; password: string },
): Promise<AccountRow> {
  const id = generateId();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO accounts (id, email, password, created_date)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, data.email, data.password, now)
    .run();
  return (await findById(db, id))!;
}

export async function updateById(
  db: D1Database,
  id: string,
  data: Partial<Record<string, unknown>>,
): Promise<void> {
  const fieldMap: Record<string, string> = {
    password: 'password',
    email: 'email',
    isPremium: 'is_premium',
    stripeCustomerId: 'stripe_customer_id',
    stripeSubscriptionId: 'stripe_subscription_id',
    subscriptionPlan: 'subscription_plan',
    subscriptionStatus: 'subscription_status',
    theme: 'theme',
    resetToken: 'reset_token',
    resetExpires: 'reset_expires',
    tradovateUsername: 'tradovate_username',
    tradovatePassword: 'tradovate_password',
    tradovateCid: 'tradovate_cid',
    tradovateSecret: 'tradovate_secret',
    tradovateEnvironment: 'tradovate_environment',
    tradovateLastSyncTime: 'tradovate_last_sync_time',
    customColorsBgPage: 'custom_colors_bg_page',
    customColorsBgSurface: 'custom_colors_bg_surface',
    customColorsTextPrimary: 'custom_colors_text_primary',
    customColorsAccent: 'custom_colors_accent',
    customColorsPositive: 'custom_colors_positive',
    customColorsNegative: 'custom_colors_negative',
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    const column = fieldMap[key];
    if (column) {
      setClauses.push(`${column} = ?`);
      // Convert boolean isPremium to integer for D1
      if (key === 'isPremium') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value ?? null);
      }
    }
  }

  if (setClauses.length === 0) return;

  values.push(id);
  await db
    .prepare(`UPDATE accounts SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}
