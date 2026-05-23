-- Kit 2 infrastructure: follow-up sequence tracking on leads
-- Adds columns to track which follow-up message has been sent
-- and whether the lead has replied, so the daily scenario knows
-- which leads need message 2 or 3 vs. which are done.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS followup_status text NOT NULL DEFAULT 'pending',
  -- pending → msg1_sent → msg2_sent → msg3_sent → converted | unresponsive
  ADD COLUMN IF NOT EXISTS msg1_sent_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS msg2_sent_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS msg3_sent_at  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replied_at    timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS converted_at  timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_followup_status ON leads (followup_status);
CREATE INDEX IF NOT EXISTS idx_leads_msg1_sent_at    ON leads (msg1_sent_at);

-- Helper RPC: mark msg1 sent (called by Make after welcome message is delivered)
CREATE OR REPLACE FUNCTION public.mark_lead_msg1_sent(p_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE leads
  SET followup_status = 'msg1_sent',
      msg1_sent_at    = now()
  WHERE id = p_lead_id AND followup_status = 'pending';
END;
$$;

-- Helper RPC: get leads that need follow-up message 2 (24-48h after msg1)
CREATE OR REPLACE FUNCTION public.get_leads_needing_followup2()
RETURNS TABLE (
  id uuid, name text, email text, whatsapp text,
  company text, sector text, plan_interest text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.name, l.email, l.whatsapp, l.company, l.sector, l.plan_interest
  FROM leads l
  WHERE l.followup_status = 'msg1_sent'
    AND l.msg1_sent_at < NOW() - INTERVAL '24 hours'
    AND l.msg1_sent_at > NOW() - INTERVAL '48 hours'
    AND l.whatsapp IS NOT NULL AND l.whatsapp <> '';
END;
$$;

-- Helper RPC: mark msg2 sent
CREATE OR REPLACE FUNCTION public.mark_lead_msg2_sent(p_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE leads
  SET followup_status = 'msg2_sent',
      msg2_sent_at    = now()
  WHERE id = p_lead_id AND followup_status = 'msg1_sent';
END;
$$;

-- Helper RPC: get leads that need follow-up message 3 (72-96h after msg1)
CREATE OR REPLACE FUNCTION public.get_leads_needing_followup3()
RETURNS TABLE (
  id uuid, name text, email text, whatsapp text,
  company text, sector text, plan_interest text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.name, l.email, l.whatsapp, l.company, l.sector, l.plan_interest
  FROM leads l
  WHERE l.followup_status = 'msg2_sent'
    AND l.msg2_sent_at < NOW() - INTERVAL '72 hours'
    AND l.msg2_sent_at > NOW() - INTERVAL '96 hours'
    AND l.whatsapp IS NOT NULL AND l.whatsapp <> '';
END;
$$;

-- Helper RPC: mark msg3 sent (final follow-up — moves to unresponsive after this)
CREATE OR REPLACE FUNCTION public.mark_lead_msg3_sent(p_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE leads
  SET followup_status = 'msg3_sent',
      msg3_sent_at    = now()
  WHERE id = p_lead_id AND followup_status = 'msg2_sent';
END;
$$;

-- Helper RPC: mark lead as replied (called when lead responds on WhatsApp)
CREATE OR REPLACE FUNCTION public.mark_lead_replied(p_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE leads
  SET followup_status = 'replied',
      replied_at      = now()
  WHERE id = p_lead_id
    AND followup_status NOT IN ('replied', 'converted');
END;
$$;

-- Grant execute to service role only (Make calls via Supabase REST RPC)
REVOKE ALL ON FUNCTION public.mark_lead_msg1_sent(uuid)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_leads_needing_followup2()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_lead_msg2_sent(uuid)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_leads_needing_followup3()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_lead_msg3_sent(uuid)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_lead_replied(uuid)        FROM PUBLIC;

-- service_role: full access (edge functions, admin)
GRANT EXECUTE ON FUNCTION public.mark_lead_msg1_sent(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION public.get_leads_needing_followup2()  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_lead_msg2_sent(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION public.get_leads_needing_followup3()  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_lead_msg3_sent(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_lead_replied(uuid)        TO service_role;

-- anon: mark functions only (Make automations use the publishable key)
-- Safe: write-only, no sensitive data exposed, requires valid UUID
GRANT EXECUTE ON FUNCTION public.mark_lead_msg1_sent(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_lead_msg2_sent(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_lead_msg3_sent(uuid) TO anon;
-- get_* functions and mark_replied stay service_role only
