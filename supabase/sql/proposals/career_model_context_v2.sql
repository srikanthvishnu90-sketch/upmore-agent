-- SOURCE-ONLY read projection; no migration/deployment or allowance is seeded.
-- Only host-stamped, committed receipts enter dialogue. Legacy chat/audit rows
-- cannot silently become active context. Owner-wide barriers cut older drafts.
create function public.career_model_context_read_v2(p_user uuid,p_thread uuid,p_revision bigint,p_version bigint,p_epoch bigint)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare barrier bigint; dialogue jsonb; draft jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch) then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 select coalesce(max((value#>>'{response,meta,career_dialogue,account_version}')::bigint),0) into barrier
 from career_watch_kv where user_id=p_user and key like 'career:turn:%' and value->>'epoch'=p_epoch::text
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2' and value#>>'{response,meta,career_dialogue,barrier}'='true';
 select coalesce(jsonb_agg(x.body order by x.n),'[]'::jsonb) into dialogue from (
 select (value#>>'{response,meta,career_dialogue,account_version}')::bigint n,
 jsonb_build_object('user',left(value#>>'{response,meta,career_dialogue,user_text}',1200),'assistant',left(value#>>'{response,reply}',1800)) body
 from career_watch_kv where user_id=p_user and key like 'career:turn:'||p_thread||':%' and value->>'epoch'=p_epoch::text
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2'
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint>barrier
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint<=p_version
 order by n desc limit 8) x;
 select value#>'{response,meta,career_model,current_draft}' into draft from career_watch_kv
 where user_id=p_user and key like 'career:turn:'||p_thread||':%' and value->>'epoch'=p_epoch::text
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2'
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint>barrier
 and (value#>>'{response,meta,career_dialogue,account_version}')::bigint<=p_version
 and value#>>'{response,meta,career_model,current_draft,status}'='draft_not_sent'
 order by (value#>>'{response,meta,career_dialogue,account_version}')::bigint desc limit 1;
 return jsonb_build_object('ok',true,'user_id',p_user,'thread_id',p_thread,'revision',p_revision,'account_version',p_version,'epoch',p_epoch,'barrier_version',barrier,'dialogue',dialogue,'current_draft',draft);
end $$;
revoke all on function public.career_model_context_read_v2(uuid,uuid,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.career_model_context_read_v2(uuid,uuid,bigint,bigint,bigint) to service_role;

-- Exact replay is free only while no newer owner-wide privacy/correction
-- barrier revokes that response. Old audit text is not a new active reply.
create function public.career_model_replay_check_v2(p_user uuid,p_thread uuid,p_key text,p_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb; r jsonb; barrier bigint; v bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then return jsonb_build_object('ok',false);end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 select value into r from career_watch_kv where user_id=p_user and key='career:turn:'||p_thread||':'||p_key;
 if r->>'hash' is distinct from p_hash or r->>'epoch' is distinct from coalesce(a->>'epoch','0') or r#>>'{response,meta,career_dialogue,version}' is distinct from 'career_dialogue/v2' then return jsonb_build_object('ok',false);end if;
 select coalesce(max((value#>>'{response,meta,career_dialogue,account_version}')::bigint),0) into barrier
 from career_watch_kv where user_id=p_user and key like 'career:turn:%' and value->>'epoch'=coalesce(a->>'epoch','0')
 and value#>>'{response,meta,career_dialogue,version}'='career_dialogue/v2' and value#>>'{response,meta,career_dialogue,barrier}'='true';
 v:=(r#>>'{response,meta,career_dialogue,account_version}')::bigint;
 return jsonb_build_object('ok',coalesce(v>barrier or (v=barrier and r#>>'{response,meta,career_dialogue,barrier}'='true'),false));
end $$;
revoke all on function public.career_model_replay_check_v2(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.career_model_replay_check_v2(uuid,uuid,text,text) to service_role;
