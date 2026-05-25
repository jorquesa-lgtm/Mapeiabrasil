-- claim_my_diagnostics()
-- Called from DashboardPage on every authenticated load.
-- Retroactively stamps user_id on diagnostic_responses and report_data rows
-- saved anonymously (user_id IS NULL) that match the caller's email.
-- SECURITY DEFINER so it can bypass RLS. Idempotent.

-- Ensure the column the dashboard + this function rely on exists
ALTER TABLE diagnostic_responses ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_diagnostic_responses_user_id ON diagnostic_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_responses_email ON diagnostic_responses(email);

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
    RETURN;
  END IF;

  UPDATE diagnostic_responses
  SET    user_id = v_user_id
  WHERE  email   = v_email
    AND  user_id IS NULL;

  UPDATE report_data
  SET    user_id = v_user_id
  WHERE  email   = v_email
    AND  user_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_my_diagnostics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_my_diagnostics() TO authenticated;
