import type { Db } from './connection';
import { generateId } from '../utils/id';

interface EconomicEventAPI {
  _id: string;
  eventName: string;
  eventTime: string | null;
  eventDate: string;
  releaseId: number | null;
}

function eventRowToAPI(row: any): EconomicEventAPI {
  return {
    _id: row.id,
    eventName: row.event_name,
    eventTime: row.event_time,
    eventDate: row.event_date,
    releaseId: row.release_id,
  };
}

interface ChecklistItemAPI {
  _id: string;
  label: string;
  sortOrder: number;
  createdAt: string;
}

interface CompletionAPI {
  _id: string;
  itemId: string;
  completedDate: string;
  completedAt: string;
}

interface SettingsAPI {
  _id: string;
  resetTime: string;
  timezone: string;
  hasDiscordWebhook: boolean;
  discordWebhookMasked: string | null;
}

function itemRowToAPI(row: any): ChecklistItemAPI {
  return {
    _id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function completionRowToAPI(row: any): CompletionAPI {
  return {
    _id: row.id,
    itemId: row.item_id,
    completedDate: row.completed_date,
    completedAt: row.completed_at,
  };
}

function maskWebhookUrl(url: string | null): string | null {
  if (!url) return null;
  // Show just the last 6 chars: "••••••abc123"
  if (url.length <= 6) return '••••••';
  return '••••••' + url.slice(-6);
}

function settingsRowToAPI(row: any): SettingsAPI {
  return {
    _id: row.id,
    resetTime: row.reset_time,
    timezone: row.timezone,
    hasDiscordWebhook: !!row.discord_webhook_url,
    discordWebhookMasked: maskWebhookUrl(row.discord_webhook_url),
  };
}

// --- Checklist Items ---

export async function getChecklistItems(
  db: Db,
  userId: string,
): Promise<ChecklistItemAPI[]> {
  const rows = db
    .prepare(
      'SELECT * FROM premarket_checklist_items WHERE user_id = ? ORDER BY sort_order ASC',
    )
    .all(userId);
  return rows.map(itemRowToAPI);
}

export async function createChecklistItem(
  db: Db,
  userId: string,
  item: { label: string; sortOrder: number },
): Promise<ChecklistItemAPI> {
  const id = generateId();
  db.prepare(
    `INSERT INTO premarket_checklist_items (id, user_id, label, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userId, item.label, item.sortOrder, new Date().toISOString());

  const row = db
    .prepare('SELECT * FROM premarket_checklist_items WHERE id = ? AND user_id = ?')
    .get(id, userId);
  return itemRowToAPI(row);
}

export async function updateChecklistItem(
  db: Db,
  userId: string,
  itemId: string,
  updates: { label?: string; sortOrder?: number },
): Promise<ChecklistItemAPI> {
  const columns: string[] = [];
  const values: unknown[] = [];
  if (updates.label !== undefined) {
    columns.push('label = ?');
    values.push(updates.label);
  }
  if (updates.sortOrder !== undefined) {
    columns.push('sort_order = ?');
    values.push(updates.sortOrder);
  }

  if (columns.length > 0) {
    const result = db
      .prepare(
        `UPDATE premarket_checklist_items SET ${columns.join(', ')}
         WHERE id = ? AND user_id = ?`,
      )
      .run(...values, itemId, userId);
    if (result.changes === 0) throw new Error('Checklist item not found');
  }

  const row = db
    .prepare('SELECT * FROM premarket_checklist_items WHERE id = ? AND user_id = ?')
    .get(itemId, userId);
  if (!row) throw new Error('Checklist item not found');
  return itemRowToAPI(row);
}

export async function deleteChecklistItem(
  db: Db,
  userId: string,
  itemId: string,
): Promise<void> {
  db.prepare('DELETE FROM premarket_checklist_items WHERE id = ? AND user_id = ?')
    .run(itemId, userId);
}

export async function reorderChecklistItems(
  db: Db,
  userId: string,
  orderedIds: string[],
): Promise<void> {
  const update = db.prepare(
    'UPDATE premarket_checklist_items SET sort_order = ? WHERE id = ? AND user_id = ?',
  );
  const run = db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      update.run(i, orderedIds[i], userId);
    }
  });
  run();
}

// --- Completions ---

export async function getCompletions(
  db: Db,
  userId: string,
  date: string,
): Promise<CompletionAPI[]> {
  const rows = db
    .prepare(
      'SELECT * FROM premarket_checklist_completions WHERE user_id = ? AND completed_date = ?',
    )
    .all(userId, date);
  return rows.map(completionRowToAPI);
}

export async function toggleCompletion(
  db: Db,
  userId: string,
  itemId: string,
  date: string,
): Promise<{ completed: boolean }> {
  const existing = db
    .prepare(
      `SELECT id FROM premarket_checklist_completions
       WHERE user_id = ? AND item_id = ? AND completed_date = ?`,
    )
    .get(userId, itemId, date) as { id: string } | undefined;

  if (existing) {
    db.prepare('DELETE FROM premarket_checklist_completions WHERE id = ?').run(existing.id);
    return { completed: false };
  }

  db.prepare(
    `INSERT INTO premarket_checklist_completions (id, user_id, item_id, completed_date, completed_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(generateId(), userId, itemId, date, new Date().toISOString());
  return { completed: true };
}

// --- Settings ---

export async function getSettings(
  db: Db,
  userId: string,
): Promise<SettingsAPI | null> {
  const row = db
    .prepare('SELECT * FROM premarket_settings WHERE user_id = ?')
    .get(userId);
  return row ? settingsRowToAPI(row) : null;
}

export async function upsertSettings(
  db: Db,
  userId: string,
  settings: { resetTime: string; timezone: string },
): Promise<SettingsAPI> {
  db.prepare(
    `INSERT INTO premarket_settings (id, user_id, reset_time, timezone)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       reset_time = excluded.reset_time,
       timezone = excluded.timezone`,
  ).run(generateId(), userId, settings.resetTime, settings.timezone);

  const row = db.prepare('SELECT * FROM premarket_settings WHERE user_id = ?').get(userId);
  return settingsRowToAPI(row);
}

export async function saveDiscordWebhook(
  db: Db,
  userId: string,
  encryptedUrl: string | null,
): Promise<SettingsAPI> {
  db.prepare(
    `INSERT INTO premarket_settings (id, user_id, discord_webhook_url)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       discord_webhook_url = excluded.discord_webhook_url`,
  ).run(generateId(), userId, encryptedUrl);

  const row = db.prepare('SELECT * FROM premarket_settings WHERE user_id = ?').get(userId);
  return settingsRowToAPI(row);
}

/**
 * Get all settings rows that have a Discord webhook configured.
 */
export async function getAllWebhookSettings(
  db: Db,
): Promise<{ userId: string; discordWebhookUrl: string; resetTime: string; timezone: string }[]> {
  const rows = db
    .prepare(
      `SELECT user_id, discord_webhook_url, reset_time, timezone
       FROM premarket_settings WHERE discord_webhook_url IS NOT NULL`,
    )
    .all() as any[];

  return rows.map((row) => ({
    userId: row.user_id,
    discordWebhookUrl: row.discord_webhook_url,
    resetTime: row.reset_time || '06:00',
    timezone: row.timezone || 'America/New_York',
  }));
}

// --- Economic Events ---

export async function getEconomicEvents(
  db: Db,
  date: string,
): Promise<EconomicEventAPI[]> {
  const rows = db
    .prepare(
      `SELECT * FROM premarket_economic_events
       WHERE event_date = ?
       ORDER BY event_time IS NULL, event_time ASC`,
    )
    .all(date);
  return rows.map(eventRowToAPI);
}

/**
 * Replace all events for a given date. Deletes existing events for the date,
 * then inserts the new ones.
 */
export async function replaceEconomicEvents(
  db: Db,
  date: string,
  events: { eventName: string; eventTime: string | null; releaseId: number | null }[],
): Promise<void> {
  const insert = db.prepare(
    `INSERT INTO premarket_economic_events (id, event_name, event_time, event_date, release_id, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    db.prepare('DELETE FROM premarket_economic_events WHERE event_date = ?').run(date);
    for (const e of events) {
      insert.run(generateId(), e.eventName, e.eventTime, date, e.releaseId, now);
    }
  });
  run();
}

/**
 * Delete all events for dates before the given date (cleanup old data).
 */
export async function deleteOldEvents(
  db: Db,
  beforeDate: string,
): Promise<void> {
  db.prepare('DELETE FROM premarket_economic_events WHERE event_date < ?').run(beforeDate);
}
