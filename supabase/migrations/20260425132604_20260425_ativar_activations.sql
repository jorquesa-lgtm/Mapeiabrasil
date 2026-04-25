/*
  # Create ativar_activations table

  ## Summary
  Stores activation records when a Premium client activates an "Ativar" tool
  from their diagnostic results page.

  ## New Tables
  - `ativar_activations`
    - `id` (uuid, primary key)
    - `created_at` (timestamptz)
    - `diagnostic_id` (uuid, FK to report_data — nullable since diagnostics table may use report_data)
    - `client_email` (text, not null)
    - `client_name` (text, not null)
    - `client_whatsapp` (text, nullable)
    - `tool_id` (text, not null) — references the tool id from ativarTools config
    - `tool_name` (text, not null)
    - `gap_area` (text, not null)
    - `setup_data` (jsonb) — stores the filled setup fields
    - `status` (text, default 'pending') — pending | active | cancelled
    - `stripe_subscription_id` (text, nullable)
    - `price_monthly` (numeric, not null)

  ## Security
  - RLS enabled
  - Authenticated users can insert their own activations (by email match)
  - Authenticated users can read their own activations (by email match)
  - Service role can manage all rows (admin access)
*/

CREATE TABLE IF NOT EXISTS ativar_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  client_email text NOT NULL,
  client_name text NOT NULL,
  client_whatsapp text,
  tool_id text NOT NULL,
  tool_name text NOT NULL,
  gap_area text NOT NULL,
  setup_data jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled')),
  stripe_subscription_id text,
  price_monthly numeric NOT NULL
);

ALTER TABLE ativar_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own activations"
  ON ativar_activations
  FOR INSERT
  TO authenticated
  WITH CHECK (client_email = auth.jwt() ->> 'email');

CREATE POLICY "Users can view own activations"
  ON ativar_activations
  FOR SELECT
  TO authenticated
  USING (client_email = auth.jwt() ->> 'email');

CREATE POLICY "Users can update own activations"
  ON ativar_activations
  FOR UPDATE
  TO authenticated
  USING (client_email = auth.jwt() ->> 'email')
  WITH CHECK (client_email = auth.jwt() ->> 'email');
