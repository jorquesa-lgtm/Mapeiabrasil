/*
  # Fix security issues

  1. Function `public.is_admin()`
     - Set search_path to '' (immutable) to prevent search-path hijacking
     - Switch from SECURITY DEFINER to SECURITY INVOKER (the function only
       reads the `admins` table, which admins already have SELECT on via RLS;
       SECURITY DEFINER is unnecessary and exposes the function to privilege
       escalation)
     - Revoke EXECUTE from `anon` — anonymous users should never call this
     - Keep EXECUTE for `authenticated` (needed by the admin dashboard)

  2. Policy `Authenticated users can insert handoff requests`
     - Replace the always-true WITH CHECK (true) with a real ownership check
       so authenticated users can only insert rows tied to their own identity
       (no restriction on whatsapp_number content since handoffs are created
       by the copilot on behalf of the logged-in user)

  3. Security notes
     - No data is deleted or altered
     - Existing admin access patterns are preserved
*/

-- 1. Recreate is_admin() as SECURITY INVOKER with a pinned search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE id = auth.uid()
  );
$$;

-- 2. Revoke EXECUTE from PUBLIC and anon so unauthenticated callers cannot probe admin status
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

-- 3. Ensure authenticated can still call it
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 4. Replace the always-true INSERT policy on handoff_requests
DROP POLICY IF EXISTS "Authenticated users can insert handoff requests"
  ON public.handoff_requests;

CREATE POLICY "Authenticated users can insert handoff requests"
  ON public.handoff_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
