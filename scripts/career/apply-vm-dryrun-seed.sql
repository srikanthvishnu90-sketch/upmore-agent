-- Stage 1 of docs/launch/APPLY-VM-RUNBOOK.md: five TEST applications for YOU only, pointing at the mock Greenhouse/Lever forms
-- that run on the VM itself (http://127.0.0.1:8787). Nothing here reaches an employer.
-- Paste into the Supabase SQL editor after replacing OWNER_USER_ID (your Upmore user id) in the one line marked <<<.
-- Needs: your account exists and you have already uploaded your resume (deno run -A workers/career-browser/approve-first.ts cloud-resume <resume.pdf>).
-- The dry run uses YOUR kept resume (it only ever goes to 127.0.0.1) and obviously fake answers (Test Person, example.invalid).
do $$
declare u uuid := 'OWNER_USER_ID'::uuid;   -- <<<
 a jsonb; h text; p jsonb; i int; kind text;
begin
 select value into a from public.career_watch_kv where user_id = u and key = 'career:account';
 if a is null then raise exception 'no account for this user id'; end if;
 select sha256 into h from public.career_apply_cloud_resumes where user_id = u order by created_at desc limit 1;
 if h is null then raise exception 'upload your resume first (approve-first.ts cloud-resume)'; end if;
 for i in 1..5 loop
  kind := case when i % 2 = 1 then 'greenhouse' else 'lever' end;
  p := jsonb_build_object('version', 1, 'user_id', u, 'job_id', 'DRYRUN-' || i, 'company', 'Mock Employer ' || i,
   'url', 'http://127.0.0.1:8787/' || kind || '/dry' || i,
   'fields', jsonb_build_array(
     jsonb_build_object('label', 'First Name', 'value', 'Test', 'factId', 'dryrun'),
     jsonb_build_object('label', 'Last Name', 'value', 'Person', 'factId', 'dryrun'),
     jsonb_build_object('label', 'Full name', 'value', 'Test Person', 'factId', 'dryrun'),
     jsonb_build_object('label', 'Email', 'value', 'test.person@example.invalid', 'factId', 'dryrun'),
     jsonb_build_object('label', 'Are you legally authorized to work in the United States?', 'value', 'Yes', 'factId', 'dryrun'),
     jsonb_build_object('label', 'Will you now or in the future require sponsorship for employment visa status?', 'value', 'No', 'factId', 'dryrun')),
   'privacy_epoch', (a->>'epoch')::bigint, 'account_version', (a->>'version')::bigint, 'expires_at', to_jsonb(now() + interval '1 day'),
   'engine_approval', repeat('d', 64), 'resume_sha256', h, 'destination', 'http://127.0.0.1:8787/' || kind || '/dry' || i);
  perform public.career_apply_enqueue(p, public.career_apply_payload_hash(p), public.career_apply_payload_hash(p), null);
 end loop;
end $$;
-- Watch them:  select job_id, state, reason, vm_phase, vm_worker from career_apply_jobs where job_id like 'DRYRUN-%' order by job_id;
-- Or what the bot would say:  select jsonb_pretty(career_apply_status_for('OWNER_USER_ID'::uuid, 'DRYRUN-1'));
