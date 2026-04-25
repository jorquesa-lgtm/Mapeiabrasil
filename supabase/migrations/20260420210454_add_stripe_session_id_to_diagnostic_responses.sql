/*
  # Add stripe_session_id to diagnostic_responses

  1. Changes
    - Add `stripe_session_id` (text) column to diagnostic_responses so the
      server can verify with Stripe whether the user actually paid, and the
      webhook can link payment events back to the exact diagnostic row.
    - Add a unique index on `stripe_session_id` (where not null) to prevent
      replay / duplicate unlock attempts and allow fast lookups from the webhook.

  2. Notes
    - Column is nullable — free flow diagnostics will not have a session id.
    - No RLS change needed (inherits existing policies).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagnostic_responses' AND column_name = 'stripe_session_id'
  ) THEN
    ALTER TABLE diagnostic_responses ADD COLUMN stripe_session_id text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_responses_stripe_session_id_key
  ON diagnostic_responses (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;