-- Staging bootstrap — NOT a repo migration. Applied by staging/scripts/migrate.sh
-- BEFORE supabase/migrations/*, staging projects only.
--
-- Why this exists (gap G3 in staging/README.md): eight tables the edge functions
-- read/write are never created by any file in supabase/migrations/ — they predate
-- the migration history in production. The first repo migration
-- (20260923_000001_agent_rate_limits.sql) already REFERENCES public.profiles(id),
-- so a fresh project fails at migration 1 without this bootstrap.
--   Referenced by functions, created by no migration (verified 2026-10-13 by
--   diffing every .from("...") in supabase/functions/ against every CREATE TABLE
--   in supabase/migrations/): agent_messages, agent_threads, listings,
--   plaid_requests, playbook_progress, profiles, route_reminders, routes.
--   plaid_requests / playbook_progress are used only by functions outside the
--   career staging set (plaid, chatbox playbooks) and are intentionally omitted.
--
-- The definitions below are the MINIMUM inferred from code reads in this repo
-- (handler.ts, agent-chat/_shared/chat_session.ts, tests/db/stubs.sql). They are
-- NOT production's exact schema: production's extra columns, indexes and RLS
-- policies are not recorded anywhere in this repo. Empty tables are correct for
-- staging v1 — the handler treats empty routes/listings as "none found".
-- Idempotent: safe to re-run.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  prefs jsonb not null default '{}'::jsonb,
  state text,
  age integer,
  free_time_hours numeric,
  paycheck_status text,
  cash_available text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

-- handler orders history by id desc, so id must be monotonically increasing.
create table if not exists public.agent_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  role text not null,
  content text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.routes (
  route_id text primary key,
  name text,
  status text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  budget_max numeric,
  status text,
  created_at timestamptz not null default now()
);

create table if not exists public.route_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id text,
  kind text,
  message text,
  due_at timestamptz,
  channel text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS: the chat handler talks to these tables with the anon key + the user's own
-- JWT (handler.ts creates its client that way), so owner policies must exist.
-- service_role bypasses RLS, as in production. Production's exact policies are
-- not in this repo (gap G3); these are the minimum owner-only equivalents.
alter table public.profiles enable row level security;
alter table public.agent_threads enable row level security;
alter table public.agent_messages enable row level security;
alter table public.route_reminders enable row level security;
alter table public.routes enable row level security;
alter table public.listings enable row level security;

drop policy if exists staging_profiles_owner on public.profiles;
create policy staging_profiles_owner on public.profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists staging_agent_threads_owner on public.agent_threads;
create policy staging_agent_threads_owner on public.agent_threads
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists staging_agent_messages_owner on public.agent_messages;
create policy staging_agent_messages_owner on public.agent_messages
  for all to authenticated
  using (exists (select 1 from public.agent_threads t
                 where t.id = thread_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.agent_threads t
                 where t.id = thread_id and t.user_id = auth.uid()));

drop policy if exists staging_route_reminders_owner on public.route_reminders;
create policy staging_route_reminders_owner on public.route_reminders
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists staging_routes_read on public.routes;
create policy staging_routes_read on public.routes
  for select to authenticated using (true);

drop policy if exists staging_listings_read on public.listings;
create policy staging_listings_read on public.listings
  for select to authenticated using (true);
