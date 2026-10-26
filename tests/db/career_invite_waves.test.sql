-- FEATURE WAVES (20261026220017_career_invite_waves.sql): invite waves from the waitlist, the approved send, redeeming
-- once, STOP, and the gates computed from live rows (pass-shaped, warn-shaped and fail-shaped). Synthetic people only.
begin;
reset role;
set local timezone = 'UTC';
-- 100 consenting people in signup order (+1 312 555 0001..0100), one without consent, one duplicate number, one in
-- Hawaii, one outside +1, one who already has an account on that number.
insert into public.site_waitlist (name, phone, consent, consent_text, consent_at, created_at)
select 'Synthetic ' || g, '+1312555' || lpad(g::text, 4, '0'), true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.',
  timestamptz '2026-10-01 00:00Z' + make_interval(mins => g), timestamptz '2026-10-01 00:00Z' + make_interval(mins => g)
from generate_series(1, 100) g;
insert into public.site_waitlist (name, phone, consent, consent_text, consent_at, created_at) values
  ('No consent', '+13125550900', false, null, null, '2026-09-30 00:00Z'),
  ('Duplicate of 1', '+13125550001', true, 'I agree.', '2026-10-05 00:00Z', '2026-10-05 00:00Z'),
  ('Hawaii', '+18085550001', true, 'I agree.', '2026-10-10 00:00Z', '2026-10-10 00:00Z'),
  ('Abroad', '+447700900001', true, 'I agree.', '2026-10-10 00:01Z', '2026-10-10 00:01Z'),
  ('Has an account', '+13125550950', true, 'I agree.', '2026-09-29 00:00Z', '2026-09-29 00:00Z');
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000017b0', 'wave-existing@example.test'),
  ('00000000-0000-4000-8000-0000000017b1', 'wave-web-a@example.test'), ('00000000-0000-4000-8000-0000000017b2', 'wave-web-b@example.test');
insert into public.profiles (id) values ('00000000-0000-4000-8000-0000000017b0'), ('00000000-0000-4000-8000-0000000017b1'), ('00000000-0000-4000-8000-0000000017b2');
insert into public.channel_contacts (contact, user_id) values ('+13125550950', '00000000-0000-4000-8000-0000000017b0');
update public.career_wave_policy set first_wave_size = 25, min_sample = 20;

-- ---------------------------------------------------------------- who may call what
select t.ok(not has_table_privilege('authenticated', 'public.career_invites', 'select') and not has_table_privilege('anon', 'public.career_invites', 'select')
  and not has_table_privilege('authenticated', 'public.career_consents', 'select') and not has_table_privilege('anon', 'public.career_wave_gates', 'select')
  and not has_table_privilege('authenticated', 'public.career_signup_gate', 'select'),
  'no person and no anonymous caller reads invites, consents, sign-up records or the gates');
set role anon;
select t.ok((select count(*) = 0 from public.site_waitlist), 'the waitlist stays unreadable to an anonymous caller (row security, no policy)');
reset role;
select t.ok(not has_function_privilege('authenticated', 'public.career_wave_open(int, text, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.career_wave_approve_send(bigint, text, text, int, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.career_invite_claim_send(bigint, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.career_invite_redeem_for(text, text, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.career_invite_redeem_own(text)', 'execute')
  and has_function_privilege('authenticated', 'public.career_invite_redeem_own(text)', 'execute')
  and has_function_privilege('anon', 'public.career_invite_stop(text)', 'execute'),
  'only the service role opens, approves, sends and redeems for a channel; a signed-in person redeems their own; the unsubscribe link needs no account');

-- ---------------------------------------------------------------- the first wave
select t.ok((select (r->>'action') = 'first' and (r->>'recommended_size')::int = 25 and (r->>'eligible_remaining')::int = 102
  from public.career_wave_recommendation('2026-10-26 18:00Z') r),
  'before any wave: the first wave at the policy size; eligible = 100 + Hawaii + abroad (no consent, the duplicate and the account excluded)');
