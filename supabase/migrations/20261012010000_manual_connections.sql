-- Guided manual connect: the live sign-in window and the session store (owner addendum 2026-10-11; decision 1: no
-- password storage, session-only). Policy: packages/domain/78-manual-connect.js; HTTP: supabase/functions/manual-connect.
--   manual_connections: one row per person and platform. The state, the consent the person read (word for word, with its
--     version and time, recorded before any window opens), the NAME of the Vault secret that holds the encrypted session
--     (never the session itself), the open sign-in window's id while the person is logging in, and session health
--     (last checked, failures in a row, whether the person was already told they were signed out).
--     The person reads their own rows; every write goes through the manual-connect edge function (service role).
--   manual_vault_store / manual_vault_read / manual_vault_delete: the session in Supabase Vault, service_role only, and
--     only under manual_<user uuid>_<platform id>, so these can never touch another Vault entry.
--   Any delete of a row (disconnect, account deletion, a direct delete) takes its Vault session with it.
--   agent_proactive_log accepts kind 'connection': the "signed you out" note is delivered once, through the same
--     once-only log as every other message the agent sends first.
-- Never a password, a one-time code, a cookie or a token in this table: the session lives in Vault alone. Idempotent.

create table if not exists public.manual_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_id text not null check (platform_id ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  state text not null default 'pending_login' check (state in ('pending_login','connected','needs_login','broken','revoked')),
  consent_version text not null check (length(consent_version) between 1 and 32),
  consent_text text not null check (length(consent_text) between 50 and 4000),
  consent_at timestamptz not null,
  vault_name text,
  window_id text check (window_id is null or window_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  last_checked timestamptz,
  failures integer not null default 0 check (failures between 0 and 1000),
  told_signed_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform_id),
  -- The Vault name is the person's own and this platform's, never anything else.
  constraint manual_connections_vault_name_own check (vault_name is null or vault_name = 'manual_' || user_id::text || '_' || platform_id),
  -- A revoked connection keeps no session and no open window.
  constraint manual_connections_revoked_empty check (state <> 'revoked' or (vault_name is null and window_id is null))
);
alter table public.manual_connections enable row level security;
drop policy if exists "own manual connections" on public.manual_connections;
create policy "own manual connections" on public.manual_connections for select to authenticated using (user_id = auth.uid());
revoke all on public.manual_connections from public, anon, authenticated;
grant select on public.manual_connections to authenticated;
grant all on public.manual_connections to service_role;
create index if not exists manual_connections_health on public.manual_connections (state, last_checked);

-- The session in Vault. service_role only; the name is checked against the one shape it may take.
create or replace function public.manual_vault_store(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_id uuid;
begin
  if p_name is null or p_name !~ '^manual_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[a-z0-9][a-z0-9-]{0,62}$' then
    raise exception 'invalid vault name';
  end if;
  if p_secret is null or length(p_secret) < 2 or length(p_secret) > 400000 then
    raise exception 'invalid session';
  end if;
  delete from vault.secrets where name = p_name;
  select vault.create_secret(p_secret, p_name, 'Upmore manual connect session (read-only)') into v_id;
  return v_id;
end;
$$;

create or replace function public.manual_vault_read(p_name text)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  if p_name is null or p_name !~ '^manual_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[a-z0-9][a-z0-9-]{0,62}$' then
    raise exception 'invalid vault name';
  end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1);
end;
$$;

create or replace function public.manual_vault_delete(p_name text)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  if p_name is null or p_name !~ '^manual_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[a-z0-9][a-z0-9-]{0,62}$' then
    raise exception 'invalid vault name';
  end if;
  delete from vault.secrets where name = p_name;
end;
$$;

revoke all on function public.manual_vault_store(text, text) from public, anon, authenticated;
revoke all on function public.manual_vault_read(text) from public, anon, authenticated;
revoke all on function public.manual_vault_delete(text) from public, anon, authenticated;
grant execute on function public.manual_vault_store(text, text) to service_role;
grant execute on function public.manual_vault_read(text) to service_role;
grant execute on function public.manual_vault_delete(text) to service_role;

-- No path leaves a session in Vault without its row (the lesson of 20261011050000_broker_vault_cascade.sql).
create or replace function public.manual_connection_vault_cleanup() returns trigger
language plpgsql security definer set search_path = public, vault as $$
begin
  delete from vault.secrets where name = 'manual_' || old.user_id::text || '_' || old.platform_id;
  return old;
end $$;
revoke all on function public.manual_connection_vault_cleanup() from public, anon, authenticated;
drop trigger if exists manual_connections_vault_cleanup on public.manual_connections;
create trigger manual_connections_vault_cleanup after delete on public.manual_connections
  for each row execute function public.manual_connection_vault_cleanup();

-- The once-only "signed you out" note rides the proactive log.
do $$
begin
  if to_regclass('public.agent_proactive_log') is not null then
    alter table public.agent_proactive_log drop constraint if exists agent_proactive_log_kind_check;
    alter table public.agent_proactive_log add constraint agent_proactive_log_kind_check
      check (kind in ('safety','watch','finding','morning_brief','weekly_recap','monthly_close','standing_report','connection'));
  end if;
end $$;
