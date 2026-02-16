-- D1 Schema for RR Metrics Trading Journal
-- Replaces MongoDB/Mongoose models

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

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  enter_time TEXT NOT NULL,
  exit_time TEXT NOT NULL,
  enter_price REAL NOT NULL CHECK(enter_price >= 0),
  exit_price REAL NOT NULL CHECK(exit_price >= 0),
  quantity REAL NOT NULL,
  manual_pl REAL DEFAULT NULL,
  image_attachments TEXT NOT NULL DEFAULT '[]',
  screenshot TEXT DEFAULT NULL,
  comments TEXT DEFAULT '',
  tradovate_order_id TEXT DEFAULT NULL,
  tradovate_source TEXT NOT NULL DEFAULT 'manual' CHECK(tradovate_source IN ('manual', 'tradovate_demo', 'tradovate_live')),
  owner TEXT NOT NULL,
  created_date TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  owner TEXT NOT NULL,
  FOREIGN KEY (owner) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(owner, name)
);

CREATE TABLE IF NOT EXISTS trade_tags (
  trade_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (trade_id, tag_id),
  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_notes (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  owner TEXT NOT NULL,
  FOREIGN KEY (owner) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(owner, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trades_owner ON trades(owner);
CREATE INDEX IF NOT EXISTS idx_trades_tradovate_order_id ON trades(tradovate_order_id);
CREATE INDEX IF NOT EXISTS idx_tags_owner ON tags(owner);
CREATE INDEX IF NOT EXISTS idx_daily_notes_owner ON daily_notes(owner);
CREATE INDEX IF NOT EXISTS idx_daily_notes_owner_date ON daily_notes(owner, date);
CREATE INDEX IF NOT EXISTS idx_trade_tags_trade_id ON trade_tags(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_tags_tag_id ON trade_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_reset_token ON accounts(reset_token);
CREATE INDEX IF NOT EXISTS idx_accounts_stripe_customer_id ON accounts(stripe_customer_id);
