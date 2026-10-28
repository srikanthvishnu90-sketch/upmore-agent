-- Stop the legacy Upmore finance schedules on the live project (Q3 removal list, 2026-10-28; audit 2026-10-26 O2, SEC9).
-- The live project still runs three finance-era pg_cron jobs that Trainee never calls:
--   upmore-proactive      hourly, posts to agent-proactive (the finance proactive run)
--   plaid-sync-6h         every 6 hours, posts to plaid-sync, its bearer token written into the job text (SEC9)
--   cancel-watcher-daily  daily, posts to cancel-watcher, which answers 401 every run (O2)
-- This file only UNSCHEDULES them (cron.unschedule): no function, table, row, Vault secret or other job is touched, and
-- a job that is not there is skipped. Any other job whose command posts to one of those three finance functions is
-- unscheduled too, so a renamed copy cannot keep firing. Trainee's own jobs (career-ingest, career-proactive,
-- trainee-deliver) are never matched. Run by scripts/launch/trainee-go-live.sh step 5 (owner only), or by hand:
--   psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -f scripts/launch/unschedule-legacy-finance.sql
-- To put one back, re-run its original schedule (scripts/launch/schedule-proactive.sql for upmore-proactive).
\set ON_ERROR_STOP on
do $$
declare
  j record;
  n int := 0;
begin
  if to_regclass('cron.job') is null then
    raise notice 'legacy finance schedules: pg_cron is not installed, nothing to unschedule';
    return;
  end if;
  for j in
    select jobid, jobname from cron.job
    where jobname in ('upmore-proactive', 'plaid-sync-6h', 'cancel-watcher-daily', 'plaid-sync', 'cancel-watcher')
       or command ~ '/functions/v1/(agent-proactive|plaid-sync|cancel-watcher)([^a-z0-9-]|$)'
    order by jobid
  loop
    perform cron.unschedule(j.jobid);
    raise notice 'legacy finance schedule unscheduled: % (job %)', coalesce(j.jobname, '(unnamed)'), j.jobid;
    n := n + 1;
  end loop;
  raise notice 'legacy finance schedules unscheduled: %', n;
  -- What is left, by name and schedule only (a job's command can hold a token: never printed here).
  for j in select jobname, schedule from cron.job order by jobname loop
    raise notice 'schedule kept: % (%)', coalesce(j.jobname, '(unnamed)'), j.schedule;
  end loop;
end
$$;
