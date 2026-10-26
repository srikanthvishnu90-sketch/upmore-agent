-- Feature 6 (20261026060106_career_ingest_runs.sql): the per-lane run log holds its accounting (read <= due, ok + failed =
-- read, fresh <= total), is the service role's alone, and career_ingest_coverage shows every lane of the newest plan,
-- a lane with no run in the window as missing (0 runs).
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000006a1','ir1@example.com');
set role service_role;
insert into public.career_ingest_runs(at,lane,lanes,window_min,ms,boards_due,boards_read,boards_ok,boards_failed,boards_not_modified,
  postings_new,postings_seen,postings_closed,url_rejected,lane_fresh,lane_total,directory_fresh,directory_total,failures,report) values
 (now() - interval '20 minutes',0,3,60,41000,120,118,115,3,40,812,4100,12,2,1380,1402,4100,4200,
  '[{"provider":"lever","board":"x","error":"HTTP 404"}]','lane 0 of 3; boards read 118/120 due'),
 (now() - interval '10 minutes',0,3,60,39000,110,110,110,0,60,20,4300,1,0,1400,1402,4150,4200,'[]','lane 0 of 3; boards read 110/110 due'),
 (now() - interval '5 minutes',1,3,60,52000,130,130,129,1,10,300,3900,0,0,1300,1390,4160,4200,'[]','lane 1 of 3; boards read 130/130 due'),
 (now() - interval '3 hours',2,3,60,10000,5,5,5,0,0,0,0,0,0,null,null,null,null,'[]','lane 2 of 3; boards read 5/5 due');
select t.ok((select count(*)=4 from public.career_ingest_runs),'the service role records lane runs');
select t.must_fail($$insert into public.career_ingest_runs(at,lane,lanes,window_min,ms,boards_due,boards_read,boards_ok,boards_failed,report) values(now(),3,3,60,1,1,1,1,0,'x')$$,'career_ingest_runs_lane_in_plan','a lane past the plan is refused');
select t.must_fail($$insert into public.career_ingest_runs(at,lane,lanes,window_min,ms,boards_due,boards_read,boards_ok,boards_failed,report) values(now(),0,1,60,1,5,6,6,0,'x')$$,'career_ingest_runs_read_check','more boards read than due is refused');
select t.must_fail($$insert into public.career_ingest_runs(at,lane,lanes,window_min,ms,boards_due,boards_read,boards_ok,boards_failed,report) values(now(),0,1,60,1,5,5,3,1,'x')$$,'career_ingest_runs_read_check','ok plus failed must equal read');
select t.must_fail($$insert into public.career_ingest_runs(at,lane,lanes,window_min,ms,boards_due,boards_read,boards_ok,boards_failed,lane_fresh,lane_total,report) values(now(),0,1,60,1,5,5,5,0,9,8,'x')$$,'career_ingest_runs_fresh_check','more fresh boards than boards is refused');
select t.must_fail($$insert into public.career_ingest_runs(at,lane,lanes,window_min,ms,boards_due,boards_read,boards_ok,boards_failed,report) values(now(),0,1,60,1,5,5,5,0,'')$$,'career_ingest_runs_report_check','a run without a report is refused');
-- Coverage over the last hour: lane 0 ran twice (newest coverage 1,400/1,402), lane 1 once, lane 2 not in the window.
select t.ok((select count(*)=3 from public.career_ingest_coverage(interval '1 hour')),'every lane of the newest plan is listed');
select t.ok((select runs=2 and boards_due=230 and boards_read=228 and boards_failed=3 and postings_new=832 and lane_fresh=1400 and lane_total=1402
  from public.career_ingest_coverage(interval '1 hour') where lane=0),'lane 0: two runs summed; the newest coverage');
select t.ok((select runs=0 and last_at is null from public.career_ingest_coverage(interval '1 hour') where lane=2),'a lane with no run in the window shows as missing');
select t.ok((select directory_fresh=4160 and directory_total=4200 from public.career_ingest_coverage(interval '1 hour') where lane=1),'the directory coverage the run counted');
-- The board's last body hash: a SHA-256 in hex or nothing.
insert into public.career_board_state(provider,board,bucket,body_sha) values('lever','hashy',3,repeat('a1',32));
select t.ok((select body_sha=repeat('a1',32) from public.career_board_state where board='hashy'),'board state keeps the last body hash');
select t.must_fail($$insert into public.career_board_state(provider,board,bucket,body_sha) values('lever','hashz',3,'not-a-hash')$$,'career_board_state_body_sha_check','a body hash that is not SHA-256 hex is refused');
reset role;
select t.as_user('00000000-0000-0000-0000-0000000006a1');
set role authenticated;
select t.must_fail($$select * from public.career_ingest_runs$$,'permission denied','a person cannot read the run log');
select t.must_fail($$select * from public.career_ingest_coverage()$$,'permission denied','a person cannot call the coverage report');
reset role;
rollback;
