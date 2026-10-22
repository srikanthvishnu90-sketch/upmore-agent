-- SCALE-S3 battery A seed (disposable harness only; synthetic TEST data only).
-- Produces card-bound queued rows in EXACTLY the end state the card tap produces
-- (career_apply_message_card_approve_own -> cloud_tap): a consumed batch approval
-- whose entry IS the payload, a cloud_bound_approvals row, and a queued job row
-- the queue trigger binds into cloud_bound_jobs. Equivalence is functional, not
-- assumed: every seeded row must pass career_message_approval_private
-- .cloud_bound_refusal and career_apply_cloud_refusal at claim time, or the
-- battery's claim counts expose it. The real tap path itself is proven end to
-- end at n=1 by career_apply_submit_armed_exercise.test.sql in the same
-- provisioned database.
-- Usage (psql variables): -v users=N -v jobs=K -v tag=TEXT -v prefix=UUIDPREFIX
--   user ids are built as prefix || lpad(n, 12, '0'); job ids '<tag>-<n>-<k>'.
\set ON_ERROR_STOP on
create schema if not exists s3;
grant usage on schema s3 to service_role, authenticated;
-- The battery drivers run the claim/finish/confirm chain as service_role;
-- make sure the confirmation stand-in can write its mail row in that role.
grant insert, select on public.career_mail_events to service_role;

-- The cloud payload, the bridge test's idiom (pg_temp.cp in the exercise),
-- parameterized per user/job/company.
create or replace function s3.cp(p_user uuid, p_job text, p_company text) returns jsonb
language sql set search_path = public, pg_temp as $$
 select jsonb_build_object('version',1,'user_id',p_user,'job_id',p_job,'company',p_company,
  'url','https://jobs.lever.co/s3/'||p_job||'/apply','destination','https://jobs.lever.co/s3/'||p_job||'/apply',
  'engine_approval',repeat('e',64),'schema_hash',repeat('d',64),
  'resume_sha256',encode(sha256(convert_to('TEST resume','UTF8')),'hex'),
  'fields',jsonb_build_array(jsonb_build_object('name','name','label','Full name','value','TEST Person',
   'factId','TEST-NAME','provenance','own synthetic statement','confirmation_event_id','evt-test-name',
   'source',jsonb_build_object('table','answers','key','full_name','value','TEST Person'))),
  'page_field_names','[]'::jsonb,'privacy_epoch',1,'account_version',1,
  'expires_at', textin(timestamptz_out(clock_timestamp() + interval '2 hours')),
  'manifest_hash',repeat('c',64),'quarantine_version','d007-v1','replay_sources','[]'::jsonb)
$$;

