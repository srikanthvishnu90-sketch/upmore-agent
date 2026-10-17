-- Owner-review proposal only. No seeds or production application.
create function public.career_journey_context_load_v2(p_user uuid,p_thread uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c jsonb;r jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into c from career_watch_kv where user_id=p_user and key='career:journey-context:'||p_thread;
 if c is null then return jsonb_build_object('context',null);end if;
 r:=career_journey_context_read_v1(p_user,p_thread);return r;
end $$;
create function public.career_journey_context_commit_v1(p_base jsonb,p_expected_context_sha text,p_context jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;old jsonb;a jsonb;saved jsonb;source jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select value into old from career_watch_kv where user_id=u and key='career:turn:'||t||':'||(p_base->>'p_key');
 if old is not null then
  saved:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');if saved ? 'error' then return saved;end if;
  return jsonb_build_object('response',saved->'replay','replay',true);
 end if;
 select value into a from career_watch_kv where user_id=u and key='career:account';
 select value into old from career_watch_kv where user_id=u and key='career:journey-context:'||t;
 if old#>>'{binding,context_sha256}' is distinct from p_expected_context_sha then return jsonb_build_object('error','journey_context_unavailable');end if;
 if p_context->>'owner_id' is distinct from u::text or p_context->>'thread_id' is distinct from t::text
 or p_context->>'contract_version' is distinct from 'career_journey_context/v1' or octet_length(p_context::text)>524288
 or (p_context#>>'{binding,account_version}')::bigint is distinct from (p_base->>'p_account_version')::bigint+1
 or (p_context#>>'{binding,thread_revision}')::bigint is distinct from (p_base->>'p_revision')::bigint+1
 or (p_context#>>'{binding,epoch}')::bigint is distinct from coalesce((a->>'epoch')::bigint,0)
 or exists(select 1 from jsonb_array_elements((p_context->'facts')||(p_context->'sources')) x where x#>>'{scope,owner_id}' is distinct from u::text or(x#>>'{scope,kind}'='thread'and x#>>'{scope,thread_id}' is distinct from t::text))
 then raise exception 'invalid owned context write';end if;
 for source in select value from jsonb_array_elements(p_context->'sources') loop
  if source->>'availability'='available' and source->>'source_sha256' is distinct from encode(sha256(convert_to(source->>'content','UTF8')),'hex')then raise exception 'invalid source bytes';end if;
 end loop;
 saved:=career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(p_base->>'p_revision')::bigint,(p_base->>'p_account_version')::bigint,p_base->'p_snapshot',p_base->'p_patch',p_base->>'p_input',p_base->'p_response');
 if saved ? 'error' then return saved;end if;
 insert into career_watch_kv(user_id,key,value)values(u,'career:journey-context:'||t,p_context)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 return saved;
end $$;
revoke all on function public.career_journey_context_load_v2(uuid,uuid),public.career_journey_context_commit_v1(jsonb,text,jsonb)from public,anon,authenticated;
grant execute on function public.career_journey_context_load_v2(uuid,uuid),public.career_journey_context_commit_v1(jsonb,text,jsonb)to service_role;
