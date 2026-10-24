-- WO-028 (20261020130000_career_resume_tailoring.sql): tailored resumes live in a private bucket the person alone can
-- read, and every application is tagged tailored or untailored from the exact resume file it carries.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000961','tailor-a@example.test'),('00000000-0000-4000-8000-000000000962','tailor-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000961'),('00000000-0000-4000-8000-000000000962');
select t.ok((select public is false from storage.buckets where id='career-resumes'),'the resume bucket is private');
select t.ok((select file_size_limit=2500000 and allowed_mime_types=array['application/pdf'] from storage.buckets where id='career-resumes'),'PDFs only, at most 2.5 MB');
select t.ok((select count(*)=3 from information_schema.columns where table_schema='public' and table_name='career_apply_jobs' and column_name in ('resume_sha256','tailored','resume_persona')),'the three columns are added');
select t.ok((select count(*)=19 from information_schema.columns where table_schema='public' and table_name='career_apply_jobs' and column_name in
 ('id','user_id','job_id','company','url','payload','payload_hash','approval_hash','state','reason','confirmation_id','attempts','lease_token','claimed_at','created_at','updated_at','evidence','tailored','resume_sha256')),'every existing column is still there');
select t.ok((select column_default='false' and is_nullable='NO' from information_schema.columns where table_schema='public' and table_name='career_apply_jobs' and column_name='tailored'),'every application is tagged: untailored unless shown otherwise');

set role service_role;
insert into storage.objects(bucket_id,name) values
 ('career-resumes','00000000-0000-4000-8000-000000000961/'||repeat('b',64)||'.pdf'),
 ('career-resumes','00000000-0000-4000-8000-000000000962/'||repeat('c',64)||'.pdf');
insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash) values
 ('00000000-0000-4000-8000-000000000961','TEST-T1','Tailor One','https://jobs.lever.co/test/T1',jsonb_build_object('resume_sha256',repeat('b',64),'resume_tailored',true,'resume_persona','banking'),repeat('a',64),repeat('a',64)),
 ('00000000-0000-4000-8000-000000000961','TEST-T2','Tailor Two','https://jobs.lever.co/test/T2',jsonb_build_object('resume_sha256',repeat('c',64),'resume_tailored',true,'resume_persona','banking'),repeat('a',64),repeat('a',64)),
 ('00000000-0000-4000-8000-000000000961','TEST-T3','Tailor Three','https://jobs.lever.co/test/T3',jsonb_build_object('resume_sha256',repeat('d',64),'resume_tailored',true),repeat('a',64),repeat('a',64)),
 ('00000000-0000-4000-8000-000000000961','TEST-T4','Tailor Four','https://jobs.lever.co/test/T4',jsonb_build_object('resume_sha256',repeat('b',64),'resume_persona','banking'),repeat('a',64),repeat('a',64)),
 ('00000000-0000-4000-8000-000000000961','TEST-T5','Tailor Five','https://jobs.lever.co/test/T5',jsonb_build_object('resume_sha256','not-a-hash','resume_tailored',true),repeat('a',64),repeat('a',64)),
 ('00000000-0000-4000-8000-000000000961','TEST-T6','Tailor Six','https://jobs.lever.co/test/T6',jsonb_build_object('resume_sha256',repeat('b',64),'resume_tailored',true,'resume_persona',repeat('x',40)),repeat('a',64),repeat('a',64));
select t.ok((select tailored and resume_persona='banking' and resume_sha256=repeat('b',64) from career_apply_jobs where job_id='TEST-T1'),'a tailored resume Trainee stored for this person is tagged tailored, with its persona');
select t.ok((select not tailored and resume_persona is null from career_apply_jobs where job_id='TEST-T2'),'another person''s tailored file does not count');
select t.ok((select not tailored and resume_sha256=repeat('d',64) from career_apply_jobs where job_id='TEST-T3'),'a tailored claim with no stored file is untailored');
select t.ok((select not tailored and resume_persona is null and resume_sha256=repeat('b',64) from career_apply_jobs where job_id='TEST-T4'),'no tailored claim: untailored, the resume still recorded');
select t.ok((select not tailored and resume_sha256 is null from career_apply_jobs where job_id='TEST-T5'),'a malformed hash records nothing');
select t.ok((select tailored and resume_persona is null from career_apply_jobs where job_id='TEST-T6'),'a persona name past 24 characters is not kept');
-- G3 (20261025100000): an approved payload changes only when a refused application is approved again, to a payload that
-- hashes to its new approval; this is that path.
update career_apply_jobs set state='not_submitted' where job_id='TEST-T4';
update career_apply_jobs set payload=payload||'{"resume_tailored":true}',
 payload_hash=career_apply_payload_hash(payload||'{"resume_tailored":true}'), approval_hash=career_apply_payload_hash(payload||'{"resume_tailored":true}')
 where job_id='TEST-T4';
select t.ok((select tailored and resume_persona='banking' from career_apply_jobs where job_id='TEST-T4'),'a changed payload is tagged again from the file');
-- The real enqueue path is tagged the same way.
insert into career_watch_kv(user_id,key,value) values('00000000-0000-4000-8000-000000000961','career:account','{"epoch":1,"version":1,"paused":false}');
create temp table tailor_input as select jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000961','job_id','TEST-T7','company','Tailor Seven','url','https://jobs.lever.co/test/T7','fields','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour','resume_sha256',repeat('b',64),'resume_tailored',true,'resume_persona','data') p;
select t.ok((select (career_apply_enqueue(p,encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),25)).tailored from tailor_input),'an enqueued application carrying a stored tailored resume is tagged tailored');
select t.ok((select resume_persona='data' from career_apply_jobs where job_id='TEST-T7'),'with the persona it used');
reset role;

-- Only the owner reads their own folder; nobody but the service role writes there.
select t.as_user('00000000-0000-4000-8000-000000000961');
set role authenticated;
select t.ok((select count(*)=1 and bool_and(name like '00000000-0000-4000-8000-000000000961/%') from storage.objects where bucket_id='career-resumes'),'a person sees only their own resumes');
select t.must_fail($$insert into storage.objects(bucket_id,name) values('career-resumes','00000000-0000-4000-8000-000000000961/'||repeat('e',64)||'.pdf')$$,'row-level security','a person cannot put a file in the bucket, even in their own folder');
update storage.objects set name='00000000-0000-4000-8000-000000000961/x.pdf' where bucket_id='career-resumes';
delete from storage.objects where bucket_id='career-resumes';
reset role;
select t.ok((select count(*)=2 from storage.objects where bucket_id='career-resumes' and name in ('00000000-0000-4000-8000-000000000961/'||repeat('b',64)||'.pdf','00000000-0000-4000-8000-000000000962/'||repeat('c',64)||'.pdf')),'and cannot rename or delete one');
select t.as_user('00000000-0000-4000-8000-000000000962');
set role authenticated;
select t.ok((select count(*)=1 and bool_and(name like '00000000-0000-4000-8000-000000000962/%') from storage.objects where bucket_id='career-resumes'),'the other person sees only theirs');
reset role;
select t.as_user('');
set role anon;
select t.ok((select count(*)=0 from storage.objects where bucket_id='career-resumes'),'nobody signed out reads a resume');
reset role;
rollback;
