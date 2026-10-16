-- Browser-owned forward proposal. Apply only after the memory/alerts repair.
-- No second account authority: use its exact row and owner advisory lock.
-- This schema starts no worker, browser, HTTP request or employer operation.
create table public.career_task_intents_v1 (
 user_id uuid not null references auth.users(id) on delete cascade,
 intent_id text not null check(intent_id ~ '^[a-f0-9]{64}$'),
 thread_id uuid not null references public.agent_threads(id), turn_key text not null, request_hash text not null,
 event_hash text not null,
 binding jsonb not null, private_input jsonb, result jsonb,
 authority_account_version bigint not null, privacy_epoch bigint not null,
 state text not null default 'queued' check(state in ('queued','claimed','completed','cancelled','uncertain')),
 task_id text, lease_token uuid, expires_at timestamptz not null default now()+interval '10 minutes',
 spent integer not null default 0, reserved integer not null default 0, budget_limit integer not null default 120,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,intent_id),unique(user_id,thread_id,turn_key),unique(user_id,event_hash)
);
create table public.career_task_effects_v1 (
 user_id uuid not null, intent_id text not null, effect_key text not null, task_id text not null,
 operation text not null, token uuid not null default gen_random_uuid(),
 state text not null check(state in ('reserved','started','completed','definitely_failed','uncertain')),
 before_sha256 text, after_sha256 text, created_at timestamptz not null default now(),
 primary key(user_id,intent_id,effect_key),unique(token),
 foreign key(user_id,intent_id) references public.career_task_intents_v1(user_id,intent_id)
);
-- A lost local task file or a new approval cannot bypass an admitted submit.
create unique index career_task_one_submit_v1 on public.career_task_effects_v1(user_id,task_id) where operation='submit';
alter table public.career_task_intents_v1 enable row level security;
alter table public.career_task_effects_v1 enable row level security;
revoke all on public.career_task_intents_v1,public.career_task_effects_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.career_task_intents_v1,public.career_task_effects_v1 to service_role;
create policy career_task_backend_v1 on public.career_task_intents_v1 for all to service_role using(true) with check(true);
create policy career_effect_backend_v1 on public.career_task_effects_v1 for all to service_role using(true) with check(true);

create function public.career_task_control_hook_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; epoch_changed boolean;
begin
 if coalesce(new.key,old.key)<>'career:account' then return null;end if;
 u:=coalesce(new.user_id,old.user_id);
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 epoch_changed:=tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0));
 update career_task_intents_v1 i set state=case when exists(select 1 from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id and e.state in ('started','uncertain')) then 'uncertain' else 'cancelled' end,updated_at=now()
  where i.user_id=u and i.state in ('queued','claimed','uncertain') and (tg_op='DELETE' or new.value->'paused'='true'::jsonb or i.authority_account_version is distinct from (new.value->>'version')::bigint or i.privacy_epoch is distinct from coalesce((new.value->>'epoch')::bigint,0));
 if epoch_changed then
  update career_task_intents_v1 set private_input=null,result=null,
   binding=jsonb_build_object('version','career_task_intent/v1','intent_id',intent_id,'user_id',user_id,'action',binding->>'action','task_id',task_id,'request_hash',request_hash),updated_at=now() where user_id=u;
 end if;
 return null;
end $$;
create trigger career_task_account_control_v1 after insert or update or delete on public.career_watch_kv for each row execute function public.career_task_control_hook_v1();

