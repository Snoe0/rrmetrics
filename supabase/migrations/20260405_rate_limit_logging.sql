-- Rate limit event logging table for audit and analytics
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_count integer NOT NULL,
  was_blocked boolean NOT NULL DEFAULT false,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limit_events_user_created
  ON rate_limit_events (user_id, created_at DESC);

CREATE INDEX idx_rate_limit_events_blocked
  ON rate_limit_events (was_blocked, created_at DESC)
  WHERE was_blocked = true;

-- RPC function to log rate limit events (called from Worker via service client)
CREATE OR REPLACE FUNCTION log_rate_limit_event(
  p_user_id uuid,
  p_request_count integer,
  p_was_blocked boolean,
  p_endpoint text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO rate_limit_events (user_id, request_count, was_blocked, endpoint)
  VALUES (p_user_id, p_request_count, p_was_blocked, p_endpoint);
END;
$$;

-- Cleanup function: purge events older than 30 days
-- Run via pg_cron or scheduled Worker
CREATE OR REPLACE FUNCTION cleanup_old_rate_limit_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM rate_limit_events
  WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- RLS: no direct access — only via service client (SECURITY DEFINER functions)
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;
