-- Career postings (20261019000001_career_postings.sql, WO-006): signed-in people read open postings; only the service
-- role writes them; the ingest state is the service role's alone; the constraints keep a posting a real, linkable job;
-- full-text search stems ("nurse" finds "Nursing") and ranks the title first.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000e1','jobs1@example.com');
set role service_role;
insert into public.career_postings(job_id,provider,board,ats_id,company,title,location,url,description,first_seen_at,last_seen_at)
values ('greenhouse:stripe:101','greenhouse','stripe','101','Stripe','Data Analyst','Remote - US','https://job-boards.greenhouse.io/stripe/jobs/101','SQL and dashboards for the payments team.','2026-10-19T12:00:00Z','2026-10-19T12:00:00Z'),
       ('lever:palantir:a1b2','lever','palantir','a1b2','Palantir','Nursing Informatics Lead','New York, NY','https://jobs.lever.co/palantir/a1b2','Clinical workflows and EHR data.','2026-10-19T12:10:00Z','2026-10-19T12:10:00Z');
select t.ok((select count(*)=2 from public.career_postings),'the service role writes postings');
insert into public.career_ingest_state(id,cursor,last_run_at,last_stats) values(1,60,now(),'{"boards_ok":60}');
select t.must_fail($$insert into public.career_ingest_state(id,cursor) values(2,0)$$,'career_ingest_state_id_check','the ingest state is one row');
select t.must_fail($$insert into public.career_postings(job_id,provider,board,company,title,url,first_seen_at,last_seen_at) values('workday:acme:1','workday','acme','Acme','X','https://acme.test/1',now(),now())$$,'check','a provider Trainee does not ingest is refused');
select t.must_fail($$insert into public.career_postings(job_id,provider,board,company,title,url,first_seen_at,last_seen_at) values('lever:acme:1','lever','acme','Acme','X','http://acme.test/1',now(),now())$$,'career_postings_url_check','a link that is not https is refused');
select t.must_fail($$insert into public.career_postings(job_id,provider,board,company,title,url,first_seen_at,last_seen_at) values('lever:acme:1','lever','acme','Acme','','https://acme.test/1',now(),now())$$,'career_postings_title_check','a posting without a title is refused');
select t.must_fail($$insert into public.career_postings(job_id,provider,board,company,title,url,description,first_seen_at,last_seen_at) values('lever:acme:1','lever','acme','Acme','X','https://acme.test/1',repeat('word ',4001),now(),now())$$,'career_postings_description_check','a description past 20,000 characters is refused');
select t.must_fail($$insert into public.career_postings(job_id,provider,board,company,title,url,first_seen_at,last_seen_at) values('lever:acme:1','lever','acme','Acme','X','https://acme.test/1','2026-10-19','2026-10-18')$$,'career_postings_seen_order','last seen before first seen is refused');
select t.must_fail($$insert into public.career_postings(job_id,provider,board,company,title,url,first_seen_at,last_seen_at) values('acme-1','lever','acme','Acme','X','https://acme.test/1',now(),now())$$,'career_postings_job_id_check','a job id that is not provider:board:id is refused');
-- WO-069 (20261022110000_career_postings_pay.sql): the pay a board states; null when it states none, at most 200 characters.
select t.ok((select count(*)=1 from information_schema.columns where table_schema='public' and table_name='career_postings' and column_name='pay' and data_type='text' and is_nullable='YES'),'career_postings has a nullable pay column');
select t.ok((select count(*)=2 from public.career_postings where pay is null),'a posting written without pay keeps null');
update public.career_postings set pay='$120,000–$180,000 (Base Pay Range)' where job_id='greenhouse:stripe:101';
select t.ok((select pay='$120,000–$180,000 (Base Pay Range)' from public.career_postings where job_id='greenhouse:stripe:101'),'the service role writes the pay a board states');
select t.must_fail($$update public.career_postings set pay=repeat('9',201) where job_id='greenhouse:stripe:101'$$,'career_postings_pay_check','a pay past 200 characters is refused');
update public.career_postings set pay=null where job_id='greenhouse:stripe:101';
select t.ok((select count(*)=1 from public.career_postings where search @@ websearch_to_tsquery('english','nurse')),'"nurse" finds the Nursing posting (stemmed)');
select t.ok((select count(*)=1 from public.career_postings where search @@ websearch_to_tsquery('english','data analyst remote')),'every word must match: "data analyst remote" finds only the remote analyst');
select t.ok((select count(*)=1 from public.career_postings where search @@ websearch_to_tsquery('english','payments')),'the description is searched too');
update public.career_postings set closed_at='2026-10-19T13:00:00Z' where job_id='greenhouse:stripe:101';
reset role;
-- A signed-in person reads postings and nothing else.
select t.as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
select t.ok((select count(*)=2 from public.career_postings),'a signed-in person reads postings');
select t.ok((select count(*)=1 from public.career_postings where closed_at is null),'and can tell open from closed');
select t.must_fail($$insert into public.career_postings(job_id,provider,board,company,title,url,first_seen_at,last_seen_at) values('lever:acme:2','lever','acme','Acme','X','https://acme.test/2',now(),now())$$,'permission denied','a person cannot add a posting');
select t.must_fail($$update public.career_postings set title='Hacked' where job_id='lever:palantir:a1b2'$$,'permission denied','a person cannot change a posting');
select t.must_fail($$delete from public.career_postings$$,'permission denied','a person cannot delete postings');
select t.must_fail($$select * from public.career_ingest_state$$,'permission denied','a person cannot read the ingest state');
reset role;
set role anon;
select t.must_fail($$select * from public.career_postings$$,'permission denied','a signed-out visitor reads nothing');
reset role;
rollback;
