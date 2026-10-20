-- WO-091d: every application row ends, and says what is known. A drive the extension never finished is swept after its
-- 30-minute lease (unknown once the click was reported, interrupted before it); an interrupted attempt, a submit the
-- browser itself refused, and an employer error the person released may be approved again; a begin whose answer was lost
-- returns the same drive; a finish kept on the person's computer lands even after the sweep; the person records a page
-- they finished themselves; needs_user, interrupted and a stale drive never count toward the daily limit or the company rule.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000091d01','states-a@example.test'),('00000000-0000-4000-8000-000000091d02','states-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000091d01'),('00000000-0000-4000-8000-000000091d02');
set role service_role;
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000091d01','career:account','{"epoch":0,"version":1,"paused":false,"daily_limit":"50"}'),
 ('00000000-0000-4000-8000-000000091d02','career:account','{"epoch":0,"version":1,"paused":false}');
reset role;

-- One payload per posting (its own company unless named), each with the database's own hash.
create temp table st_v as select name, q as p, encode(sha256(convert_to(career_apply_canonical(q),'UTF8')),'hex') as h from (
 select name, jsonb_build_object('version',1,'source','extension','user_id','00000000-0000-4000-8000-000000091d01',
  'job_id','lever:'||co||':'||name,'company',co,'url','https://jobs.lever.co/'||co||'/'||name||'/apply','family','lever',
  'fields',jsonb_build_array(jsonb_build_object('name','name','label','Full name','value','TEST Person','source','trainee','factId','text-answer:1')),
  'resume_name','test.pdf','resume_sha256',repeat('a',64),'privacy_epoch',0,'account_version',1,'expires_at',(now()+interval '2 hours')::text) as q
 from (values ('lost','lostco'),('closed','closedco'),('clicked','clickedco'),('refused','refusedco'),('captcha','captchaco'),
  ('captcha2','captchaco'),('rejected','rejectco'),('late','lateco'),('cap1','capco1'),('cap2','capco2'),('cap3','capco3'),('cap4','capco4'),
  ('rv_clicked','rvco'),('rv_clicked2','rvco'),('rv_noclick','rvnco'),('rv_noclick2','rvnco'),('rv_cloud','rvcloudco'),('rv_cloud2','rvcloudco')) v(name,co)) x;
-- The same posting, approved again from a fresh card (a new expiry: another hash).
insert into st_v select 'lost_again', p||jsonb_build_object('expires_at',(now()+interval '3 hours')::text), null from st_v where name='lost';
update st_v set h=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex') where h is null;
grant select on st_v to authenticated, anon;
create temp table st_r(name text primary key, r jsonb);
grant all on st_r to authenticated;

-- The new doors are the person's own: not anon, not signed out, never someone else's row.
set role anon;
select t.must_fail($$select career_apply_sweep_own()$$,'permission denied','anon cannot sweep');
select t.must_fail($$select career_apply_resolve_own(gen_random_uuid())$$,'permission denied','anon cannot resolve');
reset role;
set role authenticated;
select t.must_fail($$select career_apply_sweep_own()$$,'not signed in','a browser that is not signed in sweeps nothing');
select t.must_fail($$select career_apply_clicked_own(gen_random_uuid(),gen_random_uuid())$$,'not signed in','or reports no click');
reset role;

select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;

-- F2: the begin's answer was lost. Begun again, the same posting is still refused (WO-031), and the refusal names the
-- live drive; the same approval then resumes that drive (today: no way on but "You already applied").
insert into st_r select 'lost', career_apply_extension_begin_own(p, h) from st_v where name='lost';
select t.must_fail($$select career_apply_extension_begin_own(p, h) from st_v where name='lost'$$,'duplicate_job: driving [0-9a-f-]{36}','a live drive is never begun twice; the refusal names its state and row');
insert into st_r select 'lost2', career_apply_extension_resume_own(p, h) from st_v where name='lost';
select t.ok((select (a.r->>'id')=(b.r->>'id') and (a.r->>'lease')=(b.r->>'lease') from st_r a, st_r b where a.name='lost' and b.name='lost2'),
 'the same approval resumes the same drive, its lease unchanged');
