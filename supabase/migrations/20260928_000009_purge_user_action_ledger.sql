-- delete-account support: purge a single user's action_ledger rows.
--
-- The action_ledger_no_update trigger makes the ledger append-only, which
-- blocks the ON DELETE CASCADE from auth.users — so any user with ledger
-- entries could never delete their account, contradicting the app's
-- "export or delete everything anytime" promise (caught by QA 2026-09-28).
--
-- Account deletion is the ONE legitimate exception to append-only: the user
-- explicitly asked for everything to be deleted. This SECURITY DEFINER
-- function (service_role only) briefly lifts the trigger, deletes only that
-- user's rows, and restores the trigger. DDL is transactional here, so any
-- error rolls back both the disable and the delete.
create or replace function public.purge_user_action_ledger(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  alter table public.action_ledger disable trigger action_ledger_no_update;
  begin
    delete from public.action_ledger where user_id = p_uid;
  exception when others then
    alter table public.action_ledger enable trigger action_ledger_no_update;
    raise;
  end;
  alter table public.action_ledger enable trigger action_ledger_no_update;
end;
$$;

revoke all on function public.purge_user_action_ledger(uuid) from public, anon, authenticated;
