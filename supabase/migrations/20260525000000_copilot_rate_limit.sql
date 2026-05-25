-- Migration: copilot_usage rate limiting
-- Tracks daily message count per user email.
-- Copilot edge function calls increment_copilot_usage() on every request
-- and returns a friendly message when count exceeds 50/day.

CREATE TABLE IF NOT EXISTS copilot_usage (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  date_key   text NOT NULL,  -- YYYY-MM-DD UTC
  count      integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email, date_key)
);

ALTER TABLE copilot_usage ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (copilot uses service role key)
CREATE POLICY "Service role only"
  ON copilot_usage FOR ALL
  USING (false);

-- Atomic upsert — increments count and returns new value
CREATE OR REPLACE FUNCTION increment_copilot_usage(p_email text, p_date text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO copilot_usage (email, date_key, count)
  VALUES (p_email, p_date, 1)
  ON CONFLICT (email, date_key)
  DO UPDATE SET
    count      = copilot_usage.count + 1,
    updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_copilot_usage(text, text) TO anon, authenticated;
