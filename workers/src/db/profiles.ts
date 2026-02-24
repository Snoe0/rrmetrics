import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileRow, AccountAPI } from '../bindings';

function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

/** Maps a profile row to the client-compatible API shape (id -> _id) */
export function toAPI(row: ProfileRow): AccountAPI {
  return {
    _id: row.id,
    email: row.email,
    isPremium: (row.subscription_plan || 'trial') !== 'trial',
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
    createdDate: row.created_at,
    hasPassword: true,
    tradovate: {
      configured: !!row.tradovate_access_token && !isTokenExpired(row.tradovate_token_expires_at),
      expired: !!row.tradovate_access_token && isTokenExpired(row.tradovate_token_expires_at),
      environment: row.tradovate_environment || 'demo',
      lastSyncTime: row.tradovate_last_sync_time || null,
    },
    projectx: {
      configured: !!row.projectx_token && !isTokenExpired(row.projectx_token_expires_at),
      expired: !!row.projectx_token && isTokenExpired(row.projectx_token_expires_at),
      selectedAccounts: row.projectx_selected_accounts ? JSON.parse(row.projectx_selected_accounts) : [],
      copytradeConfig: row.projectx_copytrade_config ? JSON.parse(row.projectx_copytrade_config) : null,
      lastSyncTime: row.projectx_last_sync_time || null,
    },
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

export async function findByStripeCustomerId(
  supabase: SupabaseClient,
  customerId: string,
): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .single();
  return data as ProfileRow | null;
}

export async function updateById(
  supabase: SupabaseClient,
  id: string,
  data: Partial<Record<string, unknown>>,
): Promise<void> {
  const fieldMap: Record<string, string> = {
    stripeCustomerId: 'stripe_customer_id',
    stripeSubscriptionId: 'stripe_subscription_id',
    subscriptionPlan: 'subscription_plan',
    subscriptionStatus: 'subscription_status',
    theme: 'theme',
    tradovateAccessToken: 'tradovate_access_token',
    tradovateTokenExpiresAt: 'tradovate_token_expires_at',
    tradovateEnvironment: 'tradovate_environment',
    tradovateLastSyncTime: 'tradovate_last_sync_time',
    projectxUsername: 'projectx_username',
    projectxApiKey: 'projectx_api_key',
    projectxToken: 'projectx_token',
    projectxTokenExpiresAt: 'projectx_token_expires_at',
    projectxSelectedAccounts: 'projectx_selected_accounts',
    projectxCopytradeConfig: 'projectx_copytrade_config',
    projectxLastSyncTime: 'projectx_last_sync_time',
    registrationIp: 'registration_ip',
    customColorsBgPage: 'custom_colors_bg_page',
    customColorsBgSurface: 'custom_colors_bg_surface',
    customColorsTextPrimary: 'custom_colors_text_primary',
    customColorsAccent: 'custom_colors_accent',
    customColorsPositive: 'custom_colors_positive',
    customColorsNegative: 'custom_colors_negative',
  };

  const updateData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const column = fieldMap[key];
    if (column) {
      updateData[column] = value ?? null;
    }
  }

  if (Object.keys(updateData).length === 0) return;

  await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', id);
}
