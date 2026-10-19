-- WO-027: an erase ("forget my career profile", the host's career_profile_erased turn) also clears the account's
-- timeline (career_events, 20261020120000_career_events.sql), as it clears the account record, the watch state and the
-- reminders. Deleting the account already removes the rows (on delete cascade).
--
-- This migration changes career_host_commit in exactly one way: the erase branch deletes the person's career_events.
-- Everything else is byte-identical to 20261016120000_career_account_stated_facts.sql (tests/architect/wo-027-timeline.test.ts
-- compares the two files with the one line taken out; tests/db/career_events.test.sql runs the erase).
create or replace function public.career_host_commit(p_user uuid,p_thread uuid,p_key text,p_hash text,p_revision bigint,p_account_version bigint,p_snapshot jsonb,p_patch jsonb,p_input text,p_response jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb; old_snapshot jsonb; receipt jsonb; wp jsonb; epoch bigint; next_snapshot jsonb; patch_key text;
begin
 if p_user is null or p_thread is null or p_key is null or p_hash is null or p_key !~ '^[A-Za-z0-9_-]{1,128}$' or p_hash !~ '^[a-f0-9]{64}$' or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or octet_length(p_snapshot::text)>1048576
  or p_input is null or length(p_input)>20000 or p_response is null or jsonb_typeof(p_response->'reply') is distinct from 'string' or octet_length(p_response::text)>1048576 or jsonb_typeof(coalesce(p_patch,'{}'::jsonb))<>'object' or p_snapshot#>>'{scope,userId}' is distinct from p_user::text or jsonb_typeof(p_response)<>'object' or p_response->>'thread_id' is distinct from p_thread::text then raise exception 'invalid host commit';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 perform 1 from agent_threads where id=p_thread and user_id=p_user for update;
 if not found or exists(select 1 from agent_flow_state where thread_id=p_thread and user_id is distinct from p_user) then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';a:=coalesce(a,'{"version":0,"epoch":0}'::jsonb);epoch:=coalesce((a->>'epoch')::bigint,0);
 select value into receipt from career_watch_kv where user_id=p_user and key='career:turn:'||p_thread||':'||p_key;
 if receipt is not null then
  if receipt->>'hash'<>p_hash then return jsonb_build_object('error','turn_key_conflict');end if;
  if coalesce((receipt->>'epoch')::bigint,0)<>epoch or (receipt->'response' is null or receipt->'response'='null'::jsonb) then return jsonb_build_object('error','privacy_epoch_changed');end if;
  return jsonb_build_object('response',receipt->'response','replay',true);
 end if;
 if coalesce((a->>'version')::bigint,0)<>p_account_version then return jsonb_build_object('error','revision_conflict');end if;
 select state->'career' into old_snapshot from agent_flow_state where thread_id=p_thread and user_id=p_user for update;
 if coalesce((old_snapshot->>'revision')::bigint,0)<>p_revision then return jsonb_build_object('error','revision_conflict');end if;
 for patch_key in select jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) loop
  if patch_key not in ('paused','preferred_locations','erase','stated_facts') then raise exception 'invalid account patch';end if;
 end loop;
 if p_patch ? 'preferred_locations' and (jsonb_typeof(p_patch->'preferred_locations')<>'array' or jsonb_array_length(p_patch->'preferred_locations')<>1 or length(p_patch#>>'{preferred_locations,0}') not between 1 and 100) then raise exception 'invalid location';end if;
 if p_patch ? 'paused' and jsonb_typeof(p_patch->'paused')<>'boolean' then raise exception 'invalid pause';end if;
 if p_patch ? 'erase' and p_patch->'erase'<>'true'::jsonb then raise exception 'invalid erasure';end if;
 if p_patch ? 'stated_facts' and (
   jsonb_typeof(p_patch->'stated_facts')<>'object'
   or jsonb_typeof(p_patch#>'{stated_facts,facts}') is distinct from 'array'
   or jsonb_array_length(coalesce(p_patch#>'{stated_facts,facts}','[]'::jsonb))>40
   or octet_length((p_patch->'stated_facts')::text)>32768
   or exists(select 1 from jsonb_array_elements(coalesce(p_patch#>'{stated_facts,facts}','[]'::jsonb)) f
       where jsonb_typeof(f)<>'object'
         or f->>'kind' is null
         or f->>'kind' not in ('year','majors','geography','target_firm','level','excluded_level','school','experience','tone')
         or coalesce(length(f->>'value'),0) not between 1 and 200
         or (f->'evidence' is not null and f->'evidence'<>'null'::jsonb and (jsonb_typeof(f->'evidence') is distinct from 'string' or coalesce(length(f->>'evidence'),0)>200))
     )
   or (p_patch#>'{stated_facts,offer}' is not null and jsonb_typeof(p_patch#>'{stated_facts,offer}') not in ('object','null'))
   or (jsonb_typeof(p_patch#>'{stated_facts,offer}')='object' and (
       (p_patch#>>'{stated_facts,offer,firm}' is not null and length(p_patch#>>'{stated_facts,offer,firm}')>120)
       or (p_patch#>>'{stated_facts,offer,deadline}' is not null and length(p_patch#>>'{stated_facts,offer,deadline}')>60)
       or (p_patch#>>'{stated_facts,offer,role}' is not null and length(p_patch#>>'{stated_facts,offer,role}')>120)
       or (p_patch#>'{stated_facts,offer,amount}' is not null and jsonb_typeof(p_patch#>'{stated_facts,offer,amount}') not in ('number','null'))
     ))
 ) then raise exception 'invalid stated facts';end if;
 if p_patch->'erase'='true'::jsonb then
  epoch:=epoch+1;
  update agent_flow_state set state=jsonb_set(coalesce(state,'{}'::jsonb),'{career}',jsonb_build_object('v',1,'scope',jsonb_build_object('userId',p_user),'revision',coalesce((state#>>'{career,revision}')::bigint,0)+1,'stores',jsonb_build_object('globalPause',jsonb_build_object('set',true,'source','account_control')))),updated_at=now() where user_id=p_user;
  delete from career_watch_kv where user_id=p_user and key not like 'career:turn:%';
  update career_watch_kv set value=jsonb_set(value,'{response}','null'::jsonb),updated_at=now() where user_id=p_user and key like 'career:turn:%';
  update career_reminder_outbox set payload=null,record=null,status='cancelled',updated_at=now() where user_id=p_user;
  delete from career_events where user_id=p_user;
  a:=jsonb_build_object('epoch',epoch,'paused',true,'version',p_account_version);
 end if;
 a:=a||coalesce(case when p_patch->'erase'='true'::jsonb then (p_patch-'erase')-'stated_facts' else p_patch-'erase' end,'{}'::jsonb)||jsonb_build_object('version',p_account_version+1,'epoch',epoch);
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:account',a)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 if a->'paused'='true'::jsonb then update career_reminder_outbox set status='cancelled',updated_at=now() where user_id=p_user and status in ('pending','claimed','uncertain');end if;
 next_snapshot:=(case when p_patch->'erase'='true'::jsonb then jsonb_build_object('v',1,'scope',jsonb_build_object('userId',p_user),'stores',jsonb_build_object('globalPause',jsonb_build_object('set',true,'source','account_control'))) else p_snapshot end)||jsonb_build_object('revision',p_revision+1,'privacy_epoch',epoch);
 wp:=next_snapshot#>array['stores','alertWatchState','career:watch-profile:'||p_user];
 if wp is not null then
  if wp->>'user_id' is distinct from p_user::text then raise exception 'watch owner mismatch';end if;
  insert into career_watch_kv(user_id,key,value)values(p_user,'career:watch-profile:'||p_user,wp)on conflict(user_id,key)do update set value=excluded.value,updated_at=now();
 end if;
 insert into agent_flow_state(thread_id,user_id,state,updated_at)values(p_thread,p_user,jsonb_build_object('career',next_snapshot),now())
 on conflict(thread_id)do update set state=jsonb_set(coalesce(agent_flow_state.state,'{}'::jsonb),'{career}',next_snapshot),updated_at=now() where agent_flow_state.user_id=p_user;
 insert into agent_messages(thread_id,role,content)values(p_thread,'user',p_input);
 insert into agent_messages(thread_id,role,content,meta)values(p_thread,'assistant',p_response->>'reply',coalesce(p_response->'meta','{}'::jsonb)||jsonb_build_object('career',true,'career_turn_key',p_key));
 update career_reminder_outbox set seen_at=now() where user_id=p_user and status='delivered' and reminder_id in(select x->>'reminder_id' from jsonb_array_elements(coalesce(p_response->'reminders','[]'::jsonb))x);
 insert into career_watch_kv(user_id,key,value)values(p_user,'career:turn:'||p_thread||':'||p_key,jsonb_build_object('hash',p_hash,'epoch',epoch,'response',p_response));
 return jsonb_build_object('response',p_response);
end $$;
revoke all on function public.career_host_commit(uuid,uuid,text,text,bigint,bigint,jsonb,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.career_host_commit(uuid,uuid,text,text,bigint,bigint,jsonb,jsonb,text,jsonb) to service_role;
