-- STEP 4 F1 (20261025130000_career_apply_wanted_candidates.sql): a posting in the person's own apply queue is a
-- prepare-ahead candidate, under the same gates as an alerted one; a taken row, a closed posting, a paused account, a
-- prepared row and a fresh failed try each stand it down; nothing is approved, queued or sent by the read.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000c1','wq1@example.com'),('00000000-0000-0000-0000-0000000000c2','wq2@example.com');
insert into public.profiles(id) values('00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c2') on conflict do nothing;
set role service_role;
insert into public.career_watch_kv(user_id,key,value) values
 ('00000000-0000-0000-0000-0000000000c1','career:account','{"epoch":0,"version":0,"paused":false}'),
 ('00000000-0000-0000-0000-0000000000c2','career:account','{"epoch":0,"version":0,"paused":true}');
insert into public.career_postings(job_id,provider,board,company,title,location,url,description,first_seen_at,last_seen_at) values
 ('greenhouse:wanttest:1','greenhouse','wanttest','Want Co','Analyst','Chicago, IL','https://boards.greenhouse.io/wanttest/jobs/1','Analyst role.',now(),now()),
 ('greenhouse:wanttest:2','greenhouse','wanttest','Closed Co','Analyst','Chicago, IL','https://boards.greenhouse.io/wanttest/jobs/2','Closed role.',now(),now());
update public.career_postings set closed_at = now() where job_id = 'greenhouse:wanttest:2';
select public.career_apply_want_put_for('00000000-0000-0000-0000-0000000000c1',
 '[{"posting_key":"greenhouse:wanttest:1","url":"https://job-boards.greenhouse.io/wanttest/jobs/1","company":"Want Co","title":"Analyst"},
   {"posting_key":"greenhouse:wanttest:2","url":"https://job-boards.greenhouse.io/wanttest/jobs/2","company":"Closed Co","title":"Analyst"},
   {"posting_key":"greenhouse:wanttest:9","url":"https://job-boards.greenhouse.io/wanttest/jobs/9","company":"Nowhere Co","title":"Analyst"}]'::jsonb);
select public.career_apply_want_put_for('00000000-0000-0000-0000-0000000000c2',
 '[{"posting_key":"greenhouse:wanttest:1","url":"https://job-boards.greenhouse.io/wanttest/jobs/1","company":"Want Co","title":"Analyst"}]'::jsonb);
select t.ok((select count(*)=1 from public.career_apply_prepare_candidates(now(),5,50) c where c.user_id='00000000-0000-0000-0000-0000000000c1' and c.job_id='greenhouse:wanttest:1'),
 'a waiting queue row whose posting is open on file is a candidate, with no alert ever sent');
select t.ok((select count(*)=0 from public.career_apply_prepare_candidates(now(),5,50) c where c.job_id in ('greenhouse:wanttest:2','greenhouse:wanttest:9')),
 'a closed posting and a posting not on file are never candidates');
select t.ok((select count(*)=0 from public.career_apply_prepare_candidates(now(),5,50) c where c.user_id='00000000-0000-0000-0000-0000000000c2'),
 'a paused account is never prepared for');
select t.ok((select count(*)=0 from public.career_apply_jobs) and (select count(*)=0 from public.career_apply_prepared), 'the read approves, queues and prepares nothing');
-- A try that failed today stands it down for a week; an "asked" try stands it down only while its question is open.
select public.career_apply_prepare_attempt_for('00000000-0000-0000-0000-0000000000c1','greenhouse:wanttest:1','error','TEST engine down',null,'eng-1');
select t.ok((select count(*)=0 from public.career_apply_prepare_candidates(now(),5,50) c where c.user_id='00000000-0000-0000-0000-0000000000c1'), 'a fresh failed try stands it down');
select t.ok((select count(*)=1 from public.career_apply_prepare_candidates(now() + interval '8 days',5,50) c where c.user_id='00000000-0000-0000-0000-0000000000c1'), 'a week later it is tried again');
-- The extension took it into its own queue: the server leaves it alone.
update public.career_apply_wanted set state='taken', taken_at=now() where user_id='00000000-0000-0000-0000-0000000000c1' and posting_key='greenhouse:wanttest:1';
select t.ok((select count(*)=0 from public.career_apply_prepare_candidates(now() + interval '8 days',5,50) c where c.user_id='00000000-0000-0000-0000-0000000000c1'), 'a taken row is not a server candidate');
rollback;
