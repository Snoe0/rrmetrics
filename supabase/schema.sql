-- Supabase schema for RR Metrics Trading Journal
-- Run this in Supabase SQL editor

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_plan TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT,
  theme TEXT NOT NULL DEFAULT 'dark',
  custom_colors_bg_page TEXT,
  custom_colors_bg_surface TEXT,
  custom_colors_text_primary TEXT,
  custom_colors_accent TEXT,
  custom_colors_positive TEXT,
  custom_colors_negative TEXT,
  tradovate_username TEXT,
  tradovate_password TEXT,
  tradovate_cid TEXT,
  tradovate_secret TEXT,
  tradovate_environment TEXT NOT NULL DEFAULT 'demo',
  tradovate_last_sync_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TRADES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  enter_time TIMESTAMPTZ NOT NULL,
  exit_time TIMESTAMPTZ NOT NULL,
  enter_price DOUBLE PRECISION NOT NULL,
  exit_price DOUBLE PRECISION NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  manual_pl DOUBLE PRECISION,
  image_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  screenshot TEXT,
  comments TEXT NOT NULL DEFAULT '',
  is_eval BOOLEAN NOT NULL DEFAULT FALSE,
  tradovate_order_id TEXT,
  tradovate_source TEXT NOT NULL DEFAULT 'manual',
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_user_id ON public.trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_tradovate_order_id ON public.trades(tradovate_order_id);

-- ============================================
-- TAGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);

-- ============================================
-- TRADE_TAGS JUNCTION TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.trade_tags (
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);

-- ============================================
-- DAILY_NOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.daily_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_user_id ON public.daily_notes(user_id);

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trades
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trades"
  ON public.trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
  ON public.trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trades"
  ON public.trades FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trades"
  ON public.trades FOR DELETE
  USING (auth.uid() = user_id);

-- Tags
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tags"
  ON public.tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tags"
  ON public.tags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags"
  ON public.tags FOR DELETE
  USING (auth.uid() = user_id);

-- Trade Tags
ALTER TABLE public.trade_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trade_tags"
  ON public.trade_tags FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.trades WHERE trades.id = trade_tags.trade_id AND trades.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own trade_tags"
  ON public.trade_tags FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trades WHERE trades.id = trade_tags.trade_id AND trades.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own trade_tags"
  ON public.trade_tags FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.trades WHERE trades.id = trade_tags.trade_id AND trades.user_id = auth.uid()
  ));

-- Daily Notes
ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily_notes"
  ON public.daily_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily_notes"
  ON public.daily_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily_notes"
  ON public.daily_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own daily_notes"
  ON public.daily_notes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- PRE-MARKET CHECKLIST ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS public.premarket_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_premarket_checklist_items_user_id ON public.premarket_checklist_items(user_id);

-- ============================================
-- PRE-MARKET CHECKLIST COMPLETIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.premarket_checklist_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.premarket_checklist_items(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, item_id, completed_date)
);

CREATE INDEX IF NOT EXISTS idx_premarket_completions_user_date ON public.premarket_checklist_completions(user_id, completed_date);

-- ============================================
-- PRE-MARKET SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS public.premarket_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  reset_time TEXT NOT NULL DEFAULT '06:00',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  discord_webhook_url TEXT -- DEPRECATED: Discord webhook feature removed; column can be dropped
);

-- Pre-Market Checklist Items RLS
ALTER TABLE public.premarket_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checklist items"
  ON public.premarket_checklist_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own checklist items"
  ON public.premarket_checklist_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own checklist items"
  ON public.premarket_checklist_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own checklist items"
  ON public.premarket_checklist_items FOR DELETE
  USING (auth.uid() = user_id);

-- Pre-Market Checklist Completions RLS
ALTER TABLE public.premarket_checklist_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completions"
  ON public.premarket_checklist_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own completions"
  ON public.premarket_checklist_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own completions"
  ON public.premarket_checklist_completions FOR DELETE
  USING (auth.uid() = user_id);

-- Pre-Market Settings RLS
ALTER TABLE public.premarket_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own premarket settings"
  ON public.premarket_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own premarket settings"
  ON public.premarket_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own premarket settings"
  ON public.premarket_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- PRE-MARKET ECONOMIC EVENTS (DEPRECATED — no longer used by application code)
