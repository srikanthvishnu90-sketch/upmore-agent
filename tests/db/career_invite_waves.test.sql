-- FEATURE WAVES (20261026233017_career_invite_waves.sql): invite waves from the waitlist, the approved send, redeeming
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
  ('Consent without its words', '+13125550901', true, null, '2026-09-30 00:00Z', '2026-09-30 00:01Z'),
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
  and not has_function_privilege('anon', 'public.career_invite_stop(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.career_invite_stop(text)', 'execute')
  and has_function_privilege('service_role', 'public.career_invite_stop(text)', 'execute')
  and not has_function_privilege('anon', 'public.career_invite_answer_last4(text, text, text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.career_invite_answer_last4(text, text, text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.career_invite_check_last4(uuid, text, timestamptz)', 'execute'),
  'only the service role opens, approves, sends, redeems for a channel and unsubscribes by token; a signed-in person redeems their own');
-- The definer lockdown (PR #197's rule, held here too): no SECURITY DEFINER function this file defines can be run by anon or
-- PUBLIC, every one sets its search_path, and the tables are closed to both.
select t.ok(not exists (select from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and (p.proname like 'career\_invite%' or p.proname like 'career\_wave%' or p.proname like 'career\_signup%')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public'::name, p.oid, 'execute'))),
  'no invite, wave or sign-up definer function is open to anon or PUBLIC: ' || coalesce((select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and (p.proname like 'career\_invite%' or p.proname like 'career\_wave%' or p.proname like 'career\_signup%')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public'::name, p.oid, 'execute'))), 'none'));
select t.ok(not exists (select from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and (p.proname like 'career\_invite%' or p.proname like 'career\_wave%' or p.proname like 'career\_signup%')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'every invite, wave and sign-up definer function sets its search_path');
select t.ok(not has_function_privilege('anon', 'public.career_signup_state(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.career_signup_state(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.career_signup_state(uuid)', 'execute'), 'the sign-up record read is the service role''s');
select t.ok(not has_table_privilege('anon', 'public.career_invite_checks', 'select') and not has_table_privilege('authenticated', 'public.career_invite_checks', 'select'),
  'the pending last-4 questions are closed to anon and signed-in people');

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
-- Atlantic, Newfoundland, Caribbean and other non-US +1 numbers are held (never claimed) at 00:30Z, when a continental
-- US number is still inside 8 am-9 pm: +1 902 is 21:30 ADT and +1 709 is 22:00 NDT, both after 9 pm.
select t.ok((select count(*) = 0 from (select u from unnest(array['902', '782', '506', '709', '428', '879', '416', '604', '867', '876', '441', '242', '809', '868', '600']) u
    where u <> all (public.career_wave_held_npa())) x), 'the held list names Nova Scotia, PEI, New Brunswick, Newfoundland, Ontario, BC, the territories, Jamaica, Bermuda, Bahamas, the Dominican Republic, Trinidad and the non-geographic Canadian code');
select t.ok(not ('312' = any (public.career_wave_held_npa())) and not ('212' = any (public.career_wave_held_npa())) and not ('787' = any (public.career_wave_held_npa())) and not ('340' = any (public.career_wave_held_npa())),
  'US numbers (Chicago, New York, Puerto Rico, the US Virgin Islands) are not on the held list');
select t.ok(cardinality(public.career_wave_held_npa()) = (select count(distinct x) from unnest(public.career_wave_held_npa()) x), 'no area code twice');
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
-- Telegram: the link alone redeems nothing. The chat is asked for the last 4 digits of the number the invite was texted to.
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550001'), 'tg:5001', 'telegram', '2026-10-26 19:00Z')->>'error' = 'need_last4'
  and (select state from public.career_invites where phone = '+13125550001') = 'sent', 'Telegram: the link asks for the last 4 digits and takes nothing');
select t.ok(public.career_invite_answer_last4('tg:5001', 'abcd', 'telegram', '2026-10-26 19:00Z')->>'error' = 'format'
  and public.career_invite_answer_last4('tg:5001', '123', 'telegram', '2026-10-26 19:00Z')->>'error' = 'format'
  and (select wrong_tries from public.career_invites where phone = '+13125550001') = 0, 'not four digits: asked again, not counted');
select t.ok(public.career_invite_answer_last4('tg:5002', '0001', 'telegram', '2026-10-26 19:00Z')->>'error' = 'none', 'another chat has no pending question: nothing is taken, even with the right digits');
select t.ok(public.career_invite_answer_last4('tg:5001', '9999', 'telegram', '2026-10-26 19:00Z')->>'error' = 'wrong_last4'
  and (public.career_invite_answer_last4('tg:5001', '9998', 'telegram', '2026-10-26 19:00Z')->>'tries_left')::int = 3
  and (select state from public.career_invites where phone = '+13125550001') = 'sent', 'wrong digits: nothing taken, the tries counted');
select t.ok(public.career_invite_answer_last4('tg:5001', '0001', 'telegram', '2026-10-26 19:31Z')->>'error' = 'none', 'a question older than 30 minutes is gone');
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550001'), 'tg:5001', 'telegram', '2026-10-26 19:32Z')->>'error' = 'need_last4', 'asked again');
select t.ok(public.career_invite_answer_last4('tg:5001', '0001', 'telegram', '2026-10-26 19:33Z') ? 'invite_id', 'the right digits take it');
select t.ok((select wrong_tries from public.career_invites where phone = '+13125550001') = 0, 'and clear the tries');
select t.ok(not exists (select from public.career_invite_checks where holder = 'tg:5001'), 'the pending question is gone once answered');
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550001'), 'tg:5002', 'telegram', '2026-10-26 19:34Z')->>'error' = 'used', 'another chat: used');
select t.ok((public.career_invite_redeem_for((select tok from tk where phone = '+13125550001'), 'tg:5001', 'telegram', '2026-10-26 19:35Z')->>'resumed')::boolean, 'the same chat before its account was bound: resumed, not a second invite');
-- Five wrong answers lock the invite for an hour, even against the right digits; then it opens again.
select public.career_invite_redeem_for((select tok from tk where phone = '+13125550010'), 'tg:7001', 'telegram', '2026-10-26 20:00Z');
select t.ok((select string_agg(public.career_invite_answer_last4('tg:7001', '000' || g, 'telegram', ('2026-10-26 20:0' || g || 'Z')::timestamptz)->>'error', ',' order by g) from generate_series(1, 4) g) = 'wrong_last4,wrong_last4,wrong_last4,wrong_last4',
  'four wrong answers: still asking');
select t.ok(public.career_invite_answer_last4('tg:7001', '0005', 'telegram', '2026-10-26 20:05Z')->>'error' = 'locked', 'the fifth wrong answer locks the invite');
select t.ok((select locked_until from public.career_invites where phone = '+13125550010') = '2026-10-26 21:05Z', 'for an hour');
select public.career_invite_redeem_for((select tok from tk where phone = '+13125550010'), 'tg:7001', 'telegram', '2026-10-26 20:10Z');
select t.ok(public.career_invite_answer_last4('tg:7001', '0010', 'telegram', '2026-10-26 20:11Z')->>'error' = 'locked', 'locked: even the right digits are refused');
select t.ok((select state from public.career_invites where phone = '+13125550010') = 'sent', 'and nothing is taken');
select public.career_invite_redeem_for((select tok from tk where phone = '+13125550010'), 'tg:7001', 'telegram', '2026-10-26 21:06Z');
select t.ok(public.career_invite_answer_last4('tg:7001', '0010', 'telegram', '2026-10-26 21:07Z') ? 'invite_id', 'an hour later the right digits work');
-- Put 0010 back as an unused invite for the tests below (it was only taken to show the lock lifts).
update public.career_invites set state = 'sent', redeemed_at = null, redeemed_via = null, redeemed_contact = null where phone = '+13125550010';
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000017c1', null);
select t.ok((public.career_invite_bind((select id from public.career_invites where phone = '+13125550001'), '00000000-0000-4000-8000-0000000017c1', '2026-10-26 19:01Z')->>'step') = 'age', 'bound: the sign-up starts at the 18+ question');
select t.ok((select count(*) = 1 from public.career_consents where user_id = '00000000-0000-4000-8000-0000000017c1' and kind = 'sms' and source = 'site_waitlist'
  and text_sha256 = encode(sha256(convert_to('I agree to receive automated texts from Trainee. Reply STOP to opt out.', 'UTF8')), 'hex')), 'the waitlist''s SMS consent is recorded, its exact text');
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550001'), 'tg:5001', 'telegram', '2026-10-26 19:36Z')->>'error' = 'used', 'once bound, used for everyone');
select t.must_fail($$select public.career_invite_bind((select id from public.career_invites where phone = '+13125550001'), '00000000-0000-4000-8000-0000000017b1', '2026-10-26 19:02Z')$$, 'invite_bound_elsewhere', 'an invite never moves to another account');
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550002'), 'tg:5003', 'telegram', '2026-11-09 18:06Z')->>'error' = 'expired', 'after 14 days: expired');
select t.ok((select state from public.career_invites where phone = '+13125550002') = 'expired', 'and recorded as expired');
select t.ok(public.career_invite_redeem_for('A' || repeat('b', 31), 'tg:5004', 'telegram', '2026-10-26 19:00Z')->>'error' = 'invalid'
  and public.career_invite_redeem_for('short', 'tg:5004', 'telegram', '2026-10-26 19:00Z')->>'error' = 'invalid', 'an unknown or malformed token: invalid');
select t.ok(public.career_invite_redeem_phone('+13125550005', '+13125550005', 'imessage', '2026-10-26 19:00Z') ? 'invite_id'
  and public.career_invite_redeem_phone('+13125559999', '+13125559999', 'imessage', '2026-10-26 19:00Z')->>'error' = 'none', 'a first text from an invited number takes its invite; another number has none');
-- The web, as the signed-in person. The link is bound to the invited phone: the account must have signed in (confirmed) with that number.
update auth.users set phone = '13125550006', phone_confirmed_at = '2026-10-26 18:00Z' where id = '00000000-0000-4000-8000-0000000017b1';
update auth.users set phone = '13125550099', phone_confirmed_at = '2026-10-26 18:00Z' where id = '00000000-0000-4000-8000-0000000017b2';
insert into auth.users (id, phone, phone_confirmed_at) values ('00000000-0000-4000-8000-0000000017b3', '13125550012', null); -- 0012's number, never confirmed
insert into public.profiles (id) values ('00000000-0000-4000-8000-0000000017b3');
select t.as_user('00000000-0000-4000-8000-0000000017b2'); set role authenticated;
select t.ok(public.career_invite_redeem_own((select tok from tk where phone = '+13125550006'))->>'error' = 'wrong_number', 'a stranger holding the link (signed in with another number) takes nothing');
reset role;
select t.as_user('00000000-0000-4000-8000-0000000017b3'); set role authenticated;
select t.ok(public.career_invite_redeem_own((select tok from tk where phone = '+13125550012'))->>'error' = 'wrong_number', 'the invited number typed in but never confirmed by a code: not the person');
reset role;
select t.ok((select state from public.career_invites where phone in ('+13125550006', '+13125550012') group by state) = 'sent', 'and the invites are still unused');
select t.as_user('00000000-0000-4000-8000-0000000017b1'); set role authenticated;
select t.ok((public.career_invite_redeem_own((select tok from tk where phone = '+13125550006'))->>'step') = 'age', 'the web: the person signed in with the invited number takes 0006');
select t.ok(public.career_invite_redeem_own((select tok from tk where phone = '+13125550008'))->>'error' = 'already_in', 'one invite per account: a second is not used up');
reset role;
select t.ok((select state from public.career_invites where phone = '+13125550008') = 'sent', '0008 is still unused');
-- The unsubscribe by token: service role only (no page calls it yet); an anonymous caller can't run it.
set role anon;
select t.must_fail($$select public.career_invite_stop((select tok from tk where phone = '+13125550009'))$$, 'permission denied', 'an anonymous caller can''t unsubscribe by token');
reset role;
set role authenticated;
select t.must_fail($$select public.career_invite_stop((select tok from tk where phone = '+13125550009'))$$, 'permission denied', 'nor can a signed-in one');
reset role;
select t.ok(public.career_invite_stop((select tok from tk where phone = '+13125550009')) and not public.career_invite_stop('nope'), 'the service role unsubscribes by token');
select t.ok((select state from public.career_invites where phone = '+13125550009') = 'stopped' and public.channel_opted_out('+13125550009'), 'stopped and opted out');
select t.ok(public.career_invite_redeem_for((select tok from tk where phone = '+13125550009'), 'tg:5009', 'telegram', '2026-10-26 19:00Z')->>'error' = 'stopped', 'a stopped invite is never used');

-- ---------------------------------------------------------------- sign-up steps
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'terms', 'yes', '[]', '2026-10-26 19:03Z') = 'age', 'an answer before the question was put is not taken');
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'age', null, '[]', '2026-10-26 19:03Z') = 'age'
  and public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'age', null, '[]', '2026-10-26 19:03Z') = 'asked_before', 'the question is recorded as put, once');
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'terms', 'yes', jsonb_build_array(jsonb_build_object('kind', 'age_18_plus', 'version', 'v1', 'text_sha256', repeat('a', 64), 'channel', 'telegram', 'message_sha256', repeat('b', 64))), '2026-10-26 19:04Z') = 'terms', 'age answered');
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'age', 'terms', 'yes', '[]', '2026-10-26 19:04Z') = 'terms', 'a stale step changes nothing and says where it stands');
select t.ok(public.career_signup_step('00000000-0000-4000-8000-0000000017c1', 'terms', 'active', null, '[]', '2026-10-26 19:05Z') = 'terms', 'the terms are not taken before they were shown');

