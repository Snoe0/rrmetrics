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
