import type { SupabaseClient } from '@supabase/supabase-js';

/** Generates a unique RRM-XXXXXX code (avoids visually ambiguous chars) */
function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RRM-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Returns the user's referral code, or null if they haven't generated one yet */
export async function getCode(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .single();
  return data?.code ?? null;
}

/** Generates and inserts a new code. Retries up to 5× on collision. */
export async function generateCode(supabase: SupabaseClient, userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await supabase
      .from('referral_codes')
      .insert({ user_id: userId, code });
    if (!error) return code;
    // Only retry on unique-constraint violation
    if (!error.message.includes('unique') && !error.message.includes('duplicate')) throw error;
  }
  throw new Error('Failed to generate a unique referral code after 5 attempts');
}

// Blocked substrings for custom codes (case-insensitive). Intentionally short —
// catches obvious slurs/profanity. Substring match so variants are caught.
const BLOCKED_SUBSTRINGS = [
  'nigg', 'nigr', 'fag', 'kike', 'spic', 'chink', 'gook', 'tranny', 'retard',
  'cunt', 'fuck', 'shit', 'bitch', 'whore', 'slut', 'rape', 'nazi', 'hitler',
  'kkk', 'porn', 'sex', 'cock', 'dick', 'pussy', 'anal', 'cum', 'jizz',
  'admin', 'rrmetrics', 'support', 'official',
];

export function validateCustomCode(raw: string): { ok: true; code: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Code is required.' };
  const code = raw.trim().toUpperCase();
  if (code.length < 4 || code.length > 20) {
    return { ok: false, error: 'Code must be 4-20 characters.' };
  }
  if (!/^[A-Z0-9-]+$/.test(code)) {
    return { ok: false, error: 'Code can only contain letters, numbers, and dashes.' };
  }
  if (!/[A-Z]/.test(code)) {
    return { ok: false, error: 'Code must contain at least one letter.' };
  }
  if (code.startsWith('-') || code.endsWith('-') || code.includes('--')) {
    return { ok: false, error: 'Code cannot start/end with a dash or have consecutive dashes.' };
  }
  const lower = code.toLowerCase();
  if (BLOCKED_SUBSTRINGS.some((w) => lower.includes(w))) {
    return { ok: false, error: 'That code is not allowed.' };
  }
  return { ok: true, code };
}

/**
 * Sets a custom referral code for a user. Must be called with a service-role
 * client (RLS has no UPDATE policy). Upserts so users without an existing code
 * can claim a custom one directly.
 */
export async function setCustomCode(
  supabase: SupabaseClient,
  userId: string,
  rawCode: string,
): Promise<{ error?: string; code?: string }> {
  const validation = validateCustomCode(rawCode);
  if (!validation.ok) return { error: validation.error };
  const code = validation.code;

  // Lock the code once anyone has used it — changing it would break their links
  const { count: usesCount } = await supabase
    .from('referral_uses')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', userId);
  if ((usesCount ?? 0) > 0) {
    return { error: 'You cannot change your code once people have signed up using it.' };
  }

  // Uniqueness check (case-insensitive via upper-cased storage)
  const { data: existing } = await supabase
    .from('referral_codes')
    .select('user_id')
    .eq('code', code)
    .maybeSingle();

  if (existing && existing.user_id !== userId) {
    return { error: 'That code is already taken.' };
  }
  if (existing && existing.user_id === userId) {
    return { code };
  }

  // Upsert by user_id (user_id is UNIQUE)
  const { error } = await supabase
    .from('referral_codes')
    .upsert({ user_id: userId, code }, { onConflict: 'user_id' });

  if (error) {
    if (error.message.includes('unique') || error.message.includes('duplicate')) {
      return { error: 'That code is already taken.' };
    }
    return { error: 'Failed to set referral code.' };
  }
  return { code };
}

/** Returns referral stats for a referrer */
export async function getStats(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ total: number; subscribed: number; completed: number }> {
  const [usesResult, commissionsResult] = await Promise.all([
    supabase
      .from('referral_uses')
      .select('subscription_started_at')
      .eq('referrer_id', userId),
    supabase
      .from('referral_commissions')
      .select('referred_id')
      .eq('referrer_id', userId),
  ]);

  const rows = usesResult.data ?? [];
  const commissions = commissionsResult.data ?? [];
  // Count distinct referred users who have generated at least one commission
  const paidReferrals = new Set(commissions.map((r: { referred_id: string }) => r.referred_id)).size;

  return {
    total: rows.length,
    subscribed: rows.filter((r) => r.subscription_started_at).length,
    completed: paidReferrals,
  };
}

/**
 * Validates and inserts a referral_uses row.
 * Must be called with a service-role client (RLS blocks client inserts).
 */
export async function applyCode(
  supabase: SupabaseClient,
  code: string,
  referredId: string,
): Promise<{ error?: string }> {
  const { data: codeRow } = await supabase
    .from('referral_codes')
    .select('user_id')
    .eq('code', code)
    .single();

  if (!codeRow) return { error: 'Referral code not found.' };
  if (codeRow.user_id === referredId) return { error: 'You cannot use your own referral code.' };

  const { data: existing } = await supabase
    .from('referral_uses')
    .select('id')
    .eq('referred_id', referredId)
    .single();

  if (existing) return { error: 'A referral code has already been applied to your account.' };

  const { error } = await supabase
    .from('referral_uses')
    .insert({ referrer_id: codeRow.user_id, referred_id: referredId });

  if (error) return { error: 'Failed to apply referral code.' };
  return {};
}

/** Returns true if the user has a pending referral discount (no subscription started yet) */
export async function checkHasReferralDiscount(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('referral_uses')
    .select('id')
    .eq('referred_id', userId)
    .is('subscription_started_at', null)
    .single();
  return !!data;
}
