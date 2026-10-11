-- Credential references are server-owned. An owner-visible reference does
-- not authorize choosing any vault secret. Invalid legacy references must
-- be reconnected; never follow them to delete a secret during migration.
drop policy if exists exec_cred_refs_owner on public.exec_credential_refs;
drop policy if exists exec_cred_refs_owner_read on public.exec_credential_refs;
create policy exec_cred_refs_owner_read on public.exec_credential_refs
  for select using (auth.uid() = user_id);
revoke insert, update, delete on public.exec_credential_refs from anon, authenticated;

delete from public.exec_credential_refs
where vault_name <> 'exec_cred_' || user_id::text || '_' || merchant_key;

create or replace function public.exec_credential_namespace_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.vault_name <> 'exec_cred_' || new.user_id::text || '_' || new.merchant_key then
    raise exception 'credential namespace must match owner and merchant';
  end if;
  return new;
end;
$$;
drop trigger if exists exec_credential_namespace_guard on public.exec_credential_refs;
create trigger exec_credential_namespace_guard before insert or update
  on public.exec_credential_refs for each row execute function public.exec_credential_namespace_guard();

-- Preserve the existing explicit on-screen approval insert. Clients may
-- withdraw an open approval but cannot rewrite its payload or run status.
drop policy if exists exec_approvals_owner on public.exec_approvals;
drop policy if exists exec_approvals_owner_read on public.exec_approvals;
drop policy if exists exec_approvals_owner_insert on public.exec_approvals;
drop policy if exists exec_approvals_owner_cancel on public.exec_approvals;
create policy exec_approvals_owner_read on public.exec_approvals
  for select using (auth.uid() = user_id);
create policy exec_approvals_owner_insert on public.exec_approvals
  for insert with check (auth.uid() = user_id and status in ('pending', 'approved'));
create policy exec_approvals_owner_cancel on public.exec_approvals
  for update using (auth.uid() = user_id and status in ('pending', 'approved'))
  with check (auth.uid() = user_id and status = 'cancelled');

create or replace function public.exec_approval_integrity_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - 'status' - 'decided_at') is distinct from
     (to_jsonb(old) - 'status' - 'decided_at') then
    raise exception 'approval payload is immutable; create a new proposal';
  end if;
  if old.status in ('done', 'failed', 'cancelled') and new.status <> old.status then
    raise exception 'a terminal approval cannot be reopened';
  end if;
  return new;
end;
$$;
drop trigger if exists exec_approval_integrity_guard on public.exec_approvals;
create trigger exec_approval_integrity_guard before update on public.exec_approvals
  for each row execute function public.exec_approval_integrity_guard();
