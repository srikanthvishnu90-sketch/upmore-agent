-- HELD. Turns on CAREER_CLOUD_APPLY and CAREER_AGENT_SUBMIT, which the card -> cloud bridge requires together (N1:
-- 20261024130000 refuses every cloud claim unless both are 'on'). The owner's standing rule keeps CAREER_AGENT_SUBMIT
-- OFF: this file runs only on his written answer to N1, after every other step, as the last operator step before his tap.
-- One transaction; any failed check raises and nothing is written. Replace the one placeholder (never commit that copy).
-- It refuses unless the named account is the only one that could be sent for: card and bridge live, that account
-- enrolled (and no one else), its Lever waiver has sends left, its career account is not paused, its resume is stored for
-- the cloud, it opted in at 15 a day or fewer (and no one else did), no unused batch approval exists for anyone
-- (CAREER_AGENT_SUBMIT also arms the extension's agent sends), and nothing is queued or driving.
-- Off at any time: 98-switches-off.sql.
begin;
create temp table switch_target on commit drop as
 select u.id as user_id from auth.users u where lower(btrim(u.email)) = lower(btrim('__OWNER_ACCOUNT_EMAIL__'));   -- target email
do $$
declare n int; uid uuid; a jsonb; epoch bigint; o record; i int; ok boolean;
begin
 if '__OWNER_ACCOUNT_EMAIL__' = '__OWNER' || '_ACCOUNT_EMAIL__' then raise exception 'placeholder not replaced: name the account email first'; end if;
 select count(*), (array_agg(user_id))[1] into n, uid from switch_target;
 if n <> 1 then raise exception 'expected exactly one account with that email, found %', n; end if;
 if not exists (select from public.upmore_migration_ledger where filename = '20261021220430_career_apply_message_cards.sql')
  or not exists (select from public.upmore_migration_ledger where filename = '20261024130000_career_apply_card_cloud_bridge.sql')
  or to_regclass('career_message_approval_private.cloud_card_enrollments') is null then raise exception 'the card or the bridge is not live'; end if;
 execute 'select career_message_approval_private.cloud_eligible($1, now())' into ok using uid;
 if not ok then raise exception 'that account is not enrolled (run 05 first, within 24 hours)'; end if;
 execute 'select count(*) from career_message_approval_private.cloud_card_enrollments where user_id <> $1 and revoked_at is null and expires_at > now()' into i using uid;
 if i <> 0 then raise exception 'another account is enrolled'; end if;
 if coalesce(public.career_apply_cloud_waiver_left(uid, 'lever', now()), 0) <= 0 then raise exception 'no Lever waiver sends left for that account'; end if;
 select value into a from public.career_watch_kv where user_id = uid and key = 'career:account';
 if a is null or coalesce(a->>'paused', 'false') <> 'false' then raise exception 'no career account, or it is paused'; end if;
 epoch := coalesce((a->>'epoch')::bigint, 0);
 if not exists (select from public.career_apply_cloud_resumes where user_id = uid and privacy_epoch = epoch) then raise exception 'no resume stored for the cloud'; end if;
 select enabled, daily, privacy_epoch into o from public.career_apply_cloud_optin where user_id = uid;
 if not coalesce(o.enabled, false) or coalesce(o.daily, 15) > 15 or o.privacy_epoch is distinct from epoch then raise exception 'that account has not opted in at 15 a day or fewer'; end if;
 if exists (select from public.career_apply_cloud_optin where enabled and user_id <> uid) then raise exception 'another account is opted in'; end if;
 if exists (select from public.career_apply_batch_approvals where revoked_at is null and used_at is null) then
  raise exception 'an unused batch approval exists: CAREER_AGENT_SUBMIT would arm it'; end if;
 if exists (select from public.career_apply_jobs where state in ('queued', 'driving')) then raise exception 'jobs are queued or driving'; end if;
end $$;
insert into public.career_cloud_settings (key, value, updated_at) values ('CAREER_CLOUD_APPLY', 'on', now()), ('CAREER_AGENT_SUBMIT', 'on', now())
 on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
 returning key, value, updated_at;
do $$
begin
 if not public.career_apply_cloud_enabled() or not public.career_apply_agent_submit_enabled() then raise exception 'verify: a switch does not read on'; end if;
 if (select count(*) from public.career_cloud_settings) <> 2 then raise exception 'verify: settings other than the two switches exist'; end if;
end $$;
commit;
