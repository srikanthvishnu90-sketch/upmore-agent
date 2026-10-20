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
-- Supabase exposes decrypted secrets through this view; the stub stores them in the clear (test-only).
create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret from vault.secrets;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}');

-- Existing production chat table: this minimal fixture supplies the owner
-- identity/FK used by durable message turns, not a replacement app schema.
create table public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text);

-- Existing production chat messages (no user_id: a message belongs to its thread); the columns every insert in
-- supabase/functions writes.
create table public.agent_messages (
  id bigserial primary key,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  role text not null, content text not null, meta jsonb,
  created_at timestamptz not null default now());

create table public.simplefin_connections (
  user_id uuid primary key references auth.users(id) on delete cascade);

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Existing realtime publication used by the actual production reminders migration.
create publication supabase_realtime;

-- Supabase Storage (WO-028): the bucket and object tables and the folder helper, as the platform ships them, with row
-- level security on and the platform's grants, so a migration's storage policies are tested as they run there.
create schema storage;
create table storage.buckets (
  id text primary key, name text not null unique, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid,
  metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
