-- The job-alerts schedule (WO-007b): pg_cron calls career-proactive through pg_net every 5 minutes with the
-- CAREER_PROACTIVE_SECRET header. The secret lives in Vault and is read at call time, so it never appears in the job text, a
-- command line or this file. Run by the OWNER only, after the migration and the function deploy:
--   CAREER_PROACTIVE_SECRET=... psql "$SUPABASE_DB_URL" -v url=https://<ref>.supabase.co/functions/v1/career-proactive -f scripts/launch/schedule-career-proactive.sql
-- The same secret must be set on the function (supabase secrets set CAREER_PROACTIVE_SECRET=...).
-- Re-running replaces the job and the secret. Health: select * from career_proactive_runs order by run_at desc limit 5;
-- no row in the last 30 minutes means alerts are down.
\set ON_ERROR_STOP on
\set secret `printf '%s' "$CAREER_PROACTIVE_SECRET"`
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret(:'secret', 'trainee_career_proactive_secret', 'career-proactive scheduler header')
  where not exists (select 1 from vault.secrets where name = 'trainee_career_proactive_secret');
select vault.update_secret((select id from vault.secrets where name = 'trainee_career_proactive_secret'), :'secret');
select cron.unschedule('trainee-career-proactive') where exists (select 1 from cron.job where jobname = 'trainee-career-proactive');
-- Minutes 4, 9, 14, …: two minutes after each ingest run, so new postings are planned the run after they land.
select cron.schedule('trainee-career-proactive', '4-59/5 * * * *', format($job$
  select net.http_post(
    url := %L,
    headers := jsonb_build_object('content-type', 'application/json',
      'x-trainee-proactive-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'trainee_career_proactive_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000)
$job$, :'url'));
select jobname, schedule from cron.job where jobname = 'trainee-career-proactive';
