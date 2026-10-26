-- Owner setup for the live verification suite (scripts/live/verify.ts, .github/workflows/live-verify.yml).
-- The suite acts only as this account, and refuses to start unless all three hold (lib.ts assertTestAccount):
--   1. the email is on the reserved test domain @upmore.test (RFC 2606-style: no inbox, no real person);
--   2. auth.users.raw_app_meta_data has "trainee_test_account": true (app metadata: only the service role can set it,
--      a person cannot set it on themselves);
--   3. the email is the one the run is told to expect (TRAINEE_VERIFY_EMAIL, default trainee-live-verify@upmore.test).
--
-- Step 1 (dashboard, not SQL): Supabase > Authentication > Users > Add user > Create new user:
--   email trainee-live-verify@upmore.test, a long random password (it becomes the TRAINEE_VERIFY_PASSWORD secret),
--   "Auto Confirm User" on. Nothing is ever sent to this address.
-- Step 2: run this file in Supabase > SQL Editor. It is idempotent: a second run changes nothing.
begin;
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"trainee_test_account": true}'::jsonb
 where email = 'trainee-live-verify@upmore.test';
insert into public.profiles (id) select id from auth.users where email = 'trainee-live-verify@upmore.test' on conflict (id) do nothing;
-- Never a phone or iMessage contact for the test account: nothing it is sent can reach a real number. (Telegram only
-- through a test chat the owner links on purpose, step 4.)
delete from public.channel_contacts where user_id = (select id from auth.users where email = 'trainee-live-verify@upmore.test') and channel is distinct from 'telegram';
commit;

-- Check (must print one row: the id, the test email, true, 0 contacts):
select u.id, u.email, u.raw_app_meta_data->>'trainee_test_account' as flagged,
       (select count(*) from public.channel_contacts c where c.user_id = u.id) as contacts
  from auth.users u where u.email = 'trainee-live-verify@upmore.test';

-- Excluding the test account from metrics and caps. Every test account is on @upmore.test and flagged; a metric or a
-- daily count that should be about real people filters with this predicate:
--   not exists (select 1 from auth.users t where t.id = <table>.user_id
--               and (t.email like '%@upmore.test' or (t.raw_app_meta_data->>'trainee_test_account') = 'true'))
-- Real sends: the test account has no phone, iMessage or WhatsApp contact (above), its outreach contacts are
-- @example.test addresses, and the suite never answers a card, so no application job is ever created for it
-- (SAFETY.never_approved checks this every run). The per-person caps (alerts a day, applications a day) are its own.
--
-- Step 3: GitHub > Settings > Environments > production > Environment secrets: add TRAINEE_VERIFY_EMAIL
--   (trainee-live-verify@upmore.test), TRAINEE_VERIFY_PASSWORD (step 1's password), SUPABASE_ANON_KEY (Project Settings >
--   API > anon public key; public, but kept with the others), TRAINEE_APP_URL (the web app's production URL). Then
--   Deployment branches and tags: add `ci/live-verify` and `trunk` beside `release/production`.
-- Step 4 (optional, Telegram): with a SECOND Telegram account (not the one on your own Trainee account: one chat
--   belongs to one account), sign in to the web app as the test account, say "connect telegram", open the link in
--   that Telegram, press Start. Then add its chat id as TRAINEE_VERIFY_TELEGRAM_CHAT_ID and TELEGRAM_WEBHOOK_SECRET
--   (the value already live) as environment secrets. Check the link:
--   select contact, user_id, opted_out from public.channel_contacts where contact = 'tg:<chat id>';
