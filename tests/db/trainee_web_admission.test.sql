-- Sign-up in waves, enforced by the database (20261026230000_trainee_web_admission.sql; review of PR #195). Closed by
-- default. A person not admitted makes no prepared application, card, queue row or apply want, by any path: their own
-- RPCs (career_apply_prepare_own, career_apply_card_open_own, career_apply_card_answer_own) or a service write. The env's
-- allow-list (a confirmed phone, checked by the edge) admits; an invite redeemed through FEATURE WAVES admits once its
-- sign-up steps are done; opening sign-up admits everyone. The person reads only their own admission and calls nothing.
begin;
reset role;
-- The runner opened sign-up for the other suites; this test starts from the setting's absence, then closes it.
delete from public.trainee_settings;
select t.ok(public.trainee_signup_mode() = 'invite', 'with no setting, sign-up is closed (invite)');
select t.ok(public.trainee_set_signup('invite') = 'invite', 'closed explicitly for this test');
select t.ok(obj_description('public.trainee_admissions'::regclass, 'pg_class') = 'trainee admissions: existing accounts admitted', 'the backfill of existing accounts ran once and is marked');
-- N: signed up after the gate, not admitted. L: on the allow-list (the edge says so). Both have a career account.
insert into auth.users (id, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-00000000a001', '13125550142', now()),
  ('00000000-0000-0000-0000-00000000a002', '13125550143', now());
insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000a001'), ('00000000-0000-0000-0000-00000000a002') on conflict do nothing;
insert into public.career_watch_kv (user_id, key, value) values
  ('00000000-0000-0000-0000-00000000a001', 'career:account', '{"epoch":0,"version":0,"paused":false}'),
  ('00000000-0000-0000-0000-00000000a002', 'career:account', '{"epoch":0,"version":0,"paused":false}');
select t.ok((select count(*) = 0 from public.trainee_admissions where user_id in ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002')),
  'accounts made after the gate are not admitted by the backfill');
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a001', false) is null, 'not listed, no invite, sign-up closed: not admitted');
select t.ok(not public.trainee_may_act('00000000-0000-0000-0000-00000000a001'), 'and may not act');

-- The person N, through their own RPCs, as PostgREST runs them.
create temp table pl as select jsonb_build_object('version',1,'user_id','00000000-0000-0000-0000-00000000a001','job_id','TEST-GATE-1','company','Gate Co',
  'url','https://jobs.lever.co/gate/1','fields','[]'::jsonb,'privacy_epoch',0,'account_version',0,'expires_at',now()+interval '1 day') as p;
grant select on pl to authenticated, service_role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
select t.must_fail($$select public.career_apply_prepare_own((select p from pl), array['Gate Co: Analyst'])$$, 'not_admitted', 'career_apply_prepare_own: refused for a person not admitted');
reset role;
select t.ok((select count(*) = 0 from public.career_apply_prepared where user_id = '00000000-0000-0000-0000-00000000a001'), 'no prepared row');

-- A prepared application and an open card of N's that exist already (made while the gate was open, rows written as the
-- platform would): opening a new card and answering the card are refused, and nothing reaches the queue.
set local session_replication_role = replica; -- these two rows only: the trigger is what is under test
insert into public.career_apply_prepared (id, user_id, job_id, company, url, payload, payload_hash, card_lines)
select '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000a001', 'TEST-GATE-1', 'Gate Co', 'https://jobs.lever.co/gate/1', p, public.career_apply_payload_hash(p), array['Gate Co: Analyst'] from pl;
insert into public.career_apply_cards (id, user_id, items, shown_at)
values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000a001',
  (select jsonb_build_array(jsonb_build_object('n', 1, 'prepared_id', id, 'payload_hash', payload_hash)) from public.career_apply_prepared where id = '00000000-0000-0000-0000-00000000c001'), now());
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
select t.must_fail($$select public.career_apply_card_open_own(array['00000000-0000-0000-0000-00000000c001'::uuid])$$, 'not_admitted', 'career_apply_card_open_own: refused');
select t.ok((public.career_apply_card_answer_own('00000000-0000-0000-0000-00000000d001', array[1]))->0->>'result' = 'refused',
  'career_apply_card_answer_own: the tap is answered "refused", never queued');
reset role;
select t.ok((select count(*) = 0 from public.career_apply_jobs where user_id = '00000000-0000-0000-0000-00000000a001'), 'no queue row for the person not admitted');
select t.ok((select count(*) = 1 from public.career_apply_cards where user_id = '00000000-0000-0000-0000-00000000a001'), 'no second card');
-- A service write for N is refused the same way (the chat's service path, a worker).
set local role service_role;
select t.must_fail($$insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash)
  select '00000000-0000-0000-0000-00000000a001', 'TEST-GATE-1', 'Gate Co', 'https://jobs.lever.co/gate/1', p, public.career_apply_payload_hash(p), public.career_apply_payload_hash(p) from pl$$,
  'not_admitted', 'a queue row written by the service role is refused too');
select t.must_fail($$insert into public.career_apply_wanted (user_id, posting_key, url, company) values ('00000000-0000-0000-0000-00000000a001', 'lever:gate:1', 'https://jobs.lever.co/gate/1', 'Gate Co')$$,
  'not_admitted', 'an apply want is refused');
reset role;
select t.ok((select count(*) = 0 from public.career_apply_jobs where user_id = '00000000-0000-0000-0000-00000000a001')
  and (select count(*) = 0 from public.career_apply_wanted where user_id = '00000000-0000-0000-0000-00000000a001'), 'still no queue row and no want');

-- L: the allow-list admits (the edge's own check of a confirmed phone); then the same writes go through.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a002', true) = 'allowlist', 'allow-listed: admitted via the allow-list');
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a002', false) = 'allowlist', 'asked again: the same, recorded once');
insert into public.career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
select '00000000-0000-0000-0000-00000000a002', 'TEST-GATE-2', 'Gate Co', 'https://jobs.lever.co/gate/2', q, public.career_apply_payload_hash(q), array['Gate Co: Analyst']
from (select (select p from pl) || jsonb_build_object('user_id','00000000-0000-0000-0000-00000000a002','job_id','TEST-GATE-2','url','https://jobs.lever.co/gate/2') as q) x;
select t.ok((select count(*) = 1 from public.career_apply_prepared where user_id = '00000000-0000-0000-0000-00000000a002'), 'an admitted person''s prepared application is written');
select t.must_fail($$select public.trainee_admit('00000000-0000-0000-0000-0000000000ff', true)$$, 'invalid admission', 'an account that does not exist is refused');