select t.must_fail($$select public.career_wave_open(26, 'wave-a', null, '2026-10-26 18:00Z')$$, 'over_recommended', 'a wave over the recommendation needs a reason');
select t.must_fail($$select public.career_wave_open(5, 'x', null, '2026-10-26 18:00Z')$$, 'invalid_key', 'a key is 4-64 of A-Z a-z 0-9 _ -');
select t.ok((public.career_wave_open(25, 'wave-a', null, '2026-10-26 18:00Z')->>'picked')::int = 25, 'wave A: 25 invites');
select t.ok((select array_agg(phone order by signed_up_at) = (select array_agg('+1312555' || lpad(g::text, 4, '0') order by g) from generate_series(1, 25) g)
  from public.career_invites), 'the 25 earliest consenting numbers, in signup order');
select t.ok((select count(distinct token) = 25 and count(*) filter (where token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')) = 25 from public.career_invites),
  'each invite its own token, stored with its sha256');
select t.ok((public.career_wave_open(25, 'wave-a', null, '2026-10-26 18:01Z')->>'replayed')::boolean and (select count(*) = 25 from public.career_invites), 'the same key again opens nothing');
select t.must_fail($$select public.career_wave_open(10, 'wave-a', null, '2026-10-26 18:01Z')$$, 'key_reused', 'the same key with another size is refused');
select t.must_fail($$select public.career_wave_open(5, 'wave-b', null, '2026-10-26 18:01Z')$$, 'wave_in_progress', 'one wave at a time');

-- ---------------------------------------------------------------- approval
create temp table tpl as select 'Trainee: your spot is open: {link} Reply STOP to opt out.'::text as body;
select t.must_fail($$select public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-a'), (select body from tpl), encode(sha256(convert_to((select body from tpl), 'UTF8')), 'hex'), 24, '2026-10-26 18:02Z')$$, 'count_mismatch', 'the exact count');
select t.must_fail($$select public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-a'), 'Your spot is open: {link} Reply STOP to opt out.', encode(sha256(convert_to('Your spot is open: {link} Reply STOP to opt out.', 'UTF8')), 'hex'), 25, '2026-10-26 18:02Z')$$, 'text_must_name_trainee', 'the text names Trainee');
select t.must_fail($$select public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-a'), 'Trainee: open {link} {name}. Reply STOP to opt out.', encode(sha256(convert_to('Trainee: open {link} {name}. Reply STOP to opt out.', 'UTF8')), 'hex'), 25, '2026-10-26 18:02Z')$$, 'text_unknown_placeholder', 'no placeholder but the links');
select t.must_fail($$select public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-a'), 'Trainee: your spot is open. Reply STOP to opt out.', encode(sha256(convert_to('Trainee: your spot is open. Reply STOP to opt out.', 'UTF8')), 'hex'), 25, '2026-10-26 18:02Z')$$, 'text_needs_link', 'the text carries the link');
select t.must_fail($$select public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-a'), (select body from tpl), encode(sha256(convert_to((select body from tpl) || ' ', 'UTF8')), 'hex'), 25, '2026-10-26 18:02Z')$$, 'text_hash_mismatch', 'the hash of exactly this text');
select t.must_fail($$select public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-a'), 'Trainee: your spot is open: {link}', encode(sha256(convert_to('Trainee: your spot is open: {link}', 'UTF8')), 'hex'), 25, '2026-10-26 18:02Z')$$, 'text_must_say_stop', 'the text says how to stop');
select t.ok(public.career_invite_claim_send((select id from public.career_invite_waves where open_key = 'wave-a'), '2026-10-26 18:02Z')->>'stop' = 'not_approved', 'nothing is claimed before the approval');
select t.ok((public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-a'), (select body from tpl), encode(sha256(convert_to((select body from tpl), 'UTF8')), 'hex'), 25, '2026-10-26 18:02Z')->>'approved')::int = 25, 'approved: 25');
select t.ok((public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-a'), (select body from tpl), encode(sha256(convert_to((select body from tpl), 'UTF8')), 'hex'), 25, '2026-10-26 18:03Z')->>'replayed')::boolean, 'the same approval again is a no-op');

-- ---------------------------------------------------------------- sending
select t.ok(public.career_invite_claim_send((select id from public.career_invite_waves where open_key = 'wave-a'), '2026-10-26 15:59Z')->>'stop' = 'quiet_hours' and public.career_invite_claim_send((select id from public.career_invite_waves where open_key = 'wave-a'), '2026-10-27 01:00Z')->>'stop' = 'quiet_hours',
  'quiet hours: nothing before 16:00 UTC or from 01:00 UTC');
-- 0003 says STOP before the send; 0004's STOP comes while its send is in flight. 0011's STOP was recorded by a path
-- that does not stop invites (the trigger off): the claim still checks the number at send time.
select public.channel_set_opt_out('+13125550003', true, '2026-10-26 18:04Z');
alter table public.channel_contacts disable trigger career_invites_on_opt_out;
select public.channel_set_opt_out('+13125550011', true, '2026-10-26 18:04Z');
alter table public.channel_contacts enable trigger career_invites_on_opt_out;
create temp table claimed (n int, j jsonb);
do $$declare j jsonb; i int := 0; begin
  loop j := public.career_invite_claim_send((select id from public.career_invite_waves where open_key = 'wave-a'), '2026-10-26 18:05Z'); exit when j ? 'done' or j ? 'stop'; i := i + 1; insert into claimed values (i, j);
    if j->>'phone' = '+13125550004' then perform public.channel_set_opt_out('+13125550004', true, '2026-10-26 18:05Z'); end if;
    perform public.career_invite_mark_sent((j->>'invite_id')::uuid, j->>'phone' <> '+13125550007', 'lm-' || i, case when j->>'phone' = '+13125550007' then 'LoopMessage 500' end, '2026-10-26 18:05Z');
  end loop; end $$;
select t.ok((select count(*) = 23 from claimed) and not exists (select from claimed where j->>'phone' in ('+13125550003', '+13125550011')), 'a number that said STOP before the send is never claimed');
select t.ok((select state from public.career_invites where phone = '+13125550011') = 'skipped_opt_out', 'an opted-out number found at send time is skipped, not sent');
select t.ok((select state from public.career_invites where phone = '+13125550003') = 'stopped', 'its invite is stopped');
select t.ok((select state || ',' || (token is null) from public.career_invites where phone = '+13125550004') = 'stopped,true', 'a STOP during the send wins over the send result');
select t.ok((select state || ',' || send_error from public.career_invites where phone = '+13125550007') = 'failed,LoopMessage 500', 'a failed send is recorded as failed, with the error');
select t.ok((select count(*) = 21 from public.career_invites where state = 'sent' and token is null and provider_id like 'lm-%' and expires_at = sent_at + interval '14 days'),
  '21 sent: each with the provider id, no token kept, 14 days to use it');
select t.ok((select j->>'text' = (select body from tpl) and j->>'text_sha256' = encode(sha256(convert_to((select body from tpl), 'UTF8')), 'hex') from claimed limit 1), 'each claim carries the approved text and its hash');
select t.ok((select status from public.career_invite_waves where open_key = 'wave-a') = 'sent', 'the wave is sent');

-- ---------------------------------------------------------------- redeeming
create temp table tk as select phone, 'Tk' || lpad(substr(phone, 9), 30, 'x') as tok from public.career_invites where state = 'sent';
update public.career_invites i set token_hash = encode(sha256(convert_to(tk.tok, 'UTF8')), 'hex') from tk where tk.phone = i.phone; -- known tokens for the test
grant select on tk to authenticated, anon;
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550001'), 'tg:5001', 'telegram', '2026-10-26 19:00Z') ? 'invite_id', 'Telegram takes 0001');
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550001'), 'tg:5002', 'telegram', '2026-10-26 19:00Z')->>'error' = 'used', 'another chat: used');
select t.ok((public.career_invite_redeem_for((select tok from tk where phone = '+13125550001'), 'tg:5001', 'telegram', '2026-10-26 19:01Z')->>'resumed')::boolean, 'the same chat before its account was bound: resumed, not a second invite');
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000017c1', null);
select t.ok((public.career_invite_bind((select id from public.career_invites where phone = '+13125550001'), '00000000-0000-4000-8000-0000000017c1', '2026-10-26 19:01Z')->>'step') = 'age', 'bound: the sign-up starts at the 18+ question');
select t.ok((select count(*) = 1 from public.career_consents where user_id = '00000000-0000-4000-8000-0000000017c1' and kind = 'sms' and source = 'site_waitlist'
  and text_sha256 = encode(sha256(convert_to('I agree to receive automated texts from Trainee. Reply STOP to opt out.', 'UTF8')), 'hex')), 'the waitlist''s SMS consent is recorded, its exact text');
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550001'), 'tg:5001', 'telegram', '2026-10-26 19:02Z')->>'error' = 'used', 'once bound, used for everyone');
select t.must_fail($$select public.career_invite_bind((select id from public.career_invites where phone = '+13125550001'), '00000000-0000-4000-8000-0000000017b1', '2026-10-26 19:02Z')$$, 'invite_bound_elsewhere', 'an invite never moves to another account');
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550002'), 'tg:5003', 'telegram', '2026-11-09 18:06Z')->>'error' = 'expired', 'after 14 days: expired');
select t.ok((select state from public.career_invites where phone = '+13125550002') = 'expired', 'and recorded as expired');
select t.ok(public.career_invite_redeem_for('A' || repeat('b', 31), 'tg:5004', 'telegram', '2026-10-26 19:00Z')->>'error' = 'invalid'
  and public.career_invite_redeem_for('short', 'tg:5004', 'telegram', '2026-10-26 19:00Z')->>'error' = 'invalid', 'an unknown or malformed token: invalid');
select t.ok(public.career_invite_redeem_phone('+13125550005', '+13125550005', 'imessage', '2026-10-26 19:00Z') ? 'invite_id'
  and public.career_invite_redeem_phone('+13125559999', '+13125559999', 'imessage', '2026-10-26 19:00Z')->>'error' = 'none', 'a first text from an invited number takes its invite; another number has none');
-- The web, as the signed-in person.
select t.as_user('00000000-0000-4000-8000-0000000017b1'); set role authenticated;
select t.ok((public.career_invite_redeem_own((select tok from tk where phone = '+13125550006'))->>'step') = 'age', 'the web: the person''s own account takes 0006');
select t.ok(public.career_invite_redeem_own((select tok from tk where phone = '+13125550008'))->>'error' = 'already_in', 'one invite per account: a second is not used up');
reset role;
select t.ok((select state from public.career_invites where phone = '+13125550008') = 'sent', '0008 is still unused');
select t.as_user('00000000-0000-4000-8000-0000000017b2'); set role authenticated;
select t.ok(public.career_invite_redeem_own((select tok from tk where phone = '+13125550006'))->>'error' = 'used', 'someone else''s used invite: used');
reset role;
-- The unsubscribe link, with no account: that number is opted out everywhere and its invite stopped.
set role anon;
select t.ok(public.career_invite_stop((select tok from tk where phone = '+13125550009')) and not public.career_invite_stop('nope'), 'the unsubscribe link');
reset role;
select t.ok((select state from public.career_invites where phone = '+13125550009') = 'stopped' and public.channel_opted_out('+13125550009'), 'stopped and opted out');
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550009'), 'tg:5009', 'telegram', '2026-10-26 19:00Z')->>'error' = 'stopped', 'a stopped invite is never used');

-- ---------------------------------------------------------------- sign-up steps
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'terms', 'yes', '[]', '2026-10-26 19:03Z') = 'age', 'an answer before the question was put is not taken');
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'age', null, '[]', '2026-10-26 19:03Z') = 'age'
  and public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'age', null, '[]', '2026-10-26 19:03Z') = 'asked_before', 'the question is recorded as put, once');
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'terms', 'yes', jsonb_build_array(jsonb_build_object('kind', 'age_18_plus', 'version', 'v1', 'text_sha256', repeat('a', 64), 'channel', 'telegram', 'message_sha256', repeat('b', 64))), '2026-10-26 19:04Z') = 'terms', 'age answered');
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'terms', 'yes', '[]', '2026-10-26 19:04Z') = 'terms', 'a stale step changes nothing and says where it stands');
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'terms', 'active', null, '[]', '2026-10-26 19:05Z') = 'terms', 'the terms are not taken before they were shown');

-- ---------------------------------------------------------------- the gates, pass-shaped
-- The 17 still unused of the 22 sent finish sign-up (17/22); 34 messages to them delivered, none failed; a 98/100 truth
-- sample; $0.10 a person; nothing refused with 429; no site paused; no application silent.
do $$declare r record; u uuid; i int := 0; begin
  for r in select id, phone from public.career_invites where state = 'sent' order by phone loop
    i := i + 1; u := ('00000000-0000-4000-8000-' || lpad((18000 + i)::text, 12, '0'))::uuid;
    insert into auth.users (id, email) values (u, null); insert into public.profiles (id) values (u);
    perform public.career_invite_take_core(r.id, 'tg:' || (6000 + i), 'telegram', '2026-10-26 19:10Z');
    perform public.career_invite_bind(r.id, u, '2026-10-26 19:10Z');
    update public.career_signup_gate set step = 'active' where user_id = u;
    insert into public.career_outbox (user_id, key, kind, text, deliver_at, status, delivered_at, channel, contact, created_at)
      select u, 'reply:t' || i || '-' || g, 'reply', 'ok', '2026-10-27 12:00Z', 'delivered', '2026-10-27 12:00Z', 'telegram', 'tg:' || (6000 + i), '2026-10-27 12:00Z' from generate_series(1, 2) g;
    insert into public.agent_turn_costs (user_id, calls, usd_micros, created_at) values (u, 1, 100000, '2026-10-27 12:00Z');
  end loop; end $$;
insert into public.career_reply_truth_samples (run_at, checked, passed, source) values ('2026-10-27 17:00Z', 100, 98, 'live-verify (test)');
create temp table g_pass as select * from public.career_wave_gate_rows('2026-10-27 19:00Z');
select t.ok((select bool_and(status = 'pass') from g_pass), 'pass-shaped: every gate passes' || coalesce(': ' || (select string_agg(gate || '=' || status || ' (' || detail || ')', '; ') from g_pass where status <> 'pass'), ''));
select t.ok((select value = 0.7619 and n = 21 from g_pass where gate = 'signup_completion'), 'completion 16/21 of the invites sent 24 hours or more ago (STOPs before the send and a failed send were never sent)');
select t.ok((select value = 0.1 and n = 16 from g_pass where gate = 'cost_per_active_usd'), '$0.10 a person over 16 people');
select t.ok((select (r->>'action') = 'double' and (r->>'recommended_size')::int = 50 and (r->>'last_wave_size')::int = 25 from public.career_wave_recommendation('2026-10-27 19:00Z') r), 'every gate passes: double, 25 -> 50');

-- ---------------------------------------------------------------- warn-shaped: hold
insert into public.career_reply_truth_samples (run_at, checked, passed, source) values ('2026-10-27 18:00Z', 100, 92, 'live-verify (test)');
select t.ok((select status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'reply_truth') = 'warn', '92/100 true: a warning');
select t.ok((select (r->>'action') = 'hold' and (r->>'recommended_size')::int = 25 from public.career_wave_recommendation('2026-10-27 19:00Z') r), 'a warning holds the size');
select t.ok((select status from public.career_wave_gate_rows('2026-10-28 19:00Z') where gate = 'reply_truth') = 'warn', 'no sample in the last 24 hours: a warning, never a pass');

-- ---------------------------------------------------------------- fail-shaped: each gate on its own closes
create temp table fails (gate text, why text);
do $$declare u uuid := '00000000-0000-4000-8000-000000018001'; s text;
begin
  -- truth 50/100
  insert into public.career_reply_truth_samples (run_at, checked, passed, source) values ('2026-10-27 18:30Z', 100, 50, 'live-verify (test)');
  insert into fails select 'reply_truth', status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'reply_truth';
  delete from public.career_reply_truth_samples where passed = 50;
  -- errors: 10 failed sends of 50
  insert into public.career_outbox (user_id, key, kind, text, deliver_at, status, channel, contact, created_at, error)
    select u, 'reply:f' || g, 'reply', 'x', '2026-10-27 12:00Z', 'failed', 'telegram', 'tg:6001', '2026-10-27 12:00Z', 'Telegram HTTP 500' from generate_series(1, 10) g;
  insert into fails select 'error_rate', status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'error_rate';
  delete from public.career_outbox where key like 'reply:f%';
  -- the chat-down reply counts as an error too
  insert into public.career_outbox (user_id, key, kind, text, deliver_at, status, delivered_at, channel, contact, created_at)
    select u, 'reply:d' || g, 'reply', 'I couldn''t answer that just now. Try again in a minute.', '2026-10-27 12:00Z', 'delivered', '2026-10-27 12:00Z', 'telegram', 'tg:6001', '2026-10-27 12:00Z' from generate_series(1, 10) g;
  insert into fails select 'error_rate (chat down)', status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'error_rate';
  delete from public.career_outbox where key like 'reply:d%';
  -- completion: nobody finished
  create temp table was_active as select user_id from public.career_signup_gate where step = 'active';
  update public.career_signup_gate set step = 'age' where user_id in (select user_id from was_active);
  insert into fails select 'signup_completion', status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'signup_completion';
  update public.career_signup_gate set step = 'active' where user_id in (select user_id from was_active);
  -- cost: $5 a person
  update public.agent_turn_costs set usd_micros = 5000000;
  insert into fails select 'cost_per_active_usd', status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'cost_per_active_usd';
  update public.agent_turn_costs set usd_micros = 100000;
  -- Telegram 429s
  insert into public.career_outbox (user_id, key, kind, text, deliver_at, status, channel, contact, created_at, error)
    select u, 'alert:q' || g, 'alert', 'x', '2026-10-27 12:00Z', 'queued', 'telegram', 'tg:6001', '2026-10-27 12:00Z', 'Telegram HTTP 429: Too Many Requests: retry after 3' from generate_series(1, 20) g;
  insert into fails select 'telegram_429', status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'telegram_429';
  delete from public.career_outbox where key like 'alert:q%';
  -- OpenAI 429s
  insert into public.agent_provider_events (provider, model, role, ok, status, created_at) select 'openai', 'gpt-5-mini', 'chat', false, 429, '2026-10-27 12:00Z' from generate_series(1, 20);
  insert into fails select 'openai_429', status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'openai_429';
  delete from public.agent_provider_events where status = 429;
  -- cloud: three sites paused
  insert into public.career_apply_cloud_pauses (scope, portal, reason, until, created_at) select 'portal', p, 'test', '2026-10-28 00:00Z', '2026-10-27 18:00Z' from unnest(array['greenhouse', 'lever', 'ashby']) p;
  insert into fails select 'cloud_site_pauses', status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'cloud_site_pauses';
  -- the recommendation closes while they are paused, and opening is refused
  insert into fails select 'recommendation', (r->>'action') || ':' || (r->>'recommended_size') from public.career_wave_recommendation('2026-10-27 19:00Z') r;
  begin perform public.career_wave_open(10, 'wave-c', null, '2026-10-27 19:00Z'); insert into fails values ('open', 'opened');
  exception when others then insert into fails values ('open', sqlerrm); end;
  delete from public.career_apply_cloud_pauses;
end $$;
select t.ok((select string_agg(gate || '=' || why, ', ' order by gate) from fails) =
  'cloud_site_pauses=fail, cost_per_active_usd=fail, error_rate=fail, error_rate (chat down)=fail, open=gates_failed, openai_429=fail, recommendation=close:0, reply_truth=fail, signup_completion=fail, telegram_429=fail',
  'fail-shaped: each gate fails on its own; a failure closes (0) and opening is refused: ' || (select string_agg(gate || '=' || why, ', ' order by gate) from fails));
-- A finished application with no receipt, or one stuck driving, is a silent outcome.
insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, attempts, lease_token, claimed_at, created_at, updated_at)
values ('00000000-0000-4000-8000-000000018001', 'TEST-WAVE-1', 'Wave Employer', 'https://jobs.example.test/1', '{}', repeat('d', 64), repeat('d', 64), 'driving', 1, gen_random_uuid(), '2026-10-27 17:00Z', '2026-10-27 16:00Z', '2026-10-27 17:00Z');
select t.ok((select status || ':' || value from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'silent_outcomes') = 'fail:1', 'an application stuck driving for 2 hours: silent, fail');
delete from public.career_apply_jobs where job_id = 'TEST-WAVE-1';
insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, attempts, created_at, updated_at)
values ('00000000-0000-4000-8000-000000018002', 'TEST-WAVE-2', 'Wave Employer', 'https://jobs.example.test/2', '{}', repeat('e', 64), repeat('e', 64), 'failed', 1, '2026-10-27 16:00Z', '2026-10-27 17:00Z');
select t.ok((select status from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'silent_outcomes') = 'pass', 'a finished application with its receipt (the database writes it) is not silent');
delete from public.career_apply_receipts where application_id = (select id from public.career_apply_jobs where job_id = 'TEST-WAVE-2');
select t.ok((select status || ':' || value from public.career_wave_gate_rows('2026-10-27 19:00Z') where gate = 'silent_outcomes') = 'fail:1', 'an application that finished with no receipt: silent, fail');