select t.ok(public.career_signup_state('00000000-0000-4000-8000-0000000017c1') = jsonb_build_object('step', 'terms', 'asked_at', null)
  and public.career_signup_state('00000000-0000-4000-8000-0000000017b0') is null, 'the sign-up record read: the step and when it was asked, or null for an account with none');

-- ---------------------------------------------------------------- the admission (20261026230000's core, closed)
select public.trainee_set_signup('invite');
select t.ok((select via || ',' || waitlist_id from public.trainee_admissions where user_id = '00000000-0000-4000-8000-0000000017c1')
  = 'waitlist,' || (select waitlist_id from public.career_invites where phone = '+13125550001'), 'a bound invite records its admission, naming the waitlist row');
select t.ok(public.trainee_admit('00000000-0000-4000-8000-0000000017c1', false) = 'waitlist', 'the core reads it back');
select t.ok(not public.trainee_may_act('00000000-0000-4000-8000-0000000017c1'), 'admitted, but no applications until the sign-up steps are done');
select t.must_fail($$insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash) values ('00000000-0000-4000-8000-0000000017c1', 'TEST-WAVE-ADM-1', 'Wave Employer', 'https://jobs.example.test/a', '{}', repeat('a', 64), repeat('a', 64))$$,
  'not_admitted', 'the database refuses an application while the steps are unfinished');