select t.ok((select count(*)=1 from career_apply_jobs where job_id='lever:lostco:lost'),'one row');
-- Another card for the same posting (another approval) never resumes it.
select t.must_fail($$select career_apply_extension_resume_own(p, h) from st_v where name='lost_again'$$,'nothing to resume','another approval does not take over a live drive');
select t.must_fail($$select career_apply_extension_resume_own(p, repeat('c',64)) from st_v where name='lost'$$,'invalid or stale','only the payload''s own hash');
-- Once the click is reported, even the same approval never resumes.
select t.ok((select career_apply_clicked_own((r->>'id')::uuid,(r->>'lease')::uuid) from st_r where name='lost'),'the click is reported once it happened');
select t.must_fail($$select career_apply_extension_resume_own(p, h) from st_v where name='lost'$$,'nothing to resume','after a reported click the same approval is not resumed');
select t.ok((select not career_apply_clicked_own((r->>'id')::uuid,gen_random_uuid()) from st_r where name='lost'),'a click is reported only under the drive''s own lease');
reset role;

-- F2/F11: drives the browser never finished. Beyond the 30-minute lease the sweep ends them: no reported click,
-- interrupted (nothing is known to have been sent); a reported click, unknown and never retried.
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
insert into st_r select 'closed', career_apply_extension_begin_own(p, h) from st_v where name='closed';
insert into st_r select 'clicked', career_apply_extension_begin_own(p, h) from st_v where name='clicked';
select career_apply_clicked_own((r->>'id')::uuid,(r->>'lease')::uuid) from st_r where name='clicked';
reset role;
update career_apply_jobs set claimed_at=now()-interval '29 minutes' where job_id in ('lever:closedco:closed','lever:clickedco:clicked');
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
select t.ok(career_apply_sweep_own()=0,'a drive inside its lease is left alone');
reset role;
update career_apply_jobs set claimed_at=now()-interval '31 minutes' where job_id in ('lever:closedco:closed','lever:clickedco:clicked','lever:lostco:lost');
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
select t.ok(career_apply_sweep_own()=3,'three stale drives swept');
select t.ok((select state='interrupted' and reason like 'interrupted%' and evidence ? 'swept_at' from career_apply_jobs where job_id='lever:closedco:closed'),
 'no reported click: interrupted, with the reason');
select t.ok((select state='unknown_outcome' and reason like '%after the click%' from career_apply_jobs where job_id='lever:clickedco:clicked'),
 'a reported click: unknown, never retried');
select t.ok(career_apply_sweep_own()=0,'a second sweep changes nothing');
-- The interrupted one may be approved again (today: "You already applied to this posting").
insert into st_r select 'closed2', career_apply_extension_begin_own(p, h) from st_v where name='closed';
select t.ok((select state='driving' and id::text <> (select r->>'id' from st_r where name='closed') from career_apply_jobs where job_id='lever:closedco:closed'),
 'an interrupted attempt is approved again as a new drive');
select t.must_fail($$select career_apply_extension_begin_own(p, h) from st_v where name='clicked'$$,'duplicate_job.*unknown_outcome','the unknown one never goes again');
reset role;

-- F2: the finish the browser kept while it was offline lands after the sweep, under its own lease, once.
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
insert into st_r select 'late', career_apply_extension_begin_own(p, h) from st_v where name='late';
reset role;
update career_apply_jobs set claimed_at=now()-interval '45 minutes' where job_id='lever:lateco:late';
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
select career_apply_sweep_own();
select t.ok((select state='interrupted' from career_apply_jobs where job_id='lever:lateco:late'),'swept while the finish waited on the computer');
select t.ok((select state='submitted_unconfirmed' and (evidence->>'page_confirmation')::boolean and evidence ? 'late_after_sweep'
 from career_apply_finish_own((select (r->>'id')::uuid from st_r where name='late'),(select (r->>'lease')::uuid from st_r where name='late'),'confirmed',
 '{"reason":"employer confirmation on the page","source":"extension"}')),'the kept finish replaces the sweep''s guess with what the page showed');
