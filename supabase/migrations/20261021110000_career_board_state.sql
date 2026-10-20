-- WO-037: the 6-hour refresh at scale, alert latency, and the weekly alert cap.
-- career_board_state: one row per watched board (written by the career-ingest run with the service role): its fixed
-- bucket (0..63, the sharded scheduler's lanes), when it was last attempted and last read, how that went, and the
-- validators (ETag, Last-Modified) its last full read answered with, sent back as a conditional request. Nothing about a
-- person: no export, no erase. Nobody but the service role reads or writes it.
-- career_outbox.posting_first_seen_at: when Trainee first saw the posting an alert is about, kept with the alert, so
-- first seen -> delivered (delivered_at) is measured per alert. career_alert_latency reports it; career_alerts_sent_since
-- counts each person's alerts for the weekly cap. Both are the service role's alone. Idempotent.
create table if not exists public.career_board_state (
  provider text not null check (provider in ('greenhouse', 'lever', 'ashby', 'smartrecruiters')),
  board text not null check (length(board) between 1 and 200),
  bucket smallint not null check (bucket between 0 and 63),
  last_attempt_at timestamptz,
  last_ok_at timestamptz,
  last_status text check (last_status is null or length(last_status) <= 200),
  etag text check (etag is null or length(etag) <= 300),
  last_modified text check (last_modified is null or length(last_modified) <= 100),
  fail_count int not null default 0 check (fail_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, board)
);
-- The run's question: in these buckets, which boards have waited longest (never-read first)?
create index if not exists career_board_state_due on public.career_board_state (bucket, last_attempt_at asc nulls first);
alter table public.career_board_state enable row level security;
revoke all on public.career_board_state from anon, authenticated;

alter table public.career_outbox add column if not exists posting_first_seen_at timestamptz;

-- First seen -> queued and first seen -> delivered, in seconds, over alerts queued since p_since. Quiet hours move an
-- alert's delivery on purpose, so alerts queued to wait (deliver_at more than a minute after they were queued) are
-- counted apart and left out of the percentiles.
create or replace function public.career_alert_latency(p_since timestamptz)
returns table (alerts bigint, delivered bigint, held_for_quiet_hours bigint,
  queued_p50_s double precision, queued_p95_s double precision,
  delivered_p50_s double precision, delivered_p95_s double precision, delivered_max_s double precision)
language sql stable security definer set search_path = public as $$
  with a as (
    select created_at, deliver_at, delivered_at, posting_first_seen_at as seen
    from career_outbox
    where kind = 'alert' and created_at >= p_since and posting_first_seen_at is not null),
  prompt as (select * from a where deliver_at <= created_at + interval '1 minute')
  select (select count(*) from a), (select count(*) from prompt where delivered_at is not null),
    (select count(*) from a where deliver_at > created_at + interval '1 minute'),
    (select percentile_cont(0.5) within group (order by extract(epoch from created_at - seen)) from prompt),
    (select percentile_cont(0.95) within group (order by extract(epoch from created_at - seen)) from prompt),
    (select percentile_cont(0.5) within group (order by extract(epoch from delivered_at - seen)) from prompt where delivered_at is not null),
    (select percentile_cont(0.95) within group (order by extract(epoch from delivered_at - seen)) from prompt where delivered_at is not null),
    (select max(extract(epoch from delivered_at - seen)) from prompt where delivered_at is not null);
$$;

-- Alerts per person whose delivery time is at or after p_since (the weekly cap counts the last 7 days).
create or replace function public.career_alerts_sent_since(p_since timestamptz)
returns table (user_id uuid, n bigint)
language sql stable security definer set search_path = public as $$
  select o.user_id, count(*) from career_outbox o where o.kind = 'alert' and o.deliver_at >= p_since group by o.user_id;
$$;

revoke all on function public.career_alert_latency(timestamptz) from public, anon, authenticated;
revoke all on function public.career_alerts_sent_since(timestamptz) from public, anon, authenticated;
grant execute on function public.career_alert_latency(timestamptz) to service_role;
grant execute on function public.career_alerts_sent_since(timestamptz) to service_role;
