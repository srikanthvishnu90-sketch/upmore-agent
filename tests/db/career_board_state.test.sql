-- WO-037 (20261021110000_career_board_state.sql): board read state is the service role's alone and holds its shape; the
-- latency report measures first seen -> delivered per alert and leaves quiet-hours waits out of the percentiles; the
-- weekly count is per person; nobody but the service role can call either.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000003a1','bs1@example.com'),('00000000-0000-0000-0000-0000000003a2','bs2@example.com');
set role service_role;
insert into public.career_board_state(provider,board,bucket) values('greenhouse','stripe',7),('lever','plaid',63);
select t.ok((select count(*)=2 from public.career_board_state),'the service role seeds board state');
select t.must_fail($$insert into public.career_board_state(provider,board,bucket) values('someats','x',1)$$,'career_board_state_provider_check','an unsupported provider is refused');
-- WO-044 (20261026060006): the seven new readers' boards are taken, in board state and in the postings table.
insert into public.career_board_state(provider,board,bucket) values('workday','acme.wd5/External',1),('teamtailor','acme',2);
select t.ok((select count(*)=2 from public.career_board_state where provider in ('workday','teamtailor')),'board state takes the new providers');
delete from public.career_board_state where provider in ('workday','teamtailor');
insert into public.career_postings(job_id,provider,board,company,title,url,first_seen_at,last_seen_at)
  values('workday:acme.wd5/external:Associate_R1','workday','acme.wd5/External','acme','Associate','https://acme.wd5.myworkdayjobs.com/External/job/x',now(),now());
select t.ok((select count(*)=1 from public.career_postings where provider='workday'),'the postings table takes a Workday posting');
select t.must_fail($$insert into public.career_postings(job_id,provider,board,company,title,url,first_seen_at,last_seen_at) values('someats:a:1','someats','a','A','T','https://a.b/1',now(),now())$$,'career_postings_job_id_check','an unknown provider''s posting is refused');
delete from public.career_postings where provider='workday';
select t.must_fail($$insert into public.career_board_state(provider,board,bucket) values('ashby','x',64)$$,'career_board_state_bucket_check','a bucket past 63 is refused');
select t.must_fail($$insert into public.career_board_state(provider,board,bucket) values('greenhouse','stripe',7)$$,'career_board_state_pkey','one row per board');
update public.career_board_state set last_attempt_at=now(), last_ok_at=now(), last_status='ok', etag='"abc"' where board='stripe';
select t.ok((select board from public.career_board_state where bucket in (7,63) order by last_attempt_at asc nulls first limit 1)='plaid','never-read boards come first');
-- Latency: seen 10:00, queued 10:03, delivered 10:04 (240 s); seen 10:00, queued 10:08, delivered 10:10 (600 s);
-- one held for quiet hours (deliver_at hours later) is counted apart.
insert into public.career_outbox(user_id,key,kind,text,deliver_at,created_at,delivered_at,status,posting_first_seen_at) values
 ('00000000-0000-0000-0000-0000000003a1','alert:a','alert','x','2026-10-20T10:03:00Z','2026-10-20T10:03:00Z','2026-10-20T10:04:00Z','delivered','2026-10-20T10:00:00Z'),
 ('00000000-0000-0000-0000-0000000003a1','alert:b','alert','x','2026-10-20T10:08:00Z','2026-10-20T10:08:00Z','2026-10-20T10:10:00Z','delivered','2026-10-20T10:00:00Z'),
 ('00000000-0000-0000-0000-0000000003a2','alert:c','alert','x','2026-10-21T07:00:00Z','2026-10-20T23:00:00Z',null,'queued','2026-10-20T22:58:00Z'),
 ('00000000-0000-0000-0000-0000000003a2','report:2026-10-20','report','x','2026-10-20T13:00:00Z','2026-10-20T13:00:00Z',null,'queued',null);
select t.ok((select alerts=3 and delivered=2 and held_for_quiet_hours=1 and delivered_p50_s=420 and delivered_max_s=600 and queued_p50_s=330
  from public.career_alert_latency('2026-10-20T00:00:00Z')),'latency: first seen -> delivered p50 420 s, max 600 s; the quiet-hours wait is counted apart');
select t.ok((select n=2 from public.career_alerts_sent_since('2026-10-14T00:00:00Z') where user_id='00000000-0000-0000-0000-0000000003a1')
  and (select n=1 from public.career_alerts_sent_since('2026-10-14T00:00:00Z') where user_id='00000000-0000-0000-0000-0000000003a2'),'the weekly count is per person and counts alerts only');
reset role;
select t.as_user('00000000-0000-0000-0000-0000000003a1');
set role authenticated;
select t.must_fail($$select * from public.career_board_state$$,'permission denied','a person cannot read board state');
select t.must_fail($$select * from public.career_alert_latency(now() - interval '1 day')$$,'permission denied','a person cannot call the latency report');
select t.must_fail($$select * from public.career_alerts_sent_since(now() - interval '7 days')$$,'permission denied','a person cannot read anyone''s weekly count');
reset role;
rollback;
