-- ============================================================================
-- RR Metrics — SQLite schema (self-hosted).
-- Conventions: TEXT UUIDs, INTEGER 0/1 booleans, TEXT ISO-8601 timestamps,
-- TEXT JSON for former jsonb columns. No RLS — the application db layer
-- owner-scopes every query explicitly.
-- Executed on boot with CREATE TABLE IF NOT EXISTS semantics.
-- ============================================================================

-- ─── profiles (users table with local password auth) ────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                        TEXT PRIMARY KEY,             -- uuid
  email                     TEXT UNIQUE NOT NULL,
  password_hash             TEXT NOT NULL,                -- bcrypt
  theme                     TEXT NOT NULL DEFAULT 'dark',
  custom_colors_bg_page     TEXT,
  custom_colors_bg_surface  TEXT,
  custom_colors_text_primary TEXT,
  custom_colors_accent      TEXT,
  custom_colors_positive    TEXT,
  custom_colors_negative    TEXT,
  registration_ip           TEXT,
  role                      TEXT NOT NULL DEFAULT 'user',
  onboarding_completed      INTEGER NOT NULL DEFAULT 0,   -- boolean
  created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── trades ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id                   TEXT PRIMARY KEY,                  -- uuid
  user_id              TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticker               TEXT NOT NULL,
  enter_time           TEXT NOT NULL,                     -- ISO timestamp
  exit_time            TEXT NOT NULL,                     -- ISO timestamp
  enter_price          REAL NOT NULL,
  exit_price           REAL NOT NULL,
  quantity             REAL NOT NULL,
  manual_pl            REAL,
  image_attachments    TEXT NOT NULL DEFAULT '[]',        -- JSON string[]
  screenshot           TEXT,
  comments             TEXT NOT NULL DEFAULT '',
  is_eval              INTEGER NOT NULL DEFAULT 0,        -- boolean
  tradovate_order_id   TEXT,
  tradovate_source     TEXT NOT NULL DEFAULT 'manual',
  projectx_trade_id    TEXT,
  projectx_source      TEXT,
  broker_connection_id TEXT,
  account              TEXT,
  created_date         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_tradovate_order_id ON trades(tradovate_order_id);
CREATE INDEX IF NOT EXISTS idx_trades_projectx_trade_id ON trades(projectx_trade_id)
  WHERE projectx_trade_id IS NOT NULL;

-- ─── tags ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id      TEXT PRIMARY KEY,                               -- uuid
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);

-- ─── trade_tags junction ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_tags (
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);

