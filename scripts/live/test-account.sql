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

-- Step 2b: the SELECT-only database role the suite connects as. Its URI is the LIVE_VERIFY_DB_URL secret (Supabase >
-- Connect > Session pooler, with the user `trainee_live_verify_ro.<project ref>` and this role's password). The owner's
-- own SUPABASE_DB_URL is never given to the suite. Replace <A LONG RANDOM PASSWORD> before running; keep it only in the
-- secret. BYPASSRLS lets it read every person's rows for the checks; it holds no write privilege anywhere, and
-- default_transaction_read_only makes every transaction it starts read-only. The suite refuses to start on a role that
-- is a superuser, can write any table in public, auth, cron, storage or vault, can read vault.decrypted_secrets, or
-- does not have default_transaction_read_only on (lib.ts assertReadOnlyRole).
do $$ begin
  if not exists (select from pg_roles where rolname = 'trainee_live_verify_ro') then
    create role trainee_live_verify_ro login bypassrls password '<A LONG RANDOM PASSWORD>';
  end if;
end $$;
alter role trainee_live_verify_ro set default_transaction_read_only = on;
grant usage on schema public, auth, cron, storage to trainee_live_verify_ro;
grant select on all tables in schema public to trainee_live_verify_ro;
alter default privileges in schema public grant select on tables to trainee_live_verify_ro;
grant select (id, email, raw_app_meta_data) on auth.users to trainee_live_verify_ro;
grant select on cron.job, cron.job_run_details to trainee_live_verify_ro;
grant select on storage.objects to trainee_live_verify_ro;
grant execute on function public.career_ingest_coverage(interval), public.career_apply_canonical(jsonb) to trainee_live_verify_ro;
-- Check (must print: false, 0, false): not a superuser, no table it can write, no Vault read.
select r.rolsuper,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname in ('public', 'auth', 'cron', 'storage', 'vault') and c.relkind in ('r', 'p')
           and (has_table_privilege('trainee_live_verify_ro', c.oid, 'INSERT') or has_table_privilege('trainee_live_verify_ro', c.oid, 'UPDATE')
             or has_table_privilege('trainee_live_verify_ro', c.oid, 'DELETE') or has_table_privilege('trainee_live_verify_ro', c.oid, 'TRUNCATE'))) as writable,
       has_table_privilege('trainee_live_verify_ro', 'vault.decrypted_secrets', 'SELECT') as vault
  from pg_roles r where r.rolname = 'trainee_live_verify_ro';
-- If the cron or storage grants are refused (those schemas belong to Supabase's own admin role), the F6 schedule check
-- and the erase's storage count FAIL with "permission denied": the suite says so, it never passes them.

-- Step 2c: the test account must hold no apply authority, or the suite refuses to start (checks.ts
-- assertNoApplyAuthority): no cloud opt-in, batch approval or intent, cloud gate waiver, place in career_cloud_settings,
-- extension submission record, application job, queued application or answered card. A fresh account has none; this
-- clears any an earlier run or a hand test left:
begin;
delete from public.career_apply_cloud_optin where user_id = (select id from auth.users where email = 'trainee-live-verify@upmore.test');
delete from public.career_apply_wanted where user_id = (select id from auth.users where email = 'trainee-live-verify@upmore.test');
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
--   Deployment branches and tags: add `trunk` beside `release/production` (the workflow runs only from trunk, by hand).
--   Also LIVE_VERIFY_DB_URL (step 2b).
-- Step 4 (optional, Telegram): with a SECOND Telegram account (not the one on your own Trainee account: one chat
--   belongs to one account), sign in to the web app as the test account, say "connect telegram", open the link in
--   that Telegram, press Start. Then add its chat id as TRAINEE_VERIFY_TELEGRAM_CHAT_ID and TELEGRAM_WEBHOOK_SECRET
--   (the value already live) as environment secrets. Check the link:
--   select contact, user_id, opted_out from public.channel_contacts where contact = 'tg:<chat id>';
