/*
  # Create ativar_waitlist table

  ## Summary
  Stores waitlist signups when a Premium client clicks "Me avise quando estiver
  disponível" on a coming-soon Ativar tool card.

  ## New Tables
  - `ativar_waitlist`
    - `id` (uuid, primary key)
    - `created_at` (timestamptz)
    - `client_email` (text, not null)
    - `client_name` (text, not null)
    - `tool_id` (text, not null)
    - `tool_name` (text, not null)
    - `gap_area` (text, not null)
    - `sector` (text, nullable) — client's business sector from diagnostic
    - `diagnostic_score` (numeric, nullable) — global score from diagnostic

  ## Security
  - RLS enabled
  - Authenticated users can insert their own waitlist entries (by email match)
  - Authenticated users can read their own entries
*/

CREATE TABLE IF NOT EXISTS ativar_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  client_email text NOT NULL,
  client_name text NOT NULL,
  tool_id text NOT NULL,
  tool_name text NOT NULL,
  gap_area text NOT NULL,
  sector text,
  diagnostic_score numeric
);

ALTER TABLE ativar_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own waitlist entries"
  ON ativar_waitlist
  FOR INSERT
  TO authenticated
  WITH CHECK (client_email = auth.jwt() ->> 'email');

CREATE POLICY "Users can view own waitlist entries"
  ON ativar_waitlist
  FOR SELECT
  TO authenticated
  USING (client_email = auth.jwt() ->> 'email');
