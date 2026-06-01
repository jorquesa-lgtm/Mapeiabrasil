/*
  # Create admins table, is_admin() RPC, and handoff_requests table

  ## Summary
  The admin portal (/admin and /admin/ativar) calls `supabase.rpc("is_admin")` to gate access,
  but neither the `admins` table nor the RPC function existed in the database, causing all
  admin users to be redirected with "Acesso restrito".

  ## Changes

  ### New Tables
  1. `admins`
     - `id` (uuid, PK, references auth.users)
     - `email` (text, for readability)
     - `created_at` (timestamptz)

  2. `handoff_requests` (required by AdminLeads query)
     - `id` (uuid, PK)
     - `created_at` (timestamptz)
     - `whatsapp_number` (text)
     - `reason` (text)
     - `last_user_message` (text)
     - `last_assistant_message` (text)
     - `status` (text, default 'pending')
     - `resolved_at` (timestamptz)
     - `resolved_by` (text)

  ### New Functions
  - `is_admin()` — returns true if the calling authenticated user's uid is in the admins table

  ### Security
  - RLS enabled on both tables
  - admins table: only the user themselves can read their own row (used by is_admin())
  - handoff_requests: admins can select/update; insert is open to authenticated users (copilot writes here)

  ### Seed
  - jquesada@mapeiabrasil.com added as first admin
*/

-- ── admins table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read own row"
  ON admins FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- ── is_admin() RPC ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins WHERE id = auth.uid()
  );
$$;

-- ── Seed: insert the first admin (idempotent) ─────────────────────────────────
INSERT INTO admins (id, email)
VALUES ('cfa90d1e-a067-4300-a76b-2aa59ba530a2', 'jquesada@mapeiabrasil.com')
ON CONFLICT (id) DO NOTHING;

-- ── handoff_requests table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS handoff_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz DEFAULT now(),
  whatsapp_number         text,
  reason                  text,
  last_user_message       text,
  last_assistant_message  text,
  status                  text NOT NULL DEFAULT 'pending',
  resolved_at             timestamptz,
  resolved_by             text
);

ALTER TABLE handoff_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert handoff requests"
  ON handoff_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view handoff requests"
  ON handoff_requests FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update handoff requests"
  ON handoff_requests FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
