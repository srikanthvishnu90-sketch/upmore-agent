-- FEATURE 9 (account memory; DIAGNOSIS-2026-10-25 2.6, 2.7, fix F5): the person's profile and tracker live on the
-- account, not on one thread.
--
-- The account record (career_watch_kv, key 'career:account') gains one patch key: 'memory', written by the host seam
-- (supabase/functions/_shared/career_host.js extractSnapshot) only when it changed:
--   {v: 1, profile: <the career profile: confirmed and draft facts with their provenance, basics, preferences; no
--    thread frames>, tracker: <the application tracker rows; no _careerThread mirror>, updated_at}
-- and read back at every turn's start (career_host_load already returns the whole account record), so a resume
-- confirmed or an application logged in one thread is on the record in a new thread and on a later day. Per-thread
-- state (agent_flow_state.state->career) keeps the conversation's frames and a copy of the profile for the readers that
-- look there (the executor, the extension sync, the cloud engine).
--
-- career_host_commit changes in exactly three ways from 20261021050000_career_brief_digest.sql:
--   1. 'memory' joins the patch-key whitelist;
--   2. its shape is validated: an object of v/profile/tracker/updated_at, at most 512 KB, profile and tracker objects
--      or null, profile.facts and tracker.rows arrays, and no thread
--      mirror inside the tracker;
--   3. an erase commit strips it before the merge, like stated_facts: the erase rebuilds the account from nothing and
--      a same-patch memory must never resurrect what was just erased.
-- Every existing guard stands unchanged: the per-person advisory lock, the account-version fence (two threads that
-- loaded the same version cannot both commit: the second gets revision_conflict), the thread revision, the privacy
-- epoch and receipts, the erase purge.
--
-- career_account_authority_mark (20261022150000) gains one authority key, as that migration's follow-up note asked:
-- a change to the CONFIRMED profile facts on the account moves authority_version (an approval stamped before the
-- person's confirmed facts changed is no longer current). Drafts, the tracker and thread frames never do.
--
-- Idempotent: create or replace only.

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
  if patch_key not in ('paused','preferred_locations','erase','stated_facts','memory') then raise exception 'invalid account patch';end if;
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
 if p_patch ? 'memory' and (
   jsonb_typeof(p_patch->'memory')<>'object'
   or octet_length((p_patch->'memory')::text)>524288
   or exists(select 1 from jsonb_object_keys(p_patch->'memory') k where k not in ('v','profile','tracker','updated_at'))
   or (p_patch#>'{memory,v}' is not null and p_patch#>'{memory,v}'<>'1'::jsonb)
   or (p_patch#>'{memory,profile}' is not null and jsonb_typeof(p_patch#>'{memory,profile}') not in ('object','null'))
   or (jsonb_typeof(p_patch#>'{memory,profile}')='object' and p_patch#>'{memory,profile,facts}' is not null and jsonb_typeof(p_patch#>'{memory,profile,facts}')<>'array')
   or (p_patch#>'{memory,tracker}' is not null and jsonb_typeof(p_patch#>'{memory,tracker}') not in ('object','null'))
   or (jsonb_typeof(p_patch#>'{memory,tracker}')='object' and p_patch#>'{memory,tracker,rows}' is not null and jsonb_typeof(p_patch#>'{memory,tracker,rows}')<>'array')
   or (jsonb_typeof(p_patch#>'{memory,tracker}')='object' and p_patch#>'{memory,tracker}' ? '_careerThread')
 ) then raise exception 'invalid account memory';end if;
 if p_patch->'erase'='true'::jsonb then
  epoch:=epoch+1;
  update agent_flow_state set state=jsonb_set(coalesce(state,'{}'::jsonb),'{career}',jsonb_build_object('v',1,'scope',jsonb_build_object('userId',p_user),'revision',coalesce((state#>>'{career,revision}')::bigint,0)+1,'stores',jsonb_build_object('globalPause',jsonb_build_object('set',true,'source','account_control')))),updated_at=now() where user_id=p_user;
  delete from career_watch_kv where user_id=p_user and key not like 'career:turn:%';
  update career_watch_kv set value=jsonb_set(value,'{response}','null'::jsonb),updated_at=now() where user_id=p_user and key like 'career:turn:%';
  update career_reminder_outbox set payload=null,record=null,status='cancelled',updated_at=now() where user_id=p_user;
  delete from career_events where user_id=p_user;
  delete from career_interviews where user_id=p_user;
  delete from career_digest_prefs where user_id=p_user;
  a:=jsonb_build_object('epoch',epoch,'paused',true,'version',p_account_version);
 end if;
 a:=a||coalesce(case when p_patch->'erase'='true'::jsonb then ((p_patch-'erase')-'stated_facts')-'memory' else p_patch-'erase' end,'{}'::jsonb)||jsonb_build_object('version',p_account_version+1,'epoch',epoch);
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


create or replace function public.career_account_authority_mark() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare changed boolean;
begin
 if new.key<>'career:account' then return new; end if;
 if tg_op='INSERT' then
  new.value:=new.value||jsonb_build_object('authority_version',coalesce((new.value->>'version')::bigint,0));
  return new;
 end if;
 changed:=coalesce(new.value->'paused','false'::jsonb) is distinct from coalesce(old.value->'paused','false'::jsonb)
  or coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0)
  or new.value->'stated_facts' is distinct from old.value->'stated_facts'
  or new.value->'preferred_locations' is distinct from old.value->'preferred_locations'
  or jsonb_path_query_array(coalesce(new.value,'{}'::jsonb),'$.memory.profile.facts[*] ? (@.status == "confirmed")')
     is distinct from jsonb_path_query_array(coalesce(old.value,'{}'::jsonb),'$.memory.profile.facts[*] ? (@.status == "confirmed")');
 if changed then
  new.value:=new.value||jsonb_build_object('authority_version',coalesce((new.value->>'version')::bigint,0));
 else
  new.value:=new.value||jsonb_build_object('authority_version',coalesce((old.value->>'authority_version')::bigint,0));
 end if;
 return new;
end $$;
