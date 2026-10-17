-- SOURCE ONLY. Apply after application admissions and owned claim recovery.
-- Workflow actions do not change shared career memory/account version. A
-- missing answer on one role must not revoke unrelated, unchanged approvals.
create table public.career_application_batches_v1(
 user_id uuid not null references auth.users(id) on delete cascade,
 batch_id uuid not null default gen_random_uuid(),thread_id uuid not null references agent_threads(id),
 account_version bigint not null,privacy_epoch bigint not null,created_at timestamptz not null default now(),
 primary key(user_id,batch_id)
);
create table public.career_application_batch_roles_v1(
 user_id uuid not null,batch_id uuid not null,task_id text not null check(task_id~'^[a-f0-9]{32}$'),
 source_intent text not null,last_intent text not null,answer_revision integer not null default 0,
 answers jsonb not null default '[]',primary key(user_id,batch_id,task_id),
 foreign key(user_id,batch_id)references career_application_batches_v1 on delete cascade,
 foreign key(user_id,source_intent)references career_task_intents_v1(user_id,intent_id) on delete cascade,
 foreign key(user_id,last_intent)references career_task_intents_v1(user_id,intent_id) on delete cascade
);
create table public.career_application_batch_reviews_v1(
 user_id uuid not null,batch_id uuid not null,review_sha256 text not null,manifest jsonb not null,
 expires_at timestamptz not null,approved_at timestamptz,
 primary key(user_id,batch_id,review_sha256),
 foreign key(user_id,batch_id)references career_application_batches_v1 on delete cascade
);
create table public.career_application_batch_commands_v1(
 user_id uuid not null references auth.users(id) on delete cascade,request_key text not null,
 request_hash text not null,privacy_epoch bigint not null,response jsonb not null,
 created_at timestamptz not null default now(),primary key(user_id,request_key)
);
do $$declare n text;begin
 foreach n in array array['career_application_batches_v1','career_application_batch_roles_v1','career_application_batch_reviews_v1','career_application_batch_commands_v1']loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant select,insert,update,delete on public.%I to service_role',n);
  execute format('create policy backend_only on public.%I for all to service_role using(true) with check(true)',n);
 end loop;
end $$;

create function public.career_application_batch_context_v1(p_user uuid,p_thread uuid,p_batch uuid)
returns career_application_batches_v1 language plpgsql security invoker set search_path=public,pg_temp as $$
declare b career_application_batches_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into b from career_application_batches_v1 where user_id=p_user and batch_id=p_batch;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if b.batch_id is null or b.thread_id is distinct from p_thread or not exists(select 1 from agent_threads where id=p_thread and user_id=p_user)
  or a is null or a->'paused'='true'::jsonb or b.account_version is distinct from (a->>'version')::bigint
  or b.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'batch context revoked';end if;
 return b;
end $$;

create function public.career_application_batch_progress_v1(p_user uuid,p_batch uuid)returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('taskId',r.task_id,'intentId',r.last_intent,
 'answerRevision',r.answer_revision,'confirmedAnswerCount',jsonb_array_length(r.answers),
 'posting',s.private_input->'posting','status',case
  when exists(select 1 from career_task_effects_v1 e where e.user_id=r.user_id and e.task_id=r.task_id and e.operation='submit')
   then case when i.result->>'status'='completed' and i.result#>'{result,receipt}' is not null then 'completed' else 'unknown_outcome' end
  when exists(select 1 from career_task_effects_v1 e where e.user_id=r.user_id and e.task_id=r.task_id and e.state in('started','uncertain'))then 'needs_reconciliation'
  when i.result is not null then i.result->>'status'
  when i.state='queued' then 'queued' when i.state='claimed' then 'running' else 'requires_review' end,
 'task',i.result,'employerConfirmed',false) order by r.task_id),'[]'::jsonb)
 from career_application_batch_roles_v1 r join career_task_intents_v1 i on i.user_id=r.user_id and i.intent_id=r.last_intent
 join career_task_intents_v1 s on s.user_id=r.user_id and s.intent_id=r.source_intent
 where r.user_id=p_user and r.batch_id=p_batch;
$$;

