-- An applied payment is not permission to pay a newly refreshed/revised invoice
-- again. The refresh can precede creditor allocation. No timestamp or evidence
-- boolean clears this guard: a verified remaining-debt protocol is not shipped.
-- Preserve original attempts and receipts; final obligations remain readable.
do $$ begin
 if to_regprocedure('public.agent_payment_preflight_before_applied_guard(uuid)') is null then
  alter function public.agent_payment_preflight(uuid) rename to agent_payment_preflight_before_applied_guard;
 end if;
 if to_regprocedure('public.agent_workflow_store_plan_before_applied_guard(uuid,uuid,integer,jsonb,text)') is null then
  alter function public.agent_workflow_store_plan(uuid,uuid,integer,jsonb,text) rename to agent_workflow_store_plan_before_applied_guard;
 end if;
end $$;

-- Internal bases cannot be called directly by the client or service to bypass
-- the new checks. Their wrappers run as the same database owner.
revoke all on function public.agent_payment_preflight_before_applied_guard(uuid),
 public.agent_workflow_store_plan_before_applied_guard(uuid,uuid,integer,jsonb,text)
 from public,anon,authenticated,service_role;

create or replace function public.agent_payment_preflight(p_task uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx jsonb;
begin
 -- Base locks settings, exact owner obligation and task, and checks approval,
 -- accounts, freshness, provider authority and cash. Keep those locks through
 -- this check and submission reservation in the enclosing transaction.
 ctx:=public.agent_payment_preflight_before_applied_guard(p_task);
 if exists(select 1 from public.agent_payment_attempts a
  where a.user_id=(ctx->'task'->>'user_id')::uuid
   and a.obligation_id=(ctx->'obligation'->>'id')::uuid and a.status='applied') then
  raise exception 'applied payment requires creditor remaining debt reconciliation';
 end if;
 return ctx;
end $$;

create or replace function public.agent_workflow_store_plan(p_user uuid,p_obligation uuid,p_revision integer,p_plan jsonb,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; has_applied boolean;
begin
 -- Base serializes settings/obligation and validates the exact revision. A
 -- raised error rolls back its draft/event writes, so direct RPC cannot store
 -- a payable proposal which the domain planner would have refused.
 result:=public.agent_workflow_store_plan_before_applied_guard(p_user,p_obligation,p_revision,p_plan,p_hash);
 select exists(
  select 1 from public.agent_payment_attempts a where a.user_id=p_user
   and a.obligation_id=p_obligation and a.status='applied') into has_applied;
 -- On an upgraded database an older, unsubmitted authorization can exist.
 -- The base returns it before applying a read-only needs_sync assessment.
 -- Revoke only this unsubmitted authority, preserve every submitted attempt,
 -- and persist the non-executable assessment in a new task generation.
 if has_applied and result->>'state'='authorized'
  and p_plan->>'state'='needs_sync'
  and p_plan->>'code'='applied_payment_reconciliation_required'
  and p_plan->'proposal'='null'::jsonb
  and not exists(select 1 from public.agent_payment_attempts a
   where a.user_id=p_user and a.task_id=(result->>'id')::uuid
    and (a.submission_started_at is not null or a.status not in ('reserved','cancelled'))) then
  update public.agent_workflow_tasks set state='cancelled',revoked_at=coalesce(revoked_at,now()),updated_at=now()
   where id=(result->>'id')::uuid and user_id=p_user;
  update public.agent_payment_attempts set status='cancelled',updated_at=now()
   where task_id=(result->>'id')::uuid and user_id=p_user and status='reserved' and submission_started_at is null;
  result:=public.agent_workflow_store_plan_before_applied_guard(p_user,p_obligation,p_revision,p_plan,null);
 end if;
 if has_applied and result->>'state' in ('awaiting_approval','authorized') then
  raise exception 'applied payment requires creditor remaining debt reconciliation';
 end if;
 return result;
end $$;

revoke all on function public.agent_payment_preflight(uuid),
 public.agent_workflow_store_plan(uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.agent_payment_preflight(uuid),
 public.agent_workflow_store_plan(uuid,uuid,integer,jsonb,text) to service_role;
