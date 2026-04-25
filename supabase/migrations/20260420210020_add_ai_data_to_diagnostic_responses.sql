/*
  # Add ai_data column to diagnostic_responses

  1. Changes
    - Add `ai_data` (jsonb) column to store the AI-generated diagnostic payload
      (level_title, quick_wins, roadmap, gaps, process_audit, benchmark, etc.)
      so the stripe-webhook -> generate-report chain can access it reliably
      without re-running the AI generation.

  2. Notes
    - Column is nullable with default '{}' to preserve existing rows.
    - No RLS policy change needed (inherits existing policies).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagnostic_responses' AND column_name = 'ai_data'
  ) THEN
    ALTER TABLE diagnostic_responses ADD COLUMN ai_data jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;