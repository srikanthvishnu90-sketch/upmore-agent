-- HELD. Do not run until the owner names, in writing, the email of the account the waiver is for.
-- One D-010 gate waiver (20261024120000, live since 2026-10-21): that one account, the Lever family, 5 cloud sends,
-- 7 days. Scope: the owner's word 2026-10-21 ("Lever portal, 5 sends, 7 days").
--
-- How to run (operator, once, on the owner's written word):
--   1. Replace the one placeholder __OWNER_ACCOUNT_EMAIL__ below (line "target email") with the email as written.
--      Never commit the substituted file.
--   2. Run the whole file as one script against project mrwngntwmnaqrqhupvlt. It is one transaction: any check that
--      fails raises and nothing is written.
--   3. Record the RETURNING row (waiver id, created_at, expires_at) in the apply record.
--
-- What a waiver does and does not do (20261024120000):
--   - It lets the cloud claim this account's approved Lever jobs while the Lever gate is closed, up to 5 claims made
--     after the waiver row's created_at, until expires_at. A claim counts when the worker takes the job (attempts > 0),
--     whatever the outcome: a drive that ends needs_user, failed or unknown_outcome uses one of the 5.
--   - Nothing else moves. CAREER_CLOUD_APPLY must still be 'on' (the owner's switch, OFF today and left OFF here); every
--     job still needs the account's own approval of the exact payload, its opt-in, the pauses, its daily limit and the
--     30-day company rule (career_apply_cloud_refusal).
--   - This script writes no flag, no opt-in, no setting: one row in career_apply_cloud_gate_waivers.
--
-- Undo (revocation keeps the row for the record; the waiver stops at once):
--   update public.career_apply_cloud_gate_waivers set revoked_at = now() where id = '<waiver id from step 3>' and revoked_at is null;
--   select public.career_apply_cloud_waiver_left('<user id>', 'lever', now());   -- expect 0

begin;

create temp table waiver_target on commit drop as
 select u.id as user_id
 from auth.users u
 where lower(btrim(u.email)) = lower(btrim('__OWNER_ACCOUNT_EMAIL__'));   -- target email

do $$
declare n integer; uid uuid;
begin
 if '__OWNER_ACCOUNT_EMAIL__' = '__OWNER' || '_ACCOUNT_EMAIL__' then raise exception 'placeholder not replaced: name the account email first'; end if;
 select count(*), (array_agg(user_id))[1] into n, uid from waiver_target;
 if n <> 1 then raise exception 'expected exactly one account with that email, found %', n; end if;
 if not exists (select 1 from public.profiles where id = uid) then raise exception 'that account has no profile row'; end if;
 -- The switches are the owner's: this script runs only while both are off, and leaves them so.
 if exists (select 1 from public.career_cloud_settings where key in ('CAREER_CLOUD_APPLY', 'CAREER_AGENT_SUBMIT') and value = 'on') then
  raise exception 'a switch is on (CAREER_CLOUD_APPLY or CAREER_AGENT_SUBMIT): stop and ask the owner'; end if;
 -- One waiver at a time for this account and family: a second live one would add its own sends.
 if exists (select 1 from public.career_apply_cloud_gate_waivers
   where user_id = uid and portal = 'lever' and revoked_at is null and expires_at > now()) then
  raise exception 'a live Lever waiver already exists for this account: revoke it or stop'; end if;
end $$;

insert into public.career_apply_cloud_gate_waivers (user_id, portal, max_sends, expires_at, note)
 select user_id, 'lever', 5, now() + interval '7 days',
  'first approved test batch: Lever, 5 cloud sends, 7 days; owner''s word 2026-10-21, account named in writing by the owner'
 from waiver_target
 returning id, user_id, portal, max_sends, created_at, expires_at;

-- Verify-after, inside the same transaction: any surprise raises and the row is not kept.
do $$
declare uid uuid := (select user_id from waiver_target); w public.career_apply_cloud_gate_waivers;
begin
 select * into w from public.career_apply_cloud_gate_waivers where user_id = uid and portal = 'lever' and revoked_at is null and expires_at > now();
 if w.max_sends is distinct from 5 or w.expires_at is distinct from w.created_at + interval '7 days' then raise exception 'verify: waiver row not as written'; end if;
 if public.career_apply_cloud_waiver_left(uid, 'lever', now()) is distinct from 5 then raise exception 'verify: sends left is not 5'; end if;
 if public.career_apply_cloud_waiver_left(uid, 'greenhouse', now()) <> 0 or public.career_apply_cloud_waiver_left(uid, 'ashby', now()) <> 0 then
  raise exception 'verify: another family was waived'; end if;
 if (select count(*) from public.career_apply_cloud_gate_waivers where revoked_at is null and expires_at > now()) <> 1 then
  raise exception 'verify: more than this one live waiver exists'; end if;
 if public.career_apply_cloud_enabled() then raise exception 'verify: CAREER_CLOUD_APPLY reads on'; end if;
 if public.career_apply_agent_submit_enabled() then raise exception 'verify: CAREER_AGENT_SUBMIT reads on'; end if;
end $$;

commit;

-- After commit, read back for the apply record (no writes):
--   select id, user_id, portal, max_sends, created_at, expires_at, revoked_at from public.career_apply_cloud_gate_waivers;
--   select key, value from public.career_cloud_settings where key in ('CAREER_CLOUD_APPLY', 'CAREER_AGENT_SUBMIT');
--   select public.career_apply_cloud_open('lever');   -- still false: the gate itself is unchanged; the waiver is per account
