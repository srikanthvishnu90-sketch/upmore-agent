-- Brokerage tokens leave the Vault with their row (found 2026-10-11). Deleting a person's account cascaded
-- brokerage_accounts and broker_pending_links away, but the Vault has no cascade and delete-account purged only the
-- SimpleFIN, Plaid and merchant secrets, so a live OAuth token for the person's own brokerage stayed behind. These
-- triggers remove the Vault entry on ANY delete of the row (account deletion, disconnect, a direct delete), so no path
-- can leave a token without its owner. Idempotent.
create or replace function public.broker_account_vault_cleanup() returns trigger
language plpgsql security definer set search_path = public, vault as $$
begin
  if old.vault_key_ref is not null then delete from vault.secrets where name = old.vault_key_ref; end if;
  return old;
end $$;
create or replace function public.broker_pending_vault_cleanup() returns trigger
language plpgsql security definer set search_path = public, vault as $$
begin
  delete from vault.secrets where name = 'broker_pending_' || old.id::text;
  return old;
end $$;
revoke all on function public.broker_account_vault_cleanup() from public, anon, authenticated;
revoke all on function public.broker_pending_vault_cleanup() from public, anon, authenticated;
drop trigger if exists brokerage_accounts_vault_cleanup on public.brokerage_accounts;
create trigger brokerage_accounts_vault_cleanup after delete on public.brokerage_accounts
  for each row execute function public.broker_account_vault_cleanup();
drop trigger if exists broker_pending_links_vault_cleanup on public.broker_pending_links;
create trigger broker_pending_links_vault_cleanup after delete on public.broker_pending_links
  for each row execute function public.broker_pending_vault_cleanup();

-- broker_confirm_link (20261011030000) deleted the pending row before reading its token; with the trigger above the
-- token would be gone by then. Same contract, token read first. One use: the row is locked, read, then deleted.
create or replace function public.broker_confirm_link(p_link uuid)
returns boolean
language plpgsql
security definer
set search_path = vault, public
as $$
declare v_user uuid := auth.uid(); p record; v_token text;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select * into p from public.broker_pending_links where id = p_link for update;
  if p.id is null then return false; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'broker_pending_' || p.id::text;
  delete from public.broker_pending_links where id = p.id;  -- the trigger removes the pending Vault entry
  if p.user_id <> v_user or p.expires_at < now() or v_token is null then return false; end if;
  perform public.broker_link(p.user_id, p.provider, p.account_id, p.account_mask, p.scope, v_token);
  return true;
end;
$$;
revoke all on function public.broker_confirm_link(uuid) from public, anon;
grant execute on function public.broker_confirm_link(uuid) to authenticated;
