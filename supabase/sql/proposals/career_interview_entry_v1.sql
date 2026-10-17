-- SOURCE PROPOSAL ONLY. No production application, seeds or provider calls.
-- Reuses owned KV and the existing atomic career turn commit.
create function public.career_journey_context_read_v1(p_user uuid,p_thread uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c jsonb;a jsonb;r bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select coalesce(value,'{}'::jsonb)into a from career_watch_kv where user_id=p_user and key='career:account';
 select coalesce((state#>>'{career,revision}')::bigint,0)into r from agent_flow_state where thread_id=p_thread and user_id=p_user;
 select value into c from career_watch_kv where user_id=p_user and key='career:journey-context:'||p_thread;
 if c is null or c->>'owner_id' is distinct from p_user::text or c->>'thread_id' is distinct from p_thread::text
 or (c#>>'{binding,account_version}')::bigint is distinct from coalesce((a->>'version')::bigint,0)
 or (c#>>'{binding,thread_revision}')::bigint is distinct from coalesce(r,0)
 or (c#>>'{binding,epoch}')::bigint is distinct from coalesce((a->>'epoch')::bigint,0)
 then return jsonb_build_object('error','journey_context_unavailable');end if;
 return jsonb_build_object('context',c,'paused',coalesce((a->>'paused')::boolean,false));
end $$;

create function public.career_journey_turn_commit_v1(p_base jsonb,p_context jsonb,p_actions jsonb,p_artifact jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;readback jsonb;c jsonb;saved jsonb;act jsonb;old jsonb;action_key text;artid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 -- Replay lookup precedes current-context validation and performs no write.
 select value into old from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key');
 if old is not null then
  saved:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');
  if saved ? 'error' then return saved;end if;
  return jsonb_build_object('response',saved->'replay','replay',true);
 end if;
 readback:=career_journey_context_read_v1(u,t);if readback ? 'error' then return readback;end if;c:=readback->'context';
 if (p_context-'binding'-'captured_at') is distinct from (c-'binding'-'captured_at')
 or (p_context#>>'{binding,account_version}')::bigint is distinct from (p_base->>'p_account_version')::bigint+1
 or (p_context#>>'{binding,thread_revision}')::bigint is distinct from (p_base->>'p_revision')::bigint+1
 or p_context#>>'{binding,epoch}' is distinct from c#>>'{binding,epoch}'
 or p_context#>>'{binding,context_sha256}' !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions)>8
 then raise exception 'invalid journey commit';end if;
 for act in select value from jsonb_array_elements(p_actions) loop
  if act#>>'{proposal,owner_id}' is distinct from u::text or act#>>'{proposal,thread_id}' is distinct from t::text
  or act#>>'{proposal,action_id}' !~ '^ij-[a-f0-9]{24}$'
  or encode(sha256(convert_to(act->>'canonical_args','UTF8')),'hex') is distinct from act#>>'{proposal,input_digest}'
  or (act->>'canonical_args')::jsonb is distinct from act#>'{proposal,args}' then raise exception 'invalid durable proposal';end if;
  action_key:='career:journey-action:'||t||':'||(act#>>'{proposal,action_id}');
  select value into old from career_watch_kv where user_id=u and career_watch_kv.key=action_key;
  if old is not null and old is distinct from act then raise exception 'durable proposal conflict';end if;
 end loop;
 if p_artifact is not null and p_artifact<>'null'::jsonb then
  artid:=(p_artifact->>'id')::uuid;
  if p_artifact->>'owner_id' is distinct from u::text or p_artifact->>'thread_id' is distinct from t::text
  or p_artifact->'binding' is distinct from p_context->'binding'
  or p_artifact->>'mime_type' is distinct from 'text/markdown; charset=utf-8'
  or p_artifact->>'encoding' is distinct from 'utf-8'
  or octet_length(p_artifact->>'content') not between 1 and 262144
  or (p_artifact->>'byte_length')::integer is distinct from octet_length(p_artifact->>'content')
  or p_artifact->>'sha256' is distinct from encode(sha256(convert_to(p_artifact->>'content','UTF8')),'hex')
  or p_artifact->>'action_id' is distinct from p_base#>>'{p_snapshot,stores,interviewJourney,checkpoint,pending_artifact,action_id}'
  or p_artifact->>'sha256' is distinct from p_base#>>'{p_snapshot,stores,interviewJourney,checkpoint,pending_artifact,sha256}'
  then raise exception 'invalid artifact';end if;
 end if;
 saved:=career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 insert into career_watch_kv(user_id,key,value)values(u,'career:journey-context:'||t,p_context)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 for act in select value from jsonb_array_elements(p_actions) loop
  insert into career_watch_kv(user_id,key,value)values(u,'career:journey-action:'||t||':'||(act#>>'{proposal,action_id}'),act)on conflict(user_id,key)do nothing;
 end loop;
 if artid is not null then insert into career_watch_kv(user_id,key,value)values(u,'career:journey-artifact:'||artid,p_artifact);end if;
 return saved;
end $$;

create function public.career_journey_artifact_open_v1(p_user uuid,p_artifact uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;c jsonb;s jsonb;r jsonb;rid uuid:=gen_random_uuid();t uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-artifact:'||p_artifact;
 if a is null then return jsonb_build_object('error','artifact_unavailable');end if;t:=(a->>'thread_id')::uuid;
 c:=career_journey_context_read_v1(p_user,t);
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=t;
 if c ? 'error' or c->'paused'='true'::jsonb or a->'binding' is distinct from c#>'{context,binding}'
 or a->>'owner_id' is distinct from p_user::text or a->>'journey_id' is distinct from s->>'journey_id'
 or a->>'journey_revision' is distinct from s->>'revision'
 or a->>'action_id' is distinct from s#>>'{checkpoint,pending_artifact,action_id}'
 or a->'target_ref' is distinct from s->'target_ref' or a->'resume_ref' is distinct from s->'resume_ref'
 or a->>'sha256' is distinct from encode(sha256(convert_to(a->>'content','UTF8')),'hex')
 or (a->>'byte_length')::integer is distinct from octet_length(a->>'content')
 then return jsonb_build_object('error','artifact_unavailable');end if;
 r:=jsonb_build_object('id',rid,'type','artifact_readback','owner_id',p_user,'thread_id',t,'epoch',a->'epoch','artifact_id',p_artifact,'artifact_version',a->'version','action_id',a->'action_id','input_digest',a->'input_digest','authorized_open',true,'fresh_session',true,'journey_revision',a->'journey_revision','validated_binding',(c#>'{context,binding}')||jsonb_build_object('owner_id',p_user,'thread_id',t,'journey_revision',a->'journey_revision'),'target_ref',a->'target_ref','resume_ref',a->'resume_ref','sha256',a->'sha256');
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:journey-readback:'||rid,jsonb_build_object('receipt',r,'artifact',a));
 return jsonb_build_object('artifact',a,'receipt',r);
end $$;

create function public.career_journey_readback_v1(p_user uuid,p_thread uuid,p_receipt uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb;c jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 c:=career_journey_context_read_v1(p_user,p_thread);if c ? 'error' then return c;end if;
 select value into r from career_watch_kv where user_id=p_user and key='career:journey-readback:'||p_receipt;
 if r is null or r#>>'{receipt,thread_id}' is distinct from p_thread::text or r#>'{artifact,binding}' is distinct from c#>'{context,binding}'then return jsonb_build_object('error','artifact_unavailable');end if;
 return r;
end $$;
revoke all on function public.career_journey_context_read_v1(uuid,uuid),public.career_journey_turn_commit_v1(jsonb,jsonb,jsonb,jsonb),public.career_journey_artifact_open_v1(uuid,uuid),public.career_journey_readback_v1(uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function public.career_journey_context_read_v1(uuid,uuid),public.career_journey_turn_commit_v1(jsonb,jsonb,jsonb,jsonb),public.career_journey_artifact_open_v1(uuid,uuid),public.career_journey_readback_v1(uuid,uuid,uuid)to service_role;
