/*
  # Create access_codes table for friends & family bypass

  1. New Tables
    - `access_codes` — manually-issued codes that bypass Stripe checkout
      and unlock the premium diagnostic.
      - `code` (text, primary key) — the redemption code (case-insensitive
        comparison handled via UPPER() in the edge function).
      - `label` (text) — human-readable label (e.g. recipient name).
      - `max_uses` (int, default 1) — how many distinct redemptions allowed.
      - `used_count` (int, default 0) — current redemption count.
      - `active` (boolean, default true) — manual kill switch.
      - `created_at`, `expires_at`, `last_used_at`, `last_used_email`.
      - `notes` (jsonb) — append-only audit trail of redemptions.

  2. Modified Tables
    - `diagnostic_responses` — adds `access_code` column to record which code
      was used to unlock a given diagnostic, parallel to `stripe_session_id`.

  3. Security
    - RLS enabled on `access_codes` with NO public policies. Only the
      service role (used by edge functions) can read or write the table.
    - This keeps the codes private — the anon client cannot enumerate them.

  4. Seed Data
    - 20 codes inserted with label "Friends & Family #N". Codes use a
      readable format `MAPEIA-FF-XXXXX` (no ambiguous chars: 0/O/1/I).
    - `ON CONFLICT DO NOTHING` makes the migration idempotent.
*/

CREATE TABLE IF NOT EXISTS access_codes (
  code text PRIMARY KEY,
  label text DEFAULT '',
  max_uses int NOT NULL DEFAULT 1,
  used_count int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  last_used_email text DEFAULT '',
  notes jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagnostic_responses' AND column_name = 'access_code'
  ) THEN
    ALTER TABLE diagnostic_responses ADD COLUMN access_code text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_access_codes_active ON access_codes (active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_diag_access_code ON diagnostic_responses (access_code);

INSERT INTO access_codes (code, label, max_uses) VALUES
  ('MAPEIA-FF-7H3K9', 'Friends & Family #1', 1),
  ('MAPEIA-FF-X4P2N', 'Friends & Family #2', 1),
  ('MAPEIA-FF-Q8R5M', 'Friends & Family #3', 1),
  ('MAPEIA-FF-W6T9L', 'Friends & Family #4', 1),
  ('MAPEIA-FF-Y3J7K', 'Friends & Family #5', 1),
  ('MAPEIA-FF-Z5N2P', 'Friends & Family #6', 1),
  ('MAPEIA-FF-A4K8X', 'Friends & Family #7', 1),
  ('MAPEIA-FF-B2M9Q', 'Friends & Family #8', 1),
  ('MAPEIA-FF-C7L4R', 'Friends & Family #9', 1),
  ('MAPEIA-FF-D9P3T', 'Friends & Family #10', 1),
  ('MAPEIA-FF-E5R7W', 'Friends & Family #11', 1),
  ('MAPEIA-FF-F8T2Y', 'Friends & Family #12', 1),
  ('MAPEIA-FF-G3W6Z', 'Friends & Family #13', 1),
  ('MAPEIA-FF-H6Y4A', 'Friends & Family #14', 1),
  ('MAPEIA-FF-J9Z8B', 'Friends & Family #15', 1),
  ('MAPEIA-FF-K2A5C', 'Friends & Family #16', 1),
  ('MAPEIA-FF-L7B3D', 'Friends & Family #17', 1),
  ('MAPEIA-FF-M4C9E', 'Friends & Family #18', 1),
  ('MAPEIA-FF-N8D6F', 'Friends & Family #19', 1),
  ('MAPEIA-FF-P5E2G', 'Friends & Family #20', 1)
ON CONFLICT (code) DO NOTHING;
