-- Sign-up in waves on the web (20261026230000_trainee_web_admission.sql, launch readiness B7/X1), on the one wave and
-- invite system (20261026233017_career_invite_waves.sql): accounts from before the gate are admitted once; the env's
-- allow-list admits; an account is admitted by waitlist only through an invite (its own redeemed invite, or its confirmed
-- phone matching an invite that was sent, which is then taken once); nobody else; the person reads only their own
-- admission and calls nothing; 20261026230000's own waves (trainee_invite_wave, the claim columns) are gone.
begin;
reset role;
-- A fresh account created after the migration ran: not admitted by the backfill (it ran when the file was applied).
insert into auth.users (id, email, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-00000000a001', null, '13125550142', now()),         -- invited by phone, confirmed
  ('00000000-0000-0000-0000-00000000a002', null, '13125550143', null),          -- the second row's phone, never confirmed
  ('00000000-0000-0000-0000-00000000a003', 'late@example.com', null, null),      -- no waitlist row
  ('00000000-0000-0000-0000-00000000a004', null, '13125550142', now()),         -- the same phone as a001, a second account
  ('00000000-0000-0000-0000-00000000a005', 'list@example.com', null, null);      -- the edge's allow-list says yes
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000a005';
select t.ok((select count(*) = 0 from public.trainee_admissions where user_id::text like '00000000-0000-0000-0000-00000000a00%'), 'accounts created after the migration are not admitted by it');
select t.ok(obj_description('public.trainee_admissions'::regclass, 'pg_class') = 'trainee admissions: existing accounts admitted', 'the backfill is marked as done');
select t.ok(to_regprocedure('public.trainee_invite_wave(integer)') is null and to_regprocedure('public.trainee_waitlist_invited(text)') is null
  and not exists (select from information_schema.columns where table_schema = 'public' and table_name = 'site_waitlist' and column_name in ('invited_at', 'invite_wave', 'claimed_by', 'claimed_at')),
  'one wave and invite system: the first gate''s own waves and claim columns are gone');

-- This test owns the waitlist inside its transaction (rolled back at the end).
delete from public.career_invites; delete from public.career_invite_waves; delete from public.site_waitlist;
insert into public.site_waitlist (id, name, phone, consent, consent_text, created_at) values
  ('00000000-0000-0000-0000-00000000b001', 'First', '+13125550142', true, 'I agree to texts from Trainee. Reply STOP to opt out.', now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000b002', 'Second', '+13125550143', true, 'I agree to texts from Trainee. Reply STOP to opt out.', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000b003', 'No consent', '+13125550144', false, null, now() - interval '4 days'),
  ('00000000-0000-0000-0000-00000000b004', 'Later', '+13125550145', true, 'I agree to texts from Trainee. Reply STOP to opt out.', now() - interval '1 day');
create temp table at_ as select date_trunc('day', now()) + interval '18 hours' as t; -- inside the send window, today
grant select on at_ to authenticated, anon;

-- Nobody is invited yet: the phone match alone admits nobody.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a001', false) is null, 'on the waitlist but not invited: not admitted');

-- Wave 1 (the one system): the two oldest consenting rows become invites; opening sends nothing, so still nobody.
select t.ok((public.career_wave_open(2, 'adm-wave-1', null, (select t from at_))->>'picked')::int = 2, 'wave 1: two invites');
select t.ok((select array_agg(phone order by signed_up_at) = array['+13125550142', '+13125550143'] from public.career_invites), 'the two oldest with consent, in order');
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a001', false) is null, 'an invite not yet sent admits nobody');
select public.career_wave_approve_send((select id from public.career_invite_waves where open_key = 'adm-wave-1'), 'Trainee: your spot is open: {link} Reply STOP to opt out.',
  encode(sha256(convert_to('Trainee: your spot is open: {link} Reply STOP to opt out.', 'UTF8')), 'hex'), 2, (select t from at_));
do $$declare j jsonb; begin loop j := public.career_invite_claim_send((select id from public.career_invite_waves where open_key = 'adm-wave-1'), (select t from at_));
  exit when j ? 'done' or j ? 'stop'; perform public.career_invite_mark_sent((j->>'invite_id')::uuid, true, 'lm', null, (select t from at_)); end loop; end $$;
select t.ok((select count(*) = 2 from public.career_invites where state = 'sent'), 'both sent');

-- The confirmed phone takes its sent invite on the web; the admission says how.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a001', false) = 'waitlist', 'a sent invite and a confirmed phone: admitted via the waitlist');
select t.ok((select state || ',' || redeemed_user || ',' || redeemed_via from public.career_invites where phone = '+13125550142') = 'redeemed,00000000-0000-0000-0000-00000000a001,web', 'the invite is taken by that account, once');
select t.ok((select step from public.career_signup_gate where user_id = '00000000-0000-0000-0000-00000000a001') = 'age', 'and the sign-up steps begin (18+ first)');
select t.ok((select waitlist_id = '00000000-0000-0000-0000-00000000b001' from public.trainee_admissions where user_id = '00000000-0000-0000-0000-00000000a001'), 'the admission names the waitlist row');
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a001', false) = 'waitlist', 'asking again answers the same, and takes nothing more');
-- A second account with the same phone finds the invite taken.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a004', false) is null, 'a taken invite admits nobody else');
-- An unconfirmed phone takes nothing, even when its invite was sent.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a002', false) is null, 'an unconfirmed phone is not admitted');
select t.ok((select state from public.career_invites where phone = '+13125550143') = 'sent', 'and the invite stays open for the real owner');
-- The invite link's token, redeemed as the person (the gate's other way in), admits them.
update public.career_invites set token_hash = encode(sha256(convert_to('Tk-adm-second-xxxxxxxxxxxxxxxxxx', 'UTF8')), 'hex') where phone = '+13125550143';
select t.as_user('00000000-0000-0000-0000-00000000a003'); set role authenticated;
select t.ok((public.career_invite_redeem_own('Tk-adm-second-xxxxxxxxxxxxxxxxxx')->>'step') = 'age', 'the token from the link, as the signed-in person');
reset role;
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a003', false) = 'waitlist', 'an account holding a redeemed invite is admitted via the waitlist');
-- An expired invite admits nobody, by phone or otherwise.
insert into auth.users (id, phone, phone_confirmed_at) values ('00000000-0000-0000-0000-00000000a006', '13125550145', now());
select public.career_wave_open(1, 'adm-wave-2', 'test', (select t from at_));
update public.career_invites set state = 'sent', token = null, sent_at = now() - interval '20 days', expires_at = now() - interval '6 days' where phone = '+13125550145';
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a006', false) is null, 'an expired invite admits nobody');
-- The allow-list (the edge's own check) admits; no invite is touched.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a005', true) = 'allowlist', 'listed by the env: admitted via the allow-list');
select t.ok((select waitlist_id is null from public.trainee_admissions where user_id = '00000000-0000-0000-0000-00000000a005'), 'an allow-list admission takes no invite');
select t.must_fail($$select public.trainee_admit('00000000-0000-0000-0000-0000000000ff', true)$$, 'invalid admission', 'an account that does not exist is refused');
select t.must_fail($$select public.trainee_admit(null, true)$$, 'invalid admission', 'no account is refused');

-- The person: reads only their own admission; cannot admit themselves, open a wave, or read the waitlist.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
select t.ok((select count(*) = 1 from public.trainee_admissions), 'a person sees one admission: their own');
select t.must_fail($$select public.trainee_admit('00000000-0000-0000-0000-00000000a003', true)$$, 'permission denied', 'a person cannot admit anyone');
select t.must_fail($$select public.career_wave_open(5, 'mine', null, now())$$, 'permission denied', 'a person cannot open a wave');
select t.ok((select count(*) = 0 from public.site_waitlist), 'a person reads no waitlist rows (row-level security, no policy)');
select t.must_fail($$insert into public.trainee_admissions (user_id, via) values ('00000000-0000-0000-0000-00000000a003', 'allowlist')$$, 'permission denied', 'a person cannot write an admission');
reset role;
set local role anon;
select t.must_fail($$select public.trainee_admit('00000000-0000-0000-0000-00000000a003', true)$$, 'permission denied', 'anon cannot admit');
reset role;
rollback;
