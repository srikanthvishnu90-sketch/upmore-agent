-- WO-021 W4: the person's own computer claims and finishes only that person's approved applications, signed in as them.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000911','own-a@example.test'),('00000000-0000-4000-8000-000000000912','own-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000911'),('00000000-0000-4000-8000-000000000912');
set role service_role;
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000000911','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-000000000912','career:account','{"epoch":1,"version":1,"paused":false}');
do $$declare p jsonb;h text;u text;begin
 foreach u in array array['00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000912'] loop
  p:=jsonb_build_object('version',1,'user_id',u,'job_id','TEST-OWN-'||right(u,3),'company','Own Employer '||right(u,3),
   'url','https://jobs.lever.co/test/own','fields','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour');
  h:=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
  perform career_apply_enqueue(p,h,h,15);
 end loop;
end $$;
reset role;

-- Nobody signed in: refused.
set role authenticated;
select t.must_fail($$select * from career_apply_claim_own(6)$$,'not signed in','a computer that is not signed in claims nothing');
reset role;
set role anon;
select t.must_fail($$select * from career_apply_claim_own(6)$$,'permission denied','anon cannot call the own claim');
reset role;

-- Person A claims: only A's application, once.
select t.as_user('00000000-0000-4000-8000-000000000911');set role authenticated;
create temp table own_claim as select * from career_apply_claim_own(6);
select t.ok((select count(*)=1 and bool_and(user_id='00000000-0000-4000-8000-000000000911' and state='driving' and attempts=1) from own_claim),'A claims only A''s application');
select t.ok((select count(*)=0 from career_apply_claim_own(6)),'a claimed drive is not claimed again');
select t.must_fail($$select * from career_apply_claim(now(),6)$$,'permission denied','the all-users claim stays service-only');
select t.must_fail($$select career_apply_finish(id,lease_token,'confirmed','{}') from own_claim$$,'permission denied','the all-users finish stays service-only');
select t.must_fail($$select career_apply_finish_own(id,lease_token,'confirmed','"x"'::jsonb) from own_claim$$,'invalid apply evidence','evidence must be an object');
select t.must_fail($$select career_apply_finish_own(id,lease_token,'sent','{}') from own_claim$$,'invalid apply transition','an unknown outcome is refused');
reset role;

-- Person B cannot finish A's drive, even holding A's lease, and claims only B's own.
create temp table a_lease as select id,lease_token from own_claim;
grant select on a_lease to authenticated;
select t.as_user('00000000-0000-4000-8000-000000000912');set role authenticated;
select t.must_fail($$select career_apply_finish_own(id,lease_token,'confirmed','{}') from a_lease$$,'invalid apply claim','B cannot finish A''s drive with A''s lease');
select t.ok((select count(*)=1 and bool_and(user_id='00000000-0000-4000-8000-000000000912') from career_apply_claim_own(6)),'B claims only B''s application');
reset role;

-- A finishes A's drive.
select t.as_user('00000000-0000-4000-8000-000000000911');set role authenticated;
select t.ok((select state='confirmed' and confirmation_id='TEST-C1' from career_apply_finish_own((select id from a_lease),(select lease_token from a_lease),'confirmed','{"reason":"employer confirmation on the page","confirmation_id":"TEST-C1"}')),'A records the employer''s answer');
select t.must_fail($$select career_apply_finish_own(id,lease_token,'failed','{}') from a_lease$$,'invalid apply transition','a finished drive cannot be rewritten');
reset role;

-- A drive that stopped without a result is unknown at A's next claim, never re-driven.
update career_apply_jobs set claimed_at=now()-interval '16 minutes' where user_id='00000000-0000-4000-8000-000000000912';
select t.as_user('00000000-0000-4000-8000-000000000912');set role authenticated;
select t.ok((select count(*)=0 from career_apply_claim_own(6)),'nothing is re-driven');
reset role;
select t.ok((select state='unknown_outcome' and reason like '%not retried%' from career_apply_jobs where user_id='00000000-0000-4000-8000-000000000912'),'a stopped drive is unknown, named, not retried');

-- A paused account is never driven by its own computer either.
set role service_role;
update career_watch_kv set value='{"epoch":1,"version":1,"paused":true}' where user_id='00000000-0000-4000-8000-000000000911';
do $$declare p jsonb;h text;begin
 p:=jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000911','job_id','TEST-OWN-PAUSED','company','Paused Employer',
  'url','https://jobs.lever.co/test/paused','fields','[]'::jsonb,'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour');
 h:=encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
 update career_watch_kv set value='{"epoch":1,"version":1,"paused":false}' where user_id='00000000-0000-4000-8000-000000000911';
 perform career_apply_enqueue(p,h,h,15);
 update career_watch_kv set value='{"epoch":1,"version":1,"paused":true}' where user_id='00000000-0000-4000-8000-000000000911';
end $$;
reset role;
select t.as_user('00000000-0000-4000-8000-000000000911');set role authenticated;
select t.ok((select count(*)=0 from career_apply_claim_own(6)),'a paused account is never driven');
reset role;
rollback;
