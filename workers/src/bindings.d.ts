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
  STRIPE_PRICE_PRO_YEARLY: string;
  STRIPE_PRICE_ELITE_YEARLY: string;
  PRICE_PRO_YEARLY: string;
  PRICE_ELITE_YEARLY: string;
  APP_URL: string;
  PRICE_PRO: string;
  PRICE_ELITE: string;
  TRIAL_DAYS: string;
  GOOGLE_CLIENT_ID?: string;
  ADMIN_SECRET?: string;
  TRADOVATE_CLIENT_ID?: string;
  TRADOVATE_CLIENT_SECRET?: string;
  DISCORD_PAYOUT_WEBHOOK?: string;
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
  registration_ip: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarded: boolean;
  role: string;
  created_at: string;
  email_unsubscribed: boolean;
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
  role?: string;
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
  broker_connection_id: string | null;
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

export interface BrokerConnectionRow {
  id: string;
  owner: string;
  broker: string;
  environment: string;
  label: string | null;
  last_sync_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradovateConnectionRow {
  id: string;
  broker_connection_id: string;
  access_token: string | null;
  token_expires_at: string | null;
  oauth_nonce: string | null;
  selected_accounts: number[] | null;
  account_ids: number[] | null;
}

export interface ProjectXConnectionRow {
  id: string;
  broker_connection_id: string;
  username: string | null;
  api_key: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  selected_accounts: number[] | null;
  copytrade_config: { leadAccountId: number; multiplier: number } | null;
}

export interface SyncerConfigRow {
  id: string;
  owner: string;
  leader_connection_id: string | null;
  leader_account_id: number | null;
  follower_accounts: Array<{ connectionId: string; accountId: number; multiplier: number }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncerOrderLogRow {
  id: string;
  config_id: string;
  leader_order_id: number;
  leader_action: string | null;
  leader_symbol: string | null;
  leader_qty: number | null;
  follower_account_id: number;
  follower_order_id: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface AuthContext {
  user: User;
  accessToken: string;
  profile: ProfileRow;
  supabase: SupabaseClient;
}
