-- Migration: get_unpaid_diagnostics RPC
-- Used by Make scenario 5147217 (Nudge Diagnóstico Não Pago) in the paid-only model.
-- Replaces get_abandoned_leads (people who never completed the quiz)
-- with people who COMPLETED the quiz but haven't paid yet.

CREATE OR REPLACE FUNCTION get_unpaid_diagnostics()
RETURNS TABLE (
  diag_id   uuid,
  name      text,
  email     text,
  whatsapp  text,
  company   text,
  sector    text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    dr.id                               AS diag_id,
    COALESCE(l.name, '')               AS name,
    COALESCE(dr.email, l.email, '')    AS email,
    COALESCE(l.whatsapp, '')           AS whatsapp,
    COALESCE(l.company, '')            AS company,
    COALESCE(dr.sector, '')            AS sector
  FROM diagnostic_responses dr
  LEFT JOIN leads l ON l.id = dr.lead_id
  WHERE
    dr.unlocked = false
    AND dr.created_at < now() - interval '24 hours'
    AND dr.created_at > now() - interval '72 hours'  -- nudge once in this window
    AND COALESCE(l.whatsapp, '') <> ''
    AND COALESCE(dr.stripe_session_id, '') = ''       -- truly unpaid
  ORDER BY dr.created_at ASC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION get_unpaid_diagnostics() TO anon, authenticated;
