-- SOURCE-ONLY forward schema proposal; apply after 20261015234000.
-- CLI migration scaffolding is blocked in this executor; Muse must generate
-- its migration filename through a working Supabase CLI before integration.
-- Existing account authority, grants, RLS, memory functions and locks unchanged.
create or replace function public.career_task_turn_commit_v1(p_base jsonb,p_intent jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; a jsonb; saved jsonb; row_intent career_task_intents_v1; k text; action text; payload jsonb;
begin
 u:=(p_base->>'p_user')::uuid;action:=p_intent->>'action';
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or p_intent->>'version' is distinct from 'career_task_intent/v1' then raise exception 'invalid task intent version';end if;
 for k in select jsonb_object_keys(p_intent) loop
  if k not in ('version','intent_id','user_id','thread_id','turn_key','request_hash','action','task_id','event_id','artifact_id','resume_sha256','payload_sha256','profile_sha256','destination','authority_account_version','privacy_epoch','research') then raise exception 'unknown task intent field';end if;
 end loop;
 if coalesce(p_intent->>'intent_id','') !~ '^[a-f0-9]{64}$' or p_intent->>'user_id' is distinct from u::text or p_intent->>'thread_id' is distinct from p_base->>'p_thread' or p_intent->>'turn_key' is distinct from p_base->>'p_key' or p_intent->>'request_hash' is distinct from p_base->>'p_hash' or coalesce(action,'') not in ('prepare','approve','reconcile','research') or coalesce(p_intent->>'event_id','') !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'invalid task intent binding';end if;
 if action<>'research' and p_intent ? 'research' then raise exception 'research binding on another task kind';end if;
 if action='research' and (jsonb_typeof(p_intent->'research') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_intent->'research'))<>2 or p_intent#>>'{research,url}' is distinct from p_intent->>'destination' or coalesce(p_intent->>'destination','') !~ '^https://[a-z0-9.-]+/' or coalesce(length(p_intent#>>'{research,question}'),0) not between 1 and 500 or p_intent->>'task_id' is not null or p_intent->>'artifact_id' is not null or p_intent->>'resume_sha256' is not null or p_intent->>'payload_sha256' is not null or p_intent->>'profile_sha256' is not null) then raise exception 'invalid research intent';end if;
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
 payload:=case when action='research' then jsonb_build_object('eventId',p_intent->>'event_id','research',p_intent->'research') when action='prepare' then jsonb_build_object('eventId',p_intent->>'event_id','posting',p_base#>'{p_snapshot,stores,posting}','artifactId',p_intent->>'artifact_id','resumeSha256',p_intent->>'resume_sha256') else null end;
 insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id)
 values(u,p_intent->>'intent_id',(p_base->>'p_thread')::uuid,p_base->>'p_key',p_base->>'p_hash',encode(sha256(convert_to(u::text||':'||(p_intent->>'event_id'),'UTF8')),'hex'),p_intent,payload,(p_intent->>'authority_account_version')::bigint,(p_intent->>'privacy_epoch')::bigint,p_intent->>'task_id');
 return saved;
end $$;

create or replace function public.career_task_begin_effect_v1(p_user uuid,p_intent text,p_lease uuid,p_task text,p_operation text,p_effect_key text,p_bindings jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;e career_task_effects_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state<>'claimed' or p_lease is distinct from i.lease_token or p_task is distinct from i.task_id or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (p_operation<>'destination_readback' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if coalesce(p_operation,'') not in ('open','form','fill','answers','atReview','armForSubmit','submit','submissionState','destination_readback','read_public_page') or (i.binding->>'action'='research' and p_operation<>'read_public_page') or (i.binding->>'action'<>'research' and p_operation='read_public_page') or (i.binding->>'action'='prepare' and p_operation in ('armForSubmit','submit')) or (i.binding->>'action'='reconcile' and p_operation<>'destination_readback') then raise exception 'task operation not authorized';end if;
 if coalesce(p_effect_key,'') !~ '^[a-f0-9]{64}$' or p_bindings is distinct from i.binding then raise exception 'task effect binding mismatch';end if;
 if p_operation<>'destination_readback' and exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and state in ('started','uncertain')) then raise exception 'task effect outcome uncertain';end if;
 if i.spent+i.reserved>=i.budget_limit then raise exception 'task budget exhausted';end if;
 insert into career_task_effects_v1(user_id,intent_id,effect_key,task_id,operation,state) values(p_user,p_intent,p_effect_key,p_task,p_operation,'reserved') returning * into e;
 update career_task_intents_v1 set reserved=reserved+1 where user_id=p_user and intent_id=p_intent;
 return jsonb_build_object('token',e.token,'effectKey',e.effect_key,'state',e.state);
end $$;
