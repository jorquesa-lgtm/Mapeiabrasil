/*
  # Grant admins read access to the data the admin portal displays

  The standalone admin portal (public/admin.html) authenticates as an admin
  user and reads the business tables directly through row-level security.
  Until now only `handoff_requests` had an admin SELECT policy, so the other
  sections (leads, clients, payments, diagnostics, activations, copilot usage)
  came back empty. This migration adds SELECT policies, gated by is_admin(),
  so admins — and only admins — can read these tables from the client.

  No table gains write access here; inserts/updates keep their existing rules.
  is_admin() already exists and returns true only for uids present in `admins`.
*/

-- leads ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read leads" ON leads;
CREATE POLICY "Admins can read leads"
  ON leads FOR SELECT TO authenticated
  USING (is_admin());

-- user_profiles ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;
CREATE POLICY "Admins can read all profiles"
  ON user_profiles FOR SELECT TO authenticated
  USING (is_admin());

-- subscriptions (payments) ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all subscriptions" ON subscriptions;
CREATE POLICY "Admins can read all subscriptions"
  ON subscriptions FOR SELECT TO authenticated
  USING (is_admin());

-- diagnostic_responses (results) ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all diagnostics" ON diagnostic_responses;
CREATE POLICY "Admins can read all diagnostics"
  ON diagnostic_responses FOR SELECT TO authenticated
  USING (is_admin());

-- report_data (AI reports) ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all reports" ON report_data;
CREATE POLICY "Admins can read all reports"
  ON report_data FOR SELECT TO authenticated
  USING (is_admin());

-- ativar_activations (tool activations / interactions) ────────────────────────
DROP POLICY IF EXISTS "Admins can read all activations" ON ativar_activations;
CREATE POLICY "Admins can read all activations"
  ON ativar_activations FOR SELECT TO authenticated
  USING (is_admin());

-- copilot_usage (bot usage counts) ────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read copilot usage" ON copilot_usage;
CREATE POLICY "Admins can read copilot usage"
  ON copilot_usage FOR SELECT TO authenticated
  USING (is_admin());
