/*
  # Enable pg_cron and Schedule Monthly Re-diagnostic Job

  1. Extensions
    - Enable `pg_net` (async HTTP calls from SQL)
    - Enable `pg_cron` (job scheduler)

  2. Cron Job
    - Name: "monthly-rediag-alerts"
    - Schedule: 0 8 1 * * (08:00 UTC on the 1st of every month)
    - Action: HTTP POST to the monthly-alerts edge function using pg_net

  3. Notes
    - The cron job uses pg_net to call the edge function asynchronously
    - SUPABASE_URL and service role key are read from app.settings (set by Supabase platform)
    - If the job already exists it is replaced to keep the schedule up to date
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant cron usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Remove existing job if present, then re-create cleanly
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-rediag-alerts') THEN
    PERFORM cron.unschedule('monthly-rediag-alerts');
  END IF;
END $$;

-- Schedule: 08:00 UTC on the 1st of every month
SELECT cron.schedule(
  'monthly-rediag-alerts',
  '0 8 1 * *',
  $$
  SELECT extensions.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/monthly-alerts',
    body := '{}',
    params := ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
      extensions.http_header('Content-Type', 'application/json')
    ]
  );
  $$
);
