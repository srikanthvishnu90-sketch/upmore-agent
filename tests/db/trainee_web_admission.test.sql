-- Sign-up in waves (20261026230000_trainee_web_admission.sql, launch readiness B7/X1): accounts from before the gate are
-- admitted once; a wave invites the oldest consenting rows; an invited phone or email claims its spot once, and only when
-- confirmed; the env's allow-list admits; nobody else; the person can read only their own admission and call nothing.
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
-- Applying the file again (as run.sh does) must not admit them either.
select t.ok(obj_description('public.trainee_admissions'::regclass, 'pg_class') = 'trainee admissions: existing accounts admitted', 'the backfill is marked as done');

-- This test owns the waitlist inside its transaction (rolled back at the end).
delete from public.site_waitlist;
insert into public.site_waitlist (id, name, phone, consent, created_at) values
  ('00000000-0000-0000-0000-00000000b001', 'First', '+13125550142', true, now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000b002', 'Second', '+13125550143', true, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000b003', 'No consent', '+13125550144', false, now() - interval '4 days'),
  ('00000000-0000-0000-0000-00000000b004', 'Later', '+13125550145', true, now() - interval '1 day');

-- Nobody is invited yet: the phone match alone admits nobody.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a001', false) is null, 'on the waitlist but not invited: not admitted');
select t.ok(public.trainee_waitlist_invited('+1 (312) 555-0142') = false, 'the channels see no invited spot either');

-- Wave 1: the two oldest consenting rows; the row without consent is never invited.
select t.ok((select (w.wave, w.invited) = (1, 2) from public.trainee_invite_wave(2) w), 'wave 1 invites two rows');
select t.ok((select array_agg(name order by created_at) = array['First', 'Second'] from public.site_waitlist where invite_wave = 1), 'the two oldest with consent, in order');
select t.ok((select invited_at is null from public.site_waitlist where name = 'No consent'), 'a row without consent is never invited');
select t.must_fail($$select * from public.trainee_invite_wave(0)$$, 'invite between 1 and 100000', 'a wave of zero is refused');

select t.ok(public.trainee_waitlist_invited('+1 (312) 555-0142') = true, 'the channels see the invited phone, however it is written');
select t.ok(public.trainee_waitlist_invited('12345') = false, 'too few digits is no phone');
-- The confirmed phone claims its spot; the admission says how.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a001', false) = 'waitlist', 'an invited, confirmed phone is admitted via the waitlist');
select t.ok((select claimed_by = '00000000-0000-0000-0000-00000000a001' and claimed_at is not null from public.site_waitlist where name = 'First'), 'the spot is claimed by that account');
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a001', false) = 'waitlist', 'asking again answers the same, and claims nothing more');
select t.ok((select count(*) = 1 from public.site_waitlist where claimed_by = '00000000-0000-0000-0000-00000000a001'), 'one spot per account');
-- A second account with the same phone finds the spot taken.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a004', false) is null, 'a claimed spot admits nobody else');
select t.ok(public.trainee_waitlist_invited('+13125550142') = false, 'a claimed spot is no longer offered to the channels');
-- An unconfirmed phone claims nothing, even when its spot is invited.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a002', false) is null, 'an unconfirmed phone is not admitted');
select t.ok((select claimed_by is null from public.site_waitlist where name = 'Second'), 'and the spot stays open for the real owner');
-- No waitlist row, no allow-list: not admitted. The allow-list (the edge's own check) admits.
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a003', false) is null, 'no row, not listed: not admitted');
select t.ok(public.trainee_admit('00000000-0000-0000-0000-00000000a005', true) = 'allowlist', 'listed by the env: admitted via the allow-list');
select t.ok((select waitlist_id is null from public.trainee_admissions where user_id = '00000000-0000-0000-0000-00000000a005'), 'an allow-list admission claims no waitlist row');
select t.must_fail($$select public.trainee_admit('00000000-0000-0000-0000-0000000000ff', true)$$, 'invalid admission', 'an account that does not exist is refused');
select t.must_fail($$select public.trainee_admit(null, true)$$, 'invalid admission', 'no account is refused');
-- Wave 2 continues after wave 1.
select t.ok((select (w.wave, w.invited) = (2, 1) from public.trainee_invite_wave(10) w), 'wave 2 invites what is left with consent');

-- The person: reads only their own admission; cannot admit themselves, invite, or read the waitlist.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
select t.ok((select count(*) = 1 from public.trainee_admissions), 'a person sees one admission: their own');
select t.must_fail($$select public.trainee_admit('00000000-0000-0000-0000-00000000a003', true)$$, 'permission denied', 'a person cannot admit anyone');
select t.must_fail($$select * from public.trainee_invite_wave(5)$$, 'permission denied', 'a person cannot invite a wave');
select t.must_fail($$select public.trainee_waitlist_invited('+13125550145')$$, 'permission denied', 'a person cannot probe the waitlist');
select t.ok((select count(*) = 0 from public.site_waitlist), 'a person reads no waitlist rows (row-level security, no policy)');
select t.must_fail($$insert into public.trainee_admissions (user_id, via) values ('00000000-0000-0000-0000-00000000a003', 'allowlist')$$, 'permission denied', 'a person cannot write an admission');
reset role;
set local role anon;
select t.must_fail($$select public.trainee_admit('00000000-0000-0000-0000-00000000a003', true)$$, 'permission denied', 'anon cannot admit');
reset role;
rollback;
