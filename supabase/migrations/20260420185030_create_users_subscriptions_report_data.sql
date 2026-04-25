/*
  # Users, Subscriptions & Report Data

  1. New Tables
    - `user_profiles`
      - `id` (uuid, pk = auth.users.id)
      - `email` (text)
      - `name` (text)
      - `company` (text)
      - `whatsapp` (text)
      - `plan_tier` ('free' | 'premium' | 'subscription')
      - `created_at` (timestamptz)

    - `subscriptions`
      - `id` (uuid, pk)
      - `user_id` (uuid, fk -> auth.users)
      - `stripe_customer_id` (text)
      - `stripe_subscription_id` (text, nullable for one-time)
      - `stripe_session_id` (text)
      - `plan` ('premium' | 'subscription')
      - `status` ('active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete')
      - `current_period_end` (timestamptz)
      - `created_at` (timestamptz)

    - `report_data`
      - `id` (uuid, pk)
      - `diag_id` (uuid, fk -> diagnostic_responses)
      - `email` (text) — denormalized for lookup without auth
      - `stripe_session_id` (text)
      - `ai_data` (jsonb) — full generate-diagnostic JSON response
      - `pdf_sent` (boolean)
      - `pdf_sent_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - RLS on all tables
    - user_profiles: owner read/update only
    - subscriptions: owner read only, service_role write
    - report_data: owner read by email match, service_role write

  3. Notes
    - user_profiles.id is the same UUID as auth.users.id (no separate sequence)
    - report_data links to diagnostic_responses for full answer context
    - pdf_sent tracks whether the email delivery succeeded
*/

-- user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  plan_tier text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL DEFAULT '',
  stripe_customer_id text NOT NULL DEFAULT '',
  stripe_subscription_id text,
  stripe_session_id text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT 'premium',
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subs_email ON subscriptions (email);
CREATE INDEX IF NOT EXISTS idx_subs_session ON subscriptions (stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_subs_stripe_sub ON subscriptions (stripe_subscription_id);

-- report_data
CREATE TABLE IF NOT EXISTS report_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diag_id uuid REFERENCES diagnostic_responses(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL DEFAULT '',
  stripe_session_id text NOT NULL DEFAULT '',
  ai_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_sent boolean NOT NULL DEFAULT false,
  pdf_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own reports"
  ON report_data FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_report_user ON report_data (user_id);
CREATE INDEX IF NOT EXISTS idx_report_email ON report_data (email);
CREATE INDEX IF NOT EXISTS idx_report_session ON report_data (stripe_session_id);
