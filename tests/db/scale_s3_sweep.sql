-- SCALE-S3 battery A, lease/sweep leg (disposable harness only).
-- A claimed row is leased to exactly one claimer; a lease that never finishes
-- is swept to unknown_outcome by the next claim call (never re-driven), and a
-- finish under the wrong lease is refused. Run after scale_s3_seed.sql.
\set ON_ERROR_STOP on
-- Re-runnable: clear any previous sweep fixtures for this synthetic user.
delete from career_message_approval_private.cloud_bound_jobs
 where user_id = 'd0000000-0000-4000-8000-000000000001';
delete from public.career_apply_jobs
 where user_id = 'd0000000-0000-4000-8000-000000000001' and job_id like 'SWP-%';
delete from career_message_approval_private.cloud_bound_approvals
 where user_id = 'd0000000-0000-4000-8000-000000000001'
  and approval_id in (select id from public.career_apply_batch_approvals
   where user_id = 'd0000000-0000-4000-8000-000000000001' and job_id like 'SWP-%');
delete from public.career_apply_batch_approvals
 where user_id = 'd0000000-0000-4000-8000-000000000001' and job_id like 'SWP-%';
select s3.arm_cloud('51000000-0000-4000-8000-000000000051');
select s3.seed_user('d0000000-0000-4000-8000-000000000001');
select s3.seed_job('d0000000-0000-4000-8000-000000000001','SWP-'||k,'Sweep Co '||k)
 from generate_series(1,6) k;

set role service_role;
do $$
declare n int; m int;
begin
 select count(*) into n from public.career_apply_cloud_claim(6);
 if n <> 6 then raise exception 'SWEEP: first claim took %, want 6', n; end if;
 select count(*) into m from public.career_apply_cloud_claim(6);
 if m <> 0 then raise exception 'SWEEP: second claim took %, want 0 (every row is leased)', m; end if;
 raise notice 'SWEEP-OK: 6 rows claimed once, second claim takes nothing';
end $$;

-- A finish under a wrong lease is refused, and the row stays driving.
do $$
declare j public.career_apply_jobs; refused boolean := false;
begin
 select * into j from public.career_apply_jobs where job_id = 'SWP-1';
 begin
  perform public.career_apply_cloud_finish(j.id, gen_random_uuid(), 'submitted_unconfirmed',
   '{"confirmation_id":"S3-WRONG"}'::jsonb, 'submitted');
 exception when others then refused := true;
 end;
 if not refused then raise exception 'SWEEP: a finish under a wrong lease was accepted'; end if;
 select * into j from public.career_apply_jobs where job_id = 'SWP-1';
 if j.state <> 'driving' then raise exception 'SWEEP: wrong-lease finish moved the row to %', j.state; end if;
 raise notice 'SWEEP-OK: wrong-lease finish refused, row still driving';
end $$;

-- Sixteen minutes later the six unfinished leases are swept, not re-driven:
-- the next claim call marks them unknown_outcome and takes nothing new.
-- NOTE (measured, SCALE-S3): the bridge's claim_at re-stamps its p_now to
-- clock_timestamp() after taking the per-user locks, so a caller cannot age
-- rows by passing a future p_now - the sweep re-check uses real time. The
-- harness therefore ages the fixture rows' claimed_at directly and calls
-- the granted entry point.
update public.career_apply_jobs set claimed_at = clock_timestamp() - interval '16 minutes'
 where job_id like 'SWP-%' and state = 'driving';
set role service_role;
do $$
declare n int;
begin
 perform public.career_apply_cloud_claim(6);
 select count(*) into n from public.career_apply_jobs
  where job_id like 'SWP-%' and state = 'unknown_outcome';
 if n <> 6 then raise exception 'SWEEP: % rows swept to unknown_outcome, want 6', n; end if;
 select count(*) into n from public.career_apply_cloud_events e
  where e.user_id = 'd0000000-0000-4000-8000-000000000001'
   and e.outcome = 'error' and e.error_kind = 'unknown_outcome';
 if n <> 6 then raise exception 'SWEEP: % sweep telemetry rows, want 6', n; end if;
 raise notice 'SWEEP-OK: 6 stale leases swept to unknown_outcome with telemetry, none re-driven';
end $$;
reset role;