select t.must_fail($$select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'failed','{}') from st_r where name='late'$$,'invalid apply transition','and only once');
select t.must_fail($$select career_apply_finish_own((r->>'id')::uuid,gen_random_uuid(),'failed','{}') from st_r where name='closed'$$,'invalid apply claim','never under another lease');
reset role;

-- F1: a submit the browser itself refused (no submit event, an invalid field) is not sent and may be approved again.
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
insert into st_r select 'refused', career_apply_extension_begin_own(p, h) from st_v where name='refused';
select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'not_submitted','{"reason":"the browser refused the submit: LinkedIn URL: Please enter a URL."}') from st_r where name='refused';
select t.ok((select (career_apply_extension_begin_own(p, h)->>'id') is not null from st_v where name='refused'),'a submit the browser refused is approved again');
reset role;

-- F4: the page asked for a check after the click; the person finished it there and says so on the card.
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
insert into st_r select 'captcha', career_apply_extension_begin_own(p, h) from st_v where name='captcha';
select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'needs_user','{"reason":"captcha"}') from st_r where name='captcha';
-- needs_user is not sent yet: it holds no place under the company rule (today: company_cooldown).
insert into st_r select 'captcha2', career_apply_extension_begin_own(p, h) from st_v where name='captcha2';
select t.ok((select r->>'id' is not null from st_r where name='captcha2'),'a page still asking for something does not block the company');
select t.ok((select state='submitted_unconfirmed' and reason like 'finished by the person%' and evidence->>'finished_by'='person'
 from career_apply_resolve_own((select (r->>'id')::uuid from st_r where name='captcha'))),'the person finished it themselves: sent, awaiting the employer''s email');
select t.must_fail($$select career_apply_resolve_own((r->>'id')::uuid) from st_r where name='captcha'$$,'invalid apply transition','recorded once');
select t.must_fail($$select career_apply_resolve_own((r->>'id')::uuid) from st_r where name='closed2'$$,'invalid apply transition','only a page that asked for something');
reset role;
select t.as_user('00000000-0000-4000-8000-000000091d02');set role authenticated;
select t.must_fail($$select career_apply_resolve_own((r->>'id')::uuid) from st_r where name='captcha2'$$,'invalid apply transition','never someone else''s');
select t.must_fail($$select career_apply_release_own((r->>'id')::uuid) from st_r where name='captcha2'$$,'invalid apply transition','never someone else''s release');
reset role;

-- F4: the employer's form refused it in place. Approving again is refused until the person says so on the card (release);
-- then once more.
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
insert into st_r select 'rejected', career_apply_extension_begin_own(p, h) from st_v where name='rejected';
select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'failed','{"reason":"Phone is invalid"}') from st_r where name='rejected';
select t.must_fail($$select career_apply_extension_begin_own(p, h) from st_v where name='rejected'$$,'duplicate_job.*failed','an employer error is never retried by itself');
select t.ok((select evidence ? 'released_at' from career_apply_release_own((select (r->>'id')::uuid from st_r where name='rejected'))),'the person releases it from the card');
select t.must_fail($$select career_apply_release_own((r->>'id')::uuid) from st_r where name='rejected'$$,'invalid apply transition','released once');
select t.ok((select (career_apply_extension_begin_own(p, h)->>'id') is not null from st_v where name='rejected'),'then it is approved again');
reset role;

-- Counting: the daily limit (3 here) holds sent rows and live drives, never interrupted, needs_user or stale drives.
reset role;
delete from career_apply_jobs where user_id='00000000-0000-4000-8000-000000091d01';
update career_watch_kv set value=value||'{"daily_limit":"3"}' where user_id='00000000-0000-4000-8000-000000091d01' and key='career:account';
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
insert into st_r select 'cap1', career_apply_extension_begin_own(p, h) from st_v where name='cap1';
insert into st_r select 'cap2', career_apply_extension_begin_own(p, h) from st_v where name='cap2';
select career_apply_finish_own((r->>'id')::uuid,(r->>'lease')::uuid,'needs_user','{"reason":"captcha"}') from st_r where name='cap2';
insert into st_r select 'cap3', career_apply_extension_begin_own(p, h) from st_v where name='cap3';
reset role;
update career_apply_jobs set claimed_at=now()-interval '40 minutes' where job_id='lever:capco3:cap3';
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
insert into st_r select 'cap4', career_apply_extension_begin_own(p, h) from st_v where name='cap4';
select t.ok((select r->>'id' is not null from st_r where name='cap4'),'one live drive, one needs_user, one swept: under a limit of 3');
select t.ok((select state='interrupted' from career_apply_jobs where job_id='lever:capco3:cap3'),'the stale drive was swept by the begin itself');
reset role;

