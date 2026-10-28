-- scripts/launch/unschedule-legacy-finance.sql (go-live step 5): the three legacy Upmore finance pg_cron jobs, and any
-- renamed copy posting to their functions, are unscheduled; Trainee's own jobs and look-alike names are kept; a second
-- run changes nothing; without pg_cron it is a no-op. pg_cron is not in the test cluster, so a stand-in cron.job and
-- cron.unschedule with the same shape are used, all inside one transaction that is rolled back.
\set ON_ERROR_STOP on
\getenv upmore_root UPMORE_ROOT
\set unsched :upmore_root '/scripts/launch/unschedule-legacy-finance.sql'
begin;
-- 1. no pg_cron: a no-op, no error
do $$ begin assert to_regclass('cron.job') is null, 'precondition: the test cluster has no cron.job'; end $$;
\i :unsched
do $$ begin raise notice 'ok - without pg_cron the file is a no-op'; end $$;

create schema cron;
create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create function cron.unschedule(job_id bigint) returns boolean language sql as
  $$ delete from cron.job where jobid = job_id returning true $$;
insert into cron.job (jobname, schedule, command) values
  ('upmore-proactive', '7 * * * *', $c$select net.http_post(url := 'https://x.supabase.co/functions/v1/agent-proactive')$c$),
  ('plaid-sync-6h', '0 */6 * * *', $c$select net.http_post(url := 'https://x.supabase.co/functions/v1/plaid-sync', headers := '{"Authorization":"Bearer fake-token-test"}')$c$),
  ('cancel-watcher-daily', '0 9 * * *', $c$select net.http_post(url := 'https://x.supabase.co/functions/v1/cancel-watcher')$c$),
  ('renamed-finance-copy', '1 * * * *', $c$select net.http_post(url := 'https://x.supabase.co/functions/v1/plaid-sync?x=1')$c$),
  ('career-ingest', '*/5 * * * *', $c$select net.http_post(url := 'https://x.supabase.co/functions/v1/career-ingest')$c$),
  ('career-proactive', '*/5 * * * *', $c$select net.http_post(url := 'https://x.supabase.co/functions/v1/career-proactive')$c$),
  ('trainee-deliver', '* * * * *', $c$select net.http_post(url := 'https://x.supabase.co/functions/v1/trainee-deliver')$c$),
  ('lookalike', '2 * * * *', $c$select net.http_post(url := 'https://x.supabase.co/functions/v1/agent-proactive-v2')$c$);

-- 2. the finance jobs go, everything else stays
\i :unsched
do $$
declare remaining text;
begin
  select string_agg(jobname, ',' order by jobname) into remaining from cron.job;
  assert remaining = 'career-ingest,career-proactive,lookalike,trainee-deliver',
    format('only the finance jobs are unscheduled, got: %s', remaining);
  raise notice 'ok - upmore-proactive, plaid-sync-6h, cancel-watcher-daily and a renamed copy are unscheduled';
  raise notice 'ok - career-ingest, career-proactive, trainee-deliver and a look-alike name are kept';
end $$;

-- 3. a second run changes nothing
\i :unsched
do $$ begin
  assert (select count(*) from cron.job) = 4, 'a second run unschedules nothing more';
  raise notice 'ok - a second run is a no-op';
end $$;
rollback;
