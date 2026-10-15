-- LOCAL TEST FIXTURE ONLY. Run in a fresh career_test_* database.
-- These are the minimal agent tables required by the real PostgreSQL suite,
-- not a replacement for the application's complete migration history.
create schema auth;
create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key references auth.users(id));
create table public.agent_threads(id uuid primary key,user_id uuid not null references auth.users(id));
create table public.agent_flow_state(
 thread_id uuid primary key references agent_threads(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 state jsonb not null check(jsonb_typeof(state)='object'),
 updated_at timestamptz not null default now(),
 check(pg_column_size(state)<524288),
 check(not(state::text ~* '"(otp|one_time_code|password|passcode|card_number|pan|cvv|ssn)"\s*:'))
);
create table public.agent_messages(
 id uuid primary key default gen_random_uuid(),thread_id uuid not null references agent_threads(id),
 role text check(role in ('user','assistant','system')),content text,meta jsonb,created_at timestamptz default now()
);
-- The local server already has non-login roles service_role, anon and
-- authenticated. The test invokes the service RPCs under SET ROLE.
grant usage on schema public,auth to service_role,anon,authenticated;
grant select,insert,update on public.profiles,public.agent_threads,public.agent_flow_state,public.agent_messages to service_role;
