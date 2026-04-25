/*
  # Add explicit deny-all policies to access_codes

  1. Context
    - `access_codes` has RLS enabled but no policies, which is correct for
      service-role-only access but flagged by the security linter.
    - This migration adds explicit deny-all policies for both anon and
      authenticated roles. Service role bypasses RLS, so the edge functions
      (`validate-access-code`, `verify-premium`) continue to work.

  2. Security
    - Four policies (SELECT, INSERT, UPDATE, DELETE) for both anon and
      authenticated, all with USING/WITH CHECK = false.
    - Net effect: only the service role can read or modify codes. The anon
      client used in the browser cannot enumerate, create, or alter codes.
*/

DROP POLICY IF EXISTS "Deny all reads to non-service roles" ON access_codes;
DROP POLICY IF EXISTS "Deny all inserts to non-service roles" ON access_codes;
DROP POLICY IF EXISTS "Deny all updates to non-service roles" ON access_codes;
DROP POLICY IF EXISTS "Deny all deletes to non-service roles" ON access_codes;

CREATE POLICY "Deny all reads to non-service roles"
  ON access_codes FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "Deny all inserts to non-service roles"
  ON access_codes FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "Deny all updates to non-service roles"
  ON access_codes FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny all deletes to non-service roles"
  ON access_codes FOR DELETE
  TO anon, authenticated
  USING (false);
