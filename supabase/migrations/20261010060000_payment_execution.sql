create or replace function public.agent_obligation_revision_guard()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.user_id<>old.user_id or new.id<>old.id or new.source_key<>old.source_key then raise exception 'obligation identity is immutable';end if;
 if (to_jsonb(new)-'revision'-'created_at'-'updated_at') is distinct from (to_jsonb(old)-'revision'-'created_at'-'updated_at') then
  new.revision:=old.revision+1;
  update public.agent_workflow_tasks set state='cancelled',revoked_at=now(),updated_at=now()
   where obligation_id=old.id and state not in ('resolved','cancelled');
 else new.revision:=old.revision;end if;
 new.updated_at:=now();return new;
end;
$$;

-- Payment execution prerequisites are server-owned and empty by default.
-- Read-only connections do not create payment-enabled funding accounts.
create table if not exists public.agent_payment_adapters (
 id text primary key, verified boolean not null default false,
 providers text[] not null, funding_providers text[] not null,
 currencies text[] not null, kinds text[] not null,
 fee_cents bigint not null check(fee_cents between 0 and 9007199254740991),
 idempotent boolean not null default false, reconciles boolean not null default false
);
create table if not exists public.agent_payment_funding_accounts (
 user_id uuid not null references auth.users(id) on delete cascade, id text not null,
 provider_key text not null, provider_account_id text not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'), verified boolean not null default false,
 status text not null default 'active' check(status in ('active','revoked','needs_reconnect')),
 available_cents bigint check(available_cents between 0 and 9007199254740991),
 observed_at timestamptz, primary key(user_id,id)
);
create table if not exists public.agent_payment_coverage (
 user_id uuid primary key references auth.users(id) on delete cascade,
 complete boolean not null default false, observed_at timestamptz
);
alter table public.agent_payment_adapters enable row level security;
alter table public.agent_payment_funding_accounts enable row level security;
alter table public.agent_payment_coverage enable row level security;
drop policy if exists payment_funding_owner_read on public.agent_payment_funding_accounts;
create policy payment_funding_owner_read on public.agent_payment_funding_accounts for select using(auth.uid()=user_id);
drop policy if exists payment_coverage_owner_read on public.agent_payment_coverage;
create policy payment_coverage_owner_read on public.agent_payment_coverage for select using(auth.uid()=user_id);
revoke all on public.agent_payment_adapters,public.agent_payment_funding_accounts,public.agent_payment_coverage from anon,authenticated;
grant select on public.agent_payment_funding_accounts,public.agent_payment_coverage to authenticated;

alter table public.agent_payment_attempts add column if not exists fee_cents bigint not null default 0 check(fee_cents between 0 and 9007199254740991);
alter table public.agent_payment_attempts add column if not exists lease_token uuid;
alter table public.agent_payment_attempts add column if not exists lease_until timestamptz;
alter table public.agent_payment_attempts add column if not exists submission_started_at timestamptz;
create table if not exists public.agent_payment_events (
 adapter_id text not null, provider_event_id text not null,
 attempt_id uuid not null references public.agent_payment_attempts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=20000),
 created_at timestamptz not null default now(), primary key(adapter_id,provider_event_id)
);
alter table public.agent_payment_events enable row level security;
drop policy if exists payment_events_owner_read on public.agent_payment_events;
create policy payment_events_owner_read on public.agent_payment_events for select using(auth.uid()=user_id);
revoke all on public.agent_payment_events from anon,authenticated;
grant select on public.agent_payment_events to authenticated;

