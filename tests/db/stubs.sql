-- The slice of a Supabase project the agent migrations depend on, so they can
-- be run and tested against a plain local Postgres. Test-only.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
-- Supabase resolves the caller from the request's JWT claims.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema vault;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique, secret text, description text);
create function vault.create_secret(p_secret text, p_name text, p_description text)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into vault.secrets (name, secret, description)
  values (p_name, p_secret, p_description) returning id into v;
  return v;
end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}');

-- Existing production chat table: this minimal fixture supplies the owner
-- identity/FK used by durable message turns, not a replacement app schema.
create table public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text);

create table public.simplefin_connections (
  user_id uuid primary key references auth.users(id) on delete cascade);

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Existing realtime publication used by the actual production reminders migration.
create publication supabase_realtime;