-- A confirmed phone matching a sent invite: the core's hook takes it for that account.
insert into auth.users (id, phone, phone_confirmed_at) values ('00000000-0000-4000-8000-0000000017d8', '13125550008', now()),
  ('00000000-0000-4000-8000-0000000017d2', '13125550002', now()), ('00000000-0000-4000-8000-0000000017d0', '13125550010', null),
  ('00000000-0000-4000-8000-0000000017dd', null, null);
insert into public.profiles (id) values ('00000000-0000-4000-8000-0000000017d8'), ('00000000-0000-4000-8000-0000000017dd');
select t.ok(public.trainee_admit('00000000-0000-4000-8000-0000000017d8', false) = 'waitlist', 'a confirmed phone with a sent invite: admitted by the invite');
select t.ok((select state || ',' || redeemed_via || ',' || redeemed_user from public.career_invites where phone = '+13125550008') = 'redeemed,web,00000000-0000-4000-8000-0000000017d8', 'the invite is taken by that account, once');
select t.ok((select step from public.career_signup_gate where user_id = '00000000-0000-4000-8000-0000000017d8') = 'age', 'and its sign-up steps begin');
select t.ok(public.trainee_admit('00000000-0000-4000-8000-0000000017d2', false) is null, 'an expired invite admits nobody');
select t.ok(public.trainee_admit('00000000-0000-4000-8000-0000000017d0', false) is null and (select state from public.career_invites where phone = '+13125550010') = 'sent', 'an unconfirmed phone takes nothing');
select t.ok(public.trainee_admit('00000000-0000-4000-8000-0000000017dd', false) is null and not public.trainee_may_act('00000000-0000-4000-8000-0000000017dd'), 'no invite, not listed, closed: not admitted');
select t.must_fail($$insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash) values ('00000000-0000-4000-8000-0000000017dd', 'TEST-WAVE-ADM-2', 'Wave Employer', 'https://jobs.example.test/b', '{}', repeat('b', 64), repeat('b', 64))$$,
  'not_admitted', 'a person not admitted is refused at the database');