create function public.career_task_turn_commit_v1(p_base jsonb,p_intent jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; a jsonb; saved jsonb; row_intent career_task_intents_v1; k text; action text; payload jsonb;
begin
 u:=(p_base->>'p_user')::uuid;action:=p_intent->>'action';
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or p_intent->>'version' is distinct from 'career_task_intent/v1' then raise exception 'invalid task intent version';end if;
 for k in select jsonb_object_keys(p_intent) loop
  if k not in ('version','intent_id','user_id','thread_id','turn_key','request_hash','action','task_id','event_id','artifact_id','resume_sha256','payload_sha256','profile_sha256','destination','authority_account_version','privacy_epoch') then raise exception 'unknown task intent field';end if;
 end loop;
 if coalesce(p_intent->>'intent_id','') !~ '^[a-f0-9]{64}$' or p_intent->>'user_id' is distinct from u::text or p_intent->>'thread_id' is distinct from p_base->>'p_thread' or p_intent->>'turn_key' is distinct from p_base->>'p_key' or p_intent->>'request_hash' is distinct from p_base->>'p_hash' or coalesce(action,'') not in ('prepare','approve','reconcile') or coalesce(p_intent->>'event_id','') !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'invalid task intent binding';end if;
 if action='prepare' and (coalesce(p_intent->>'artifact_id','') !~ '^[A-Za-z0-9_-]{1,160}$' or coalesce(p_intent->>'resume_sha256','') !~ '^[a-f0-9]{64}$' or p_intent->>'destination' is distinct from p_base#>>'{p_snapshot,stores,posting,url}' or p_base#>>'{p_snapshot,stores,posting,canonicalKey}' is null) then raise exception 'invalid preparation intent';end if;
 if action in ('approve','reconcile') and coalesce(p_intent->>'task_id','') !~ '^[a-f0-9]{32}$' then raise exception 'invalid task identity';end if;
 if action='approve' and (coalesce(p_intent->>'resume_sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_intent->>'payload_sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_intent->>'destination','') !~ '^https?://' or p_base->>'p_input' is distinct from 'Approve browser task '||(p_intent->>'task_id')) then raise exception 'invalid task approval';end if;
 if p_intent ? 'profile_sha256' and p_intent->>'profile_sha256' is not null and p_intent->>'profile_sha256' !~ '^[a-f0-9]{64}$' then raise exception 'invalid profile binding';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from career_task_intents_v1 where user_id=u and event_hash=encode(sha256(convert_to(u::text||':'||(p_intent->>'event_id'),'UTF8')),'hex') and intent_id<>p_intent->>'intent_id') then return jsonb_build_object('error','task_event_conflict');end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 select * into row_intent from career_task_intents_v1 where user_id=u and intent_id=p_intent->>'intent_id';
 if row_intent.intent_id is not null then
  if row_intent.binding is distinct from p_intent then raise exception 'immutable task intent conflict';end if;
 end if;
 -- Call the existing commit, never a fork of its transaction/control logic.
 saved:=career_host_commit(u,(p_base->>'p_thread')::uuid,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 if saved->'replay'='true'::jsonb then
  if row_intent.intent_id is null then raise exception 'replayed task receipt missing intent';end if;
  return saved;
 end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 if a is null or (a->>'version')::bigint is distinct from (p_intent->>'authority_account_version')::bigint or coalesce((a->>'epoch')::bigint,0) is distinct from (p_intent->>'privacy_epoch')::bigint or (action<>'reconcile' and a->'paused'='true'::jsonb) then raise exception 'task authority changed';end if;
 if p_base#>>'{p_response,task,intent_id}' is distinct from p_intent->>'intent_id' or p_base#>>'{p_response,task,userId}' is distinct from u::text or p_base#>'{p_response,task,bindings}' is distinct from p_intent then raise exception 'task response binding mismatch';end if;
 payload:=case when action='prepare' then jsonb_build_object('eventId',p_intent->>'event_id','posting',p_base#>'{p_snapshot,stores,posting}','artifactId',p_intent->>'artifact_id','resumeSha256',p_intent->>'resume_sha256') else null end;
 insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id)
 values(u,p_intent->>'intent_id',(p_base->>'p_thread')::uuid,p_base->>'p_key',p_base->>'p_hash',encode(sha256(convert_to(u::text||':'||(p_intent->>'event_id'),'UTF8')),'hex'),p_intent,payload,(p_intent->>'authority_account_version')::bigint,(p_intent->>'privacy_epoch')::bigint,p_intent->>'task_id');
 return saved;
end $$;

create function public.career_task_account_v1(p_user uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('exists',exists(select 1 from career_watch_kv where user_id=p_user and key='career:account'),'account',(select value from career_watch_kv where user_id=p_user and key='career:account'));
$$;
create function public.career_task_claim_v1(p_user uuid,p_intent text,p_task text,p_lease uuid default null) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if i.intent_id is null then raise exception 'task intent missing';end if;
 if a is null or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (i.binding->>'action'<>'reconcile' and a->'paused'='true'::jsonb) or i.expires_at<=now() or i.state not in ('queued','claimed') then raise exception 'task authority revoked';end if;
 if coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or (i.task_id is not null and i.task_id<>p_task) then raise exception 'task binding mismatch';end if;
 if i.state='claimed' and (p_lease is null or p_lease is distinct from i.lease_token) then raise exception 'task claim busy';end if;
 update career_task_intents_v1 set task_id=p_task,state='claimed',lease_token=coalesce(lease_token,gen_random_uuid()),updated_at=now() where user_id=p_user and intent_id=p_intent returning * into i;
 return jsonb_build_object('version','career_task_intent/v1','intentId',p_intent,'userId',p_user,'taskId',i.task_id,'accountVersion',i.authority_account_version,'privacyEpoch',i.privacy_epoch,'leaseToken',i.lease_token,'binding',i.binding,'request',i.private_input);
end $$;

create function public.career_task_begin_effect_v1(p_user uuid,p_intent text,p_lease uuid,p_task text,p_operation text,p_effect_key text,p_bindings jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;e career_task_effects_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state<>'claimed' or p_lease is distinct from i.lease_token or p_task is distinct from i.task_id or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (p_operation<>'destination_readback' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if coalesce(p_operation,'') not in ('open','form','fill','answers','atReview','armForSubmit','submit','submissionState','destination_readback') or (i.binding->>'action'='prepare' and p_operation in ('armForSubmit','submit')) or (i.binding->>'action'='reconcile' and p_operation<>'destination_readback') then raise exception 'task operation not authorized';end if;
 if coalesce(p_effect_key,'') !~ '^[a-f0-9]{64}$' or p_bindings is distinct from i.binding then raise exception 'task effect binding mismatch';end if;
 if p_operation<>'destination_readback' and exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and state in ('started','uncertain')) then raise exception 'task effect outcome uncertain';end if;
 if i.spent+i.reserved>=i.budget_limit then raise exception 'task budget exhausted';end if;
 insert into career_task_effects_v1(user_id,intent_id,effect_key,task_id,operation,state) values(p_user,p_intent,p_effect_key,p_task,p_operation,'reserved') returning * into e;
 update career_task_intents_v1 set reserved=reserved+1 where user_id=p_user and intent_id=p_intent;
 return jsonb_build_object('token',e.token,'effectKey',e.effect_key,'state',e.state);
end $$;
create function public.career_task_consume_effect_v1(p_user uuid,p_token uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e career_task_effects_v1;i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into e from career_task_effects_v1 where user_id=p_user and token=p_token for update;
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=e.intent_id;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if e.token is null or e.state<>'reserved' or i.state<>'claimed' or i.expires_at<=now() or a is null or i.authority_account_version is distinct from (a->>'version')::bigint or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or (e.operation<>'destination_readback' and a->'paused'='true'::jsonb) then raise exception 'task effect revoked or already consumed';end if;
 update career_task_effects_v1 set state='started' where user_id=p_user and token=p_token;
 return jsonb_build_object('consumed',true,'token',p_token);
end $$;
create function public.career_task_settle_effect_v1(p_user uuid,p_token uuid,p_outcome text,p_before text,p_after text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e career_task_effects_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into e from career_task_effects_v1 where user_id=p_user and token=p_token for update;
 if e.token is null or coalesce(p_outcome,'') not in ('completed','definitely_failed','uncertain') or (p_before is not null and p_before !~ '^[a-f0-9]{64}$') or (p_after is not null and p_after !~ '^[a-f0-9]{64}$') then raise exception 'invalid effect settlement';end if;
 if e.state in ('completed','definitely_failed','uncertain') then
  if e.state is distinct from p_outcome or e.before_sha256 is distinct from p_before or e.after_sha256 is distinct from p_after then raise exception 'effect receipt conflict';end if;
 elsif e.state='started' or (e.state='reserved' and p_outcome='definitely_failed') then
  update career_task_effects_v1 set state=p_outcome,before_sha256=p_before,after_sha256=p_after where user_id=p_user and token=p_token;
  update career_task_intents_v1 set reserved=greatest(reserved-1,0),spent=spent+1 where user_id=p_user and intent_id=e.intent_id;
 else raise exception 'effect was not consumed';end if;
 return jsonb_build_object('state',p_outcome,'token',p_token,'beforeSha256',p_before,'afterSha256',p_after);
end $$;
create function public.career_task_effect_status_v1(p_user uuid,p_token uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select coalesce((select jsonb_build_object('state',state,'token',token,'beforeSha256',before_sha256,'afterSha256',after_sha256) from career_task_effects_v1 where user_id=p_user and token=p_token),'{}'::jsonb);
$$;
create function public.career_task_finish_v1(p_user uuid,p_intent text,p_lease uuid,p_result jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if i.intent_id is null or p_lease is distinct from i.lease_token then raise exception 'task result owner mismatch';end if;
 if a is null or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or i.state not in ('claimed','completed') then return jsonb_build_object('state','revoked');end if;
 if p_result->>'userId' is distinct from p_user::text or p_result->>'id' is distinct from i.task_id or p_result->>'version' is distinct from 'career_task/v1' or octet_length(p_result::text)>1048576 then raise exception 'invalid owned task result';end if;
 if i.state='completed' and i.result is distinct from p_result then raise exception 'task result receipt conflict';end if;
 update career_task_intents_v1 set state='completed',result=p_result,updated_at=now() where user_id=p_user and intent_id=p_intent;
 return jsonb_build_object('state','completed');
end $$;
create function public.career_task_result_v1(p_user uuid,p_task text default null,p_intent text default null) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('task',(select i.result from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account' where i.user_id=p_user and (i.task_id=p_task or i.intent_id=p_intent) and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) order by i.updated_at desc limit 1));
$$;
create function public.career_task_pending_v1() returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'binding',i.binding,'request',i.private_input)),'[]'::jsonb)) from (select i.* from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account' where i.state='queued' and i.expires_at>now() and i.authority_account_version=(a.value->>'version')::bigint and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) and (i.binding->>'action'='reconcile' or a.value->'paused' is distinct from 'true'::jsonb) order by i.created_at limit 50)i;
$$;

revoke all on function public.career_task_control_hook_v1(),public.career_task_turn_commit_v1(jsonb,jsonb),public.career_task_account_v1(uuid),public.career_task_claim_v1(uuid,text,text,uuid),public.career_task_begin_effect_v1(uuid,text,uuid,text,text,text,jsonb),public.career_task_consume_effect_v1(uuid,uuid),public.career_task_settle_effect_v1(uuid,uuid,text,text,text),public.career_task_effect_status_v1(uuid,uuid),public.career_task_finish_v1(uuid,text,uuid,jsonb),public.career_task_result_v1(uuid,text,text),public.career_task_pending_v1() from public,anon,authenticated;
grant execute on function public.career_task_control_hook_v1(),public.career_task_turn_commit_v1(jsonb,jsonb),public.career_task_account_v1(uuid),public.career_task_claim_v1(uuid,text,text,uuid),public.career_task_begin_effect_v1(uuid,text,uuid,text,text,text,jsonb),public.career_task_consume_effect_v1(uuid,uuid),public.career_task_settle_effect_v1(uuid,uuid,text,text,text),public.career_task_effect_status_v1(uuid,uuid),public.career_task_finish_v1(uuid,text,uuid,jsonb),public.career_task_result_v1(uuid,text,text),public.career_task_pending_v1() to service_role;
