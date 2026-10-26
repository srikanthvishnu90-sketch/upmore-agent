-- Feature 6 (hourly job index at scale): one row per career-ingest lane run, written by the function with the service
-- role (supabase/functions/career-ingest/handler.ts, supabasePostingsDb.recordLaneRun). With N lanes every 5 minutes,
-- career_ingest_state's single last_stats row shows only the last lane; this log shows every lane, and the coverage
-- each run counted after its writes: boards read of those due, failures (up to 50, each with its reason), postings new /
-- seen / reopened / closed, links refused by the URL-shape guard, and boards read within the window, of the lane and of
-- the directory. Lane 0 prunes rows older than 14 days. Nothing about a person: no export, no erase. Nobody but the
-- service role reads or writes it. career_ingest_coverage(window) answers "is every lane running and how fresh is the
-- index" for the owner and the smoke check. Idempotent.
create table if not exists public.career_ingest_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null,
  lane smallint not null check (lane between 0 and 63),
  lanes smallint not null check (lanes between 1 and 64),
  window_min int not null check (window_min between 15 and 2880),
  ms int not null check (ms >= 0),
  boards_due int not null check (boards_due >= 0),
  boards_read int not null check (boards_read >= 0),
  boards_ok int not null check (boards_ok >= 0),
  boards_failed int not null check (boards_failed >= 0),
  boards_not_modified int not null default 0 check (boards_not_modified >= 0),
  postings_new int not null default 0 check (postings_new >= 0),
  postings_seen int not null default 0 check (postings_seen >= 0),
  postings_reopened int not null default 0 check (postings_reopened >= 0),
  postings_closed int not null default 0 check (postings_closed >= 0),
  url_rejected int not null default 0 check (url_rejected >= 0),
  lane_fresh int,
  lane_total int check (lane_total is null or lane_total >= 0),
  directory_fresh int,
  directory_total int check (directory_total is null or directory_total >= 0),
  failures jsonb not null default '[]'::jsonb check (jsonb_typeof(failures) = 'array' and jsonb_array_length(failures) <= 50),
  report text not null check (length(report) between 1 and 2000),
  constraint career_ingest_runs_lane_in_plan check (lane < lanes),
  constraint career_ingest_runs_read_check check (boards_read <= boards_due and boards_ok + boards_failed = boards_read and boards_not_modified <= boards_ok),
  constraint career_ingest_runs_fresh_check check ((lane_fresh is null or lane_fresh between 0 and coalesce(lane_total, -1))
    and (directory_fresh is null or directory_fresh between 0 and coalesce(directory_total, -1)))
);
create index if not exists career_ingest_runs_at on public.career_ingest_runs (at desc);
create index if not exists career_ingest_runs_lane_at on public.career_ingest_runs (lane, at desc);
alter table public.career_ingest_runs enable row level security;
revoke all on public.career_ingest_runs from anon, authenticated;

-- A board's last full read, as the SHA-256 of its body: a body equal to it again is not parsed or normalized (the way a
-- 304 is not), which is most of a read's CPU on providers that send no ETag (scripts/career/measure-ingest-lane.ts).
alter table public.career_board_state add column if not exists body_sha text;
alter table public.career_board_state drop constraint if exists career_board_state_body_sha_check;
alter table public.career_board_state add constraint career_board_state_body_sha_check check (body_sha is null or body_sha ~ '^[0-9a-f]{64}$');

-- Per lane over the last p_window: runs, the last run's time and report, boards read of those due, failures, and the
-- freshest coverage the lane counted. A lane of the current plan with no run in the window is missing (lanes come from the
-- newest run's `lanes`).
create or replace function public.career_ingest_coverage(p_window interval default interval '1 hour')
returns table (lane smallint, lanes smallint, runs bigint, last_at timestamptz, boards_due bigint, boards_read bigint,
  boards_failed bigint, postings_new bigint, url_rejected bigint, lane_fresh int, lane_total int,
  directory_fresh int, directory_total int, last_report text)
language sql stable security definer set search_path = public as $$
  with plan as (select r.lanes from career_ingest_runs r order by r.at desc limit 1),
  want as (select g::smallint as lane, plan.lanes from plan, generate_series(0, plan.lanes - 1) g),
  w as (select * from career_ingest_runs r where r.at >= now() - p_window),
  last as (select distinct on (w.lane) w.lane, w.at, w.report, w.lane_fresh, w.lane_total, w.directory_fresh, w.directory_total
           from w order by w.lane, w.at desc)
  select want.lane, want.lanes, count(w.id), max(w.at), coalesce(sum(w.boards_due), 0), coalesce(sum(w.boards_read), 0),
    coalesce(sum(w.boards_failed), 0), coalesce(sum(w.postings_new), 0), coalesce(sum(w.url_rejected), 0),
    max(last.lane_fresh), max(last.lane_total), max(last.directory_fresh), max(last.directory_total), max(last.report)
  from want left join w on w.lane = want.lane left join last on last.lane = want.lane
  group by want.lane, want.lanes order by want.lane
$$;
revoke all on function public.career_ingest_coverage(interval) from public, anon, authenticated;
grant execute on function public.career_ingest_coverage(interval) to service_role;
