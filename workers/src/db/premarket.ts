import type { SupabaseClient } from '@supabase/supabase-js';

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
  supabase: SupabaseClient,
  userId: string,
): Promise<ChecklistItemAPI[]> {
  const { data, error } = await supabase
    .from('premarket_checklist_items')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(itemRowToAPI);
}

export async function createChecklistItem(
  supabase: SupabaseClient,
  userId: string,
  item: { label: string; sortOrder: number },
): Promise<ChecklistItemAPI> {
  const { data, error } = await supabase
    .from('premarket_checklist_items')
    .insert({ user_id: userId, label: item.label, sort_order: item.sortOrder })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return itemRowToAPI(data);
}

export async function updateChecklistItem(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  updates: { label?: string; sortOrder?: number },
): Promise<ChecklistItemAPI> {
  const updateData: any = {};
  if (updates.label !== undefined) updateData.label = updates.label;
  if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;

  const { data, error } = await supabase
    .from('premarket_checklist_items')
    .update(updateData)
    .eq('id', itemId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return itemRowToAPI(data);
}

export async function deleteChecklistItem(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
): Promise<void> {
  const { error } = await supabase
    .from('premarket_checklist_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function reorderChecklistItems(
  supabase: SupabaseClient,
  userId: string,
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('premarket_checklist_items')
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }
}

// --- Completions ---

export async function getCompletions(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<CompletionAPI[]> {
  const { data, error } = await supabase
    .from('premarket_checklist_completions')
    .select('*')
    .eq('user_id', userId)
    .eq('completed_date', date);

  if (error) throw new Error(error.message);
  return (data || []).map(completionRowToAPI);
}

export async function toggleCompletion(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  date: string,
): Promise<{ completed: boolean }> {
  // Check if already completed
  const { data: existing } = await supabase
    .from('premarket_checklist_completions')
    .select('id')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .eq('completed_date', date)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('premarket_checklist_completions')
      .delete()
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
    return { completed: false };
  } else {
    const { error } = await supabase
      .from('premarket_checklist_completions')
      .insert({ user_id: userId, item_id: itemId, completed_date: date });
    if (error) throw new Error(error.message);
    return { completed: true };
  }
}

// --- Settings ---

export async function getSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<SettingsAPI | null> {
  const { data, error } = await supabase
    .from('premarket_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? settingsRowToAPI(data) : null;
}

export async function upsertSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: { resetTime: string; timezone: string },
): Promise<SettingsAPI> {
  const { data, error } = await supabase
    .from('premarket_settings')
    .upsert(
      { user_id: userId, reset_time: settings.resetTime, timezone: settings.timezone },
      { onConflict: 'user_id' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return settingsRowToAPI(data);
}

export async function saveDiscordWebhook(
  supabase: SupabaseClient,
  userId: string,
  encryptedUrl: string | null,
): Promise<SettingsAPI> {
  const { data, error } = await supabase
    .from('premarket_settings')
    .upsert(
      { user_id: userId, discord_webhook_url: encryptedUrl },
      { onConflict: 'user_id' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return settingsRowToAPI(data);
}

/**
 * Get all settings rows that have a Discord webhook configured.
 * Used by cron to send daily notifications. Requires service-role client.
 */
export async function getAllWebhookSettings(
  supabase: SupabaseClient,
): Promise<{ userId: string; discordWebhookUrl: string; resetTime: string; timezone: string }[]> {
  const { data, error } = await supabase
    .from('premarket_settings')
    .select('user_id, discord_webhook_url, reset_time, timezone')
    .not('discord_webhook_url', 'is', null);

  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    userId: row.user_id,
    discordWebhookUrl: row.discord_webhook_url,
    resetTime: row.reset_time || '06:00',
    timezone: row.timezone || 'America/New_York',
  }));
}

// --- Economic Events ---

export async function getEconomicEvents(
  supabase: SupabaseClient,
  date: string,
): Promise<EconomicEventAPI[]> {
  const { data, error } = await supabase
    .from('premarket_economic_events')
    .select('*')
    .eq('event_date', date)
    .order('event_time', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data || []).map(eventRowToAPI);
}

/**
 * Replace all events for a given date. Uses service-role client (bypasses RLS).
 * Deletes existing events for the date, then inserts the new ones.
 */
export async function replaceEconomicEvents(
  supabase: SupabaseClient,
  date: string,
  events: { eventName: string; eventTime: string | null; releaseId: number | null }[],
): Promise<void> {
  // Delete existing events for this date
  const { error: delError } = await supabase
    .from('premarket_economic_events')
    .delete()
    .eq('event_date', date);

  if (delError) throw new Error(delError.message);

  if (events.length === 0) return;

  // Insert new events
  const rows = events.map((e) => ({
    event_name: e.eventName,
    event_time: e.eventTime,
    event_date: date,
    release_id: e.releaseId,
  }));

  const { error: insError } = await supabase
    .from('premarket_economic_events')
    .insert(rows);

  if (insError) throw new Error(insError.message);
}

/**
 * Delete all events for dates before the given date (cleanup old data).
 */
export async function deleteOldEvents(
  supabase: SupabaseClient,
  beforeDate: string,
): Promise<void> {
  const { error } = await supabase
    .from('premarket_economic_events')
    .delete()
    .lt('event_date', beforeDate);

  if (error) throw new Error(error.message);
}