create function public.career_application_batch_queue_v1(p_user uuid,p_batch uuid,p_task text,p_kind text,p_review jsonb default null)
returns text language plpgsql security invoker set search_path=public,pg_temp as $$
declare b career_application_batches_v1;r career_application_batch_roles_v1;s career_task_intents_v1;
 id text;event text;binding jsonb;payload jsonb;context jsonb;expiry timestamptz;
begin
 select * into b from career_application_batches_v1 where user_id=p_user and batch_id=p_batch;
 b:=career_application_batch_context_v1(p_user,b.thread_id,p_batch);
 select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=p_batch and task_id=p_task for update;
 select * into s from career_task_intents_v1 where user_id=p_user and intent_id=r.source_intent;
 if r.task_id is null or s.private_input->'posting' is null or s.privacy_epoch<>b.privacy_epoch or p_kind not in('prepare','approve','reconcile') then raise exception 'batch preparation source missing';end if;
 if p_kind='reconcile' then
  if not exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and operation='submit')then raise exception 'batch reconcile not needed';end if;
 elsif exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=p_task and operation='submit')then raise exception 'batch reconcile required';end if;
 context:=jsonb_build_object('batchId',p_batch,'taskId',p_task,'answerRevision',r.answer_revision);
 id:=encode(sha256(convert_to(jsonb_build_array(p_user,p_batch,p_task,r.answer_revision,p_kind,p_review)::text,'UTF8')),'hex');event:='batch_'||substr(id,1,48);
 expiry:=clock_timestamp()+interval '10 minutes';
 binding:=jsonb_build_object('version','career_task_intent/v1','intent_id',id,'user_id',p_user,'thread_id',b.thread_id,'turn_key',event,
  'request_hash',id,'action',p_kind,'task_id',p_task,'event_id',event,'artifact_id',s.binding->>'artifact_id',
  'resume_sha256',s.binding->>'resume_sha256','payload_sha256',null,'profile_sha256',null,
  'destination',s.private_input#>>'{posting,url}','authority_account_version',b.account_version,'privacy_epoch',b.privacy_epoch);
 if p_kind='approve' then
  if p_review->>'taskId' is distinct from p_task or p_review->>'userId' is distinct from p_user::text
   or coalesce(p_review->>'payloadSha256','')!~'^[a-f0-9]{64}$' or coalesce(p_review->>'profileHash','')!~'^[a-f0-9]{64}$'
   or p_review->>'resumeSha256' is distinct from s.binding->>'resume_sha256'
   or p_review#>>'{eligibility,status}' is distinct from 'eligible' then raise exception 'batch exact review required';end if;
  expiry:=least(expiry,(p_review->>'expiresAt')::timestamptz);
  binding:=binding||jsonb_build_object('payload_sha256',p_review->>'payloadSha256','profile_sha256',p_review->>'profileHash','destination',p_review->>'destination');
  payload:=jsonb_build_object('batch',context);
 elsif p_kind='reconcile' then payload:=jsonb_build_object('batch',context);
 else payload:=s.private_input||jsonb_build_object('eventId',event,'batch',context);end if;
 if expiry<=clock_timestamp() then raise exception 'batch review expired';end if;
 insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,expires_at)
 values(p_user,id,b.thread_id,event,id,encode(sha256(convert_to(p_user::text||':'||event,'UTF8')),'hex'),binding,payload,b.account_version,b.privacy_epoch,p_task,expiry);
 update career_application_batch_roles_v1 set last_intent=id where user_id=p_user and batch_id=p_batch and task_id=p_task;
 return id;
end $$;

