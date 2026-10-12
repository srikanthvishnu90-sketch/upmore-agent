-- The hourly proactive run (capability list section 2): pg_cron calls agent-proactive through pg_net with the
-- PROACTIVE_SECRET header. The secret lives in Vault and is read at call time, so it never appears in the job text, a
-- command line or this file. Run by scripts/launch/go-live.sh (owner only) with psql -v url=<function URL>; the secret
-- comes from the PROACTIVE_SECRET environment variable through \set below. Re-running replaces the job and the secret.
\set ON_ERROR_STOP on
\set secret `printf '%s' "$PROACTIVE_SECRET"`
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret(:'secret', 'upmore_proactive_secret', 'agent-proactive scheduler header')
  where not exists (select 1 from vault.secrets where name = 'upmore_proactive_secret');
select vault.update_secret((select id from vault.secrets where name = 'upmore_proactive_secret'), :'secret');
select cron.unschedule('upmore-proactive') where exists (select 1 from cron.job where jobname = 'upmore-proactive');
-- Minute 7 of every hour: off the top of the hour, when most scheduled jobs run.
select cron.schedule('upmore-proactive', '7 * * * *', format($job$
  select net.http_post(
    url := %L,
    headers := jsonb_build_object('content-type', 'application/json',
      'x-upmore-proactive-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'upmore_proactive_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 110000)
$job$, :'url'));
select jobname, schedule from cron.job where jobname = 'upmore-proactive';