-- FEATURE WAVES (the one invite system): a redeemed invite admits once the sign-up steps are done. Run when its tables
-- are in this database; without them no account is ever treated as invited.
do $$ begin
  if to_regclass('public.career_invites') is null then
    perform t.ok(not public.trainee_invited('00000000-0000-0000-0000-00000000a001'), 'without FEATURE WAVES nobody counts as invited');
  else
    execute $x$insert into public.career_invite_waves (id, open_key, size, opened_at) values (990001, 'gate_test', 1, now())$x$;
    execute $x$insert into public.career_invites (id, wave_id, phone, token_hash, state, signed_up_at, created_at, sent_at, expires_at, redeemed_at, redeemed_via, redeemed_user)
      values ('00000000-0000-0000-0000-00000000e001', 990001, '+13125550142', repeat('e', 64), 'redeemed', now(), now(), now(), now() + interval '14 days', now(), 'web',
              '00000000-0000-0000-0000-00000000a001')$x$;
    execute $x$insert into public.career_signup_gate (user_id, invite_id, step, created_at, updated_at)
      values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000e001', 'terms', now(), now())$x$;
    perform t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a001', false) = 'invite', 'a redeemed invite admits via the invite');
    perform t.ok(not public.trainee_may_act('00000000-0000-0000-0000-00000000a001'), 'but not before the sign-up steps are done');
    execute $x$update public.career_signup_gate set step = 'active' where user_id = '00000000-0000-0000-0000-00000000a001'$x$;
    perform t.ok(public.trainee_may_act('00000000-0000-0000-0000-00000000a001'), 'and may act once they are');
  end if;
end $$;

-- Opening sign-up admits everyone; closing it keeps who was admitted.
select t.ok(public.trainee_set_signup('open') = 'open', 'the owner opens sign-up');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a003', 'late@example.com');
select t.ok(public.trainee_may_act('00000000-0000-0000-0000-00000000a003'), 'open: a new account may act');
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a003', false) = 'open', 'and is recorded as admitted while open');
select t.ok(public.trainee_set_signup('invite') = 'invite', 'the owner closes it again');
select t.ok(public.trainee_may_act('00000000-0000-0000-0000-00000000a003'), 'who was admitted while open stays admitted');
select t.must_fail($$select public.trainee_set_signup('wide')$$, 'invite or open', 'only invite or open');

-- The person: reads only their own admission; cannot admit, open sign-up or ask the gate.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a002', true);
select t.ok((select count(*) = 1 from public.trainee_admissions), 'a person sees one admission: their own');
select t.must_fail($$select public.trainee_admit('00000000-0000-0000-0000-00000000a001', true)$$, 'permission denied', 'a person cannot admit anyone');
select t.must_fail($$select public.trainee_set_signup('open')$$, 'permission denied', 'a person cannot open sign-up');
select t.must_fail($$select public.trainee_may_act('00000000-0000-0000-0000-00000000a001')$$, 'permission denied', 'a person cannot probe the gate');
select t.must_fail($$insert into public.trainee_admissions (user_id, via) values ('00000000-0000-0000-0000-00000000a001', 'open')$$, 'permission denied', 'a person cannot write an admission');
select t.must_fail($$update public.trainee_settings set value = 'open'$$, 'permission denied', 'or the setting');
reset role;
set local role anon;
select t.must_fail($$select public.trainee_admit('00000000-0000-0000-0000-00000000a001', true)$$, 'permission denied', 'anon cannot admit');
reset role;
rollback;
