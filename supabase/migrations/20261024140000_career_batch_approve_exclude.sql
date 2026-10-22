-- P1 TEXT YES (2026-10-22) — PROPOSED, owner applies. Nothing here starts a
-- worker, browser, HTTP request or employer operation.
--
-- "yes but not 2": a texted yes on a batch card may leave named applications
-- of THAT card off. The approve intent gains one optional field, exclude_keys
-- (the posting keys left off, sorted, unique, 1..50). The commit refuses it
-- unless every key is a doorstep application of the stored run whose card hash
-- the yes names, and at least one application remains. Absent, the function
-- behaves exactly as 20261016010000 defined it. The worker's 155 approveRun
-- re-checks the same set at execute time; this is the database's own copy of
-- that rule, so a forged intent cannot leave off something the card never had.
--
-- Same signature, same grants (create or replace keeps them); the body is
-- 20261016010000's with the two exclude_keys checks added.
create or replace function public.career_batch_turn_commit_v1(p_base jsonb,p_intent jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; a jsonb; saved jsonb; row_intent career_batch_intents_v1; k text; action text; run_row career_batch_runs_v1; ex jsonb; door text[]; n_ex int;
begin
 u:=(p_base->>'p_user')::uuid;action:=p_intent->>'action';
 if p_intent is null or jsonb_typeof(p_intent)<>'object' or p_intent->>'version' is distinct from 'career_batch_intent/v1' then raise exception 'invalid batch intent version';end if;
 for k in select jsonb_object_keys(p_intent) loop
  if k not in ('version','intent_id','user_id','thread_id','turn_key','request_hash','action','event_id','run_id','family_text','count','card_sha256','exclude_keys','run','authority_account_version','privacy_epoch') then raise exception 'unknown batch intent field';end if;
 end loop;
 if coalesce(p_intent->>'intent_id','') !~ '^[a-f0-9]{64}$' or p_intent->>'user_id' is distinct from u::text or p_intent->>'thread_id' is distinct from p_base->>'p_thread' or p_intent->>'turn_key' is distinct from p_base->>'p_key' or p_intent->>'request_hash' is distinct from p_base->>'p_hash' or coalesce(action,'') not in ('prepare','approve') or coalesce(p_intent->>'event_id','') !~ '^[A-Za-z0-9_-]{1,128}$' or coalesce(p_intent->>'run_id','') !~ '^batch-[A-Za-z0-9-]{4,96}$' then raise exception 'invalid batch intent binding';end if;
 if action='prepare' and (p_intent->>'event_id' is distinct from 'prepare-'||(p_intent->>'run_id') or jsonb_typeof(p_intent->'run')<>'object' or p_intent#>>'{run,id}' is distinct from p_intent->>'run_id' or p_intent#>>'{run,userId}' is distinct from u::text or p_intent#>>'{run,status}' is distinct from 'queued_prepare' or p_intent#>>'{run,familyText}' is distinct from p_intent->>'family_text') then raise exception 'invalid batch preparation intent';end if;
 if action='prepare' and p_intent ? 'exclude_keys' then raise exception 'invalid batch preparation intent';end if;
 if action='approve' then
  if coalesce(p_intent->>'card_sha256','') !~ '^([a-f0-9]{64}|fnv1a-[a-f0-9]{1,16})$' or p_base->>'p_input' is distinct from 'Approve batch '||(p_intent->>'run_id') then raise exception 'invalid batch approval';end if;
  select * into run_row from career_batch_runs_v1 where user_id=u and run_id=p_intent->>'run_id';
  if run_row.run_id is null or run_row.state is distinct from 'awaiting_approval' or run_row.run->>'cardSha256' is distinct from p_intent->>'card_sha256' then raise exception 'batch card mismatch';end if;
  if p_intent ? 'exclude_keys' then
   ex:=p_intent->'exclude_keys';
   if jsonb_typeof(ex)<>'array' or jsonb_array_length(ex) not between 1 and 50
      or exists(select 1 from jsonb_array_elements(ex) e where jsonb_typeof(e)<>'string')
      or (select count(distinct e) from jsonb_array_elements_text(ex) e)<>jsonb_array_length(ex) then raise exception 'invalid batch exclusion';end if;
   select coalesce(array_agg(s),'{}') into door from jsonb_array_elements_text(coalesce(run_row.run->'selected','[]'::jsonb)) s where run_row.run#>>array['apps',s,'stage']='doorstep';
   select count(*) into n_ex from jsonb_array_elements_text(ex) e where e=any(door);
   if n_ex<>jsonb_array_length(ex) or n_ex>=coalesce(array_length(door,1),0) then raise exception 'batch exclusion not on card';end if;
  end if;
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