update public.career_signup_gate set step = 'active' where user_id = '00000000-0000-4000-8000-0000000017d8';
select t.ok(public.trainee_may_act('00000000-0000-4000-8000-0000000017d8'), 'the steps done: they may apply');
select public.trainee_set_signup('open');

-- ---------------------------------------------------------------- the gates, pass-shaped
-- The invites still unused finish sign-up (with the one taken by phone above, 16 of the 21 sent); their messages delivered, none failed; a 98/100 truth
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
select t.ok((select value = 0.1 and n = 15 from g_pass where gate = 'cost_per_active_usd'), '$0.10 a person over the 15 with metered turns');
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
select t.ok(not exists (select from public.career_invites where phone in ('+13125550950', '+13125550900', '+13125550901')),
  'the number with an account, the one without consent and the one whose consent words are not on record are never invited');
select t.ok((select count(*) = 1 from public.career_invites where phone = '+13125550001'), 'the duplicate signup is one invite');
select t.ok(not exists (select from public.career_invites where phone = '+13125550099'), 'a number that said STOP is never invited');

-- ---------------------------------------------------------------- STOP reaches every number of that person
-- One person with a Telegram chat, an iMessage number and a WhatsApp number, each holding an unused invite; another person's invite
-- is the control. A STOP on the Telegram chat (which has no number of its own) stops the invites to both of their numbers.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000019a1', null), ('00000000-0000-4000-8000-0000000019a2', null);
insert into public.profiles (id) values ('00000000-0000-4000-8000-0000000019a1'), ('00000000-0000-4000-8000-0000000019a2');
insert into public.career_invite_waves (id, open_key, size, status, opened_at) values (990900, 'wave-stop-test', 4, 'sent', '2026-10-20 00:00Z');
insert into public.career_invites (wave_id, phone, token_hash, state, signed_up_at, created_at, sent_at, expires_at)
select 990900, ph, encode(sha256(convert_to(ph, 'UTF8')), 'hex'), 'sent', '2026-10-20 00:00Z', '2026-10-20 00:00Z', '2026-10-26 00:00Z', '2026-11-09 00:00Z'
from unnest(array['+13125557101', '+13125557102', '+13125557103']) ph;
insert into public.channel_contacts (contact, user_id) values ('tg:7100', '00000000-0000-4000-8000-0000000019a1'), ('+13125557101', '00000000-0000-4000-8000-0000000019a1'),
  ('wa:7102', '00000000-0000-4000-8000-0000000019a1'), ('+13125557103', '00000000-0000-4000-8000-0000000019a2');
