-- 15-career-batch-hook-semantics.test.sql — LOOP Task 1, Fix 1 guard.
--
-- The live defect (census BL-025; loop iteration-0 baseline,
-- 2026-10-20): a queued career_batch_intent/v1 was CANCELLED by the
-- account control hook whenever the account row's version moved —
-- and every committed chat turn moves it (the product's own
-- stated-facts commit on the next turn killed the batch the previous
-- turn had just claimed to hand off: 19 cancelled / 0 queued on the
-- gauntlet account). The record's exact journey, replayed here:
-- an intent is committed against account version N; a mundane
-- account write bumps the version to N+1; the intent must survive,
-- list in career_batch_pending_v1, and claim.
--
-- Post-fix semantics asserted (migration
-- 20261020020000_career_batch_hook_semantics_v2.sql):
--   A. a version bump alone revokes NOTHING (pending + claim work);
--   B. the user's own PAUSE still cancels queued work;
--   C. a privacy EPOCH change still cancels and scrubs;
--   D. deleting the account row still cancels queued work.
-- Run order: stubs.sql, 20261015020000, 20261016010000, THIS FILE
-- (fails at A before the fix migration), then
-- 20261020020000_career_batch_hook_semantics_v2.sql and THIS FILE
-- again on a fresh database (all pass). Runner:
-- tests/db/career/run-batch-hook-guard.sh.
\set ON_ERROR_STOP on

insert into auth.users(id, email) values ('11111111-1111-1111-1111-111111111111', 'hook-guard@test.invalid');
insert into public.agent_threads(id, user_id) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
insert into public.career_watch_kv(user_id, key, value)
values ('11111111-1111-1111-1111-111111111111', 'career:account', '{"version":1,"epoch":0,"paused":false}'::jsonb);

-- A queued prepare intent, born against account version 1.
insert into public.career_batch_intents_v1(user_id, intent_id, thread_id, turn_key, request_hash, event_hash, binding, private_input, authority_account_version, privacy_epoch, run_id)
values ('11111111-1111-1111-1111-111111111111', repeat('a', 64), '22222222-2222-2222-2222-222222222222', 'turn-a', 'hash-a', 'event-a',
        '{"version":"career_batch_intent/v1","action":"prepare","run_id":"batch-hooktest-a"}'::jsonb,
        '{"run":{"id":"batch-hooktest-a"}}'::jsonb, 1, 0, 'batch-hooktest-a');

-- A: the mundane account write — the next chat turn's commit bumps
-- the account version (exactly what career_host_commit does).
update public.career_watch_kv set value = value || '{"version":2}'::jsonb
where user_id = '11111111-1111-1111-1111-111111111111' and key = 'career:account';

do $$
declare st text; pend jsonb; cl jsonb;
begin
  select state into st from public.career_batch_intents_v1
  where user_id = '11111111-1111-1111-1111-111111111111' and intent_id = repeat('a', 64);
  if st is distinct from 'queued' then
    raise exception 'FAIL A1: a mundane account-version bump left the intent in state % (the live batch-cancel defect)', st;
  end if;
  raise notice 'ok A1: intent survives a mundane account-version bump';

  pend := public.career_batch_pending_v1();
  if not (pend -> 'intents' @> jsonb_build_array(jsonb_build_object('intentId', repeat('a', 64)))) then
    raise exception 'FAIL A2: the surviving intent does not list in career_batch_pending_v1: %', pend;
  end if;
  raise notice 'ok A2: intent lists in career_batch_pending_v1 after the bump';

  cl := public.career_batch_claim_v1('11111111-1111-1111-1111-111111111111', repeat('a', 64));
  if coalesce((cl ->> 'claimed')::boolean, false) is not true then
    raise exception 'FAIL A3: the surviving intent does not claim: %', cl;
  end if;
  raise notice 'ok A3: the worker claims the intent after the bump';
end $$;

