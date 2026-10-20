begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000901','apply-test@example.test'),('00000000-0000-4000-8000-000000000902','other@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000901'),('00000000-0000-4000-8000-000000000902');
-- WO-039: the 009b-1 pool claim (career_apply_claim) is granted to no one, so this test drives it as the database owner.
insert into career_watch_kv(user_id,key,value) values('00000000-0000-4000-8000-000000000901','career:account','{"epoch":1,"version":1,"paused":false}');
create temp table apply_input as select jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000901','job_id','TEST-1','company','Test Employer','url','https://jobs.lever.co/test/TEST-1','fields','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour') p;
create temp table apply_claim as select * from career_apply_claim(now(),1);
select t.ok((select count(*)=0 from apply_claim),'empty queue claims nothing');
select career_apply_enqueue(p,encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),15) from apply_input;
select t.ok((select bool_and(state='queued' and attempts=0) from career_apply_jobs),'a new job waits queued');
select t.must_fail($$update career_apply_jobs set state='sent'$$,'career_apply_jobs_state_check','unknown states are refused');
select t.must_fail($$select career_apply_enqueue(p,'bad','bad',15) from apply_input$$,'invalid or stale','a fabricated payload digest is refused');
do $$declare p jsonb;h text;begin
 p:=(select i.p from apply_input i)||'{"job_id":"TEST-OTHER","company":"Test Employer LLC"}';h:=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
 perform t.must_fail(format('select career_apply_enqueue(%L,%L,%L,15)',p,h,h),'company_cooldown','company aliases share the 30-day cap');
 p:=p||'{"company":"Different Employer"}';h:=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
 perform t.must_fail(format('select career_apply_enqueue(%L,%L,%L,1)',p,h,h),'daily_cap','SQL enforces admission under the owner lock');
end $$;
update career_watch_kv set value='{"epoch":1,"version":1,"paused":true}' where key='career:account' and user_id='00000000-0000-4000-8000-000000000901';
select t.ok((select count(*)=0 from career_apply_claim(now(),6)),'paused owner cannot be driven');
update career_watch_kv set value='{"epoch":2,"version":2}' where key='career:account' and user_id='00000000-0000-4000-8000-000000000901';
select t.ok((select count(*)=0 from career_apply_claim(now(),6)),'erased or changed facts cannot use the old approval');
update career_watch_kv set value='{"epoch":1,"version":1}' where key='career:account' and user_id='00000000-0000-4000-8000-000000000901';
select t.must_fail($$select career_apply_enqueue(p,encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),15) from apply_input$$,'duplicate_job','one application per posting ever');
insert into apply_claim select * from career_apply_claim(now(),1);
select t.ok((select count(*)=1 and bool_and(state='driving' and attempts=1 and claimed_at is not null) from apply_claim),'claim enters driving once');
select t.ok((select count(*)=0 from career_apply_claim(now(),10)),'a claimed drive cannot be claimed again');
select t.must_fail($$select career_apply_finish(id,gen_random_uuid(),'confirmed','{}') from apply_claim$$,'invalid apply claim','foreign lease cannot finish');
select t.ok(career_apply_sweep(now()+interval '16 minutes')=1,'dead drive becomes uncertain');
select t.ok((select bool_and(state='unknown_outcome' and reason like '%not retried%') from career_apply_jobs),'uncertainty is named without inventing submission');
select t.ok((select count(*)=0 from career_apply_claim(now()+interval '17 minutes',10)),'dead drive never re-drives');
select t.must_fail($$select career_apply_finish(id,lease_token,'confirmed','{}') from apply_claim$$,'invalid apply transition','late worker cannot overwrite a swept claim');
select t.must_fail($$select career_apply_enqueue(p,encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex'),15) from apply_input$$,'duplicate_job','an uncertain posting cannot be enqueued anew');
-- Each reported final state is accepted only for its actual claimed drive.
do $$declare s text;p jsonb;j career_apply_jobs;h text;begin
 for s in select unnest(array['confirmed','submitted_unconfirmed','needs_user','failed','not_submitted','unknown_outcome']) loop
  p:=(select i.p from apply_input i)||jsonb_build_object('job_id','TEST-'||s,'company','Employer '||s);h:=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
  perform career_apply_enqueue(p,h,h,15);select * into j from career_apply_claim(now(),1);perform career_apply_finish(j.id,j.lease_token,s,jsonb_build_object('reason','TEST outcome'));
 end loop;
end $$;
-- WO-032 (20261021075000): a page's "confirmed" is evidence; the row waits, submitted_unconfirmed, for the employer's email.
select t.ok((select count(distinct state)=5 and bool_and(state<>'confirmed') from career_apply_jobs where job_id<>'TEST-1'),'all final states persist; none is confirmed by a page');
select t.ok((select state='submitted_unconfirmed' and evidence->>'page_confirmation'='true' from career_apply_jobs where job_id='TEST-confirmed'),'the page''s confirmation is kept as evidence');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000902');set role authenticated;
select t.ok((select count(*)=0 from career_apply_jobs),'other owner sees no rows');
select t.must_fail($$select * from career_apply_claim(now(),10)$$,'permission denied','owner cannot claim');
select t.must_fail($$delete from career_apply_jobs$$,'permission denied','owner cannot delete receipts');
reset role;select t.as_user('00000000-0000-4000-8000-000000000901');set role authenticated;
select t.ok((select count(*)=7 from career_apply_jobs),'owner reads own rows');
reset role;delete from auth.users where id='00000000-0000-4000-8000-000000000901';
select t.ok((select count(*)=0 from career_apply_jobs),'account deletion cascades');
rollback;
