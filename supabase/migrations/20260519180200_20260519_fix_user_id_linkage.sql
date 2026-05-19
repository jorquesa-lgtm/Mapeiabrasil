/*
  # Fix User ID Linkage Across Diagnostic, Report, and Goals Tables

  ## Summary
  This migration fixes the broken connection between the diagnostic flow and
  the user dashboard by:

  1. Adding `user_id` to `diagnostic_responses` so each diagnostic can be
     linked to the authenticated Supabase user who completed it.

  2. Adding `source_diag_id` to `user_goals` so checklist items can be linked
     back to the diagnostic that generated them (for auto-population).

  3. Adding a `source` text column to `user_goals` to distinguish auto-populated
     items ("roadmap_30", "roadmap_60", "roadmap_90") from manually created ones.

  4. Fixing the RLS policy on `report_data` to allow reads by email match in
     addition to user_id, so the dashboard email-fallback query works under RLS.

  5. Adding missing indexes for new columns.

  ## Tables Modified

  ### diagnostic_responses
  - New column: `user_id` (uuid, nullable FK -> auth.users) — links diagnostic to authenticated user

  ### user_goals
  - New column: `source_diag_id` (uuid, nullable FK -> diagnostic_responses) — links goal to originating diagnostic
  - New column: `source` (text, default 'manual') — "manual" | "roadmap_30" | "roadmap_60" | "roadmap_90"

  ### report_data
  - New RLS policy: allow authenticated users to read reports where email matches auth.users email
    (supplements existing user_id policy, enabling the dashboard email-fallback path to work)

  ## Security
  - RLS remains enabled on all tables
  - New policies follow the same ownership pattern
  - `user_id` on diagnostic_responses is nullable to remain compatible with
    anonymous/legacy diagnostics that predate the account gate
*/

-- 1. Add user_id to diagnostic_responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagnostic_responses' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE diagnostic_responses
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_diag_user_id ON diagnostic_responses (user_id);

-- RLS: let authenticated users read their own diagnostics by user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'diagnostic_responses' AND policyname = 'Users can read own diagnostics'
  ) THEN
    CREATE POLICY "Users can read own diagnostics"
      ON diagnostic_responses FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. Add source_diag_id and source to user_goals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_goals' AND column_name = 'source_diag_id'
  ) THEN
    ALTER TABLE user_goals
      ADD COLUMN source_diag_id uuid REFERENCES diagnostic_responses(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_goals' AND column_name = 'source'
  ) THEN
    ALTER TABLE user_goals
      ADD COLUMN source text NOT NULL DEFAULT 'manual';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_goals_diag ON user_goals (source_diag_id);

-- 3. Add email-based RLS fallback policy on report_data
-- This allows the dashboard email-fallback query to work when user_id is NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'report_data' AND policyname = 'Users can read reports by email'
  ) THEN
    CREATE POLICY "Users can read reports by email"
      ON report_data FOR SELECT
      TO authenticated
      USING (
        email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
      );
  END IF;
END $$;