-- Review of #128: age alone never frees a drive that may have reached the employer. A drive counts toward the limit and
-- the company rule until a sweep ends it; every path that checks them sweeps the person's drives first, under the same lock.
delete from career_apply_jobs where user_id='00000000-0000-4000-8000-000000091d01';
update career_watch_kv set value=value||'{"daily_limit":"50"}' where user_id='00000000-0000-4000-8000-000000091d01' and key='career:account';
select t.as_user('00000000-0000-4000-8000-000000091d01');set role authenticated;
insert into st_r select 'rv_clicked', career_apply_extension_begin_own(p, h) from st_v where name='rv_clicked';
select career_apply_clicked_own((r->>'id')::uuid,(r->>'lease')::uuid) from st_r where name='rv_clicked';
insert into st_r select 'rv_noclick', career_apply_extension_begin_own(p, h) from st_v where name='rv_noclick';
reset role;
update career_apply_jobs set claimed_at=now()-interval '31 minutes' where job_id in ('lever:rvco:rv_clicked','lever:rvnco:rv_noclick');
-- The extension clicked and the browser died; 31 minutes later the person says yes in chat to the same company.
select t.must_fail($$select career_apply_enqueue(p,h,h,25) from st_v where name='rv_clicked2'$$,'company_cooldown',
 'a clicked drive past its lease still holds the company: the employer never gets it twice');
-- (The refused yes rolls back with its own sweep: the clicked drive is still held, never freed.)
select t.ok((select state in ('driving','unknown_outcome') from career_apply_jobs where job_id='lever:rvco:rv_clicked'),'the clicked drive is still held, never interrupted');
-- No click: the yes sweeps it to interrupted and goes.
select t.ok((select state='queued' from career_apply_enqueue((select p from st_v where name='rv_noclick2'),(select h from st_v where name='rv_noclick2'),
 (select h from st_v where name='rv_noclick2'),25)),'a drive that never clicked is freed by the next yes');
select t.ok((select state='interrupted' from career_apply_jobs where job_id='lever:rvnco:rv_noclick'),'swept to interrupted under the same lock');
-- A cloud worker's drive longer than 30 minutes still counts; the scheduled service sweep ends it as unknown (a worker
-- reports no click, so it may have sent), and it still counts.
insert into career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash,state,attempts,claimed_at,lease_token,source)
 select '00000000-0000-4000-8000-000000091d01',p->>'job_id',p->>'company',p->>'url',p,h,h,'driving',1,now()-interval '45 minutes',gen_random_uuid(),'cloud'
 from st_v where name='rv_cloud';
select t.must_fail($$select career_apply_enqueue(p,h,h,25) from st_v where name='rv_cloud2'$$,'company_cooldown','a long cloud drive still holds the company');
select t.ok((select state='driving' from career_apply_jobs where job_id='lever:rvcloudco:rv_cloud'),'the person''s own sweep leaves a worker''s drive to the scheduled one');
set role authenticated;
select t.must_fail($$select career_apply_sweep_drives()$$,'permission denied','only the service runs the scheduled sweep');
reset role;
set role service_role;
select t.ok(career_apply_sweep_drives()>=1,'the scheduled sweep ends every stale drive, every source');
reset role;
select t.ok((select state='unknown_outcome' and evidence ? 'swept_at' from career_apply_jobs where job_id='lever:rvcloudco:rv_cloud'),'the cloud drive is unknown, never retried');
select t.must_fail($$select career_apply_enqueue(p,h,h,25) from st_v where name='rv_cloud2'$$,'company_cooldown','and it still holds the company');
rollback;
