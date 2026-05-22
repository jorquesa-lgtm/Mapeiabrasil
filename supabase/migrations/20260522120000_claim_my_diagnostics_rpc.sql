-- claim_my_diagnostics()
-- Called from DashboardPage on every authenticated load.
-- Retroactively stamps user_id on diagnostic_responses and report_data rows
-- that were saved anonymously (user_id IS NULL) but match the caller's email.
-- SECURITY DEFINER so it can bypass RLS and update rows the client can't see.
-- Idempotent: safe to call repeatedly; the WHERE user_id IS NULL guard is a no-op
-- once the rows are already claimed.

CREATE OR REPLACE FUNCTION public.claim_my_diagnostics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_email    text := auth.email();
BEGIN
  IF v_user_id IS NULL OR v_email IS NULL THEN
    RETURN; -- not authenticated, nothing to do
  END IF;

  -- Claim diagnostic_responses rows saved without a user_id
  UPDATE diagnostic_responses
  SET    user_id = v_user_id
  WHERE  email   = v_email
    AND  user_id IS NULL;

  -- Claim report_data rows saved without a user_id
  UPDATE report_data
  SET    user_id = v_user_id
  WHERE  email   = v_email
    AND  user_id IS NULL;

  -- Claim user_goals that were written with a source_diag_id belonging to this user
  -- (generate-report skips goals when user_id is null, but handle any that exist)
  UPDATE user_goals
  SET    user_id = v_user_id
  WHERE  user_id IS NULL
    AND  source_diag_id IN (
           SELECT id FROM diagnostic_responses
           WHERE  email = v_email
         );
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.claim_my_diagnostics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_my_diagnostics() TO authenticated;
