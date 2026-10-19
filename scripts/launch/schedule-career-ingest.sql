-- The job-ingestion schedule (WO-006): pg_cron calls career-ingest through pg_net every 5 minutes with the
-- CAREER_INGEST_SECRET header. The secret lives in Vault and is read at call time, so it never appears in the job text, a
-- command line or this file. Run by the OWNER only, after the migration and the function deploy:
--   CAREER_INGEST_SECRET=... psql "$SUPABASE_DB_URL" -v url=https://<ref>.supabase.co/functions/v1/career-ingest -f scripts/launch/schedule-career-ingest.sql
-- The same secret must be set on the function (supabase secrets set CAREER_INGEST_SECRET=... INGEST_CONTACT_EMAIL=...).
-- Re-running replaces the job and the secret. Health: select last_run_at, last_stats from career_ingest_state;
-- last_run_at older than 30 minutes means ingestion is down.
\set ON_ERROR_STOP on
\set secret `printf '%s' "$CAREER_INGEST_SECRET"`
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret(:'secret', 'trainee_career_ingest_secret', 'career-ingest scheduler header')
  where not exists (select 1 from vault.secrets where name = 'trainee_career_ingest_secret');
select vault.update_secret((select id from vault.secrets where name = 'trainee_career_ingest_secret'), :'secret');
select cron.unschedule('trainee-career-ingest') where exists (select 1 from cron.job where jobname = 'trainee-career-ingest');
-- Minutes 2, 7, 12, …: off the minute most scheduled jobs use.
select cron.schedule('trainee-career-ingest', '2-59/5 * * * *', format($job$
  select net.http_post(
    url := %L,
    headers := jsonb_build_object('content-type', 'application/json',
      'x-trainee-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'trainee_career_ingest_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000)
$job$, :'url'));
select jobname, schedule from cron.job where jobname = 'trainee-career-ingest';
