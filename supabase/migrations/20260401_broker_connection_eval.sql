-- Add is_eval flag to broker_connections
-- When true, all trades synced from this connection are automatically marked as eval
ALTER TABLE public.broker_connections
  ADD COLUMN IF NOT EXISTS is_eval BOOLEAN NOT NULL DEFAULT FALSE;
