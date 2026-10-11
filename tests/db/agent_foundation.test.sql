-- SQL tests for 20260928_000001_agent_permissions_ledger.sql.
-- Each block raises on failure; ON_ERROR_STOP makes the run fail.
\set ON_ERROR_STOP on

create schema t;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create or replace function t.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
end $$;

-- Asserts that running `sql` raises an error whose message matches `pattern`.
create or replace function t.must_fail(sql text, pattern text, label text)
returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm !~* pattern then
      raise exception 'FAIL %: failed, but with "%" (wanted /%/)', label, sqlerrm, pattern;
    end if;
    raise notice 'ok   %', label;
    return;
  end;
  raise exception 'FAIL %: statement succeeded but had to fail', label;
end $$;

create or replace function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;

grant usage on schema t to anon, authenticated, service_role;
grant execute on all functions in schema t to anon, authenticated, service_role;
grant create on schema t to authenticated;

-- ---------------------------------------------------------------- ledger
select t.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;

select t.ok(
  public.agent_ledger_append(
    '11111111-1111-1111-1111-111111111111', 'proposed', 'subscriptions.cancel',
    'Cancel Netflix', 'Netflix', 15.99, 2::smallint, 'Browser session', null, null,
    '{"charges": 4}'::jsonb) is not null,
  'a user can append a proposed event');
select public.agent_ledger_append(
  '11111111-1111-1111-1111-111111111111', 'approved', 'subscriptions.cancel',
  'Cancel Netflix', 'Netflix', 15.99, 2::smallint);

select t.ok((select count(*) = 2 from public.agent_ledger), 'user reads their own rows');
select t.ok((select actor = 'user' and approver = 'user' from public.agent_ledger where event = 'approved'),
  'approval is stamped as the user''s');
select t.ok((select actor = 'agent' and approver is null from public.agent_ledger where event = 'proposed'),
  'a proposal carries no approver');

select t.must_fail($$select public.agent_ledger_append(gen_random_uuid(), 'succeeded', 'subscriptions.cancel', 'x')$$,
  'cannot be recorded from the app', 'a user cannot record that the agent succeeded');
select t.must_fail($$select public.agent_ledger_append(gen_random_uuid(), 'confirmed', 'subscriptions.cancel', 'x')$$,
  'cannot be recorded from the app', 'a user cannot record a confirmation');
select t.must_fail($$select public.agent_ledger_append(gen_random_uuid(), 'stopped', 'stop_everything', 'x')$$,
  'cannot be recorded from the app', 'a user cannot forge a stop event');
select t.must_fail($$select public.agent_ledger_append(gen_random_uuid(), 'approved', 'bills.bill_pay', 'x', 'ComEd', 20, 3::smallint)$$,
  'autonomous action cannot be recorded', 'a user cannot record an autonomous (T3) action');
select t.must_fail($$select public.agent_ledger_append(gen_random_uuid(), 'proposed', 'x', 'x', null, null, null, null, null, null, '[1]'::jsonb)$$,
  'evidence must be a JSON object', 'evidence must be an object');
select t.must_fail($$insert into public.agent_ledger (user_id, action_id, event, capability_id, what, actor)
  values ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'succeeded', 'x', 'x', 'agent')$$,
  'permission denied', 'a user cannot insert into the ledger directly');
select t.must_fail($$update public.agent_ledger set what = 'edited'$$,
  'permission denied', 'a user cannot update the ledger');
select t.must_fail($$delete from public.agent_ledger$$,
  'permission denied', 'a user cannot delete from the ledger');

select t.ok(public.agent_ledger_verify() is null, 'a fresh chain verifies');

-- Another user sees none of it.
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) = 0 from public.agent_ledger), 'another user sees nothing');
select t.ok((select count(*) = 0 from public.agent_settings), 'another user sees no settings');

-- Even the service role and the owner role cannot rewrite history.
reset role;
select t.must_fail($$update public.agent_ledger set what = 'edited'$$,
  'append-only', 'the table owner cannot update a ledger row');
select t.must_fail($$delete from public.agent_ledger$$,
  'append-only', 'the table owner cannot delete a ledger row');
select t.must_fail($$truncate public.agent_ledger$$,
  'append-only', 'the table owner cannot truncate the ledger');
set role service_role;
select t.must_fail($$update public.agent_ledger set amount = 1$$,
  'append-only', 'the service role cannot update a ledger row');
