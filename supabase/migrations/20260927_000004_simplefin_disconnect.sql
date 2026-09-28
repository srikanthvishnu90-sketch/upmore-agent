-- Upmore migration 20260927_000004: self-service SimpleFIN disconnect.
-- Problem (QA track B, 2026-09-27): disconnectBank() in the client could only
-- delete the simplefin_connections row; the vaulted Access URL was orphaned
-- forever because simplefin_vault_delete was service_role-only, and nothing
-- called it. Disconnecting must also destroy the bank credential.
-- Fix: the RPC now takes an OPTIONAL name. When omitted, it deletes ONLY the
-- caller's own secret (simplefin_access_url_{auth.uid()}), which makes it safe
-- to grant to authenticated users. An explicit name remains service_role-only
-- (used by the simplefin-claim rollback path), so one user can never delete
-- another user's secret.

create or replace function public.simplefin_vault_delete(p_name text default null)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_name text;
begin
  if p_name is null then
    -- Client path: derive the name from the caller's own JWT. No caller input.
    if auth.uid() is null then
      raise exception 'sign in required';
    end if;
    v_name := 'simplefin_access_url_' || auth.uid()::text;
  else
    -- Explicit names are service_role-only (claim-function rollback).
    if auth.role() <> 'service_role' then
      raise exception 'not allowed';
    end if;
    v_name := p_name;
  end if;
  if v_name is null or v_name not like 'simplefin\_access\_url\_%' then
    raise exception 'invalid vault name';
  end if;
  delete from vault.secrets where name = v_name;
end;
$$;

revoke all on function public.simplefin_vault_delete(text) from public, anon, authenticated;
grant execute on function public.simplefin_vault_delete(text) to authenticated, service_role;
