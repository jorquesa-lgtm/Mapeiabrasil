-- Migration: kit subscription support
-- Adds RPC to get active kit subscriptions by email (used by copilot edge function)

CREATE OR REPLACE FUNCTION get_kit_subscriptions(p_email text)
RETURNS TABLE (
  plan   text,
  status text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT plan, status
  FROM subscriptions
  WHERE
    email = p_email
    AND plan LIKE 'kit_%'
    AND status = 'active'
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_kit_subscriptions(text) TO anon, authenticated;
