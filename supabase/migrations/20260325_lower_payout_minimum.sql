-- Lower minimum payout from $25 to $15
CREATE OR REPLACE FUNCTION public.create_payout_atomic(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_min_cents INTEGER DEFAULT 1500,
  p_maturity_days INTEGER DEFAULT 14,
  p_cooldown_hours INTEGER DEFAULT 24
)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_matured_total INTEGER;
  v_reserved_total INTEGER;
  v_available INTEGER;
  v_last_payout TIMESTAMPTZ;
  v_result public.payout_requests;
BEGIN
  -- Serialize concurrent payout requests for this user
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- 1. Calculate matured earnings (commissions older than maturity window)
  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_matured_total
    FROM public.referral_commissions
   WHERE referrer_id = p_user_id
     AND created_at <= NOW() - (p_maturity_days || ' days')::INTERVAL;

  -- 2. Calculate already-reserved or paid-out amounts
  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_reserved_total
    FROM public.payout_requests
   WHERE referrer_id = p_user_id
     AND status IN ('pending_transfer', 'completed');

  v_available := v_matured_total - v_reserved_total;

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
