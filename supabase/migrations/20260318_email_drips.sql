-- Email drip log for one-time drip emails (trial_expired, followup_3d, followup_7d)
CREATE TABLE IF NOT EXISTS email_drip_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  drip_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  promo_code TEXT,
  UNIQUE(user_id, drip_key)
);

-- Monthly re-engagement emails (no unique constraint — recurring)
CREATE TABLE IF NOT EXISTS email_drip_monthly_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unsubscribe flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN DEFAULT false;

-- RLS: service role only for drip tables
ALTER TABLE email_drip_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_drip_monthly_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (no user-facing policies)
CREATE POLICY "Service role full access on email_drip_log"
  ON email_drip_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on email_drip_monthly_log"
  ON email_drip_monthly_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow users to read/update their own email_unsubscribed flag
-- (existing profiles RLS already covers SELECT/UPDATE for own row)

-- Index for cron queries
CREATE INDEX IF NOT EXISTS idx_drip_log_user_key ON email_drip_log(user_id, drip_key);
CREATE INDEX IF NOT EXISTS idx_drip_monthly_user_sent ON email_drip_monthly_log(user_id, sent_at DESC);
