/*
  # Add website_url and company_intel to diagnostic_responses

  1. Changes
    - `website_url` (text) — the prospect's company website entered during the diagnostic gate
    - `company_intel` (jsonb) — AI-extracted company intelligence from scraping the website:
        { industry, size_hint, products_services, target_market, tech_stack_hints,
          digital_maturity_hints, key_pain_points, summary }

  2. Notes
    - Both columns are nullable — existing rows are unaffected
    - website_url defaults to empty string for consistency with other text fields
    - company_intel defaults to empty object
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagnostic_responses' AND column_name = 'website_url'
  ) THEN
    ALTER TABLE diagnostic_responses ADD COLUMN website_url text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagnostic_responses' AND column_name = 'company_intel'
  ) THEN
    ALTER TABLE diagnostic_responses ADD COLUMN company_intel jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;
