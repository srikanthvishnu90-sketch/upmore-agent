-- The delivery schedule (WO-013b-1): pg_cron calls trainee-deliver through pg_net every minute with the
-- TRAINEE_DELIVER_SECRET header. The secret lives in Vault and is read at call time, so it never appears in the job text, a
-- command line or this file. Run by the OWNER only, after the migration, the function deploy and the LoopMessage key:
--   TRAINEE_DELIVER_SECRET=... psql "$SUPABASE_DB_URL" -v url=https://<ref>.supabase.co/functions/v1/trainee-deliver -f scripts/launch/schedule-trainee-deliver.sql
-- The same secret must be set on the function (supabase secrets set TRAINEE_DELIVER_SECRET=... LOOPMESSAGE_API_KEY=...).
-- Re-running replaces the job and the secret. Health: select * from channel_delivery_runs order by run_at desc limit 5;
-- no row in the last 5 minutes means texts are not going out.
\set ON_ERROR_STOP on
\set secret `printf '%s' "$TRAINEE_DELIVER_SECRET"`
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret(:'secret', 'trainee_deliver_secret', 'trainee-deliver scheduler header')
  where not exists (select 1 from vault.secrets where name = 'trainee_deliver_secret');
select vault.update_secret((select id from vault.secrets where name = 'trainee_deliver_secret'), :'secret');
select cron.unschedule('trainee-deliver') where exists (select 1 from cron.job where jobname = 'trainee-deliver');
select cron.schedule('trainee-deliver', '* * * * *', format($job$
  select net.http_post(
    url := %L,
    headers := jsonb_build_object('content-type', 'application/json',
      'x-trainee-deliver-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'trainee_deliver_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000)
$job$, :'url'));
select jobname, schedule from cron.job where jobname = 'trainee-deliver';
