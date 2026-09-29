-- Upmore OAuth connections (2026-09-28): Gmail connector for auto-OTP.
-- Tokens live encrypted in Supabase Vault (oauth_* namespace); this table
-- holds only metadata. The client never sees tokens.

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

drop policy if exists "oauth_connections_owner" on public.user_oauth_connections;
create policy "oauth_connections_owner"
  on public.user_oauth_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists user_oauth_connections_user_idx
  on public.user_oauth_connections (user_id);

-- Vault wrappers for OAuth tokens (service_role only). Secrets are
-- namespaced oauth_* so a caller can never touch other vault entries.
create or replace function public.oauth_vault_store(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_id uuid;
begin
  if p_name is null or p_name not like 'oauth\_%' then
    raise exception 'invalid vault name';
  end if;
  delete from vault.secrets where name = p_name;
  select vault.create_secret(p_secret, p_name, 'Upmore OAuth token') into v_id;
  return v_id;
end;
$$;

create or replace function public.oauth_vault_read(p_name text)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_secret text;
begin
  if p_name is null or p_name not like 'oauth\_%' then
    raise exception 'invalid vault name';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = p_name;
  return v_secret;
end;
$$;

create or replace function public.oauth_vault_delete(p_name text)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  if p_name is null or p_name not like 'oauth\_%' then
    raise exception 'invalid vault name';
  end if;
  delete from vault.secrets where name = p_name;
end;
$$;

revoke all on function public.oauth_vault_store(text, text) from public, anon, authenticated;
revoke all on function public.oauth_vault_read(text) from public, anon, authenticated;
revoke all on function public.oauth_vault_delete(text) from public, anon, authenticated;
grant execute on function public.oauth_vault_store(text, text) to service_role;
grant execute on function public.oauth_vault_read(text) to service_role;
grant execute on function public.oauth_vault_delete(text) to service_role;