-- B: the user's own pause still cancels queued work.
insert into public.career_batch_intents_v1(user_id, intent_id, thread_id, turn_key, request_hash, event_hash, binding, private_input, authority_account_version, privacy_epoch, run_id)
values ('11111111-1111-1111-1111-111111111111', repeat('b', 64), '22222222-2222-2222-2222-222222222222', 'turn-b', 'hash-b', 'event-b',
        '{"version":"career_batch_intent/v1","action":"prepare","run_id":"batch-hooktest-b"}'::jsonb,
        '{"run":{"id":"batch-hooktest-b"}}'::jsonb, 2, 0, 'batch-hooktest-b');
update public.career_watch_kv set value = value || '{"version":3,"paused":true}'::jsonb
where user_id = '11111111-1111-1111-1111-111111111111' and key = 'career:account';
do $$
declare st text;
begin
  select state into st from public.career_batch_intents_v1
  where user_id = '11111111-1111-1111-1111-111111111111' and intent_id = repeat('b', 64);
  if st is distinct from 'cancelled' then
    raise exception 'FAIL B: the user pause left the intent in state % (expected cancelled)', st;
  end if;
  raise notice 'ok B: the user pause still cancels queued work';
end $$;
update public.career_watch_kv set value = value || '{"version":4,"paused":false}'::jsonb
where user_id = '11111111-1111-1111-1111-111111111111' and key = 'career:account';

-- C: a privacy epoch change still cancels and scrubs runs.
insert into public.career_batch_intents_v1(user_id, intent_id, thread_id, turn_key, request_hash, event_hash, binding, private_input, authority_account_version, privacy_epoch, run_id)
values ('11111111-1111-1111-1111-111111111111', repeat('c', 64), '22222222-2222-2222-2222-222222222222', 'turn-c', 'hash-c', 'event-c',
        '{"version":"career_batch_intent/v1","action":"prepare","run_id":"batch-hooktest-c"}'::jsonb,
        '{"run":{"id":"batch-hooktest-c"}}'::jsonb, 4, 0, 'batch-hooktest-c');
insert into public.career_batch_runs_v1(user_id, run_id, state, run, summary)
values ('11111111-1111-1111-1111-111111111111', 'batch-hooktest-c', 'awaiting_approval', '{"id":"batch-hooktest-c"}'::jsonb, '{}'::jsonb);
update public.career_watch_kv set value = value || '{"version":5,"epoch":1}'::jsonb
where user_id = '11111111-1111-1111-1111-111111111111' and key = 'career:account';
do $$
declare st text; runs int;
begin
  select state into st from public.career_batch_intents_v1
  where user_id = '11111111-1111-1111-1111-111111111111' and intent_id = repeat('c', 64);
  if st is distinct from 'cancelled' then
    raise exception 'FAIL C1: the privacy epoch change left the intent in state % (expected cancelled)', st;
  end if;
  select count(*) into runs from public.career_batch_runs_v1
  where user_id = '11111111-1111-1111-1111-111111111111';
  if runs <> 0 then
    raise exception 'FAIL C2: the privacy epoch change left % batch run rows (expected the scrub)', runs;
  end if;
  raise notice 'ok C: the privacy epoch change still cancels and scrubs';
end $$;

-- D: deleting the account row still cancels queued work.
insert into public.career_batch_intents_v1(user_id, intent_id, thread_id, turn_key, request_hash, event_hash, binding, private_input, authority_account_version, privacy_epoch, run_id)
values ('11111111-1111-1111-1111-111111111111', repeat('d', 64), '22222222-2222-2222-2222-222222222222', 'turn-d', 'hash-d', 'event-d',
        '{"version":"career_batch_intent/v1","action":"prepare","run_id":"batch-hooktest-d"}'::jsonb,
        '{"run":{"id":"batch-hooktest-d"}}'::jsonb, 5, 1, 'batch-hooktest-d');
delete from public.career_watch_kv
where user_id = '11111111-1111-1111-1111-111111111111' and key = 'career:account';
do $$
declare st text;
begin
  select state into st from public.career_batch_intents_v1
  where user_id = '11111111-1111-1111-1111-111111111111' and intent_id = repeat('d', 64);
  if st is distinct from 'cancelled' then
    raise exception 'FAIL D: deleting the account row left the intent in state % (expected cancelled)', st;
  end if;
  raise notice 'ok D: deleting the account row still cancels queued work';
end $$;