create function public.career_application_batch_control_v1(p_user uuid,p_thread uuid,p_request text,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a jsonb;b career_application_batches_v1;r career_application_batch_roles_v1;s career_task_intents_v1;i career_task_intents_v1;
 saved career_application_batch_commands_v1;review career_application_batch_reviews_v1;
 batch uuid;request_hash text;task text;entry jsonb;answer jsonb;question jsonb;new_answers jsonb;ready jsonb:='[]';held jsonb:='[]';manifest jsonb;
 result jsonb;review_hash text;expiry timestamptz;field_key text;allowed text[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or a->'paused'='true'::jsonb or not exists(select 1 from agent_threads where id=p_thread and user_id=p_user) then raise exception 'batch context revoked';end if;
 if coalesce(p_request,'')!~'^[A-Za-z0-9_-]{1,128}$' or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>65536 then raise exception 'invalid batch command';end if;
 allowed:=case p_action when 'create' then array['taskIds'] when 'review' then array['batchId'] when 'approve' then array['batchId','reviewHash','message'] when 'answers' then array['batchId','taskId','questionsHash','answers','message'] when 'reconcile' then array['batchId','taskId','message'] when 'status' then array['batchId'] else null end;
 if allowed is null then raise exception 'invalid batch command';end if;
 for field_key in select jsonb_object_keys(p_input)loop if not field_key=any(allowed)then raise exception 'unknown batch command field';end if;end loop;
 if p_action<>'create' then batch:=(p_input->>'batchId')::uuid;b:=career_application_batch_context_v1(p_user,p_thread,batch);end if;
 if p_action='status' then return jsonb_build_object('version','career_application_batch/v1','batchId',batch,'roles',career_application_batch_progress_v1(p_user,batch));end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_thread,p_action,p_input)::text,'UTF8')),'hex');
 select * into saved from career_application_batch_commands_v1 where user_id=p_user and request_key=p_request;
 if saved.request_key is not null then
  if saved.request_hash is distinct from request_hash or saved.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) then raise exception 'batch command conflict';end if;
  if p_action='create' then perform career_application_batch_context_v1(p_user,p_thread,(saved.response->>'batchId')::uuid);end if;
  return saved.response;
 end if;
 if p_action='create' then
  if jsonb_typeof(p_input->'taskIds') is distinct from 'array' or jsonb_array_length(p_input->'taskIds') not between 1 and 100
   or (select count(distinct v)from jsonb_array_elements_text(p_input->'taskIds')v)<>jsonb_array_length(p_input->'taskIds') then raise exception 'exact distinct batch tasks required';end if;
  insert into career_application_batches_v1(user_id,thread_id,account_version,privacy_epoch)values(p_user,p_thread,(a->>'version')::bigint,coalesce((a->>'epoch')::bigint,0))returning * into b;batch:=b.batch_id;
  for task in select jsonb_array_elements_text(p_input->'taskIds')loop
   if task!~'^[a-f0-9]{32}$'then raise exception 'invalid batch task';end if;
   select * into s from career_task_intents_v1 where user_id=p_user and thread_id=p_thread and task_id=task and binding->>'action'='prepare' and privacy_epoch=b.privacy_epoch and private_input->'posting' is not null order by created_at,intent_id limit 1;
   if s.intent_id is null then raise exception 'owned batch task missing';end if;
   select * into i from career_task_intents_v1 where user_id=p_user and task_id=task and privacy_epoch=b.privacy_epoch order by updated_at desc,intent_id desc limit 1;
   insert into career_application_batch_roles_v1(user_id,batch_id,task_id,source_intent,last_intent)values(p_user,batch,task,s.intent_id,i.intent_id);
   if not exists(select 1 from career_task_effects_v1 where user_id=p_user and task_id=task and (operation='submit' or state in('reserved','started','uncertain')))then perform career_application_batch_queue_v1(p_user,batch,task,'prepare');end if;
  end loop;
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'roles',career_application_batch_progress_v1(p_user,batch));
 elsif p_action='review' then
  expiry:=clock_timestamp()+interval '10 minutes';
  for entry in select * from jsonb_array_elements(career_application_batch_progress_v1(p_user,batch))loop
   if entry->>'status'='review_ready' and entry#>>'{task,review,authority,accountVersion}'=b.account_version::text
    and entry#>>'{task,review,authority,privacyEpoch}'=b.privacy_epoch::text and entry#>>'{task,review,eligibility,status}'='eligible'
    and (entry#>>'{task,review,expiresAt}')::timestamptz>clock_timestamp() then
    ready:=ready||jsonb_build_array(jsonb_build_object('taskId',entry->>'taskId','intentId',entry->>'intentId','posting',entry->'posting','review',entry#>'{task,review}'));
    expiry:=least(expiry,(entry#>>'{task,review,expiresAt}')::timestamptz);
   else held:=held||jsonb_build_array(jsonb_build_object('taskId',entry->>'taskId','status',entry->>'status','asks',entry#>'{task,asks}'));end if;
  end loop;
  if jsonb_array_length(ready)=0 then raise exception 'no batch roles ready';end if;
  manifest:=jsonb_build_object('version','career_application_batch_review/v1','batchId',batch,'userId',p_user,'threadId',p_thread,'accountVersion',b.account_version,'privacyEpoch',b.privacy_epoch,'roles',ready,'withheld',held);
  review_hash:=encode(sha256(convert_to(manifest::text,'UTF8')),'hex');
  insert into career_application_batch_reviews_v1(user_id,batch_id,review_sha256,manifest,expires_at)values(p_user,batch,review_hash,manifest,expiry)on conflict do nothing;
  select * into review from career_application_batch_reviews_v1 where user_id=p_user and batch_id=batch and review_sha256=review_hash;
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'reviewHash',review_hash,'encoding','postgres-jsonb-text/v1','manifest',review.manifest,'expiresAt',review.expires_at,'approvalPhrase','Approve batch '||review_hash);
 elsif p_action='approve' then
  review_hash:=p_input->>'reviewHash';select * into review from career_application_batch_reviews_v1 where user_id=p_user and batch_id=batch and review_sha256=review_hash for update;
  if review.review_sha256 is null or review.approved_at is not null or review.expires_at<=clock_timestamp() or p_input->>'message' is distinct from 'Approve batch '||review_hash then raise exception 'exact fresh batch approval required';end if;
  for entry in select * from jsonb_array_elements(review.manifest->'roles')loop
   select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=batch and task_id=entry->>'taskId';
   select * into i from career_task_intents_v1 where user_id=p_user and intent_id=r.last_intent;
   if r.last_intent is distinct from entry->>'intentId' or i.result->>'status' is distinct from 'review_ready' or i.result->'review' is distinct from entry->'review' then raise exception 'batch review changed';end if;
   perform career_application_batch_queue_v1(p_user,batch,r.task_id,'approve',entry->'review');
  end loop;
  update career_application_batch_reviews_v1 set approved_at=clock_timestamp()where user_id=p_user and batch_id=batch and review_sha256=review_hash;
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'reviewHash',review_hash,'approvedTaskIds',(select jsonb_agg(v->>'taskId')from jsonb_array_elements(review.manifest->'roles')v),'status','queued','execution','separate_worker');
 elsif p_action='reconcile' then
  task:=p_input->>'taskId';
  if not exists(select 1 from career_application_batch_roles_v1 where user_id=p_user and batch_id=batch and task_id=task)or p_input->>'message' is distinct from 'Reconcile batch role '||task then raise exception 'exact role reconciliation required';end if;
  perform career_application_batch_queue_v1(p_user,batch,task,'reconcile',jsonb_build_object('requestId',p_request));
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'taskId',task,'status','readback_queued','resubmitAuthorized',false);
 elsif p_action='answers' then
  task:=p_input->>'taskId';select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=batch and task_id=task for update;
  select * into i from career_task_intents_v1 where user_id=p_user and intent_id=r.last_intent;
  if r.task_id is null or i.result->>'status' is distinct from 'awaiting_user' or i.result->>'questionsSha256' is distinct from p_input->>'questionsHash'
   or p_input->>'message' is distinct from 'Confirm answers for '||task||' '||(p_input->>'questionsHash') then raise exception 'exact role answer confirmation required';end if;
  if jsonb_typeof(p_input->'answers')is distinct from 'array' or jsonb_array_length(p_input->'answers')not between 1 and 50
   or (select count(distinct v->>'fieldId')from jsonb_array_elements(p_input->'answers')v)<>jsonb_array_length(p_input->'answers')then raise exception 'invalid role answers';end if;
  new_answers:=r.answers;
  for answer in select * from jsonb_array_elements(p_input->'answers')loop
   if jsonb_typeof(answer)is distinct from 'object' or (select count(*)from jsonb_object_keys(answer))<>3 or not answer?'fieldId' or not answer?'questionSha256' or not answer?'value'
    or jsonb_typeof(answer->'value')not in('string','boolean','number') or octet_length((answer->'value')::text)>4000 then raise exception 'invalid role answer';end if;
   select v into question from jsonb_array_elements(i.result->'asks')v where v->>'field_id'=answer->>'fieldId' and v->>'questionSha256'=answer->>'questionSha256' and v->'required'='true'::jsonb and v->'answerable'='true'::jsonb;
   if question is null then raise exception 'role question changed';end if;
   if question#>>'{field,kind}'='eligibility' and (jsonb_typeof(answer->'value') is distinct from question#>>'{field,answerType}' or (question#>>'{field,answerType}'='string' and (length(btrim(answer->>'value'))not between 1 and 300)))then raise exception 'invalid eligibility answer type';end if;
   select coalesce(jsonb_agg(v),'[]')into new_answers from jsonb_array_elements(new_answers)v where v->>'fieldId'<>answer->>'fieldId';
   new_answers:=new_answers||jsonb_build_array(answer||jsonb_build_object('source','user_explicit_role_confirmation','kind',coalesce(question#>>'{field,kind}','portal')));
  end loop;
  update career_application_batch_roles_v1 set answers=new_answers,answer_revision=answer_revision+1 where user_id=p_user and batch_id=batch and task_id=task;
  perform career_application_batch_queue_v1(p_user,batch,task,'prepare');
  result:=jsonb_build_object('version','career_application_batch/v1','batchId',batch,'taskId',task,'status','queued','submissionApproved',false);
 end if;
 insert into career_application_batch_commands_v1 values(p_user,p_request,request_hash,coalesce((a->>'epoch')::bigint,0),result,now());
 return result;
end $$;

create function public.career_application_batch_answers_v1(p_user uuid,p_intent text,p_lease uuid,p_task text)returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;b career_application_batches_v1;r career_application_batch_roles_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent;
 if i.state is distinct from 'claimed' or i.lease_token is distinct from p_lease or i.task_id is distinct from p_task or i.expires_at<=clock_timestamp()
  or(i.claim_worker is not null and(i.claim_lease_until is null or i.claim_lease_until<=clock_timestamp()))then raise exception 'batch task authority revoked';end if;
 b:=career_application_batch_context_v1(p_user,i.thread_id,(i.private_input#>>'{batch,batchId}')::uuid);
 select * into r from career_application_batch_roles_v1 where user_id=p_user and batch_id=b.batch_id and task_id=p_task;
 if r.task_id is null or i.authority_account_version<>b.account_version or i.privacy_epoch<>b.privacy_epoch or r.last_intent<>i.intent_id or r.answer_revision::text is distinct from i.private_input#>>'{batch,answerRevision}'then raise exception 'batch answer context revoked';end if;
 return jsonb_build_object('answers',r.answers,'answerRevision',r.answer_revision);
end $$;

create function public.career_application_batch_erase_v1()returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid;
begin
 if coalesce(new.key,old.key)='career:account' and(TG_OP='DELETE' or(TG_OP='UPDATE' and coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0)))then
  u:=coalesce(new.user_id,old.user_id);delete from career_application_batches_v1 where user_id=u;delete from career_application_batch_commands_v1 where user_id=u;
 end if;return null;
end $$;
create trigger career_application_batch_erase_v1 after update or delete on public.career_watch_kv for each row execute function public.career_application_batch_erase_v1();
revoke all on function public.career_application_batch_context_v1(uuid,uuid,uuid),public.career_application_batch_progress_v1(uuid,uuid),public.career_application_batch_queue_v1(uuid,uuid,text,text,jsonb),public.career_application_batch_control_v1(uuid,uuid,text,text,jsonb),public.career_application_batch_answers_v1(uuid,text,uuid,text),public.career_application_batch_erase_v1()from public,anon,authenticated;
grant execute on function public.career_application_batch_context_v1(uuid,uuid,uuid),public.career_application_batch_progress_v1(uuid,uuid),public.career_application_batch_queue_v1(uuid,uuid,text,text,jsonb),public.career_application_batch_control_v1(uuid,uuid,text,text,jsonb),public.career_application_batch_answers_v1(uuid,text,uuid,text),public.career_application_batch_erase_v1()to service_role;
