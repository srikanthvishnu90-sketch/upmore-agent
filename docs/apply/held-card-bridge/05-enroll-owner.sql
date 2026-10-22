-- HELD. C10 (owner's spec, 2026-10-21): one named ordinary account may use cloud cards for at most 24 hours; the grant is
-- written by the operator, empty by default, revocable; enrollment is separately authorized. Run only on the owner's
-- written word for this step, after 04-verify.sql, with the one placeholder replaced (never commit the substituted file).
begin;
create temp table enroll_target on commit drop as
 select u.id as user_id from auth.users u where lower(btrim(u.email)) = lower(btrim('__OWNER_ACCOUNT_EMAIL__'));   -- target email
do $$
declare n integer; uid uuid;
begin
 if '__OWNER_ACCOUNT_EMAIL__' = '__OWNER' || '_ACCOUNT_EMAIL__' then raise exception 'placeholder not replaced: name the account email first'; end if;
 select count(*), (array_agg(user_id))[1] into n, uid from enroll_target;
 if n <> 1 then raise exception 'expected exactly one account with that email, found %', n; end if;
 if not exists (select 1 from public.profiles where id = uid) then raise exception 'that account has no profile row'; end if;
 if to_regclass('career_message_approval_private.cloud_card_enrollments') is null then raise exception 'the bridge is not applied'; end if;
 if exists (select 1 from career_message_approval_private.cloud_card_enrollments where revoked_at is null and expires_at > now()) then
  raise exception 'a live enrollment already exists: revoke it or stop'; end if;
end $$;
insert into career_message_approval_private.cloud_card_enrollments (user_id, purpose, expires_at, approval_ref)
 select user_id, 'first-real-card-cloud', now() + interval '24 hours',
  'owner''s word 2026-10-21 (C10: one named ordinary account, operator-written, 24h max, revocable)' from enroll_target
 returning user_id, purpose, created_at, expires_at;
do $$
declare uid uuid := (select user_id from enroll_target);
begin
 if not career_message_approval_private.cloud_eligible(uid, now()) then raise exception 'verify: the account is not eligible'; end if;
 if (select count(*) from career_message_approval_private.cloud_card_enrollments where revoked_at is null and expires_at > now()) <> 1 then
  raise exception 'verify: not exactly one live enrollment'; end if;
end $$;
commit;
-- Undo (immediate; the row stays for the record):
--   update career_message_approval_private.cloud_card_enrollments set revoked_at = now() where revoked_at is null;
