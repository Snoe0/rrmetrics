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
  subscription_plan TEXT NOT NULL DEFAULT 'trial',
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
  discord_webhook_url TEXT
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
-- PRE-MARKET ECONOMIC EVENTS (shared, not user-scoped)
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
