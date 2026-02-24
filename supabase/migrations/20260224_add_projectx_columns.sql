-- Add ProjectX connection columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS projectx_username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS projectx_api_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS projectx_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS projectx_token_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS projectx_selected_accounts TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS projectx_copytrade_config TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS projectx_last_sync_time TIMESTAMPTZ;

-- Add ProjectX trade tracking columns to trades
ALTER TABLE trades ADD COLUMN IF NOT EXISTS projectx_trade_id TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS projectx_source TEXT;

-- Index for dedup lookups
CREATE INDEX IF NOT EXISTS idx_trades_projectx_trade_id ON trades(projectx_trade_id) WHERE projectx_trade_id IS NOT NULL;
