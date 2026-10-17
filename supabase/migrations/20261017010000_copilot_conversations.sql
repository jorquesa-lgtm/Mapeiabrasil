/*
  # Persist copilot conversations

  Until now the copilot edge function answered each message and never stored
  the exchange, so there was no conversation history to review. This adds a
  table that records every turn (the client message and the bot reply),
  grouped by a conversation id generated per chat session.

  ## Table: copilot_conversations
  One row per turn.
    - conversation_id   groups turns into a single chat session
    - email / company / sector   who the conversation is with (from context)
    - user_message      the client's message that triggered this turn
    - assistant_message the bot's reply
    - rate_limited      true when the turn hit the daily limit
    - created_at        when the turn happened

  ## Security
  - RLS enabled. Only admins (is_admin()) can read.
  - No INSERT policy: the edge function writes with the service role key,
    which bypasses RLS. The client is never granted write access, so a
    visitor cannot forge conversation rows.
*/

CREATE TABLE IF NOT EXISTS copilot_conversations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid NOT NULL,
  email              text NOT NULL DEFAULT '',
  company            text NOT NULL DEFAULT '',
  sector             text NOT NULL DEFAULT '',
  user_message       text NOT NULL DEFAULT '',
  assistant_message  text NOT NULL DEFAULT '',
  rate_limited       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE copilot_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read copilot conversations" ON copilot_conversations;
CREATE POLICY "Admins can read copilot conversations"
  ON copilot_conversations FOR SELECT TO authenticated
  USING (is_admin());

CREATE INDEX IF NOT EXISTS idx_copilot_conv_conversation ON copilot_conversations (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_copilot_conv_created ON copilot_conversations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_conv_email ON copilot_conversations (email);