update public.channel_contacts set phone = '+13125557102' where contact = 'wa:7102';
select public.channel_set_opt_out('tg:7100', true, '2026-10-27 20:00Z');
select t.ok((select string_agg(phone || ':' || state, ',' order by phone) from public.career_invites where wave_id = 990900)
  = '+13125557101:stopped,+13125557102:stopped,+13125557103:sent',
  'a STOP on one of a person''s channels stops the unused invites to every number of theirs, and only theirs');
delete from public.career_invites where wave_id = 990900; delete from public.career_invite_waves where id = 990900;
delete from public.channel_contacts where user_id in ('00000000-0000-4000-8000-0000000019a1', '00000000-0000-4000-8000-0000000019a2');

-- ---------------------------------------------------------------- the error-rate gate on a small sample
-- Ten of ten messages failing is 100%, but ten is fewer than the policy's 20 to judge: a warning, never a pass and never a failure.
insert into public.career_outbox (user_id, key, kind, text, deliver_at, status, channel, contact, created_at, error)
  select '00000000-0000-4000-8000-000000018001', 'reply:small' || g, 'reply', 'x', '2026-11-05 12:00Z', 'failed', 'telegram', 'tg:6001', '2026-11-05 12:00Z', 'Telegram HTTP 500' from generate_series(1, 10) g;