-- ─── daily_notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_notes (
  id      TEXT PRIMARY KEY,                               -- uuid
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,                                  -- YYYY-MM-DD
  content TEXT NOT NULL,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_user_id ON daily_notes(user_id);

-- ─── premarket_checklist_items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS premarket_checklist_items (
  id         TEXT PRIMARY KEY,                            -- uuid
  user_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_premarket_checklist_items_user_id
  ON premarket_checklist_items(user_id);

-- ─── premarket_checklist_completions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS premarket_checklist_completions (
  id             TEXT PRIMARY KEY,                        -- uuid
  user_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id        TEXT NOT NULL REFERENCES premarket_checklist_items(id) ON DELETE CASCADE,
  completed_date TEXT NOT NULL,                           -- YYYY-MM-DD
  completed_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, item_id, completed_date)
);

CREATE INDEX IF NOT EXISTS idx_premarket_completions_user_date
  ON premarket_checklist_completions(user_id, completed_date);

-- ─── premarket_settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS premarket_settings (
  id                  TEXT PRIMARY KEY,                   -- uuid
  user_id             TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  reset_time          TEXT NOT NULL DEFAULT '06:00',
  timezone            TEXT NOT NULL DEFAULT 'America/New_York',
  discord_webhook_url TEXT                                -- deprecated; kept for compat
);

-- ─── premarket_economic_events (global, not user-scoped) ─────────────────────
CREATE TABLE IF NOT EXISTS premarket_economic_events (
  id         TEXT PRIMARY KEY,                            -- uuid
  event_name TEXT NOT NULL,
  event_time TEXT,
  event_date TEXT NOT NULL,                               -- YYYY-MM-DD
  release_id INTEGER,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_premarket_events_date
  ON premarket_economic_events(event_date);

-- ─── strategy_rules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strategy_rules (
  id         TEXT PRIMARY KEY,                            -- uuid
  user_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('trade', 'day')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_strategy_rules_user_id ON strategy_rules(user_id);

-- ─── trade_rule_checks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_rule_checks (
  id       TEXT PRIMARY KEY,                              -- uuid
  user_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  rule_id  TEXT NOT NULL REFERENCES strategy_rules(id) ON DELETE CASCADE,
  followed INTEGER NOT NULL DEFAULT 0,                    -- boolean
  UNIQUE(user_id, trade_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_rule_checks_user_id ON trade_rule_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_rule_checks_trade_id ON trade_rule_checks(trade_id);

-- ─── daily_rule_checks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_rule_checks (
  id         TEXT PRIMARY KEY,                            -- uuid
  user_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule_id    TEXT NOT NULL REFERENCES strategy_rules(id) ON DELETE CASCADE,
  check_date TEXT NOT NULL,                               -- YYYY-MM-DD
  followed   INTEGER NOT NULL DEFAULT 0,                  -- boolean
  UNIQUE(user_id, rule_id, check_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_rule_checks_user_id ON daily_rule_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_rule_checks_date ON daily_rule_checks(user_id, check_date);

-- ─── backtesting_sessions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backtesting_sessions (
  id         TEXT PRIMARY KEY,                            -- uuid
  user_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT,
  ticker     TEXT NOT NULL,
  start_date TEXT NOT NULL,                               -- YYYY-MM-DD
  end_date   TEXT,                                        -- YYYY-MM-DD
  is_active  INTEGER NOT NULL DEFAULT 1,                  -- boolean
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── backtesting_trades ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backtesting_trades (
  id            TEXT PRIMARY KEY,                         -- uuid
  session_id    TEXT NOT NULL REFERENCES backtesting_sessions(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  result        TEXT NOT NULL CHECK (result IN ('win', 'loss')),
  profit_factor REAL NOT NULL,
  time_of_day   TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ============================================================================
-- Broker sync tables
-- ============================================================================

-- ─── broker_connections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broker_connections (
  id             TEXT PRIMARY KEY,                        -- uuid
  owner          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  broker         TEXT NOT NULL,                           -- 'tradovate' | 'projectx' | 'webull' | 'robinhood' | ...
  environment    TEXT NOT NULL DEFAULT 'live',            -- 'demo' | 'live'
  label          TEXT,
  is_eval        INTEGER NOT NULL DEFAULT 0,              -- boolean
  last_sync_time TEXT,                                    -- ISO timestamp
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_broker_connections_owner
  ON broker_connections(owner);
CREATE INDEX IF NOT EXISTS idx_broker_connections_owner_broker
  ON broker_connections(owner, broker);

-- ─── tradovate_connections ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tradovate_connections (
  id                   TEXT PRIMARY KEY,                  -- uuid
  broker_connection_id TEXT NOT NULL UNIQUE
                         REFERENCES broker_connections(id) ON DELETE CASCADE,
  access_token         TEXT,                              -- encrypted "iv:tag:cipher" hex; NULL = pending OAuth
  token_expires_at     TEXT,                              -- ISO timestamp
  oauth_nonce          TEXT,
  selected_accounts    TEXT,                              -- JSON number[]
  account_ids          TEXT,                              -- JSON number[]
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_tradovate_connections_expiry
  ON tradovate_connections(token_expires_at)
  WHERE access_token IS NOT NULL;

-- ─── projectx_connections ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projectx_connections (
  id                   TEXT PRIMARY KEY,                  -- uuid
  broker_connection_id TEXT NOT NULL UNIQUE
                         REFERENCES broker_connections(id) ON DELETE CASCADE,
  username             TEXT,
  api_key              TEXT,                              -- encrypted "iv:tag:cipher" hex
  access_token         TEXT,                              -- encrypted "iv:tag:cipher" hex
  token_expires_at     TEXT,                              -- ISO timestamp
  selected_accounts    TEXT,                              -- JSON number[]
  copytrade_config     TEXT,                              -- JSON { leadAccountId, multiplier }
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_projectx_connections_expiry
  ON projectx_connections(token_expires_at)
  WHERE api_key IS NOT NULL;

-- ─── webull_connections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webull_connections (
  id                   TEXT PRIMARY KEY,                  -- uuid
  broker_connection_id TEXT NOT NULL UNIQUE
                         REFERENCES broker_connections(id) ON DELETE CASCADE,
  access_token         TEXT,                              -- encrypted "iv:tag:cipher" hex; NULL = pending OAuth
  refresh_token        TEXT,                              -- encrypted "iv:tag:cipher" hex
  token_expires_at     TEXT,                              -- ISO timestamp
  oauth_nonce          TEXT,
  account_id           TEXT,                              -- Webull accountId
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_webull_connections_expiry
  ON webull_connections(token_expires_at)
  WHERE access_token IS NOT NULL;

-- ─── robinhood_connections ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS robinhood_connections (
  id                   TEXT PRIMARY KEY,                  -- uuid
  broker_connection_id TEXT NOT NULL UNIQUE
                         REFERENCES broker_connections(id) ON DELETE CASCADE,
  access_token         TEXT,                              -- encrypted "iv:tag:cipher" hex
  refresh_token        TEXT,                              -- encrypted "iv:tag:cipher" hex
  token_expires_at     TEXT,                              -- ISO timestamp
  account_id           TEXT,                              -- Robinhood account_number
  device_token         TEXT,                              -- encrypted "iv:tag:cipher" hex
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_robinhood_connections_expiry
  ON robinhood_connections(token_expires_at)
  WHERE access_token IS NOT NULL;

-- ─── trade_syncer_configs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_syncer_configs (
  id                   TEXT PRIMARY KEY,                  -- uuid
  owner                TEXT NOT NULL UNIQUE
                         REFERENCES profiles(id) ON DELETE CASCADE,
  leader_connection_id TEXT REFERENCES broker_connections(id) ON DELETE SET NULL,
  leader_account_id    INTEGER,
  follower_accounts    TEXT NOT NULL DEFAULT '[]',
                       -- JSON [{ connectionId, accountId, multiplier }]
  is_active            INTEGER NOT NULL DEFAULT 0,        -- boolean
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─── syncer_order_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS syncer_order_log (
  id                  TEXT PRIMARY KEY,                   -- uuid
  config_id           TEXT NOT NULL
                        REFERENCES trade_syncer_configs(id) ON DELETE CASCADE,
  leader_order_id     INTEGER NOT NULL,
  leader_action       TEXT,                               -- 'Buy' | 'Sell'
  leader_symbol       TEXT,
  leader_qty          INTEGER,
  follower_account_id INTEGER NOT NULL,
  follower_order_id   INTEGER,
  follower_qty        INTEGER,
  order_type          TEXT,                               -- e.g. 'Market' | 'Limit'
  status              TEXT NOT NULL,                      -- 'placed' | 'failed' | 'cancelled'
  error_message       TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (config_id, leader_order_id, follower_account_id)
);

CREATE INDEX IF NOT EXISTS idx_syncer_order_log_config_created
  ON syncer_order_log(config_id, created_at DESC);