-- Arm the cloud inside the disposable harness (harness-local settings rows are
-- fixtures): kill switch on, one gate tester, the lever gate opened by 3
-- employer-confirmed hand submissions, exactly as the exercise arms it.
create or replace function s3.arm_cloud(p_gate uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare j public.career_apply_jobs; n int;
begin
 insert into auth.users(id,email) values (p_gate,'s3-gate@example.test') on conflict (id) do nothing;
 insert into public.profiles(id) values (p_gate) on conflict (id) do nothing;
 insert into public.career_watch_kv(user_id,key,value) values
  (p_gate,'career:account','{"epoch":1,"version":1,"paused":false}') on conflict (user_id,key) do nothing;
 -- Fixture hygiene: the repo suite leaves a COMMITTED lever portal pause in
 -- the harness DB (career_apply_cloud.test.sql extends one to ~6h). A battery
 -- that arms the cloud starts from no pauses, as a fresh deployment would.
 delete from public.career_apply_cloud_pauses;
 -- The throttle's failure window runs "since the portal's last pause", over
 -- events from EVERY user of the portal. Expired pauses start the window
 -- afresh (that is the production steady state the morning after any pause),
 -- so the batteries' own earlier legs cannot poison later runs; the A100
 -- first attempt in the SCALE-S3 doc shows what happens when they do.
 insert into public.career_apply_cloud_pauses(scope,portal,reason,until,created_at)
 values ('portal','lever','S3 fresh window',clock_timestamp() - interval '1 minute',clock_timestamp()),
        ('portal','greenhouse','S3 fresh window',clock_timestamp() - interval '1 minute',clock_timestamp()),
        ('portal','ashby','S3 fresh window',clock_timestamp() - interval '1 minute',clock_timestamp());
 insert into public.career_cloud_settings(key,value) values ('CAREER_CLOUD_APPLY','on'),
  ('CAREER_AGENT_SUBMIT','on'),
  ('owner_user_id',p_gate::text),('gate_user_ids','{'||p_gate::text||'}')
 on conflict (key) do update set value = excluded.value;
 for n in 1..3 loop
  if exists (select 1 from public.career_apply_jobs where user_id = p_gate and job_id = 'S3-GATE-'||n) then
   continue;
  end if;
  perform set_config('request.jwt.claim.sub',p_gate::text,true);
  select * into j from public.career_apply_record_own('S3-GATE-'||n,'Gate Co '||n,
   'https://jobs.lever.co/gate'||n||'/1','submitted_unconfirmed');
  update public.career_apply_jobs set state='confirmed', email_confirmed_at=now(),
   confirmation_mail_hash=encode(sha256(convert_to('S3-GATE-'||n,'UTF8')),'hex')
   where id=j.id;
  insert into public.career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
  values(p_gate,'job:'||j.id,'received','Gate Co '||n,'received: "thank you for applying" from example.test',
   encode(sha256(convert_to('S3-GATE-'||n,'UTF8')),'hex'),now());
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 if not public.career_apply_cloud_open('lever') then raise exception 's3 seed: lever gate did not open'; end if;
end $$;

-- One synthetic user, fully enrolled: auth + profile + account + TEST cloud
-- eligibility + cloud opt-in + the owned resume the claim/resume reads check.
create or replace function s3.seed_user(p_user uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
 insert into auth.users(id,email) values (p_user,'s3-'||p_user::text||'@example.test') on conflict (id) do nothing;
 insert into public.profiles(id) values (p_user) on conflict (id) do nothing;
 insert into public.career_watch_kv(user_id,key,value) values
  (p_user,'career:account','{"epoch":1,"version":1,"paused":false}') on conflict (user_id,key) do nothing;
 insert into career_message_approval_private.test_users(user_id,enabled) values (p_user,true)
  on conflict (user_id) do update set enabled = true;
 perform public.career_apply_cloud_optin_as(p_user,true,'TEST terms');
 insert into public.career_apply_cloud_resumes(user_id,filename,bytes,sha256,privacy_epoch)
 select p_user,'s3.pdf',convert_to('TEST resume','UTF8'),
  encode(sha256(convert_to('TEST resume','UTF8')),'hex'),1
 where not exists (select 1 from public.career_apply_cloud_resumes r
  where r.user_id = p_user and r.privacy_epoch = 1
   and r.sha256 = encode(sha256(convert_to('TEST resume','UTF8')),'hex'));
end $$;

-- One card-bound queued row, in the tap's end state. The job INSERT runs the
-- queue guard trigger, which binds the row to the approval (cloud_bound_jobs)
-- and refuses the insert unless the binding checks pass.
create or replace function s3.seed_job(p_user uuid, p_job text, p_company text) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare p jsonb := s3.cp(p_user,p_job,p_company);
 h text := encode(sha256(convert_to(public.career_apply_canonical(p),'UTF8')),'hex');
 aid uuid; jid uuid; stamp timestamptz := clock_timestamp();
begin
 insert into public.career_apply_batch_approvals(user_id,job_id,batch_hash,entry,approved_at,used_at)
 values (p_user,p_job,h,p,stamp,stamp) returning id into aid;
 insert into career_message_approval_private.cloud_bound_approvals
  (approval_id,user_id,card_id,item_index,payload_hash,approved_at,expires_at)
 values (aid,p_user,gen_random_uuid(),0,h,stamp,stamp + interval '2 hours');
 insert into public.career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 values (p_user,p_job,p_company,'https://jobs.lever.co/s3/'||p_job||'/apply',p,h,h) returning id into jid;
 if not exists (select 1 from career_message_approval_private.cloud_bound_jobs b
   where b.job_row_id = jid and b.approval_id = aid) then
  raise exception 's3 seed: job % was not bound by the queue trigger', p_job;
 end if;
 return jid;
end $$;

-- The employer's confirmation, the exercise's pg_temp.confirm stand-in for
-- WO-032's mail path: the row goes confirmed with its mail hash recorded.
create or replace function s3.confirm(p_id uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare j public.career_apply_jobs;
 h text := encode(sha256(convert_to('S3-CONF-'||p_id::text,'UTF8')),'hex');
begin
 select * into j from public.career_apply_jobs where id = p_id;
 update public.career_apply_jobs set state='confirmed', email_confirmed_at=now(),
  confirmation_mail_hash=h where id = p_id;
 insert into public.career_mail_events(user_id,application_ref,kind,company,evidence,message_hash,mail_at)
 values (j.user_id,'job:'||j.id,'received',j.company,'received: "thank you for applying" from example.test',h,now());
end $$;
