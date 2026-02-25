import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  ENCRYPTION_KEY: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PRO: string;
  STRIPE_PRICE_ELITE: string;
  APP_URL: string;
  PRICE_PRO: string;
  PRICE_ELITE: string;
  TRIAL_DAYS: string;
  GOOGLE_CLIENT_ID?: string;
  ADMIN_SECRET?: string;
  TRADOVATE_CLIENT_ID?: string;
  TRADOVATE_CLIENT_SECRET?: string;
}

export interface ProfileRow {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_plan: string;
  subscription_status: string | null;
  theme: string;
  custom_colors_bg_page: string | null;
  custom_colors_bg_surface: string | null;
  custom_colors_text_primary: string | null;
  custom_colors_accent: string | null;
  custom_colors_positive: string | null;
  custom_colors_negative: string | null;
  tradovate_access_token: string | null;
  tradovate_token_expires_at: string | null;
  tradovate_environment: string;
  tradovate_last_sync_time: string | null;
  projectx_username: string | null;
  projectx_api_key: string | null;
  projectx_token: string | null;
  projectx_token_expires_at: string | null;
  projectx_selected_accounts: string | null;
  projectx_copytrade_config: string | null;
  projectx_last_sync_time: string | null;
  registration_ip: string | null;
  created_at: string;
}

export interface AccountAPI {
  _id: string;
  email: string;
  isPremium: boolean;
  subscriptionPlan: string;
  subscriptionStatus: string | null;
  theme: string;
  customColors: {
    bgPage?: string | null;
    bgSurface?: string | null;
    textPrimary?: string | null;
    accent?: string | null;
    positive?: string | null;
    negative?: string | null;
  };
  createdDate: string;
  hasPassword: boolean;
  tradovate: {
    configured: boolean;
    expired: boolean;
    environment: string;
    lastSyncTime: string | null;
  };
  projectx: {
    configured: boolean;
    expired: boolean;
    selectedAccounts: number[];
    copytradeConfig: { leadAccountId: number; multiplier: number } | null;
    lastSyncTime: string | null;
  };
}

export interface TradeRow {
  id: string;
  user_id: string;
  ticker: string;
  enter_time: string;
  exit_time: string;
  enter_price: number;
  exit_price: number;
  quantity: number;
  manual_pl: number | null;
  image_attachments: any;
  screenshot: string | null;
  comments: string;
  tradovate_order_id: string | null;
  tradovate_source: string;
  projectx_trade_id: string | null;
  projectx_source: string | null;
  created_date: string;
}

export interface TagRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
}

export interface DailyNoteRow {
  id: string;
  user_id: string;
  date: string;
  content: string;
}

export interface AuthContext {
  user: User;
  accessToken: string;
  profile: ProfileRow;
  supabase: SupabaseClient;
}
