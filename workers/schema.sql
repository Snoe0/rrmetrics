-- D1 Schema for RR Metrics Trading Journal
-- Only accounts are stored in D1.
-- Trades, tags, trade_tags, and daily_notes are stored in per-user
-- Durable Objects with SQLite storage (UserDataDO).

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  is_premium INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT DEFAULT NULL,
  stripe_subscription_id TEXT DEFAULT NULL,
  subscription_plan TEXT NOT NULL DEFAULT 'trial' CHECK(subscription_plan IN ('trial', 'pro', 'elite')),
  subscription_status TEXT DEFAULT NULL CHECK(subscription_status IN ('active', 'past_due', 'canceled', 'incomplete', NULL)),
  theme TEXT NOT NULL DEFAULT 'dark' CHECK(theme IN ('dark', 'light', 'custom')),
  custom_colors_bg_page TEXT DEFAULT NULL,
  custom_colors_bg_surface TEXT DEFAULT NULL,
  custom_colors_text_primary TEXT DEFAULT NULL,
  custom_colors_accent TEXT DEFAULT NULL,
  custom_colors_positive TEXT DEFAULT NULL,
  custom_colors_negative TEXT DEFAULT NULL,
  reset_token TEXT DEFAULT NULL,
  reset_expires TEXT DEFAULT NULL,
  tradovate_username TEXT DEFAULT NULL,
  tradovate_password TEXT DEFAULT NULL,
  tradovate_cid TEXT DEFAULT NULL,
  tradovate_secret TEXT DEFAULT NULL,
  tradovate_environment TEXT NOT NULL DEFAULT 'demo' CHECK(tradovate_environment IN ('demo', 'live')),
  tradovate_last_sync_time TEXT DEFAULT NULL,
  created_date TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_reset_token ON accounts(reset_token);
CREATE INDEX IF NOT EXISTS idx_accounts_stripe_customer_id ON accounts(stripe_customer_id);