select t.must_fail($$delete from public.agent_ledger$$,
  'append-only', 'the service role cannot delete a ledger row');
-- The service role is how execution events arrive.
insert into public.agent_ledger (user_id, action_id, event, capability_id, what, counterparty, amount, tier, actor, outcome, evidence)
values ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'succeeded',
  'subscriptions.cancel', 'Cancel Netflix', 'Netflix', 15.99, 2, 'agent', 'Netflix confirmed the cancellation.',
  '{"run_id": "r1"}');
reset role;

select t.ok((select count(*) = 3 and count(distinct row_hash) = 3 from public.agent_ledger),
  'three rows, three distinct hashes');
select t.ok((select prev_hash is null from public.agent_ledger order by id limit 1),
  'the first row has no previous hash');
select t.ok((select bool_and(l.prev_hash = p.row_hash)
  from public.agent_ledger l join lateral (
    select row_hash from public.agent_ledger x where x.user_id = l.user_id and x.id < l.id order by x.id desc limit 1) p on true),
  'each row links to the one before it');
select t.ok((select bool_and(created_at > '2020-01-01') from public.agent_ledger),
  'the database sets the timestamp');

-- Tampering (only possible by disabling the triggers as a superuser) is caught.
alter table public.agent_ledger disable trigger agent_ledger_no_update;
update public.agent_ledger set amount = 0.01 where event = 'approved';
alter table public.agent_ledger enable trigger agent_ledger_no_update;
select t.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select t.ok(
  public.agent_ledger_verify() = (select id from public.agent_ledger where event = 'approved'),
  'verify names the tampered row');
reset role;
alter table public.agent_ledger disable trigger agent_ledger_no_update;
update public.agent_ledger set amount = 15.99 where event = 'approved';
alter table public.agent_ledger enable trigger agent_ledger_no_update;

-- -------------------------------------------------------------- settings
select t.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into public.agent_settings (user_id) values ('00000000-0000-0000-0000-00000000000a');
select t.ok((select per_action_cap = 25 and monthly_cap = 200 and match_tolerance = 0.10
  and quiet_start = 22 and quiet_end = 7 and tiers = '{}'::jsonb and stopped_at is null
  from public.agent_settings), 'defaults match the spec');
select t.ok((select count(*) = 1 from public.agent_ledger where event = 'settings_changed'),
  'creating settings writes a ledger event');

update public.agent_settings set tiers = '{"bills.bill_pay": 3, "subscriptions.cancel": 2}', per_action_cap = 40;
select t.ok((select evidence -> 'per_action_cap' = '{"from": 25, "to": 40}'::jsonb
  from public.agent_ledger where event = 'settings_changed' order by id desc limit 1),
  'a settings change records before and after');
update public.agent_settings set per_action_cap = 40;
select t.ok((select count(*) = 2 from public.agent_ledger where event = 'settings_changed'),
  'a no-op update writes nothing');

select t.must_fail($$update public.agent_settings set tiers = '{"x": 4}'$$, 'must be 0, 1, 2 or 3', 'tier 4 cannot be stored');
select t.must_fail($$update public.agent_settings set tiers = '{"x": "3"}'$$, 'must be 0, 1, 2 or 3', 'a string tier cannot be stored');
select t.must_fail($$update public.agent_settings set tiers = '{"x": 2.5}'$$, 'must be 0, 1, 2 or 3', 'a fractional tier cannot be stored');
select t.must_fail($$update public.agent_settings set tiers = '[3]'$$, 'must be a JSON object', 'tiers must be an object');
select t.must_fail($$update public.agent_settings set per_action_cap = -1$$, 'check constraint', 'a negative cap cannot be stored');
select t.must_fail($$update public.agent_settings set quiet_start = 24$$, 'check constraint', 'hour 24 cannot be stored');
select t.must_fail($$update public.agent_settings set stopped_at = now()$$, 'use agent_stop_everything', 'a plain update cannot fake a stop');
select t.must_fail($$insert into public.agent_settings (user_id) values ('00000000-0000-0000-0000-00000000000b')$$,
  'row-level security', 'a user cannot create settings for someone else');
delete from public.agent_settings;
select t.ok((select count(*) = 1 from public.agent_settings), 'a user cannot delete their settings row');

