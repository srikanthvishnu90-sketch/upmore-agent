-- Gmail tokens leave the Vault with their row (found 2026-10-12). user_oauth_connections cascades from auth.users, but
-- the Vault has no cascade and delete-account never purged oauth_* secrets, so a deleted account left its Gmail refresh
-- token behind, against the privacy policy ("Deleting your account ... deletes ... stored credentials"). The row was
-- also writable by its owner (one "for all" policy), so a direct delete orphaned the token the same way.
--   1. Any delete of a row (account deletion, disconnect, a direct delete) removes its Vault entry. The name is derived
--      from the row's owner and provider, never read from vault_name, so no row can point the cleanup at another
--      person's secret.
--   2. The rows are server-owned like exec_credential_refs (20261010020000): the owner reads them; only the gmail-oauth
--      function (service role) writes them, and a row's vault_name must be its owner's own oauth_<provider>_<user> name.
-- Idempotent. Safe on a project that never applied 20260928_000011 (the table is created as it defines it, with RLS on),
-- since go-live applies pending files in one transaction.
create table if not exists public.user_oauth_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  vault_name text not null,
  email text,
  scopes text,
  connected_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.user_oauth_connections enable row level security;
create or replace function public.oauth_connection_vault_cleanup() returns trigger
language plpgsql security definer set search_path = public, vault as $$
begin
  delete from vault.secrets where name = 'oauth_' || old.provider || '_' || old.user_id::text;
  return old;
end $$;
revoke all on function public.oauth_connection_vault_cleanup() from public, anon, authenticated;
drop trigger if exists user_oauth_connections_vault_cleanup on public.user_oauth_connections;
create trigger user_oauth_connections_vault_cleanup after delete on public.user_oauth_connections
  for each row execute function public.oauth_connection_vault_cleanup();

drop policy if exists "oauth_connections_owner" on public.user_oauth_connections;
drop policy if exists oauth_connections_owner_read on public.user_oauth_connections;
create policy oauth_connections_owner_read on public.user_oauth_connections
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.user_oauth_connections from anon, authenticated;

-- A legacy row naming any other secret is dropped without following it (its own token, if any, is removed by name).
delete from public.user_oauth_connections where vault_name <> 'oauth_' || provider || '_' || user_id::text;
create or replace function public.oauth_connection_namespace_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.vault_name <> 'oauth_' || new.provider || '_' || new.user_id::text then
    raise exception 'oauth vault name must match owner and provider';
  end if;
  return new;
end;
$$;
drop trigger if exists user_oauth_connections_namespace_guard on public.user_oauth_connections;
create trigger user_oauth_connections_namespace_guard before insert or update
  on public.user_oauth_connections for each row execute function public.oauth_connection_namespace_guard();
