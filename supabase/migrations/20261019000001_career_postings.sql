-- WO-006: real jobs. One table of postings from public ATS boards, written only by the scheduled career-ingest function
-- (service role), read by every signed-in person's agent. first_seen_at is when Trainee first saw the posting (the basis
-- of "posted 4 minutes ago"); closed_at is set only when a successful, complete read of its board no longer lists it.
-- career_ingest_state holds the directory cursor and the last run's stats, so a silent stop is visible:
-- last_run_at older than 30 minutes means ingestion is down.
create table if not exists public.career_postings (
  job_id text primary key check (job_id ~ '^(greenhouse|lever|ashby|smartrecruiters):[^:]+:.+$'),
  provider text not null check (provider in ('greenhouse', 'lever', 'ashby', 'smartrecruiters')),
  board text not null check (length(board) between 1 and 200),
  ats_id text,
  company text not null check (length(company) between 1 and 300),
  title text not null check (length(title) between 1 and 500),
  location text not null default '' check (length(location) <= 1000),
  url text not null check (url ~ '^https://' and length(url) <= 2000),
  description text not null default '' check (length(description) <= 20000),
  department text not null default '' check (length(department) <= 300),
  posted_at timestamptz,
  remote text check (remote is null or remote in ('remote', 'hybrid', 'onsite')),
  role_family text,
  seniority_band text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  closed_at timestamptz,
  constraint career_postings_seen_order check (last_seen_at >= first_seen_at),
  search tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, title), 'A') ||
    setweight(to_tsvector('english'::regconfig, company || ' ' || location), 'B') ||
    setweight(to_tsvector('english'::regconfig, description), 'D')) stored
);
-- The open feed newest first (search, alerts), a board's open postings (closing), and full-text search.
create index if not exists career_postings_open_newest on public.career_postings (first_seen_at desc) where closed_at is null;
create index if not exists career_postings_open_board on public.career_postings (provider, board, job_id) where closed_at is null;
create index if not exists career_postings_search on public.career_postings using gin (search);

alter table public.career_postings enable row level security;
revoke all on public.career_postings from anon, authenticated;
grant select on public.career_postings to authenticated;
drop policy if exists career_postings_read on public.career_postings;
create policy career_postings_read on public.career_postings for select to authenticated using (true);

create table if not exists public.career_ingest_state (
  id int primary key default 1 check (id = 1),
  cursor int not null default 0 check (cursor >= 0),
  last_run_at timestamptz,
  last_stats jsonb
);
alter table public.career_ingest_state enable row level security;
revoke all on public.career_ingest_state from anon, authenticated;
