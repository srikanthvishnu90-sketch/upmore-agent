-- Owner-review proposal. Reuses owned KV and paired accounting; no seeds.
create function public.career_journey_action_read_v1(p_user uuid,p_thread uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-action:'||p_thread||':'||p_action;
 if a is null or a#>>'{proposal,owner_id}' is distinct from p_user::text or a#>>'{proposal,thread_id}' is distinct from p_thread::text or a#>>'{proposal,type}' is distinct from 'coach_answer' then return jsonb_build_object('error','action_unavailable');end if;
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('action',a,'execution',e);
end $$;

create function public.career_journey_action_claim_v1(p_user uuid,p_thread uuid,p_action text,p_spec jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare readback jsonb;a jsonb;e jsonb;s jsonb;c jsonb;p jsonb;pol career_model_pair_policy_v2;reason text;eid uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 readback:=career_journey_action_read_v1(p_user,p_thread,p_action);if readback ? 'error' then return readback;end if;
 if readback->'execution'<>'null'::jsonb then return jsonb_build_object('execution',readback->'execution','is_new',false);end if;a:=readback->'action';
 c:=career_journey_context_read_v1(p_user,p_thread);if c ? 'error' then return c;end if;
 select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
 if p_spec->>'request_hash' is distinct from a#>>'{proposal,input_digest}'
 or (p_spec->>'canonical_request')::jsonb is distinct from a#>'{proposal,args,request}'
 or p_spec->>'request_digest' is distinct from encode(sha256(convert_to(p_spec->>'canonical_request','UTF8')),'hex')
 or p_spec->>'generation_payload' is distinct from encode(sha256(convert_to(p_spec->>'generation_wire_body','UTF8')),'hex')
 or (p_spec->>'generation_input')::bigint is distinct from octet_length(p_spec->>'generation_wire_body')
 or p_spec->>'verification_envelope' is distinct from encode(sha256(convert_to(p_spec->>'verification_envelope_text','UTF8')),'hex')
 or octet_length(p_spec::text)>200000 then raise exception 'invalid exact execution specification';end if;
 if c->'paused'='true'::jsonb or s->>'status' is distinct from 'active' or s#>>'{checkpoint,pending_reasoning,action_id}' is distinct from p_action
 or a#>'{proposal,expected_binding,epoch}' is distinct from c#>'{context,binding,epoch}' then reason:='context_changed';end if;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p_spec->>'policy_digest' and active;
 if pol.policy_digest is null or pol.generation_config_digest is distinct from p_spec->>'generation_config_digest'
 or pol.verification_config_digest is distinct from p_spec->>'verification_config_digest'
 or pol.model is distinct from ((p_spec->>'generation_wire_body')::jsonb->>'model')
 or (p_spec->>'generation_output')::bigint is distinct from (((p_spec->>'generation_wire_body')::jsonb->>'max_completion_tokens')::bigint)then reason:='policy_unavailable';end if;
 if reason is null then
  p:=career_model_pair_reserve_v2(p_user,p_thread,p_action,p_spec->>'request_hash',(c#>>'{context,binding,thread_revision}')::bigint,(c#>>'{context,binding,account_version}')::bigint,(c#>>'{context,binding,epoch}')::bigint,p_spec->>'policy_digest',p_spec->>'generation_payload',p_spec->>'verification_envelope',(p_spec->>'generation_input')::bigint,(p_spec->>'generation_output')::bigint,(p_spec->>'verification_input')::bigint,(p_spec->>'verification_output')::bigint);
  if p->>'ok' is distinct from 'true' then reason:=p->>'reason';end if;
 end if;
 e:=jsonb_build_object('execution_id',eid,'owner_id',p_user,'thread_id',p_thread,'action_id',p_action,'epoch',c#>'{context,binding,epoch}','state',case when reason is null then 'claimed' else 'not_sent' end,'reason',reason,'pair_id',case when reason is null then p->'pair_id' else 'null'::jsonb end,'spec',p_spec,'observations','{}'::jsonb,'claimed_at',clock_timestamp());
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:journey-execution:'||p_thread||':'||p_action,e);
 return jsonb_build_object('execution',e,'is_new',true);
end $$;

create function public.career_journey_leg_consume_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid,p_kind text,p_payload text,p_envelope text,p_input bigint,p_output bigint)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed' then return jsonb_build_object('ok',false,'reason','execution_fenced');end if;
 if p_kind='verification'and(p_payload is distinct from encode(sha256(convert_to(e->>'verification_wire_body','UTF8')),'hex')or p_input is distinct from octet_length(e->>'verification_wire_body'))then return jsonb_build_object('ok',false,'reason','checker_payload_not_durable');end if;
 return career_model_leg_consume_v2(p_user,(e->>'pair_id')::uuid,p_kind,p_payload,p_envelope,p_input,p_output);
end $$;
create function public.career_journey_checker_prepare_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid,p_wire text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;a jsonb;wire jsonb;input jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:journey-action:'||p_thread||':'||p_action;
 wire:=p_wire::jsonb;input:=(wire#>>'{messages,-1,content}')::jsonb;
 if e is null or e->>'execution_id' is distinct from p_execution::text or e->>'state' is distinct from 'claimed'
 or octet_length(p_wire)>(e#>>'{spec,verification_input}')::bigint
 or wire->>'model' is distinct from ((e#>>'{spec,generation_wire_body}')::jsonb->>'model')
 or (wire->>'max_completion_tokens')::bigint is distinct from (e#>>'{spec,verification_output}')::bigint
 or input->>'kind' is distinct from 'interview_checker_request/v1' or input->'request' is distinct from a#>'{proposal,args,request}'
 or input->'candidate' is distinct from (e#>>'{observations,generation,text}')::jsonb
 or input->>'request_digest' is distinct from e#>>'{spec,request_digest}'
 or(e->>'verification_wire_body' is not null and e->>'verification_wire_body' is distinct from p_wire)then raise exception 'invalid immutable checker request';end if;
 e:=e||jsonb_build_object('verification_wire_body',p_wire);
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('ok',true);
end $$;

create function public.career_journey_observe_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid,p_kind text,p_receipt jsonb,p_text text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;old jsonb;leg career_model_pair_legs_v2;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 select * into leg from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user and thread_id=p_thread and kind=p_kind;
 if e is null or e->>'execution_id' is distinct from p_execution::text or leg.dispatched_payload is null or p_kind not in('generation','verification')
 or p_receipt->>'request_body_sha256' is distinct from leg.dispatched_payload or p_receipt->>'config_digest' is distinct from leg.config_digest
 or octet_length(coalesce(p_text,''))>40000 then raise exception 'invalid owned provider observation';end if;
 old:=e#>array['observations',p_kind];
 if old is not null and old->'receipt' is distinct from p_receipt then raise exception 'provider observation conflict';end if;
 if p_text is not null and old->>'text' is not null and old->>'text' is distinct from p_text then raise exception 'provider content conflict';end if;
 e:=jsonb_set(e,array['observations',p_kind],jsonb_build_object('receipt',p_receipt,'text',coalesce(p_text,old->>'text')));
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('ok',true);
end $$;
create function public.career_journey_execution_fence_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 if e is null or e->>'execution_id' is distinct from p_execution::text then raise exception 'execution unavailable';end if;
 if e->>'state'='claimed'then
  e:=e||jsonb_build_object('state','unknown');
  update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
  update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);
 end if;
 return jsonb_build_object('execution',e);
end $$;

create function public.career_journey_outcome_record_v1(p_user uuid,p_thread uuid,p_action text,p_execution uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e jsonb;p jsonb;s jsonb;old jsonb;checker jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into e from career_watch_kv where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action for update;
 if e is null or e->>'execution_id' is distinct from p_execution::text or p_result->>'kind'not in('semantic_candidate','reasoning_outcome')or octet_length(p_result::text)>100000 then raise exception 'invalid owned outcome';end if;
 if e->>'pair_id' is not null then p:=career_model_pair_read_v2(p_user,(e->>'pair_id')::uuid);else p:=jsonb_build_object('accounting_state','settled','known_cost_micros',0);end if;
 if p_result->>'budget_state'='settled' and p->>'accounting_state' is distinct from 'settled' then raise exception 'unsettled accounting';end if;
 if p_result->>'kind'='semantic_candidate' then
  checker:=(e#>>'{observations,verification,text}')::jsonb;
  select state#>'{career,stores,interviewJourney}'into s from agent_flow_state where user_id=p_user and thread_id=p_thread;
  if p#>>'{generation,state}' is distinct from 'recorded'or p#>>'{verification,state}' is distinct from 'recorded'or p->>'provider_calls_confirmed' is distinct from '2'
  or p->>'contextCurrent' is distinct from 'true' or s->>'status' is distinct from 'active' or s#>>'{checkpoint,pending_reasoning,action_id}' is distinct from p_action
  or (p_result->>'canonical_candidate')::jsonb is distinct from p_result->'candidate'
  or p_result->>'candidate_sha256' is distinct from encode(sha256(convert_to(p_result->>'canonical_candidate','UTF8')),'hex')
  or p_result->>'rendered_sha256' is distinct from encode(sha256(convert_to(p_result->>'rendered_response','UTF8')),'hex')then raise exception 'untrusted candidate publication';end if;
  if p_result->'candidate' is distinct from (e#>>'{observations,generation,text}')::jsonb
  or checker->>'version' is distinct from 'career_interview_checker/v1'or checker->>'verdict' is distinct from 'accepted'
  or checker->>'request_digest' is distinct from e#>>'{spec,request_digest}'
  or checker->>'candidate_sha256' is distinct from p_result->>'candidate_sha256'
  or checker->>'rendered_sha256' is distinct from p_result->>'rendered_sha256'
  or not coalesce(checker#>'{checks,answer_meaning}'='true'::jsonb and checker#>'{checks,factual_grounding}'='true'::jsonb and checker#>'{checks,role_constraints}'='true'::jsonb and checker#>'{checks,rubric_grounding}'='true'::jsonb and checker#>'{checks,truthfulness}'='true'::jsonb,false)then raise exception 'independent checker proof missing';end if;
 end if;
 old:=e->'result';
 if old=p_result then return jsonb_build_object('execution',e);end if;
 if old is not null and old->>'budget_state'='settled'and not(old->>'kind'='semantic_candidate'and p_result->>'kind'='reasoning_outcome'and p_result->>'failure_kind'='stale_context'and p->>'contextCurrent'='false')then raise exception 'terminal outcome conflict';end if;
 if p_result->>'budget_state'='uncertain'then
  -- Reported transport uncertainty participates immediately in the shared
  -- existing overdue-started stop, while retaining full holds. A later owned
  -- raw receipt may perform the first settlement; no dispatch is repeated.
  update career_model_reservations_v1 set expires_at=least(expires_at,clock_timestamp())where user_id=p_user and state='started'and id in(select ticket_id from career_model_pair_legs_v2 where pair_id=(e->>'pair_id')::uuid and user_id=p_user);
 end if;
 e:=e||jsonb_build_object('state',case when p_result->>'budget_state'='settled'then 'closed'else 'unknown'end,'result',p_result,'result_receipt_id',gen_random_uuid());
 update career_watch_kv set value=e,updated_at=now()where user_id=p_user and key='career:journey-execution:'||p_thread||':'||p_action;
 return jsonb_build_object('execution',e);
end $$;
revoke all on function public.career_journey_action_read_v1(uuid,uuid,text),public.career_journey_action_claim_v1(uuid,uuid,text,jsonb),public.career_journey_leg_consume_v1(uuid,uuid,text,uuid,text,text,text,bigint,bigint),public.career_journey_observe_v1(uuid,uuid,text,uuid,text,jsonb,text),public.career_journey_outcome_record_v1(uuid,uuid,text,uuid,jsonb),public.career_journey_execution_fence_v1(uuid,uuid,text,uuid)from public,anon,authenticated;
grant execute on function public.career_journey_action_read_v1(uuid,uuid,text),public.career_journey_action_claim_v1(uuid,uuid,text,jsonb),public.career_journey_leg_consume_v1(uuid,uuid,text,uuid,text,text,text,bigint,bigint),public.career_journey_observe_v1(uuid,uuid,text,uuid,text,jsonb,text),public.career_journey_outcome_record_v1(uuid,uuid,text,uuid,jsonb),public.career_journey_execution_fence_v1(uuid,uuid,text,uuid)to service_role;
revoke all on function public.career_journey_checker_prepare_v1(uuid,uuid,text,uuid,text)from public,anon,authenticated;
grant execute on function public.career_journey_checker_prepare_v1(uuid,uuid,text,uuid,text)to service_role;