-- The sender closes a wave on a failing gate: what was not sent is held.
select t.ok(public.career_wave_close((select id from public.career_invite_waves where open_key = 'wave-a'), 'a gate failed: silent_outcomes', '2026-10-27 19:00Z') = 0, 'close: nothing was left unsent in wave A');
select t.ok((select status from public.career_invite_waves where open_key = 'wave-a') = 'closed', 'wave A is closed');
select t.ok((public.career_wave_open(10, 'wave-c', 'owner: test override', '2026-10-27 19:00Z')->>'picked')::int = 10, 'the owner can open past a failure only with a reason');
select t.ok((select override_reason from public.career_invite_waves where open_key = 'wave-c') = 'owner: test override', 'the reason is kept on the wave');
select t.ok(public.career_wave_close((select id from public.career_invite_waves where open_key = 'wave-c'), 'test', '2026-10-27 19:01Z') = 10, 'closing wave C holds its 10');
select t.ok((select count(*) = 10 from public.career_invites i join public.career_invite_waves w on w.id = i.wave_id where w.open_key = 'wave-c' and i.state = 'held'), 'closing holds the unsent invites');
-- Numbers whose local time Trainee can't know are held, never sent. 0099 said STOP before ever being invited.
reset role;
select public.channel_set_opt_out('+13125550099', true, '2026-10-27 19:02Z');
update public.career_invite_waves set status = 'closed' where status <> 'closed';
select public.career_wave_open(102, 'wave-d', 'owner: test the rest', '2026-10-27 19:02Z');
select public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-d'), (select body from tpl), encode(sha256(convert_to((select body from tpl), 'UTF8')), 'hex'),
  (select count(*)::int from public.career_invites i join public.career_invite_waves w on w.id = i.wave_id where w.open_key = 'wave-d'), '2026-10-27 19:03Z');
do $$declare j jsonb; w bigint := (select id from public.career_invite_waves where open_key = 'wave-d'); begin
  loop j := public.career_invite_claim_send(w, '2026-10-27 19:04Z'); exit when j ? 'done' or j ? 'stop';
    perform public.career_invite_mark_sent((j->>'invite_id')::uuid, true, 'lm', null, '2026-10-27 19:04Z'); end loop; end $$;
select t.ok((select string_agg(phone || ':' || state, ',' order by phone) from public.career_invites where phone in ('+18085550001', '+447700900001')) = '+18085550001:held,+447700900001:held',
  'Hawaii and a number outside +1 are held for the owner (quiet hours unknown)');
select t.ok(not exists (select from public.career_invites where phone = '+13125550950') and not exists (select from public.career_invites where phone = '+13125550900'),
  'the number with an account and the one without consent are never invited');
select t.ok((select count(*) = 1 from public.career_invites where phone = '+13125550001'), 'the duplicate signup is one invite');
select t.ok(not exists (select from public.career_invites where phone = '+13125550099'), 'a number that said STOP is never invited');
rollback;