-- ------------------------------------------------------- stop everything
reset role;
select public.exec_vault_store('exec_cred_00000000-0000-0000-0000-00000000000a_netflix', '{"username":"u","password":"p"}');
select public.exec_vault_store('exec_cred_a_plaid', 'read-only-brokerage-token');
insert into public.exec_credential_refs (user_id, merchant_key, vault_name, label)
  values ('00000000-0000-0000-0000-00000000000a', 'netflix', 'exec_cred_00000000-0000-0000-0000-00000000000a_netflix', 'Netflix');
insert into public.exec_approvals (id, user_id, merchant, merchant_key, status) values
  ('22222222-2222-2222-2222-222222222221', '00000000-0000-0000-0000-00000000000a', 'Netflix', 'netflix', 'approved'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000a', 'Hulu', 'hulu', 'executing'),
  ('22222222-2222-2222-2222-222222222223', '00000000-0000-0000-0000-00000000000a', 'Devin', 'devin', 'done'),
  ('22222222-2222-2222-2222-222222222224', '00000000-0000-0000-0000-00000000000b', 'Netflix', 'netflix', 'approved');
insert into public.exec_runs (approval_id, user_id, status, browserbase_session_id) values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000a', 'awaiting_otp', 'bb-session-1'),
  ('22222222-2222-2222-2222-222222222223', '00000000-0000-0000-0000-00000000000a', 'done', 'bb-session-0');
insert into public.agent_scheduled (user_id, action_id, capability_id, what, run_after) values
  ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'bills.bill_pay', 'Pay ComEd $20.00', now() + interval '2 days'),
  ('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), 'bills.bill_pay', 'Pay Nicor $30.00', now() + interval '2 days');

select t.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
create table t.stop_result as select public.agent_stop_everything() as r;
select t.ok((select (r ->> 'approvals_cancelled')::int = 2 from t.stop_result), 'both open approvals cancelled');
select t.ok((select (r ->> 'runs_stopped')::int = 1 from t.stop_result), 'the in-flight run stopped');
select t.ok((select r -> 'browser_sessions' = '["bb-session-1"]'::jsonb from t.stop_result), 'the live browser session is returned to be killed');
select t.ok((select (r ->> 'scheduled_cancelled')::int = 1 from t.stop_result), 'the scheduled action cancelled');
select t.ok((select r -> 'logins_deleted' = '["Netflix"]'::jsonb from t.stop_result), 'the saved login deleted');
select t.ok((select r -> 'autonomous_capabilities_turned_off' = '["bills.bill_pay"]'::jsonb from t.stop_result), 'the T3 capability is named');
select t.ok((select (r ->> 'ms')::numeric < 5000 from t.stop_result), 'stop ran in under five seconds');
select t.ok((select stopped_at is not null and tiers = '{}'::jsonb from public.agent_settings), 'settings show stopped, tiers empty');
select t.ok((select status = 'cancelled' from public.exec_approvals where id = '22222222-2222-2222-2222-222222222221'), 'approved approval is cancelled');
select t.ok((select status = 'done' from public.exec_approvals where id = '22222222-2222-2222-2222-222222222223'), 'a finished approval is left alone');
select t.ok((select count(*) = 0 from public.exec_credential_refs), 'no credential refs remain');
select t.ok((select evidence ? 'browser_sessions' is false and outcome like 'Stopped.%'
  from public.agent_ledger where event = 'stopped'), 'the stop is in the ledger, without session ids');
select t.must_fail($$update public.agent_settings set tiers = '{"bills.bill_pay": 3}'$$,
  'the agent is stopped', 'tiers cannot be raised while stopped');
select t.must_fail($$update public.agent_settings set stopped_at = null$$,
  'use agent_stop_everything', 'a plain update cannot clear the stop');

create table t.stop_again as select public.agent_stop_everything() as r;
select t.ok((select (r ->> 'already_stopped')::boolean and (r ->> 'approvals_cancelled')::int = 0 from t.stop_again),
  'stopping twice is safe');

reset role;
select t.ok((select count(*) = 0 from vault.secrets where name = 'exec_cred_00000000-0000-0000-0000-00000000000a_netflix'), 'the vault secret is gone');
select t.ok((select count(*) = 1 from vault.secrets where name = 'exec_cred_a_plaid'), 'the read-only brokerage token is untouched');
select t.ok((select status = 'approved' from public.exec_approvals where id = '22222222-2222-2222-2222-222222222224'),
  'another user''s approval is untouched');
select t.ok((select status = 'scheduled' from public.agent_scheduled where user_id = '00000000-0000-0000-0000-00000000000b'),
  'another user''s scheduled action is untouched');

-- ------------------------------------------------------------------ resume
select t.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
create table t.resume_result as select public.agent_resume() as r;
select t.ok((select (r ->> 'resumed')::boolean from t.resume_result), 'resume reports success');
select t.ok((select stopped_at is null and tiers = '{"bills.bill_pay": 2, "subscriptions.cancel": 2}'::jsonb
  from public.agent_settings), 'T3 comes back as T2, never as T3');
select t.ok((select (public.agent_resume() ->> 'resumed')::boolean is false), 'resuming when not stopped does nothing');
select t.ok((select count(*) = 1 from public.agent_ledger where event = 'resumed'), 'resume is in the ledger once');
select t.ok(public.agent_ledger_verify() is null, 'the chain still verifies after everything');

-- ------------------------------------------------- scheduled / findings / claims
select t.must_fail($$insert into public.agent_scheduled (user_id, action_id, capability_id, what, run_after)
  values ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'bills.bill_pay', 'x', now())$$,
  'permission denied', 'a user cannot schedule an action by hand');
