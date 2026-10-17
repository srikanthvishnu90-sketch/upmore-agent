-- SOURCE ONLY. After batch and applicant-ingress proposals. No external action.
-- Public source snapshots and explicit profile reviews reuse existing owner
-- account/epoch, career_host_commit and task/batch authority, never a second ledger.
create table public.career_application_searches_v1(
 user_id uuid not null references auth.users(id)on delete cascade,search_id uuid not null default gen_random_uuid(),
 thread_id uuid not null references agent_threads(id),request_key text not null,request_hash text not null,
 account_version bigint not null,privacy_epoch bigint not null,ask text not null,requested integer not null check(requested between 1 and 100),
 resume jsonb not null,results jsonb not null,source_health jsonb not null,role_interests jsonb not null,
 selected_batch uuid,selected_tasks jsonb,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '5 minutes',
 primary key(user_id,search_id),unique(user_id,thread_id,request_key),
 foreign key(user_id,selected_batch)references career_application_batches_v1(user_id,batch_id)on delete cascade,
 check(jsonb_typeof(results)='array' and jsonb_array_length(results)<=200),check(octet_length(results::text)<=4194304)
);
create table public.career_application_profile_reviews_v1(
 user_id uuid not null references auth.users(id)on delete cascade,thread_id uuid not null references agent_threads(id),
 request_key text not null,request_hash text not null,review_sha256 text not null,account_version bigint not null,privacy_epoch bigint not null,
 profile jsonb not null,fields jsonb not null,expires_at timestamptz not null default now()+interval '10 minutes',
 primary key(user_id,review_sha256),unique(user_id,thread_id,request_key),check(octet_length(profile::text)<=1048576)
);
do $$declare n text;begin
 foreach n in array array['career_application_searches_v1','career_application_profile_reviews_v1']loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant select,insert,update,delete on public.%I to service_role',n);
  execute format('create policy backend_only on public.%I for all to service_role using(true)with check(true)',n);
 end loop;
end $$;
create function public.career_application_chat_context_v1(p_user uuid,p_thread uuid,p_key text,p_hash text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare loaded jsonb;resume jsonb;s career_application_searches_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then return jsonb_build_object('error','owned_thread_missing');end if;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a->'paused'='true'::jsonb then return jsonb_build_object('error','application_context_revoked');end if;
 loaded:=career_host_load(p_user,p_thread,p_key,p_hash);if loaded?'error'then return loaded;end if;
 if loaded?'replay'then return jsonb_build_object('version','career_application_context/v1','loaded',loaded);end if;
 resume:=career_applicant_status_v1(p_user,p_thread);
 if resume?'error'and resume->>'error'<>'APPLICANT_STATUS_REVOKED'then return resume;end if;
 select * into s from career_application_searches_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if s.search_id is not null and s.request_hash is distinct from p_hash then return jsonb_build_object('error','turn_key_conflict');end if;
 if s.search_id is not null and(s.account_version is distinct from (a->>'version')::bigint or s.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0))then return jsonb_build_object('error','application_context_revoked');end if;
 return jsonb_build_object('version','career_application_context/v1','loaded',loaded,'resume',resume->'applicant','searchReplay',case when s.search_id is null then null else to_jsonb(s)end);
