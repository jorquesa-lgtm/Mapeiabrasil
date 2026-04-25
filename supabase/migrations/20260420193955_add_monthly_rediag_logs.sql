/*
  # Monthly Re-diagnostic Logs

  Tracks when monthly re-diagnostic reminder emails were sent to each user,
  preventing duplicate sends within the same month and providing an audit trail.

  1. New Tables
    - `monthly_rediag_logs`
      - `id` (uuid, pk)
      - `user_id` (uuid, fk -> auth.users)
      - `email` (text) — denormalized for lookup
      - `month_key` (text) — format "YYYY-MM", used for deduplication
      - `last_score` (integer) — score at time of send
      - `sector` (text) — sector at time of send
      - `sent_at` (timestamptz)

  2. Security
    - RLS enabled
    - Users can read their own log entries
    - Only service_role can insert (written by edge function)

  3. Indexes
    - (user_id, month_key) unique — guarantees one send per user per month
    - (month_key) — for bulk queries during cron run
*/

CREATE TABLE IF NOT EXISTS monthly_rediag_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  month_key text NOT NULL DEFAULT '',
  last_score integer NOT NULL DEFAULT 0,
  sector text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE monthly_rediag_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own rediag logs"
  ON monthly_rediag_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rediag_user_month
  ON monthly_rediag_logs (user_id, month_key);

CREATE INDEX IF NOT EXISTS idx_rediag_month_key
  ON monthly_rediag_logs (month_key);