reset role;
insert into public.agent_scheduled (id, user_id, action_id, capability_id, what, run_after) values
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'bills.bill_pay', 'Pay ComEd', now());
set role authenticated;
select t.must_fail($$update public.agent_scheduled set status = 'done' where id = '33333333-3333-3333-3333-333333333333'$$,
  'row-level security', 'a user cannot mark a scheduled action done');
update public.agent_scheduled set status = 'cancelled' where id = '33333333-3333-3333-3333-333333333333';
select t.ok((select status = 'cancelled' from public.agent_scheduled where id = '33333333-3333-3333-3333-333333333333'),
  'a user can cancel their own scheduled action');
update public.agent_scheduled set status = 'scheduled' where id = '33333333-3333-3333-3333-333333333333';
select t.ok((select status = 'cancelled' from public.agent_scheduled where id = '33333333-3333-3333-3333-333333333333'),
  'a cancelled action cannot be revived');

insert into public.agent_cancel_watches (user_id, action_id, merchant, source, expected_billing_date, grace_until)
  values ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'Netflix', 'user', '2026-10-15', '2026-10-17');
select t.must_fail($$insert into public.agent_cancel_watches (user_id, action_id, merchant, source, status)
  values ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'Hulu', 'user', 'confirmed')$$,
  'row-level security', 'a user cannot insert an already-confirmed cancellation');
select t.must_fail($$insert into public.agent_cancel_watches (user_id, action_id, merchant, source)
  values ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'Hulu', 'agent')$$,
  'row-level security', 'a user cannot claim the agent cancelled something');
select t.must_fail($$update public.agent_cancel_watches set status = 'confirmed'$$,
  'permission denied', 'a user cannot confirm their own cancellation');

insert into public.agent_findings (user_id, dedupe_key, kind, capability_id, title, source)
  values ('00000000-0000-0000-0000-00000000000a', 'dup:netflix:2026-10-01', 'duplicate_charge', 'recovery.duplicate_charge_dispute', 'Netflix charged twice', 'app');
select t.must_fail($$insert into public.agent_findings (user_id, dedupe_key, kind, capability_id, title, source)
  values ('00000000-0000-0000-0000-00000000000a', 'dup:netflix:2026-10-01', 'duplicate_charge', 'recovery.duplicate_charge_dispute', 'again', 'app')$$,
  'duplicate key', 'the same finding is never stored twice');
select t.must_fail($$insert into public.agent_findings (user_id, dedupe_key, kind, capability_id, title, source)
  values ('00000000-0000-0000-0000-00000000000a', 'k2', 'k', 'c', 't', 'nightly')$$,
  'row-level security', 'a user cannot forge a nightly finding');

-- ------------------------------------------------------- account deletion
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select t.ok((select count(*) = 0 from public.agent_ledger where user_id = '00000000-0000-0000-0000-00000000000a'),
  'deleting the account removes its ledger');
select t.ok((select count(*) = 0 from public.agent_settings where user_id = '00000000-0000-0000-0000-00000000000a')
  and (select count(*) = 0 from public.agent_cancel_watches where user_id = '00000000-0000-0000-0000-00000000000a')
  and (select count(*) = 0 from public.agent_findings where user_id = '00000000-0000-0000-0000-00000000000a'),
  'and its settings, claims and findings');
