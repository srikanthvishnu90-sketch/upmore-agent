-- LOOP J10 (Crew B, 2026-10-15) — PROPOSED, owner applies (the
-- task-intent migration's posture: this schema starts no worker,
-- browser, HTTP request or employer operation). Apply only after
-- 20261015234000_career_task_intents_v1.sql.
--
-- Batch delegation for the career apply loop: the Edge handler
-- commits career_batch_intent/v1 intents transactionally with the
-- chat reply (prepare from the owner's "apply to N <family> roles"
-- ask; approve from the structured career_batch request + the exact
-- message "Approve batch <runId>"); the worker-side batch executor
-- claims them and runs module 155 in its own process; prepared and
-- final batch runs are stored as career_batch_run/v1 records the
-- handler reads back owner-scoped. Bindings, immutability, account
-- version/epoch checks, pause gating and RLS mirror the task stack.
-- Deliberate differences from the task stack, recorded: (1) no
-- per-effect token table — a batch's effect discipline lives in
-- 149/150 (doorstep stop, MI-110 caps, MI-116 hash binding, the
-- arming wire) and in the executor's claim-once rule: an execute
-- intent that crashes mid-run is finished 'uncertain' and never
-- re-driven; (2) a claim extends the intent's working window to 60
-- minutes (a 15-application batch drives for minutes, not seconds);
-- (3) run-record writes (save_run) are gated on an in-flight or
-- completed intent for the same (user, run) instead of a lease.
create table public.career_batch_intents_v1 (
 user_id uuid not null references auth.users(id) on delete cascade,
 intent_id text not null check(intent_id ~ '^[a-f0-9]{64}$'),
 thread_id uuid not null references public.agent_threads(id), turn_key text not null, request_hash text not null,
 event_hash text not null,
 binding jsonb not null, private_input jsonb, result jsonb,
 authority_account_version bigint not null, privacy_epoch bigint not null,
 state text not null default 'queued' check(state in ('queued','claimed','completed','blocked','cancelled','uncertain')),
 run_id text not null, lease_token uuid, expires_at timestamptz not null default now()+interval '30 minutes',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,intent_id),unique(user_id,thread_id,turn_key),unique(user_id,event_hash)
);
create table public.career_batch_runs_v1 (
 user_id uuid not null references auth.users(id) on delete cascade,
 run_id text not null, state text not null, run jsonb not null, summary jsonb,
 updated_at timestamptz not null default now(),
 primary key(user_id,run_id)
);
create table public.career_batch_ledgers_v1 (
 user_id uuid not null references auth.users(id) on delete cascade,
 records jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 primary key(user_id)
);
alter table public.career_batch_intents_v1 enable row level security;
alter table public.career_batch_runs_v1 enable row level security;
alter table public.career_batch_ledgers_v1 enable row level security;
revoke all on public.career_batch_intents_v1,public.career_batch_runs_v1,public.career_batch_ledgers_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.career_batch_intents_v1,public.career_batch_runs_v1,public.career_batch_ledgers_v1 to service_role;
create policy career_batch_backend_v1 on public.career_batch_intents_v1 for all to service_role using(true) with check(true);
create policy career_batch_run_backend_v1 on public.career_batch_runs_v1 for all to service_role using(true) with check(true);
create policy career_batch_ledger_backend_v1 on public.career_batch_ledgers_v1 for all to service_role using(true) with check(true);

create function public.career_batch_control_hook_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; epoch_changed boolean;
begin
 if coalesce(new.key,old.key)<>'career:account' then return null;end if;
 u:=coalesce(new.user_id,old.user_id);
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 epoch_changed:=tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0));
 update career_batch_intents_v1 i set state=case when i.state='claimed' then 'uncertain' else 'cancelled' end,updated_at=now()
  where i.user_id=u and i.state in ('queued','claimed') and (tg_op='DELETE' or new.value->'paused'='true'::jsonb or i.authority_account_version is distinct from (new.value->>'version')::bigint or i.privacy_epoch is distinct from coalesce((new.value->>'epoch')::bigint,0));
 if epoch_changed then
  update career_batch_intents_v1 set private_input=null,result=null,
   binding=jsonb_build_object('version','career_batch_intent/v1','intent_id',intent_id,'user_id',user_id,'action',binding->>'action','run_id',run_id,'request_hash',request_hash),updated_at=now() where user_id=u;
  delete from career_batch_runs_v1 where user_id=u;
 end if;
 return null;
end $$;
create trigger career_batch_account_control_v1 after insert or update or delete on public.career_watch_kv for each row execute function public.career_batch_control_hook_v1();

