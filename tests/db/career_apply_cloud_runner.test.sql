-- The cloud runner's database side (20261026100000_career_apply_cloud_runner.sql): the dispatcher claims through the one
-- cloud claim, never more than the global limit at once nor more than the per-portal limit on one family; the per-portal
-- claim is exactly claim_at with the family filter; a verification check is recorded per host; nobody but the service
-- reaches any of it.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-00000000d001','runner-a@example.test'),
 ('00000000-0000-4000-8000-00000000d002','runner-b@example.test'),
 ('00000000-0000-4000-8000-00000000d003','runner-c@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-00000000d001'),('00000000-0000-4000-8000-00000000d002'),('00000000-0000-4000-8000-00000000d003');
insert into career_watch_kv(user_id,key,value) select id,'career:account','{"epoch":1,"version":1,"paused":false}'::jsonb from profiles
 where id::text like '00000000-0000-4000-8000-00000000d00%';
delete from career_cloud_settings where key in ('CAREER_CLOUD_APPLY','gate_user_ids','owner_user_id');
delete from career_apply_cloud_pauses;
insert into career_cloud_settings(key,value) values('CAREER_CLOUD_APPLY','on');
select career_apply_cloud_optin_as(id,true,'TEST terms') from profiles where id::text like '00000000-0000-4000-8000-00000000d00%';
-- The gate stays closed; each person holds a waiver per family (the owner's operator writes these; 5 sends each).
insert into career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 select p.id, f, 5, now()+interval '1 day', 'TEST runner' from profiles p, unnest(array['greenhouse','lever','ashby']) f
 where p.id::text like '00000000-0000-4000-8000-00000000d00%';
create function pg_temp.q(u text, n int, url text) returns uuid language plpgsql as $$
declare p jsonb; h text;
begin
 p := jsonb_build_object('version',1,'user_id',u,'job_id','TEST-RUN-'||n,'company','Runner Employer '||n,'url',url,'fields','[]'::jsonb,
  'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour','engine_approval',repeat('e',64),
  'resume_sha256',encode(sha256('TEST resume'::bytea),'hex'),'destination',url);
 h := encode(sha256(convert_to(career_apply_canonical(p),'UTF8')),'hex');
 return (career_apply_enqueue(p,h,h,50)).id;
end $$;
select pg_temp.q('00000000-0000-4000-8000-00000000d001', g, 'https://job-boards.greenhouse.io/runa'||g||'/jobs/'||g) from generate_series(1,3) g;
select pg_temp.q('00000000-0000-4000-8000-00000000d001', g, 'https://jobs.lever.co/runa'||g||'/'||g) from generate_series(4,5) g;
select pg_temp.q('00000000-0000-4000-8000-00000000d002', g, 'https://job-boards.greenhouse.io/runb'||g||'/jobs/'||g) from generate_series(6,8) g;
select pg_temp.q('00000000-0000-4000-8000-00000000d003', g, 'https://jobs.ashbyhq.com/runc'||g||'/'||g) from generate_series(9,10) g;
select t.ok((select count(*)=10 from career_apply_jobs where job_id like 'TEST-RUN-%' and state='queued'),'ten approved applications queued');

-- The per-portal claim is the installed claim_at with the family filter, nothing else.
select t.ok(career_apply_cloud_runner_missing() = '{}','the per-portal claim matches the installed claim_at');
select t.ok((select prosrc like '%f = p_portal and public.career_apply_cloud_open(f)%' and prosrc like '%w.portal = p_portal and w.revoked_at%'
 from pg_proc where proname='career_apply_cloud_claim_portal_at'),'both candidate lists are filtered to the one family');
select t.ok((select replace(replace(p.prosrc,'f = p_portal and ',''),'w.portal = p_portal and ','') = c.prosrc
 from pg_proc p, pg_proc c where p.proname='career_apply_cloud_claim_portal_at' and c.oid='public.career_apply_cloud_claim_at(integer,timestamptz)'::regprocedure),
 'byte for byte claim_at apart from the two filters');

-- Nobody but the service.
set role authenticated;
select t.must_fail($$select * from career_apply_cloud_dispatch_claim(1,1,1)$$,'permission denied','a signed-in person cannot dispatch');
select t.must_fail($$select career_apply_cloud_check_rates(7)$$,'permission denied','a signed-in person cannot read the rates');
reset role;
set role service_role;
select t.must_fail($$select * from career_apply_cloud_claim_portal_at(1,now(),'lever')$$,'permission denied','the per-portal claim is reached only through the dispatcher');
select t.must_fail($$select * from career_apply_cloud_dispatch_claim(1,0,1)$$,'invalid dispatch limits','a zero global limit is refused');

-- Global 4, per portal 2: four claimed, no family over two.
create temp table d1 as select * from career_apply_cloud_dispatch_claim(10,4,2);
select t.ok((select count(*)=4 from d1),'four claimed: the global limit');
select t.ok((select max(k)<=2 from (select career_apply_portal(url) f, count(*) k from d1 group by 1) x),'no family over its limit of two');
select t.ok((select bool_and(state='driving' and source='cloud' and attempts=1 and lease_token is not null) from d1),'each claimed under its own lease, once');
select t.ok((career_apply_cloud_inflight()->>'total')::int=4,'four in flight');
select t.ok((select count(*)=0 from career_apply_cloud_dispatch_claim(10,4,2)),'full: a second dispatch claims nothing');
-- Global 100, per portal 2: greenhouse (6 queued) stays at two while the others fill.
create temp table d2 as select * from career_apply_cloud_dispatch_claim(10,100,2);
select t.ok((career_apply_cloud_inflight()->>'greenhouse')::int=2,'greenhouse held at two with four more waiting');
select t.ok((career_apply_cloud_inflight()->>'total')::int=6,'every family at its limit: six in flight');

-- A sent one frees its slot, and the next dispatch fills only that slot.
create temp table sent as select * from d1 where career_apply_portal(url)='greenhouse' limit 1;
select career_apply_cloud_finish((select id from sent),(select lease_token from sent),'submitted_unconfirmed','{"reason":"page said received"}'::jsonb,'submitted',null);
select t.ok((career_apply_cloud_inflight()->>'greenhouse')::int=1,'its slot is free');
create temp table d3 as select * from career_apply_cloud_dispatch_claim(10,100,2);
select t.ok((select count(*)=1 and bool_and(career_apply_portal(url)='greenhouse') from d3),'the next dispatch fills only the freed greenhouse slot');
-- A verification check: needs_user, never re-driven, counted for its host. The existing throttle (2% of the window, or 2
-- checks in the last 20) then pauses the family for the cloud, and the dispatcher claims nothing more there.
create temp table bot as select * from d3;
select career_apply_cloud_finish((select id from bot),(select lease_token from bot),'needs_user',
 '{"reason":"bot_check","link":"handed back"}'::jsonb,'bot_check','captcha');
select t.ok((select state='needs_user' and attempts=1 from career_apply_jobs where id=(select id from bot)),'a verification check ends needs_user');
select t.ok((select count(*)=0 from career_apply_cloud_dispatch_claim(10,100,2) where career_apply_portal(url)='greenhouse'),
 'the family is paused by the existing throttle: no greenhouse claim, and the checked one is never claimed again');
create temp table r as select career_apply_cloud_check_rates(7) v;
select t.ok((select (h->>'bot_checks')::int=1 and (h->>'attempts')::int=2 and (h->>'bot_check_rate')::numeric=0.5
 from r, jsonb_array_elements(v->'hosts') h where h->>'host'='job-boards.greenhouse.io'),'its host: 1 bot check in 2 attempts (0.5), with its counts');
select t.ok((select (p->>'submitted')::int=1 and (p->>'bot_checks')::int=1 and (p->>'attempts')::int=2 from r, jsonb_array_elements(v->'portals') p
 where p->>'portal'='greenhouse'),'the family: 2 attempts, 1 sent, 1 bot check');

-- The kill switch still decides.
reset role;
update career_cloud_settings set value='off' where key='CAREER_CLOUD_APPLY';
set role service_role;
select t.ok((select count(*)=0 from career_apply_cloud_dispatch_claim(10,100,100)),'kill switch off: nothing is claimed');
reset role;

-- Re-installing after claim_at changes keeps them equal; a claim_at without the anchor is refused, not guessed.
select t.ok(career_apply_cloud_claim_portal_install()='installed' and career_apply_cloud_runner_missing()='{}','re-install is idempotent');
rollback;
