export interface Env {
  DB: D1Database;
  SESSIONS: DurableObjectNamespace;
  USER_DATA: DurableObjectNamespace;
  ASSETS: Fetcher;
  ENCRYPTION_KEY: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PRO: string;
  STRIPE_PRICE_ELITE: string;
  APP_URL: string;
  GOOGLE_CLIENT_ID?: string;
}

export interface SessionData {
  account: AccountAPI;
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
    environment: string;
    lastSyncTime: string | null;
  };
}

export interface AccountRow {
  id: string;
  email: string;
  password: string;
  is_premium: number;
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
  reset_token: string | null;
  reset_expires: string | null;
  tradovate_username: string | null;
  tradovate_password: string | null;
  tradovate_cid: string | null;
  tradovate_secret: string | null;
  tradovate_environment: string;
  tradovate_last_sync_time: string | null;
  created_date: string;
}

export interface TradeRow {
  id: string;
  ticker: string;
  enter_time: string;
  exit_time: string;
  enter_price: number;
  exit_price: number;
  quantity: number;
  manual_pl: number | null;
  image_attachments: string;
  screenshot: string | null;
  comments: string;
  tradovate_order_id: string | null;
  tradovate_source: string;
  owner: string;
  created_date: string;
}

export interface TagRow {
  id: string;
  name: string;
  color: string;
  owner: string;
}

export interface DailyNoteRow {
  id: string;
  date: string;
  content: string;
  owner: string;
}
