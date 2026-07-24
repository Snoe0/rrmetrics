import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileRow, AccountAPI } from '../bindings';

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

export async function findById(supabase: SupabaseClient, id: string): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();
  return data as ProfileRow | null;
}

export async function updateById(
  supabase: SupabaseClient,
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

  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const column = fieldMap[key];
    if (column) {
      updateData[column] = value ?? null;
    }
  }

  if (Object.keys(updateData).length === 0) return;

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', id);

  if (error) throw new Error(`Profile update failed: ${error.message}`);
}