create function public.career_batch_turn_commit_v1(p_base jsonb,p_intent jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; a jsonb; saved jsonb; row_intent career_batch_intents_v1; k text; action text; run_row career_batch_runs_v1;
begin
 u:=(p_base->>'p_user')::uuid;action:=p_intent->>'action';
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or p_intent->>'version' is distinct from 'career_batch_intent/v1' then raise exception 'invalid batch intent version';end if;
 for k in select jsonb_object_keys(p_intent) loop
  if k not in ('version','intent_id','user_id','thread_id','turn_key','request_hash','action','event_id','run_id','family_text','count','card_sha256','run','authority_account_version','privacy_epoch') then raise exception 'unknown batch intent field';end if;
 end loop;
 if coalesce(p_intent->>'intent_id','') !~ '^[a-f0-9]{64}$' or p_intent->>'user_id' is distinct from u::text or p_intent->>'thread_id' is distinct from p_base->>'p_thread' or p_intent->>'turn_key' is distinct from p_base->>'p_key' or p_intent->>'request_hash' is distinct from p_base->>'p_hash' or coalesce(action,'') not in ('prepare','approve') or coalesce(p_intent->>'event_id','') !~ '^[A-Za-z0-9_-]{1,128}$' or coalesce(p_intent->>'run_id','') !~ '^batch-[A-Za-z0-9-]{4,96}$' then raise exception 'invalid batch intent binding';end if;
 if action='prepare' and (p_intent->>'event_id' is distinct from 'prepare-'||(p_intent->>'run_id') or jsonb_typeof(p_intent->'run')<>'object' or p_intent#>>'{run,id}' is distinct from p_intent->>'run_id' or p_intent#>>'{run,userId}' is distinct from u::text or p_intent#>>'{run,status}' is distinct from 'queued_prepare' or p_intent#>>'{run,familyText}' is distinct from p_intent->>'family_text') then raise exception 'invalid batch preparation intent';end if;
 if action='approve' then
  if coalesce(p_intent->>'card_sha256','') !~ '^([a-f0-9]{64}|fnv1a-[a-f0-9]{1,16})$' or p_base->>'p_input' is distinct from 'Approve batch '||(p_intent->>'run_id') then raise exception 'invalid batch approval';end if;
  select * into run_row from career_batch_runs_v1 where user_id=u and run_id=p_intent->>'run_id';
  if run_row.run_id is null or run_row.state is distinct from 'awaiting_approval' or run_row.run->>'cardSha256' is distinct from p_intent->>'card_sha256' then raise exception 'batch card mismatch';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from career_batch_intents_v1 where user_id=u and event_hash=encode(sha256(convert_to(u::text||':'||(p_intent->>'event_id'),'UTF8')),'hex') and intent_id<>p_intent->>'intent_id') then return jsonb_build_object('error','task_event_conflict');end if;
 select * into row_intent from career_batch_intents_v1 where user_id=u and intent_id=p_intent->>'intent_id';
 if row_intent.intent_id is not null and row_intent.binding is distinct from (p_intent-'run') then raise exception 'immutable batch intent conflict';end if;
 -- Call the existing commit, never a fork of its transaction/control logic.
 saved:=career_host_commit(u,(p_base->>'p_thread')::uuid,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 if saved->'replay'='true'::jsonb then
  if row_intent.intent_id is null then raise exception 'replayed batch receipt missing intent';end if;
  return saved;
 end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 if a is null or (a->>'version')::bigint is distinct from (p_intent->>'authority_account_version')::bigint or coalesce((a->>'epoch')::bigint,0) is distinct from (p_intent->>'privacy_epoch')::bigint or a->'paused'='true'::jsonb then raise exception 'batch authority changed';end if;
 if p_base#>>'{p_response,batch,intent_id}' is distinct from p_intent->>'intent_id' or p_base#>>'{p_response,batch,userId}' is distinct from u::text or p_base#>>'{p_response,batch,id}' is distinct from p_intent->>'run_id' or p_base#>'{p_response,batch,bindings}' is distinct from p_intent then raise exception 'batch response binding mismatch';end if;
 insert into career_batch_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,run_id)
 values(u,p_intent->>'intent_id',(p_base->>'p_thread')::uuid,p_base->>'p_key',p_base->>'p_hash',encode(sha256(convert_to(u::text||':'||(p_intent->>'event_id'),'UTF8')),'hex'),(p_intent-'run'),case when action='prepare' then jsonb_build_object('run',p_intent->'run') else null end,(p_intent->>'authority_account_version')::bigint,(p_intent->>'privacy_epoch')::bigint,p_intent->>'run_id');
 return saved;
end $$;

create function public.career_batch_pending_v1() returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'binding',i.binding,'request',i.private_input)),'[]'::jsonb)) from (select i.* from career_batch_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account' where i.state='queued' and i.expires_at>now() and i.authority_account_version=(a.value->>'version')::bigint and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) and a.value->'paused' is distinct from 'true'::jsonb order by i.created_at limit 50)i;
$$;
create function public.career_batch_claim_v1(p_user uuid,p_intent text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_batch_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_batch_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if i.intent_id is null then raise exception 'batch intent missing';end if;
 if a is null or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or a->'paused'='true'::jsonb or i.expires_at<=now() or i.state<>'queued' then raise exception 'batch authority revoked';end if;
 update career_batch_intents_v1 set state='claimed',lease_token=gen_random_uuid(),expires_at=now()+interval '60 minutes',updated_at=now() where user_id=p_user and intent_id=p_intent returning * into i;
 return jsonb_build_object('claimed',true,'intentId',p_intent,'userId',p_user,'leaseToken',i.lease_token,'binding',i.binding,'request',i.private_input);
end $$;
create function public.career_batch_finish_v1(p_user uuid,p_intent text,p_lease uuid,p_state text,p_result jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_batch_intents_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_batch_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 if i.intent_id is null or p_lease is distinct from i.lease_token then raise exception 'batch result owner mismatch';end if;
 if coalesce(p_state,'') not in ('completed','blocked','uncertain') or i.state<>'claimed' then raise exception 'invalid batch finish';end if;
 update career_batch_intents_v1 set state=p_state,result=p_result,updated_at=now() where user_id=p_user and intent_id=p_intent;
 return jsonb_build_object('state',p_state);
end $$;
create function public.career_batch_save_run_v1(p_user uuid,p_run jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_run->>'version' is distinct from 'career_batch_run/v1' or p_run->>'userId' is distinct from p_user::text or coalesce(p_run->>'runId','') !~ '^batch-[A-Za-z0-9-]{4,96}$' or jsonb_typeof(p_run->'run')<>'object' or p_run#>>'{run,id}' is distinct from p_run->>'runId' then raise exception 'invalid batch run record';end if;
 if not exists(select 1 from career_batch_intents_v1 where user_id=p_user and run_id=p_run->>'runId' and state in ('claimed','completed')) then raise exception 'batch run write not authorized';end if;
 insert into career_batch_runs_v1(user_id,run_id,state,run,summary,updated_at) values(p_user,p_run->>'runId',p_run->>'status',p_run->'run',p_run->'summary',now())
 on conflict(user_id,run_id) do update set state=excluded.state,run=excluded.run,summary=excluded.summary,updated_at=now();
 return jsonb_build_object('saved',true);
end $$;
create function public.career_batch_result_v1(p_user uuid,p_run text default null) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('batch',(select jsonb_build_object('version','career_batch_run/v1','runId',r.run_id,'userId',r.user_id,'status',r.state,'run',r.run,'summary',r.summary) from career_batch_runs_v1 r join career_watch_kv a on a.user_id=r.user_id and a.key='career:account' where r.user_id=p_user and r.run_id=p_run limit 1));
$$;
create function public.career_batch_ledger_v1(p_user uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('records',coalesce((select records from career_batch_ledgers_v1 where user_id=p_user),'[]'::jsonb));
$$;
create function public.career_batch_save_ledger_v1(p_user uuid,p_records jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_records)<>'array' then raise exception 'invalid batch ledger';end if;
 insert into career_batch_ledgers_v1(user_id,records,updated_at) values(p_user,p_records,now())
 on conflict(user_id) do update set records=excluded.records,updated_at=now();
 return jsonb_build_object('saved',true);
end $$;

revoke all on function public.career_batch_control_hook_v1(),public.career_batch_turn_commit_v1(jsonb,jsonb),public.career_batch_pending_v1(),public.career_batch_claim_v1(uuid,text),public.career_batch_finish_v1(uuid,text,uuid,text,jsonb),public.career_batch_save_run_v1(uuid,jsonb),public.career_batch_result_v1(uuid,text),public.career_batch_ledger_v1(uuid),public.career_batch_save_ledger_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.career_batch_control_hook_v1(),public.career_batch_turn_commit_v1(jsonb,jsonb),public.career_batch_pending_v1(),public.career_batch_claim_v1(uuid,text),public.career_batch_finish_v1(uuid,text,uuid,text,jsonb),public.career_batch_save_run_v1(uuid,jsonb),public.career_batch_result_v1(uuid,text),public.career_batch_ledger_v1(uuid),public.career_batch_save_ledger_v1(uuid,jsonb) to service_role;