-- Used under locks by both reservation and point-of-submission revalidation.
create or replace function public.agent_payment_preflight(p_task uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.agent_workflow_tasks; o public.agent_obligations; a public.agent_payment_adapters;
 f public.agent_payment_funding_accounts; s public.agent_settings; c public.agent_payment_coverage;
 proposal jsonb; uid uuid; oid uuid; reserved numeric; others numeric;
begin
 select user_id,obligation_id into uid,oid from public.agent_workflow_tasks where id=p_task;
 if not found then raise exception 'payment task unavailable';end if;
 -- Lock order matches approval/stop and serializes all funding reservations.
 select * into s from public.agent_settings where user_id=uid for update;
 if not found or s.stopped_at is not null then raise exception 'agent stopped or settings missing';end if;
 select * into o from public.agent_obligations where id=oid and user_id=uid for update;
 select * into t from public.agent_workflow_tasks where id=p_task for update;
 proposal:=t.approved_snapshot;
 if t.state<>'authorized' or t.revoked_at is not null or t.approved_at is null or t.approved_at>now()
  or t.obligation_revision<>o.revision or proposal is distinct from t.plan->'proposal'
  or (proposal->>'expires_at')::timestamptz<=now() or proposal->>'expires_at' is null then raise exception 'payment approval expired or changed';end if;
 if o.source_type<>'biller' or o.direction<>'payable' or o.status not in ('verified','partially_paid')
  or o.amount_due_cents is null or o.amount_due_cents<=0 or o.autopay<>'off' or o.due_on is null
  or o.observed_at>now() or o.observed_at<now()-interval '48 hours'
  or coalesce((o.evidence->>'sync_error')::boolean,false) then raise exception 'bill preflight failed';end if;
 if not exists(select 1 from public.agent_biller_records br join public.agent_biller_connections bc on bc.id=br.connection_id
  where br.obligation_id=o.id and br.user_id=uid and bc.status='active') then raise exception 'biller connection unavailable';end if;
 select * into a from public.agent_payment_adapters where id=proposal->>'adapter_id' for share;
 if not found or not a.verified or not a.idempotent or not a.reconciles or not (o.provider_key=any(a.providers))
  or not (o.currency=any(a.currencies)) or not (o.kind=any(a.kinds)) then raise exception 'payment adapter unavailable';end if;
 if proposal->>'action' is distinct from 'pay_obligation' or proposal->>'obligation_id' is distinct from o.id::text
  or (proposal->>'obligation_revision')::integer is distinct from o.revision
  or (proposal->>'amount_cents')::bigint is distinct from o.amount_due_cents
  or (proposal->>'fee_cents')::bigint is distinct from a.fee_cents
  or proposal->>'currency' is distinct from o.currency or proposal->>'provider_key' is distinct from o.provider_key
  or proposal->>'provider_account_id' is distinct from o.provider_account_id or proposal->>'reference' is distinct from o.reference
  or proposal->>'funding_account_id' is distinct from o.funding_account_id or proposal->>'due_on' is distinct from o.due_on::text
  then raise exception 'payment snapshot mismatch';end if;
 select * into f from public.agent_payment_funding_accounts where user_id=uid and id=o.funding_account_id for update;
 if not found or not f.verified or f.status<>'active' or f.currency<>o.currency or not (f.provider_key=any(a.funding_providers))
  or f.available_cents is null or f.observed_at is null or f.observed_at>now() or f.observed_at<now()-interval '15 minutes'
  then raise exception 'payment funding unavailable or stale';end if;
 select * into c from public.agent_payment_coverage where user_id=uid for share;
 if not found or not c.complete or c.observed_at is null or c.observed_at>now() or c.observed_at<now()-interval '15 minutes'
  or exists(select 1 from public.agent_obligations where user_id=uid and id<>o.id and direction='payable'
   and status not in ('settled','waived','invalid') and (status not in ('verified','partially_paid') or amount_due_cents is null or currency<>o.currency))
  then raise exception 'cash coverage incomplete';end if;
 select coalesce(sum(amount_due_cents),0) into others from public.agent_obligations where user_id=uid and id<>o.id
  and direction='payable' and status in ('verified','partially_paid') and currency=o.currency
  and not exists(select 1 from public.agent_payment_attempts pa join public.agent_workflow_tasks wt on wt.id=pa.task_id
   where pa.obligation_id=agent_obligations.id and pa.status in ('reserved','submitted','processing','settled','unknown')
   and wt.approved_snapshot->>'funding_account_id'=f.id);
 select coalesce(sum(amount_cents+fee_cents),0) into reserved from public.agent_payment_attempts pa
  join public.agent_workflow_tasks wt on wt.id=pa.task_id where pa.user_id=uid and wt.approved_snapshot->>'funding_account_id'=f.id
  and pa.status in ('reserved','submitted','processing','settled','unknown') and pa.task_id<>p_task;
 if f.available_cents::numeric-o.amount_due_cents-a.fee_cents-others-reserved < s.buffer::numeric*100 then raise exception 'payment would breach cash buffer';end if;
 return jsonb_build_object('task',to_jsonb(t),'obligation',to_jsonb(o),'funding',to_jsonb(f));
end;
$$;
revoke all on function public.agent_payment_preflight(uuid) from public,anon,authenticated;
grant execute on function public.agent_payment_preflight(uuid) to service_role;

create or replace function public.agent_payment_reserve(p_task uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx jsonb; t jsonb; proposal jsonb; result public.agent_payment_attempts;
begin
 ctx:=public.agent_payment_preflight(p_task);t:=ctx->'task';proposal:=t->'approved_snapshot';
 if t->>'snapshot_hash' is distinct from p_hash then raise exception 'payment hash mismatch';end if;
 select * into result from public.agent_payment_attempts where task_id=p_task;
 if found then return to_jsonb(result);end if;
 insert into public.agent_payment_attempts(user_id,task_id,obligation_id,idempotency_key,adapter_id,amount_cents,currency,fee_cents,status)
 values((t->>'user_id')::uuid,p_task,(t->>'obligation_id')::uuid,'upmore-payment:'||p_task::text,proposal->>'adapter_id',
  (proposal->>'amount_cents')::bigint,proposal->>'currency',(proposal->>'fee_cents')::bigint,'reserved') returning * into result;
 insert into public.agent_workflow_events(user_id,obligation_id,task_id,event,evidence)
  values(result.user_id,result.obligation_id,p_task,'payment_reserved',jsonb_build_object('attempt_id',result.id));
 return to_jsonb(result);
end;
$$;
revoke all on function public.agent_payment_reserve(uuid,text) from public,anon,authenticated;
grant execute on function public.agent_payment_reserve(uuid,text) to service_role;

create or replace function public.agent_payment_claim(p_attempt uuid,p_seconds integer default 45)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.agent_payment_attempts; token uuid:=gen_random_uuid();
begin
 if p_seconds<5 or p_seconds>60 then raise exception 'invalid payment lease';end if;
 select * into a from public.agent_payment_attempts where id=p_attempt for update;
 if not found or a.status not in ('reserved','submitted','processing','settled','unknown') then return null;end if;
 if a.lease_until is not null and a.lease_until>now() then return null;end if;
 update public.agent_payment_attempts set lease_token=token,lease_until=now()+make_interval(secs=>p_seconds)
  where id=a.id returning * into a;
 return to_jsonb(a);
end;
$$;
revoke all on function public.agent_payment_claim(uuid,integer) from public,anon,authenticated;
grant execute on function public.agent_payment_claim(uuid,integer) to service_role;

create or replace function public.agent_payment_begin_submission(p_attempt uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.agent_payment_attempts; ctx jsonb; tid uuid;
begin
 select task_id into tid from public.agent_payment_attempts where id=p_attempt;
 if not found then raise exception 'payment attempt unavailable';end if;
 ctx:=public.agent_payment_preflight(tid);
 select * into a from public.agent_payment_attempts where id=p_attempt for update;
 if a.lease_token is distinct from p_lease or a.lease_until is null or a.lease_until<=now() then raise exception 'payment lease expired';end if;
 if a.status<>'reserved' or a.submission_started_at is not null then raise exception 'payment submission already started';end if;
 update public.agent_payment_attempts set status='submitted',submission_started_at=now(),updated_at=now() where id=a.id returning * into a;
 insert into public.agent_workflow_events(user_id,obligation_id,task_id,event,evidence)
 values(a.user_id,a.obligation_id,a.task_id,'payment_submission_started',jsonb_build_object('attempt_id',a.id));
 return jsonb_build_object('attempt',to_jsonb(a),'context',ctx);
end;
$$;
revoke all on function public.agent_payment_begin_submission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.agent_payment_begin_submission(uuid,uuid) to service_role;

create or replace function public.agent_payment_cancel_reserved(p_attempt uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.agent_payment_attempts; uid uuid; oid uuid; tid uuid;
begin
 select user_id,obligation_id,task_id into uid,oid,tid from public.agent_payment_attempts where id=p_attempt;
 if not found then return null;end if;
 perform user_id from public.agent_settings where user_id=uid for update;
 perform id from public.agent_obligations where id=oid for update;
 perform id from public.agent_workflow_tasks where id=tid for update;
 update public.agent_payment_attempts set status='cancelled',lease_token=null,lease_until=null,updated_at=now()
  where id=p_attempt and lease_token=p_lease and status='reserved' and submission_started_at is null returning * into a;
 if not found then return null;end if;
 update public.agent_workflow_tasks set state='cancelled',revoked_at=now(),updated_at=now() where id=tid and state<>'resolved';
 insert into public.agent_workflow_events(user_id,obligation_id,task_id,event,evidence)
  values(uid,oid,tid,'payment_preflight_blocked',jsonb_build_object('attempt_id',a.id));
 return to_jsonb(a);
end;
$$;
revoke all on function public.agent_payment_cancel_reserved(uuid,uuid) from public,anon,authenticated;
grant execute on function public.agent_payment_cancel_reserved(uuid,uuid) to service_role;

create or replace function public.agent_payment_uncertain(p_attempt uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.agent_payment_attempts;
begin
 update public.agent_payment_attempts set status='unknown',lease_token=null,lease_until=null,updated_at=now()
  where id=p_attempt and lease_token=p_lease and status in ('submitted','processing','unknown') returning * into a;
 if not found then return null;end if;
 insert into public.agent_workflow_events(user_id,obligation_id,task_id,event,evidence)
 values(a.user_id,a.obligation_id,a.task_id,'payment_result_uncertain',jsonb_build_object('attempt_id',a.id));
 return to_jsonb(a);
end;
$$;
revoke all on function public.agent_payment_uncertain(uuid,uuid) from public,anon,authenticated;
grant execute on function public.agent_payment_uncertain(uuid,uuid) to service_role;

-- Only signature-verified webhooks or authenticated adapter reads call this.
create or replace function public.agent_payment_record_event(p_attempt uuid,p_adapter text,p_event jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.agent_payment_attempts; o public.agent_obligations; t public.agent_workflow_tasks;
 prior public.agent_payment_events; eid text:=p_event->>'provider_event_id'; nextstate text:=p_event->>'status'; oid uuid; uid uuid;
begin
 select user_id,obligation_id into uid,oid from public.agent_payment_attempts where id=p_attempt;
 if not found then raise exception 'payment attempt unavailable';end if;
 -- Ordering matches bill corrections and stop; reconciliation remains allowed after stop.
 perform user_id from public.agent_settings where user_id=uid for update;
 select * into o from public.agent_obligations where id=oid for update;
 select * into t from public.agent_workflow_tasks where id=(select task_id from public.agent_payment_attempts where id=p_attempt) for update;
 select * into a from public.agent_payment_attempts where id=p_attempt for update;
 if a.adapter_id<>p_adapter or coalesce(eid,'')='' or length(eid)>160 or coalesce(p_event->>'provider_payment_id','')=''
  or p_event->>'idempotency_key' is distinct from a.idempotency_key
  or p_event->>'reference' is distinct from t.approved_snapshot->>'reference'
  or p_event->>'provider_account_id' is distinct from t.approved_snapshot->>'provider_account_id'
  or p_event->>'currency' is distinct from a.currency or (p_event->>'amount_cents')::bigint is distinct from a.amount_cents
  or (a.provider_payment_id is not null and a.provider_payment_id<>p_event->>'provider_payment_id') then raise exception 'unmatched payment event';end if;
 if nextstate not in ('submitted','processing','settled','applied','failed','returned') or nextstate is null then raise exception 'unknown payment status';end if;
 if nextstate='applied' and coalesce(p_event->>'applied_reference','')='' then raise exception 'creditor application evidence required';end if;
 select * into prior from public.agent_payment_events where adapter_id=p_adapter and provider_event_id=eid;
 if found then
  if prior.attempt_id<>a.id or prior.payload<>p_event then raise exception 'conflicting payment event';end if;
  return jsonb_build_object('ok',true,'duplicate',true,'attempt',to_jsonb(a));
 end if;
 if a.status in ('reserved','cancelled') then raise exception 'payment was not submitted';end if;
 insert into public.agent_payment_events(adapter_id,provider_event_id,attempt_id,user_id,payload) values(p_adapter,eid,a.id,a.user_id,p_event);
 -- Late events are retained as evidence but cannot regress terminal state.
 if a.status in ('returned','failed') or (a.status='applied' and nextstate<>'returned') or
  (a.status='settled' and nextstate in ('submitted','processing')) or (a.status='processing' and nextstate='submitted') then
  return jsonb_build_object('ok',true,'ignored_late',true,'attempt',to_jsonb(a));
 end if;
 update public.agent_payment_attempts set status=nextstate,provider_payment_id=p_event->>'provider_payment_id',
  evidence=evidence||jsonb_build_object('last_provider_event',eid,'applied_reference',p_event->>'applied_reference'),
  lease_token=null,lease_until=null,updated_at=now() where id=a.id returning * into a;
 if nextstate in ('applied','returned') then
  update public.agent_payment_funding_accounts set observed_at=null
   where user_id=a.user_id and id=t.approved_snapshot->>'funding_account_id';
 end if;
 if nextstate in ('failed','returned') then
  update public.agent_workflow_tasks set state='cancelled',revoked_at=now(),updated_at=now() where id=t.id and state not in ('resolved','cancelled');
 end if;
 if nextstate='applied' and o.revision=t.obligation_revision and o.amount_due_cents=a.amount_cents then
  update public.agent_workflow_tasks set state='resolved',updated_at=now() where id=t.id and revoked_at is null;
  update public.agent_obligations set status='settled',amount_due_cents=0,
   evidence=evidence||jsonb_build_object('payment_attempt_id',a.id,'applied_reference',p_event->>'applied_reference') where id=o.id;
 elsif nextstate='returned' and o.evidence->>'payment_attempt_id'=a.id::text then
  update public.agent_obligations set status='asserted',amount_due_cents=null,
   evidence=evidence||jsonb_build_object('payment_returned',true,'unpaid_confirmed',false,'refresh_required',true) where id=o.id;
 end if;
 insert into public.agent_workflow_events(user_id,obligation_id,task_id,event,evidence)
  values(a.user_id,a.obligation_id,a.task_id,'payment_'||nextstate,jsonb_build_object('attempt_id',a.id,'provider_event_id',eid));
 return jsonb_build_object('ok',true,'attempt',to_jsonb(a));
end;
$$;
revoke all on function public.agent_payment_record_event(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.agent_payment_record_event(uuid,text,jsonb) to service_role;

-- New approval rounds are distinct tasks, even if the invoice revision has
-- not changed. An expired/cancelled authorization can never be reopened.
alter table public.agent_workflow_tasks add column if not exists generation integer not null default 1 check(generation>0);
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.agent_workflow_tasks'::regclass
  and contype='u' and pg_get_constraintdef(oid)='UNIQUE (user_id, obligation_id, obligation_revision)' loop
  execute format('alter table public.agent_workflow_tasks drop constraint %I',c.conname);
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.agent_workflow_tasks'::regclass and conname='agent_task_generation_unique') then
  alter table public.agent_workflow_tasks add constraint agent_task_generation_unique unique(user_id,obligation_id,obligation_revision,generation);
 end if;
end;$$;
create or replace function public.agent_workflow_store_plan(p_user uuid,p_obligation uuid,p_revision integer,p_plan jsonb,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare rev integer; task public.agent_workflow_tasks; stopped timestamptz; gen integer:=1;
begin
 select stopped_at into stopped from public.agent_settings where user_id=p_user for update;
 if not found then raise exception 'settings missing';end if;
 select revision into rev from public.agent_obligations where id=p_obligation and user_id=p_user for update;
 if not found or rev<>p_revision then raise exception 'obligation changed';end if;
 if p_plan->>'obligation_id' is distinct from p_obligation::text or (p_plan->>'obligation_revision')::integer is distinct from rev then raise exception 'plan identity mismatch';end if;
 if stopped is not null then
  p_plan:=p_plan||jsonb_build_object('state','blocked','code','agent_stopped','message','The agent is stopped.','proposal',null);p_hash:=null;
 end if;
 select * into task from public.agent_workflow_tasks where user_id=p_user and obligation_id=p_obligation and obligation_revision=rev order by generation desc limit 1 for update;
 if found then
  if task.state='resolved' then return to_jsonb(task);end if;
  if task.state='authorized' and task.revoked_at is null and (task.approved_snapshot->>'expires_at')::timestamptz>now() then return to_jsonb(task);end if;
  if task.state in ('authorized','cancelled') then
   gen:=task.generation+1;
   update public.agent_workflow_tasks set state='cancelled',revoked_at=coalesce(revoked_at,now()),updated_at=now() where id=task.id;
   update public.agent_payment_attempts set status='cancelled',updated_at=now() where task_id=task.id and status='reserved' and submission_started_at is null;
  else gen:=task.generation;end if;
 end if;
 if p_plan->>'state'='awaiting_approval' and exists(select 1 from public.agent_payment_attempts where obligation_id=p_obligation and status in ('reserved','submitted','processing','settled','unknown')) then raise exception 'payment already in flight';end if;
 insert into public.agent_workflow_tasks(user_id,obligation_id,obligation_revision,generation,state,plan,snapshot_hash)
  values(p_user,p_obligation,rev,gen,p_plan->>'state',p_plan,p_hash)
  on conflict(user_id,obligation_id,obligation_revision,generation) do update set state=excluded.state,plan=excluded.plan,snapshot_hash=excluded.snapshot_hash,updated_at=now() returning * into task;
 insert into public.agent_workflow_events(user_id,obligation_id,task_id,event,evidence)
  values(p_user,p_obligation,task.id,'planned',jsonb_build_object('state',task.state,'generation',task.generation));
 return to_jsonb(task);
end;
$$;
