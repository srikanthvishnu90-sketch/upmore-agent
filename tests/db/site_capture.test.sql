-- WO-081 (port of main's 20261019020000_site_capture.sql, live in production, kept byte for byte): the landing page's
-- waitlist and careers capture. Only the service role (the site-signup / site-careers edge functions) writes; nobody
-- signed in or signed out can read or write either table, and uploaded resumes sit in a private bucket nobody else reads.
begin;
reset role;
select t.ok((select relrowsecurity from pg_class where oid='public.site_waitlist'::regclass),'the waitlist has row level security on');
select t.ok((select relrowsecurity from pg_class where oid='public.site_careers_applications'::regclass),'the careers applications have row level security on');
select t.ok((select count(*)=0 from pg_policy where polrelid in ('public.site_waitlist'::regclass,'public.site_careers_applications'::regclass)),'neither table has a policy: no public reads or writes');
select t.ok((select public is false from storage.buckets where id='careers-resumes'),'the resume bucket is private');

set role service_role;
insert into public.site_waitlist(name,phone,consent,consent_text,consent_at,source) values('Test Visitor','+15550001234',true,'I agree to texts','2026-10-19T00:00:00Z','hero');
insert into public.site_careers_applications(name,email,resume_path) values('Test Applicant','applicant@example.test','00000000-0000-4000-8000-000000000981.pdf');
insert into storage.objects(bucket_id,name) values('careers-resumes','00000000-0000-4000-8000-000000000981.pdf');
select t.ok((select count(*)=1 from public.site_waitlist where phone='+15550001234'),'the edge function (service role) records a signup');
select t.ok((select count(*)=1 from public.site_careers_applications where email='applicant@example.test'),'and a careers application');
select t.ok((select consent and created_at is not null and id is not null from public.site_waitlist where phone='+15550001234'),'with its consent and a time');

set role anon;
select t.ok((select count(*)=0 from public.site_waitlist),'a visitor reads no signups');
select t.ok((select count(*)=0 from public.site_careers_applications),'a visitor reads no applications');
select t.ok((select count(*)=0 from storage.objects where bucket_id='careers-resumes'),'a visitor reads no resume');
select t.must_fail($$insert into public.site_waitlist(name,phone,consent) values('x','+15550000000',true)$$,'row-level security','a visitor cannot write a signup straight to the table');
select t.must_fail($$insert into public.site_careers_applications(name,email,resume_path) values('x','x@example.test','x.pdf')$$,'row-level security','or an application');

set role authenticated;
select t.ok((select count(*)=0 from public.site_waitlist),'a signed-in person reads no signups');
select t.ok((select count(*)=0 from public.site_careers_applications),'or applications');
select t.ok((select count(*)=0 from storage.objects where bucket_id='careers-resumes'),'or resumes');
select t.must_fail($$insert into public.site_waitlist(name,phone,consent) values('x','+15550000000',true)$$,'row-level security','a signed-in person cannot write a signup either');
select t.must_fail($$insert into storage.objects(bucket_id,name) values('careers-resumes','planted.pdf')$$,'row-level security','or put a file in the resume bucket');
rollback;
