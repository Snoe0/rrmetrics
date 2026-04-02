-- ============================================
-- Commission Status Tracking & RLS Hardening
-- ============================================
-- Replaces 14-day date-based maturity with status-based tracking
-- tied to Stripe invoice billing periods (~30 days).
-- Hardens RLS to explicitly block user writes on commission/payout tables.

-- 1. Add status and period tracking columns
ALTER TABLE public.referral_commissions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS matures_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_period_end TIMESTAMPTZ;

-- 2. Constraint: only valid statuses
ALTER TABLE public.referral_commissions
  ADD CONSTRAINT chk_commission_status CHECK (status IN ('pending', 'available'));

-- 3. Partial index for cron maturation query
CREATE INDEX IF NOT EXISTS idx_referral_commissions_pending_maturity
  ON public.referral_commissions(status, matures_at)
  WHERE status = 'pending';

-- 4. Migrate existing commissions to 'available' (all are past 14-day maturity)
UPDATE public.referral_commissions
   SET status = 'available',
       matures_at = created_at + INTERVAL '14 days'
 WHERE status = 'pending';

-- ============================================
-- RLS HARDENING: Explicit deny policies
-- ============================================
-- Supabase RLS is deny-by-default, but these are belt-and-suspenders.
-- Service role bypasses RLS entirely, so backend writes are unaffected.

-- referral_commissions: block all user writes
CREATE POLICY "Block user inserts on commissions"
  ON public.referral_commissions FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block user updates on commissions"
  ON public.referral_commissions FOR UPDATE
  USING (false);

CREATE POLICY "Block user deletes on commissions"
  ON public.referral_commissions FOR DELETE
  USING (false);

-- payout_requests: block all user writes
CREATE POLICY "Block user inserts on payout_requests"
  ON public.payout_requests FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block user updates on payout_requests"
  ON public.payout_requests FOR UPDATE
  USING (false);

CREATE POLICY "Block user deletes on payout_requests"
  ON public.payout_requests FOR DELETE
  USING (false);

-- referral_uses: block user writes (should already be service-role only, but enforce)
CREATE POLICY "Block user inserts on referral_uses"
  ON public.referral_uses FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Block user updates on referral_uses"
  ON public.referral_uses FOR UPDATE
  USING (false);

CREATE POLICY "Block user deletes on referral_uses"
  ON public.referral_uses FOR DELETE
  USING (false);

-- ============================================
-- Replace create_payout_atomic: status-based maturity
-- ============================================
CREATE OR REPLACE FUNCTION public.create_payout_atomic(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_min_cents INTEGER DEFAULT 1500,
  p_cooldown_hours INTEGER DEFAULT 24
)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available_total INTEGER;
  v_reserved_total INTEGER;
  v_available INTEGER;
  v_last_payout TIMESTAMPTZ;
  v_result public.payout_requests;
BEGIN
  -- Serialize concurrent payout requests for this user
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- 1. Sum commissions with status = 'available'
  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_available_total
    FROM public.referral_commissions
   WHERE referrer_id = p_user_id
     AND status = 'available';

  -- 2. Sum reserved + paid out amounts
  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_reserved_total
    FROM public.payout_requests
   WHERE referrer_id = p_user_id
     AND status IN ('pending_transfer', 'completed');

  v_available := v_available_total - v_reserved_total;

  -- 3. Validate minimum payout amount
  IF p_amount_cents < p_min_cents THEN
    RAISE EXCEPTION 'Minimum payout amount is % cents', p_min_cents;
  END IF;

  -- 4. Validate sufficient balance
  IF p_amount_cents > v_available THEN
    RAISE EXCEPTION 'Insufficient balance: requested % cents but only % cents available', p_amount_cents, v_available;
  END IF;

  -- 5. Rate limit: check cooldown period
  SELECT MAX(created_at)
    INTO v_last_payout
    FROM public.payout_requests
   WHERE referrer_id = p_user_id
     AND status IN ('pending_transfer', 'completed');

  IF v_last_payout IS NOT NULL AND v_last_payout > NOW() - (p_cooldown_hours || ' hours')::INTERVAL THEN
    RAISE EXCEPTION 'Payout cooldown: please wait at least % hours between payout requests', p_cooldown_hours;
  END IF;

  -- 6. Insert payout request with instant status
  INSERT INTO public.payout_requests (referrer_id, amount_cents, status)
  VALUES (p_user_id, p_amount_cents, 'pending_transfer')
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