select t.ok((select status || ':' || n from public.career_wave_gate_rows('2026-11-05 13:00Z') where gate = 'error_rate') = 'warn:10',
  '10 of 10 messages failed: a warning on a small sample, not a failure');
insert into public.career_outbox (user_id, key, kind, text, deliver_at, status, channel, contact, created_at, error)
  select '00000000-0000-4000-8000-000000018001', 'reply:small' || g, 'reply', 'x', '2026-11-05 12:00Z', 'failed', 'telegram', 'tg:6001', '2026-11-05 12:00Z', 'Telegram HTTP 500' from generate_series(11, 20) g;
select t.ok((select status || ':' || n from public.career_wave_gate_rows('2026-11-05 13:00Z') where gate = 'error_rate') = 'fail:20',
  'the same failure rate over 20 messages (the sample the policy needs): a failure');
delete from public.career_outbox where key like 'reply:small%';

-- ---------------------------------------------------------------- quiet hours for Atlantic, Newfoundland and Caribbean numbers
-- At 00:30Z a Chicago number is at 19:30 and sends; +1 902 (Nova Scotia, 21:30 ADT), +1 709 (Newfoundland, 22:00 NDT), Ontario,
-- Jamaica and Bermuda are held, never claimed.
insert into public.site_waitlist (name, phone, consent, consent_text, consent_at, created_at)
select 'Held ' || ph, ph, true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.', '2026-11-01 00:00Z', '2026-11-01 00:00Z'
from unnest(array['+19025550101', '+17095550102', '+14165550103', '+18765550104', '+14415550105', '+15065550106', '+12125550107']) ph;
update public.career_invite_waves set status = 'closed' where status <> 'closed';
select public.career_wave_open(10, 'wave-npa', 'owner: test the held area codes', '2026-11-05 19:00Z');
select public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'wave-npa'), (select body from tpl), encode(sha256(convert_to((select body from tpl), 'UTF8')), 'hex'),
  (select count(*)::int from public.career_invites i join public.career_invite_waves w on w.id = i.wave_id where w.open_key = 'wave-npa'), '2026-11-05 19:01Z');
create temp table npa_claims (j jsonb);
do $$declare j jsonb; w bigint := (select id from public.career_invite_waves where open_key = 'wave-npa'); begin
  loop j := public.career_invite_claim_send(w, '2026-11-06 00:30Z'); exit when j ? 'done' or j ? 'stop'; insert into npa_claims values (j); end loop; end $$;
select t.ok((select string_agg(j->>'phone', ',') from npa_claims) = '+12125550107', 'at 00:30Z only the New York number is claimed: ' || coalesce((select string_agg(j->>'phone', ',') from npa_claims), 'none'));
select t.ok((select count(*) = 6 and bool_and(send_error like 'quiet hours unknown%') from public.career_invites i join public.career_invite_waves w on w.id = i.wave_id
  where w.open_key = 'wave-npa' and i.state = 'held'), 'Nova Scotia, Newfoundland, Ontario, Jamaica, Bermuda and New Brunswick are held for the owner, not sent');
rollback;
