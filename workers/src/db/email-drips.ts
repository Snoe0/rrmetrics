import type { SupabaseClient } from '@supabase/supabase-js';

export interface DripLogRow {
  id: string;
  user_id: string;
  drip_key: string;
  sent_at: string;
  promo_code: string | null;
}

/**
 * Check if a specific drip email has already been sent to a user.
 */
export async function hasSentDrip(
  supabase: SupabaseClient,
  userId: string,
  dripKey: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('email_drip_log')
    .select('id')
    .eq('user_id', userId)
    .eq('drip_key', dripKey)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Get the promo code from the trial_expired drip for follow-up emails.
 */
export async function getPromoCode(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('email_drip_log')
    .select('promo_code')
    .eq('user_id', userId)
    .eq('drip_key', 'trial_expired')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.promo_code ?? null;
}

/**
 * Log a one-time drip email send.
 */
export async function logDripSend(
  supabase: SupabaseClient,
  userId: string,
  dripKey: string,
  promoCode?: string,
): Promise<void> {
  const { error } = await supabase
    .from('email_drip_log')
    .insert({
      user_id: userId,
      drip_key: dripKey,
      promo_code: promoCode || null,
    });
  if (error) throw error;
}

/**
 * Get the most recent monthly email date for a user.
 */
export async function getLastMonthlySent(
  supabase: SupabaseClient,
  userId: string,
): Promise<Date | null> {
  const { data, error } = await supabase
    .from('email_drip_monthly_log')
    .select('sent_at')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return new Date(data[0].sent_at);
}

/**
 * Log a monthly re-engagement email send.
 */
export async function logMonthlySend(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('email_drip_monthly_log')
    .insert({ user_id: userId });
  if (error) throw error;
}
