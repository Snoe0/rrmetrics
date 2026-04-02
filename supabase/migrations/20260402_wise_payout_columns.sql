-- Add Wise payout columns to profiles (replacing Stripe Connect for referral payouts)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wise_recipient_id TEXT,
  ADD COLUMN IF NOT EXISTS wise_onboarded BOOLEAN NOT NULL DEFAULT false;
