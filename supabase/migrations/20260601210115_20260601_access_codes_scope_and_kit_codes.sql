/*
  # Add scope to access_codes + seed kit-scoped codes

  1. Modified Tables
    - `access_codes` — adds `scope` column (text, default 'diagnostic')
      Allowed values: 'diagnostic' | 'kits' | 'all'
      - 'diagnostic' — unlocks the premium diagnostic (existing behaviour)
      - 'kits'       — unlocks a kit purchase without Stripe
      - 'all'        — unlocks both

  2. New Data
    - 10 kit-scoped friends & family codes inserted
      (MAPEIA-KIT-XXXXX format, max_uses = 1, scope = 'kits')
    - Existing 20 diagnostic codes updated to scope = 'diagnostic' explicitly

  3. No destructive changes — existing data and RLS policies unchanged.
*/

-- Add scope column if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'access_codes' AND column_name = 'scope'
  ) THEN
    ALTER TABLE access_codes ADD COLUMN scope text NOT NULL DEFAULT 'diagnostic';
  END IF;
END $$;

-- Backfill existing diagnostic codes
UPDATE access_codes
SET scope = 'diagnostic'
WHERE scope IS DISTINCT FROM 'diagnostic'
  AND code LIKE 'MAPEIA-FF-%';

-- Seed 10 kit-scoped codes (idempotent)
INSERT INTO access_codes (code, label, max_uses, scope) VALUES
  ('MAPEIA-KIT-3H7NQ', 'Kit F&F #1',  1, 'kits'),
  ('MAPEIA-KIT-X9R2K', 'Kit F&F #2',  1, 'kits'),
  ('MAPEIA-KIT-B4M7P', 'Kit F&F #3',  1, 'kits'),
  ('MAPEIA-KIT-W6T3L', 'Kit F&F #4',  1, 'kits'),
  ('MAPEIA-KIT-Y2J8N', 'Kit F&F #5',  1, 'kits'),
  ('MAPEIA-KIT-Z5N9Q', 'Kit F&F #6',  1, 'kits'),
  ('MAPEIA-KIT-A7K4X', 'Kit F&F #7',  1, 'kits'),
  ('MAPEIA-KIT-C8L2R', 'Kit F&F #8',  1, 'kits'),
  ('MAPEIA-KIT-D3P6T', 'Kit F&F #9',  1, 'kits'),
  ('MAPEIA-KIT-E9R5W', 'Kit F&F #10', 1, 'kits')
ON CONFLICT (code) DO NOTHING;
