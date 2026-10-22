-- SCALE-S3 battery C seed (disposable harness only; synthetic TEST data only).
-- Mints real batch approvals through career_apply_batch_approve_own, the same
-- producer the submit-armed exercise's LEG 0 uses, one per begin-door case.
-- The begin races themselves are driven by scale_s3_battery_c.py.
\set ON_ERROR_STOP on
create schema if not exists s3c;
grant usage on schema s3c to service_role, authenticated;
create table if not exists s3c.cases(
 name text primary key, user_id uuid not null, job_id text not null,
 entry jsonb not null, batch_hash text not null,
 pay_ext jsonb not null, hash_ext text not null,
 pay_cloud jsonb not null, hash_cloud text not null);
grant select on s3c.cases to service_role, authenticated;

-- The approved entry, the exercise's pg_temp.ent idiom, parameterized.
create or replace function s3c.ent(p_user uuid, p_job text, p_qid uuid) returns jsonb
language sql set search_path = public, pg_temp as $$
 select jsonb_build_object('version',1,'kind','agent-batch','jobId',p_job,'company','Test Co',
  'url','https://jobs.lever.co/testco/'||p_job||'/apply',
  'answers',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','shown','test@example.test','kind','text','factId','F-012','file',null),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','shown','TEST Person','kind','text','factId','text-answer:'||p_qid::text,'file',null)),
  'blank',jsonb_build_array('Anything else?'),
  'ledger',jsonb_build_array(
    jsonb_build_object('application_id',p_job,'field_id','email','question_hash',repeat('1',64),'answer_hash',repeat('2',64),
      'fact_refs',jsonb_build_array('F-012'),'source_refs',jsonb_build_array('owner stated this in chat'),'confirmation_event_id','chat:event-12','derivation_rule','verbatim'),
    jsonb_build_object('application_id',p_job,'field_id','name','question_hash',repeat('3',64),'answer_hash',repeat('4',64),
      'fact_refs',jsonb_build_array('text-answer:'||p_qid::text),'source_refs',jsonb_build_array('owner answered this question (text-answer:'||p_qid::text||')'),
      'confirmation_event_id','text-answer:'||p_qid::text,'derivation_rule','verbatim')),
  'question_set_hash',repeat('5',64),'manifest_hash',repeat('6',64),'quarantine_version','d007-v1')
$$;

-- The extension-door payload, the exercise's pg_temp.pay idiom.
create or replace function s3c.pay_ext(p_user uuid, p_job text, p_qid uuid) returns jsonb
language sql set search_path = public, pg_temp as $$
 select jsonb_build_object('manifest_hash',repeat('6',64),'quarantine_version','d007-v1','version',1,'source','extension',
  'user_id',p_user,'job_id',p_job,'company','Test Co','url','https://jobs.lever.co/testco/'||p_job||'/apply','family','lever',
  'fields',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','source','trainee','factId','F-012','detail',''),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:'||p_qid::text,'detail','')),
  'resume_name',null,'resume_sha256',null,'privacy_epoch',1,'account_version',1,
  'expires_at', textin(timestamptz_out(clock_timestamp() + interval '2 hours')))
$$;

-- The cloud-door payload: the same approved answers, the cloud's own shape
-- (source 'cloud', the destination and engine approval the claim will demand).
create or replace function s3c.pay_cloud(p_user uuid, p_job text, p_qid uuid) returns jsonb
language sql set search_path = public, pg_temp as $$
 select jsonb_build_object('manifest_hash',repeat('6',64),'quarantine_version','d007-v1','version',1,'source','cloud',
  'user_id',p_user,'job_id',p_job,'company','Test Co','url','https://jobs.lever.co/testco/'||p_job||'/apply','family','lever',
  'destination','https://jobs.lever.co/testco/'||p_job||'/apply','engine_approval',repeat('e',64),
  'fields',jsonb_build_array(
    jsonb_build_object('name','email','label','Email','value','test@example.test','source','trainee','factId','F-012','detail',''),
    jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:'||p_qid::text,'detail','')),
  'resume_name',null,'resume_sha256',encode(sha256(convert_to('TEST resume','UTF8')),'hex'),
  'privacy_epoch',1,'account_version',1,
  'expires_at', textin(timestamptz_out(clock_timestamp() + interval '2 hours')))
$$;

create or replace function s3c.make_user(p_user uuid, p_qid uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
 insert into auth.users(id,email) values (p_user,'s3c-'||p_user::text||'@example.test') on conflict (id) do nothing;
 insert into public.profiles(id) values (p_user) on conflict (id) do nothing;
 insert into public.career_watch_kv(user_id,key,value) values
  (p_user,'career:account','{"epoch":1,"version":1,"paused":false}') on conflict (user_id,key) do nothing;
 insert into public.career_apply_questions(id,user_id,key,kind,label,type,state,answer,answered_at) values
  (p_qid,p_user,'fact:full_name','fact','Full name','text','answered','TEST Person',now())
 on conflict (id) do nothing;
end $$;

-- One case: a user plus a live batch approval for one posting, with both
-- doors' payloads and hashes recorded for the driver.
create or replace function s3c.make_case(p_name text, p_user uuid, p_job text, p_qid uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare e jsonb := s3c.ent(p_user,p_job,p_qid);
 pe jsonb := s3c.pay_ext(p_user,p_job,p_qid);
 pc jsonb := s3c.pay_cloud(p_user,p_job,p_qid);
 bh text := encode(sha256(convert_to(public.career_apply_canonical(e),'UTF8')),'hex');
 he text := encode(sha256(convert_to(public.career_apply_canonical(pe),'UTF8')),'hex');
 hc text := encode(sha256(convert_to(public.career_apply_canonical(pc),'UTF8')),'hex');
 n int;
begin
 perform s3c.make_user(p_user,p_qid);
 perform set_config('request.jwt.claim.sub',p_user::text,false);
 select public.career_apply_batch_approve_own(
   jsonb_build_array(jsonb_build_object('entry',e,'hash',bh))) into n;
 perform set_config('request.jwt.claim.sub','',false);
 if n <> 1 then raise exception 's3c seed: approve_own minted % approvals for case %', n, p_name; end if;
 insert into s3c.cases values (p_name,p_user,p_job,e,bh,pe,he,pc,hc)
 on conflict (name) do update set entry=excluded.entry,batch_hash=excluded.batch_hash,
  pay_ext=excluded.pay_ext,hash_ext=excluded.hash_ext,pay_cloud=excluded.pay_cloud,hash_cloud=excluded.hash_cloud;
end $$;
