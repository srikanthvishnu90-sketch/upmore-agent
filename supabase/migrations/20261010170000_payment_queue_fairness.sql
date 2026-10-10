-- Reconciliation scheduling is independent of financial state timestamps.
-- Existing unknown results stay uncertain; checking is never resubmission.
alter table public.agent_payment_attempts add column if not exists last_checked_at timestamptz;
alter table public.agent_payment_attempts add column if not exists next_check_at timestamptz not null default now();
alter table public.agent_payment_attempts add column if not exists check_backoff integer not null default 0 check(check_backoff between 0 and 10);
create index if not exists agent_payment_due_queue on public.agent_payment_attempts(next_check_at,last_checked_at,id)
 where status in ('reserved','submitted','processing','settled','unknown');

create or replace function public.agent_payment_claim(p_attempt uuid,p_seconds integer default 45)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.agent_payment_attempts; token uuid:=gen_random_uuid();
begin
 if p_seconds is null or p_seconds<5 or p_seconds>60 then raise exception 'invalid payment lease';end if;
 select * into a from public.agent_payment_attempts where id=p_attempt for update;
 if not found or a.status not in ('reserved','submitted','processing','settled','unknown') then return null;end if;
 if a.next_check_at>now() or (a.lease_until is not null and a.lease_until>now()) then return null;end if;
 update public.agent_payment_attempts set lease_token=token,lease_until=now()+make_interval(secs=>p_seconds),
  last_checked_at=clock_timestamp(),next_check_at=now()+make_interval(secs=>p_seconds)
  where id=a.id returning * into a;
 return to_jsonb(a);
end;
$$;

create or replace function public.agent_payment_uncertain(p_attempt uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.agent_payment_attempts;
begin
 update public.agent_payment_attempts set status=case when status='settled' then 'settled' else 'unknown' end,
  lease_token=null,lease_until=null,last_checked_at=clock_timestamp(),check_backoff=least(check_backoff+1,10),
  next_check_at=now()+make_interval(secs=>least(3600,30*(2^least(check_backoff,7))::integer)),updated_at=now()
  where id=p_attempt and lease_token=p_lease and status in ('submitted','processing','unknown','settled') returning * into a;
 if not found then return null;end if;
 insert into public.agent_workflow_events(user_id,obligation_id,task_id,event,evidence)
 values(a.user_id,a.obligation_id,a.task_id,case when a.status='settled' then 'payment_application_pending' else 'payment_result_uncertain' end,jsonb_build_object('attempt_id',a.id));
 return to_jsonb(a);
end;
$$;

-- Preserve validated event binding/state transitions. Scheduling wraps the
-- existing implementation, including duplicate and ignored-late branches.
do $$begin
 if to_regprocedure('public.agent_payment_record_event_core17(uuid,text,jsonb)') is null then
  alter function public.agent_payment_record_event(uuid,text,jsonb) rename to agent_payment_record_event_core17;
 end if;
end;$$;
revoke all on function public.agent_payment_record_event_core17(uuid,text,jsonb) from public,anon,authenticated,service_role;
create or replace function public.agent_payment_record_event(p_attempt uuid,p_adapter text,p_event jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; a public.agent_payment_attempts; stagnant boolean;
begin
 result:=public.agent_payment_record_event_core17(p_attempt,p_adapter,p_event);
 stagnant:=coalesce((result->>'duplicate')::boolean,false) or coalesce((result->>'ignored_late')::boolean,false);
 update public.agent_payment_attempts set last_checked_at=clock_timestamp(),lease_token=null,lease_until=null,
  check_backoff=case when stagnant then least(check_backoff+1,10) else 0 end,
  next_check_at=now()+make_interval(secs=>case when stagnant then least(3600,30*(2^least(check_backoff,7))::integer) else 30 end)
  where id=p_attempt returning * into a;
 return jsonb_set(result,'{attempt}',to_jsonb(a));
end;
$$;

create or replace function public.agent_payment_due_attempts(p_adapters text[],p_limit integer default 5)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_limit is null or p_limit<1 or p_limit>10 then raise exception 'invalid payment queue limit';end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
  select id,adapter_id from public.agent_payment_attempts where adapter_id=any(p_adapters)
   and status in ('reserved','submitted','processing','settled','unknown')
   and next_check_at<=now() and (lease_until is null or lease_until<=now())
   order by last_checked_at nulls first,next_check_at,id limit p_limit
 ) q),'[]'::jsonb);
end;
$$;
create or replace function public.agent_payment_due_tasks(p_adapters text[],p_limit integer default 5)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_limit is null or p_limit<1 or p_limit>10 then raise exception 'invalid payment queue limit';end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
  select t.id,t.snapshot_hash from public.agent_workflow_tasks t
   where t.state='authorized' and t.revoked_at is null and t.approved_snapshot->>'adapter_id'=any(p_adapters)
   and (t.approved_snapshot->>'expires_at')::timestamptz>now()
   and not exists(select 1 from public.agent_payment_attempts a where a.task_id=t.id)
   order by t.approved_at,t.id limit p_limit
 ) q),'[]'::jsonb);
end;
$$;
revoke all on function public.agent_payment_claim(uuid,integer),public.agent_payment_uncertain(uuid,uuid),
 public.agent_payment_record_event(uuid,text,jsonb),public.agent_payment_due_attempts(text[],integer),public.agent_payment_due_tasks(text[],integer) from public,anon,authenticated;
grant execute on function public.agent_payment_claim(uuid,integer),public.agent_payment_uncertain(uuid,uuid),
 public.agent_payment_record_event(uuid,text,jsonb),public.agent_payment_due_attempts(text[],integer),public.agent_payment_due_tasks(text[],integer) to service_role;