-- The FRED API integration and Discord webhook notifications have been removed.
-- This table can be dropped once confirmed no longer needed.
-- ============================================
CREATE TABLE IF NOT EXISTS public.premarket_economic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  event_time TEXT,
  event_date DATE NOT NULL,
  release_id INT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_premarket_events_date ON public.premarket_economic_events(event_date);

-- Economic Events RLS — any authenticated user can read, only service role writes
ALTER TABLE public.premarket_economic_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view economic events"
  ON public.premarket_economic_events FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================
-- TRADOVATE OAUTH MIGRATION
-- Run after initial schema setup to switch from
-- username/password to OAuth token storage.
-- ============================================
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS tradovate_username,
  DROP COLUMN IF EXISTS tradovate_password,
  DROP COLUMN IF EXISTS tradovate_cid,
  DROP COLUMN IF EXISTS tradovate_secret;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tradovate_access_token TEXT,
  ADD COLUMN IF NOT EXISTS tradovate_token_expires_at TIMESTAMPTZ;

-- ============================================
-- STRATEGY RULES
-- ============================================
CREATE TABLE IF NOT EXISTS public.strategy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('trade', 'day')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_rules_user_id ON public.strategy_rules(user_id);

ALTER TABLE public.strategy_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own strategy rules"
  ON public.strategy_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own strategy rules"
  ON public.strategy_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own strategy rules"
  ON public.strategy_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own strategy rules"
  ON public.strategy_rules FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TRADE RULE CHECKS (per-trade rule check-offs)
-- ============================================
CREATE TABLE IF NOT EXISTS public.trade_rule_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.strategy_rules(id) ON DELETE CASCADE,
  followed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, trade_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_rule_checks_user_id ON public.trade_rule_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_rule_checks_trade_id ON public.trade_rule_checks(trade_id);

ALTER TABLE public.trade_rule_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trade rule checks"
  ON public.trade_rule_checks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trade rule checks"
  ON public.trade_rule_checks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trade rule checks"
  ON public.trade_rule_checks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trade rule checks"
  ON public.trade_rule_checks FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- REFERRAL CODES
-- ============================================
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes(code);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral code"
  ON public.referral_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own referral code"
  ON public.referral_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- REFERRAL USES
-- ============================================
CREATE TABLE IF NOT EXISTS public.referral_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  subscription_started_at TIMESTAMPTZ,
  first_month_completed_at TIMESTAMPTZ,
  referrer_rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer ON public.referral_uses(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referred ON public.referral_uses(referred_id);

ALTER TABLE public.referral_uses ENABLE ROW LEVEL SECURITY;

-- Referred user can see their own row; referrer can see rows where they referred someone
CREATE POLICY "Users can view own referral use"
  ON public.referral_uses FOR SELECT
  USING (auth.uid() = referred_id OR auth.uid() = referrer_id);

-- Only the backend (service role) inserts/updates referral_uses rows
-- (client calls /api/referral/apply which runs as service role)

-- ============================================
-- REFERRAL MONTHS EARNED (on profiles)
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_months_earned INT NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS registration_ip TEXT;

-- ============================================
-- DAILY RULE CHECKS (per-day rule check-offs)
-- ============================================
CREATE TABLE IF NOT EXISTS public.daily_rule_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.strategy_rules(id) ON DELETE CASCADE,
  check_date DATE NOT NULL,
  followed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, rule_id, check_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_rule_checks_user_id ON public.daily_rule_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_rule_checks_date ON public.daily_rule_checks(user_id, check_date);

ALTER TABLE public.daily_rule_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily rule checks"
  ON public.daily_rule_checks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily rule checks"
  ON public.daily_rule_checks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily rule checks"
  ON public.daily_rule_checks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own daily rule checks"
  ON public.daily_rule_checks FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- BACKTESTING TABLES
-- ============================================
CREATE TABLE IF NOT EXISTS public.backtesting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  ticker TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.backtesting_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.backtesting_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss')),
  profit_factor DOUBLE PRECISION NOT NULL,
  time_of_day TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.backtesting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtesting_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own backtesting sessions"
  ON public.backtesting_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own backtesting trades"
  ON public.backtesting_trades FOR ALL
  USING (auth.uid() = user_id);