end $$;
create function public.career_application_search_store_v1(p_user uuid,p_thread uuid,p_key text,p_hash text,p_version bigint,p_epoch bigint,p_ask text,p_limit integer,p_results jsonb,p_health jsonb,p_interests jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;resume jsonb;s career_application_searches_v1;r jsonb;expected text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb or (a->>'version')::bigint is distinct from p_version or coalesce((a->>'epoch')::bigint,0)is distinct from p_epoch or not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then return jsonb_build_object('error','application_context_revoked');end if;
 if coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or p_ask is null or length(p_ask)>4000 or p_limit not between 1 and 100 or jsonb_typeof(p_results)is distinct from 'array'or jsonb_array_length(p_results)>least(200,p_limit*2)or (select count(distinct v->>'taskId')from jsonb_array_elements(p_results)v)<>jsonb_array_length(p_results)or jsonb_typeof(p_health)is distinct from 'array'or jsonb_typeof(p_interests)is distinct from 'array'then raise exception 'invalid application search';end if;
 select * into s from career_application_searches_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if s.search_id is not null then if s.request_hash is distinct from p_hash then return jsonb_build_object('error','turn_key_conflict');end if;return to_jsonb(s);end if;
 resume:=career_applicant_status_v1(p_user,p_thread);if resume->>'status'is distinct from 'confirmed'then return jsonb_build_object('error','confirmed_resume_required');end if;
 for r in select *from jsonb_array_elements(p_results)loop
  expected:=substr(encode(sha256(convert_to(career_applicant_canonical_v1(jsonb_build_array(p_user::text,r#>>'{posting,canonicalKey}')),'UTF8')),'hex'),1,32);
  if r->>'taskId'is distinct from expected or r#>>'{posting,status}'is distinct from 'open'or coalesce(r#>>'{source,sha256}','')!~'^[a-f0-9]{64}$'or coalesce(r#>>'{source,provenance}','')not in('public_ats_snapshot/v1','synthetic_fixture/v1')or r#>>'{source,observedAt}'is null or (r#>>'{source,observedAt}')::timestamptz<clock_timestamp()-interval '5 minutes'or (r#>>'{source,observedAt}')::timestamptz>clock_timestamp()+interval '30 seconds'then raise exception 'invalid sourced application candidate';end if;
 end loop;
 insert into career_application_searches_v1(user_id,thread_id,request_key,request_hash,account_version,privacy_epoch,ask,requested,resume,results,source_health,role_interests)
 values(p_user,p_thread,p_key,p_hash,p_version,p_epoch,p_ask,p_limit,resume->'applicant',p_results,p_health,p_interests)returning *into s;return to_jsonb(s);
end $$;
create function public.career_application_search_prepare_v1(p_user uuid,p_thread uuid,p_key text,p_search uuid,p_tasks jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;s career_application_searches_v1;resume jsonb;r jsonb;t text;id text;event text;binding jsonb;request jsonb;result jsonb;old career_task_intents_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select *into s from career_application_searches_v1 where user_id=p_user and search_id=p_search and thread_id=p_thread for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if s.search_id is null or a is null or a->'paused'='true'::jsonb or s.account_version is distinct from (a->>'version')::bigint or s.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0)or not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then raise exception 'application context revoked';end if;
 if jsonb_typeof(p_tasks)is distinct from 'array'or jsonb_array_length(p_tasks)not between 1 and 100 or (select count(distinct v)from jsonb_array_elements_text(p_tasks)v)<>jsonb_array_length(p_tasks)then raise exception 'invalid selected application tasks';end if;
 if s.selected_batch is not null then if s.selected_tasks is distinct from p_tasks then raise exception 'application selection conflict';end if;return career_application_batch_control_v1(p_user,p_thread,p_key,'status',jsonb_build_object('batchId',s.selected_batch));end if;
 if s.expires_at<=clock_timestamp()then raise exception 'application source snapshot expired';end if;
 resume:=career_applicant_status_v1(p_user,p_thread);if resume->>'status'is distinct from 'confirmed'or resume#>>'{applicant,artifactId}'is distinct from s.resume->>'artifactId'or resume#>>'{applicant,versionId}'is distinct from s.resume->>'versionId'or resume#>>'{applicant,sha256}'is distinct from s.resume->>'sha256'then raise exception 'application resume changed';end if;
 for t in select jsonb_array_elements_text(p_tasks)loop
  select v into r from jsonb_array_elements(s.results)v where v->>'taskId'=t;
  if r is null then raise exception 'owned selected application missing';end if;
  select anchor.*into old from career_task_intents_v1 anchor where anchor.user_id=p_user and anchor.task_id=t and anchor.privacy_epoch=s.privacy_epoch and anchor.binding->>'action'='prepare'and anchor.private_input->'posting'is not null order by anchor.created_at,anchor.intent_id limit 1;
  if old.intent_id is not null and(old.private_input->'posting'is distinct from r->'posting'or old.binding->>'resume_sha256'is distinct from s.resume->>'sha256')then raise exception 'application original preparation changed';end if;
  if old.intent_id is null then
   id:=encode(sha256(convert_to(career_applicant_canonical_v1(jsonb_build_array(p_user::text,p_search::text,t,'source')),'UTF8')),'hex');event:='discovery_'||substr(id,1,48);
   binding:=jsonb_build_object('version','career_task_intent/v1','intent_id',id,'user_id',p_user,'thread_id',p_thread,'turn_key',event,'request_hash',s.request_hash,'action','prepare','task_id',t,'event_id',event,'artifact_id',s.resume->>'artifactId','resume_sha256',s.resume->>'sha256','destination',r#>>'{posting,url}','authority_account_version',s.account_version,'privacy_epoch',s.privacy_epoch);
   request:=jsonb_build_object('eventId',event,'posting',r->'posting','artifactId',s.resume->>'artifactId','resumeSha256',s.resume->>'sha256');
   insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,state,expires_at)
   values(p_user,id,p_thread,event,s.request_hash,id,binding,request,s.account_version,s.privacy_epoch,t,'completed',clock_timestamp()+interval '10 minutes');
  end if;
 end loop;
 result:=career_application_batch_control_v1(p_user,p_thread,p_key,'create',jsonb_build_object('taskIds',p_tasks));
 update career_application_searches_v1 set selected_batch=(result->>'batchId')::uuid,selected_tasks=p_tasks where user_id=p_user and search_id=p_search;
 return result;
end $$;
create function public.career_application_batch_lookup_v1(p_user uuid,p_thread uuid,p_review text default null,p_task text default null)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;b career_application_batches_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)or a is null or a->'paused'='true'::jsonb then raise exception 'application context revoked';end if;
 select *into b from career_application_batches_v1 x where x.user_id=p_user and x.thread_id=p_thread and x.account_version=(a->>'version')::bigint and x.privacy_epoch=coalesce((a->>'epoch')::bigint,0)
 and(p_review is null or exists(select 1 from career_application_batch_reviews_v1 r where r.user_id=p_user and r.batch_id=x.batch_id and r.review_sha256=p_review))
 and(p_task is null or exists(select 1 from career_application_batch_roles_v1 r where r.user_id=p_user and r.batch_id=x.batch_id and r.task_id=p_task))order by x.created_at desc,x.batch_id limit 1;
 return jsonb_build_object('batchId',b.batch_id);
end $$;
create function public.career_application_task_context_v1(p_user uuid,p_intent text,p_lease uuid,p_task text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;i career_task_intents_v1;s career_application_searches_v1;r jsonb;profile jsonb;f jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';select *into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 if a is null or a->'paused'='true'::jsonb or i.state is distinct from 'claimed'or i.task_id is distinct from p_task or i.lease_token is distinct from p_lease or i.expires_at<=clock_timestamp()or i.authority_account_version is distinct from (a->>'version')::bigint or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0)or(i.claim_worker is not null and(i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()))or coalesce(i.binding->>'action','')not in('prepare','approve')then raise exception 'application task context revoked';end if;
 select *into s from career_application_searches_v1 where user_id=p_user and thread_id=i.thread_id and selected_batch=(i.private_input#>>'{batch,batchId}')::uuid and account_version=i.authority_account_version and privacy_epoch=i.privacy_epoch;
 if s.search_id is null then return jsonb_build_object('context',null);end if;
 perform career_application_batch_context_v1(p_user,i.thread_id,s.selected_batch);
 select v into r from jsonb_array_elements(coalesce(s.current_results,s.results))v where v->>'taskId'=p_task;
 select state->'career'into f from agent_flow_state where user_id=p_user and thread_id=i.thread_id;profile:=f#>'{stores,profile}';
 if r is null or profile is null or f#>>'{scope,userId}'is distinct from p_user::text or coalesce((f->>'privacy_epoch')::bigint,-1)is distinct from i.privacy_epoch then raise exception 'application profile context revoked';end if;
 return jsonb_build_object('context',jsonb_build_object('userId',p_user,'accountVersion',i.authority_account_version,'privacyEpoch',i.privacy_epoch,'taskId',p_task,'careerProfile',profile,'ask',s.ask,'roleInterests',s.role_interests,'currentPosting',jsonb_build_object('posting',r->'posting','observedAt',r#>>'{source,observedAt}','sourceSha256',r#>>'{source,sha256}')));
end $$;
create function public.career_application_profile_review_v1(p_user uuid,p_thread uuid,p_key text,p_hash text,p_version bigint,p_epoch bigint,p_review text,p_profile jsonb,p_fields jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;expected text;r career_application_profile_reviews_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a->'paused'='true'::jsonb or coalesce((a->>'version')::bigint,0)is distinct from p_version or coalesce((a->>'epoch')::bigint,0)is distinct from p_epoch or not exists(select 1 from agent_threads th where th.user_id=p_user and th.id=p_thread)then raise exception 'application context revoked';end if;
 select *into r from career_application_profile_reviews_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if r.review_sha256 is not null then
  if r.request_hash is distinct from p_hash then raise exception 'application profile request conflict';end if;
  if r.account_version is distinct from p_version or r.privacy_epoch is distinct from p_epoch then raise exception 'application profile review changed';end if;
  return jsonb_build_object('reviewHash',r.review_sha256,'fields',r.fields,'expiresAt',r.expires_at);
 end if;
 expected:=encode(sha256(convert_to(career_applicant_canonical_v1(jsonb_build_object('userId',p_user,'threadId',p_thread,'requestKey',p_key,'accountVersion',p_version,'privacyEpoch',p_epoch,'profile',p_profile,'fields',p_fields)),'UTF8')),'hex');if expected is distinct from p_review then raise exception 'invalid application profile review';end if;
 insert into career_application_profile_reviews_v1(user_id,thread_id,request_key,request_hash,review_sha256,account_version,privacy_epoch,profile,fields)values(p_user,p_thread,p_key,p_hash,p_review,p_version,p_epoch,p_profile,p_fields)on conflict(user_id,review_sha256)do nothing;
 return jsonb_build_object('reviewHash',p_review,'fields',p_fields,'expiresAt',(select expires_at from career_application_profile_reviews_v1 where user_id=p_user and review_sha256=p_review));
end $$;
create function public.career_application_profile_confirm_v1(p_base jsonb,p_review text,p_message text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid:=(p_base->>'p_user')::uuid;t uuid:=(p_base->>'p_thread')::uuid;r career_application_profile_reviews_v1;loaded jsonb;f jsonb;response jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));loaded:=career_host_load(u,t,p_base->>'p_key',p_base->>'p_hash');if loaded?'error'then return loaded;end if;if loaded?'replay'then return jsonb_build_object('response',loaded->'replay');end if;
 select *into r from career_application_profile_reviews_v1 where user_id=u and thread_id=t and review_sha256=p_review;
 if r.review_sha256 is null or r.expires_at<=clock_timestamp()or r.account_version is distinct from (loaded->>'accountVersion')::bigint or r.privacy_epoch is distinct from coalesce((loaded#>>'{account,epoch}')::bigint,0)or loaded#>'{account,paused}'='true'::jsonb or p_message is distinct from 'Confirm application facts '||p_review then raise exception 'application profile review changed';end if;
 f:=coalesce(nullif(loaded->'snapshot','null'::jsonb),jsonb_build_object('v',1,'scope',jsonb_build_object('userId',u),'stores','{}'::jsonb));f:=jsonb_set(f,'{stores,profile}',r.profile);
 response:=jsonb_build_object('thread_id',t,'turn_key',p_base->>'p_key','reply','Saved the application facts you explicitly confirmed. No application was submitted. Ask me to find your internship shortlist.','reminders','[]'::jsonb,'application',jsonb_build_object('version','career_application_chat/v1','status','profile_confirmed'));
 return career_host_commit(u,t,p_base->>'p_key',p_base->>'p_hash',(loaded->>'revision')::bigint,(loaded->>'accountVersion')::bigint,f,'{}'::jsonb,p_message,response);
end $$;
create function public.career_application_conversation_erase_v1()returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if coalesce(new.key,old.key)='career:account'and(tg_op='DELETE'or(tg_op='UPDATE'and coalesce((new.value->>'epoch')::bigint,0)is distinct from coalesce((old.value->>'epoch')::bigint,0)))then
  delete from career_application_search_scopes_v1 where user_id=coalesce(new.user_id,old.user_id);delete from career_application_scope_requests_v1 where user_id=coalesce(new.user_id,old.user_id);delete from career_application_searches_v1 where user_id=coalesce(new.user_id,old.user_id);delete from career_application_profile_reviews_v1 where user_id=coalesce(new.user_id,old.user_id);
 end if;return null;
end $$;
create trigger career_application_conversation_erasure_v1 after update or delete on public.career_watch_kv for each row execute function career_application_conversation_erase_v1();
revoke all on function career_application_chat_context_v1(uuid,uuid,text,text),career_application_search_store_v1(uuid,uuid,text,text,bigint,bigint,text,integer,jsonb,jsonb,jsonb),career_application_search_prepare_v1(uuid,uuid,text,uuid,jsonb),career_application_batch_lookup_v1(uuid,uuid,text,text),career_application_task_context_v1(uuid,text,uuid,text),career_application_profile_review_v1(uuid,uuid,text,text,bigint,bigint,text,jsonb,jsonb),career_application_profile_confirm_v1(jsonb,text,text),career_application_conversation_erase_v1()from public,anon,authenticated;
grant execute on function career_application_chat_context_v1(uuid,uuid,text,text),career_application_search_store_v1(uuid,uuid,text,text,bigint,bigint,text,integer,jsonb,jsonb,jsonb),career_application_search_prepare_v1(uuid,uuid,text,uuid,jsonb),career_application_batch_lookup_v1(uuid,uuid,text,text),career_application_task_context_v1(uuid,text,uuid,text),career_application_profile_review_v1(uuid,uuid,text,text,bigint,bigint,text,jsonb,jsonb),career_application_profile_confirm_v1(jsonb,text,text),career_application_conversation_erase_v1()to service_role;

-- Query constraints have their own owner/thread scope; they are not applicant facts.
alter table career_application_searches_v1 add column current_results jsonb;
create table career_application_search_scopes_v1(user_id uuid not null references auth.users on delete cascade,thread_id uuid not null references agent_threads,account_version bigint not null,privacy_epoch bigint not null,interests jsonb not null,primary key(user_id,thread_id));
create table career_application_scope_requests_v1(user_id uuid not null references auth.users on delete cascade,thread_id uuid not null references agent_threads,request_key text not null,request_hash text not null,account_version bigint not null,privacy_epoch bigint not null,interests jsonb not null,primary key(user_id,thread_id,request_key));
do $$declare n text;begin foreach n in array array['career_application_search_scopes_v1','career_application_scope_requests_v1']loop
 execute format('alter table %I enable row level security',n);execute format('revoke all on %I from public,anon,authenticated',n);execute format('grant select,insert,update,delete on %I to service_role',n);execute format('create policy backend_only on %I for all to service_role using(true)with check(true)',n);end loop;end $$;
create function career_application_search_scope_v1(p_user uuid,p_thread uuid,p_key text,p_hash text,p_version bigint,p_epoch bigint,p_interests jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;old career_application_search_scopes_v1;saved career_application_scope_requests_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if not exists(select 1 from agent_threads where user_id=p_user and id=p_thread)or a->'paused'='true'::jsonb or coalesce((a->>'version')::bigint,0)is distinct from p_version or coalesce((a->>'epoch')::bigint,0)is distinct from p_epoch then raise exception 'application scope context revoked';end if;
 if coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or jsonb_typeof(p_interests)is distinct from 'array'or octet_length(p_interests::text)>16384 then raise exception 'invalid application scope';end if;
 select *into old from career_application_search_scopes_v1 where user_id=p_user and thread_id=p_thread;
 select *into saved from career_application_scope_requests_v1 where user_id=p_user and thread_id=p_thread and request_key=p_key;
 if saved.request_key is not null then
  if saved.request_hash is distinct from p_hash then raise exception 'application search conflict';end if;
  if saved.account_version is distinct from p_version or saved.privacy_epoch is distinct from p_epoch or old.interests is distinct from saved.interests then raise exception 'application search scope changed';end if;
  return jsonb_build_object('interests',saved.interests);
 end if;
 insert into career_application_scope_requests_v1 values(p_user,p_thread,p_key,p_hash,p_version,p_epoch,p_interests);
 insert into career_application_search_scopes_v1 values(p_user,p_thread,p_version,p_epoch,p_interests)on conflict(user_id,thread_id)do update set account_version=excluded.account_version,privacy_epoch=excluded.privacy_epoch,interests=excluded.interests;
 if old.interests is distinct from p_interests then
  update career_task_intents_v1 i set state='cancelled'where i.user_id=p_user and i.thread_id=p_thread and i.state in('queued','claimed')and i.binding->>'action'in('prepare','approve')and exists(select 1 from career_application_searches_v1 x where x.user_id=p_user and x.thread_id=p_thread and x.selected_batch::text=i.private_input#>>'{batch,batchId}'and x.role_interests is distinct from p_interests);
  delete from career_application_batch_reviews_v1 r using career_application_batches_v1 b where b.user_id=p_user and b.thread_id=p_thread and r.user_id=b.user_id and r.batch_id=b.batch_id and r.approved_at is null;
 end if;
 return jsonb_build_object('interests',p_interests);
end $$;
create or replace function career_application_batch_context_v1(p_user uuid,p_thread uuid,p_batch uuid)returns career_application_batches_v1
language plpgsql security invoker set search_path=public,pg_temp as $$
declare b career_application_batches_v1;a jsonb;s career_application_searches_v1;q career_application_search_scopes_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));select *into b from career_application_batches_v1 where user_id=p_user and batch_id=p_batch;select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if b.batch_id is null or b.thread_id is distinct from p_thread or not exists(select 1 from agent_threads where user_id=p_user and id=p_thread)or a is null or a->'paused'='true'::jsonb or b.account_version is distinct from (a->>'version')::bigint or b.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0)then raise exception 'batch context revoked';end if;
 select *into s from career_application_searches_v1 where user_id=p_user and selected_batch=p_batch;
 if s.search_id is not null then select *into q from career_application_search_scopes_v1 where user_id=p_user and thread_id=p_thread;if q.interests is distinct from s.role_interests or q.account_version is distinct from b.account_version or q.privacy_epoch is distinct from b.privacy_epoch then raise exception 'batch search scope changed';end if;end if;return b;
end $$;
create function career_application_source_refresh_context_v1(p_user uuid,p_thread uuid,p_batch uuid,p_key text,p_hash text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s career_application_searches_v1;c career_application_batch_commands_v1;
begin
 perform career_application_batch_context_v1(p_user,p_thread,p_batch);select *into s from career_application_searches_v1 where user_id=p_user and thread_id=p_thread and selected_batch=p_batch;
 if s.search_id is null then raise exception 'owned source snapshot missing';end if;
 select *into c from career_application_batch_commands_v1 where user_id=p_user and request_key=p_key;
 if c.request_key is not null then if c.request_hash is distinct from p_hash then raise exception 'source refresh conflict';end if;return jsonb_build_object('replay',c.response);end if;
 return jsonb_build_object('search',to_jsonb(s));
end $$;
create function career_application_source_refresh_v1(p_user uuid,p_thread uuid,p_batch uuid,p_key text,p_hash text,p_results jsonb,p_health jsonb)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare ctx jsonb;s career_application_searches_v1;r career_application_batch_roles_v1;prior jsonb;fresh jsonb;kept jsonb:='[]';result jsonb;i career_task_intents_v1;id text;event text;binding jsonb;
begin
 ctx:=career_application_source_refresh_context_v1(p_user,p_thread,p_batch,p_key,p_hash);if ctx?'replay'then return ctx->'replay';end if;s:=jsonb_populate_record(null::career_application_searches_v1,ctx->'search');
 if coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or jsonb_typeof(p_results)is distinct from 'array'or jsonb_array_length(p_results)>100 or octet_length(p_results::text)>4194304 or jsonb_typeof(p_health)is distinct from 'array'then raise exception 'invalid source refresh';end if;
 for fresh in select *from jsonb_array_elements(p_results)loop if coalesce(fresh#>>'{source,sha256}','')!~'^[a-f0-9]{64}$'or coalesce(fresh#>>'{source,provenance}','')not in('public_ats_snapshot/v1','synthetic_fixture/v1')or fresh#>>'{source,observedAt}'is null or (fresh#>>'{source,observedAt}')::timestamptz<clock_timestamp()-interval '5 minutes'or(fresh#>>'{source,observedAt}')::timestamptz>clock_timestamp()+interval '30 seconds'then raise exception 'invalid refreshed observation';end if;end loop;
 for r in select *from career_application_batch_roles_v1 where user_id=p_user and batch_id=p_batch for update loop
  if exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=r.task_id and(operation='submit'or state in('reserved','started','uncertain')))then continue;end if;
  select v into prior from jsonb_array_elements(s.results)v where v->>'taskId'=r.task_id;select v into fresh from jsonb_array_elements(p_results)v where v->>'taskId'=r.task_id;
  update career_task_intents_v1 pending set state='cancelled'where pending.user_id=p_user and pending.task_id=r.task_id and pending.state in('queued','claimed')and pending.binding->>'action'in('prepare','approve');
  update career_application_batch_roles_v1 set answer_revision=answer_revision+1,answers='[]'where user_id=p_user and batch_id=p_batch and task_id=r.task_id;
  if fresh is not null and fresh->'posting'=prior->'posting'then kept:=kept||jsonb_build_array(fresh);perform career_application_batch_queue_v1(p_user,p_batch,r.task_id,'prepare');
  else
   select *into i from career_task_intents_v1 where user_id=p_user and intent_id=r.source_intent;id:=encode(sha256(convert_to(jsonb_build_array(p_user,p_batch,r.task_id,p_key,'source-held')::text,'UTF8')),'hex');event:='refresh_'||substr(id,1,48);binding:=i.binding||jsonb_build_object('intent_id',id,'turn_key',event,'event_id',event,'request_hash',p_hash);
   insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,state,result,expires_at)
   values(p_user,id,p_thread,event,p_hash,id,binding,i.private_input,s.account_version,s.privacy_epoch,r.task_id,'completed',jsonb_build_object('status','blocked','blocker','SOURCE_CHANGED_OR_UNAVAILABLE_RESELECTION_REQUIRED','review',null,'asks','[]'::jsonb,'observedReplacement',fresh->'posting'),clock_timestamp()+interval '10 minutes');
   update career_application_batch_roles_v1 set last_intent=id where user_id=p_user and batch_id=p_batch and task_id=r.task_id;
  end if;
 end loop;
 update career_application_searches_v1 set current_results=kept,source_health=p_health where user_id=p_user and search_id=s.search_id;
 delete from career_application_batch_reviews_v1 where user_id=p_user and batch_id=p_batch and approved_at is null;
 result:=career_application_batch_control_v1(p_user,p_thread,p_key,'status',jsonb_build_object('batchId',p_batch));insert into career_application_batch_commands_v1 values(p_user,p_key,p_hash,s.privacy_epoch,result,now());return result;
end $$;
revoke all on function career_application_search_scope_v1(uuid,uuid,text,text,bigint,bigint,jsonb),career_application_source_refresh_context_v1(uuid,uuid,uuid,text,text),career_application_source_refresh_v1(uuid,uuid,uuid,text,text,jsonb,jsonb)from public,anon,authenticated;
grant execute on function career_application_search_scope_v1(uuid,uuid,text,text,bigint,bigint,jsonb),career_application_source_refresh_context_v1(uuid,uuid,uuid,text,text),career_application_source_refresh_v1(uuid,uuid,uuid,text,text,jsonb,jsonb)to service_role;
create function career_application_approval_source_guard_v1()returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare s career_application_searches_v1;r jsonb;
begin
 if new.binding->>'action'='approve'and new.private_input#>>'{batch,batchId}'is not null then
  select *into s from career_application_searches_v1 where user_id=new.user_id and selected_batch=(new.private_input#>>'{batch,batchId}')::uuid;
  if s.search_id is not null then
   select v into r from jsonb_array_elements(coalesce(s.current_results,s.results))v where v->>'taskId'=new.task_id;
   if r is null or(r#>>'{source,observedAt}')::timestamptz<clock_timestamp()-interval '5 minutes'then raise exception 'application source observation expired; refresh and review required';end if;
  end if;
 end if;return new;
end $$;
revoke all on function career_application_approval_source_guard_v1()from public,anon,authenticated;grant execute on function career_application_approval_source_guard_v1()to service_role;
create trigger career_application_approval_source_guard_v1 before insert on career_task_intents_v1 for each row execute function career_application_approval_source_guard_v1();
