-- Upmore migration 20260927_000002: SimpleFIN per-user vault wrapper.
-- The claim flow stores one Access URL per user in the Supabase Vault as
-- simplefin_access_url_{user_id}. This RPC is service_role-only and rejects
-- any name outside that namespace, so a caller can never touch other secrets.

create or replace function public.simplefin_vault_store(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_id uuid;
begin
  if p_name is null or p_name not like 'simplefin\_access\_url\_%' then
    raise exception 'invalid vault name';
  end if;
  delete from vault.secrets where name = p_name;
  select vault.create_secret(p_secret, p_name, 'Upmore SimpleFIN access URL') into v_id;
  return v_id;
end;
$$;

revoke all on function public.simplefin_vault_store(text, text) from public, anon, authenticated;
grant execute on function public.simplefin_vault_store(text, text) to service_role;

create or replace function public.simplefin_vault_delete(p_name text)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  if p_name is null or p_name not like 'simplefin\_access\_url\_%' then
    raise exception 'invalid vault name';
  end if;
  delete from vault.secrets where name = p_name;
end;
$$;

revoke all on function public.simplefin_vault_delete(text) from public, anon, authenticated;
grant execute on function public.simplefin_vault_delete(text) to service_role;
