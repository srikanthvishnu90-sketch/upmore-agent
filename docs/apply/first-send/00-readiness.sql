-- READ-ONLY readiness check for the first real cloud application (item 5). Writes nothing: the whole check runs inside
-- a READ ONLY transaction, which Postgres itself refuses to let write. Replace the one placeholder with the account
-- email the owner named (never commit the substituted file). Run it before and after every owner step; it says which
-- conditions hold and, last, "READY FOR TAP: yes" only when the owner's tap on the card is the only thing left.
begin transaction read only;
do $$
declare
 target_email text := lower(btrim('__OWNER_ACCOUNT_EMAIL__'));   -- target email
 uid uuid; n int; a jsonb; epoch bigint; o record; missing text[] := '{}'; v text; i int; bridge boolean;
 ok boolean;
begin
 if target_email = lower('__OWNER' || '_ACCOUNT_EMAIL__') then raise exception 'placeholder not replaced: name the account email first'; end if;
 select count(*), (array_agg(u.id))[1] into n, uid from auth.users u where lower(btrim(u.email)) = target_email;
 raise notice 'ready: account named ............... %', case when n = 1 then 'yes' else format('NO (%s accounts)', n) end;
 if n <> 1 then missing := missing || 'account'::text; end if;
 ok := n = 1 and exists (select from public.profiles where id = uid);
 if n = 1 and not ok then missing := missing || 'profile'::text; end if;

 ok := exists (select from public.upmore_migration_ledger where filename = '20261021220430_career_apply_message_cards.sql');
 raise notice 'ready: card migration live ........ %', case when ok then 'yes' else 'NO' end;
 if not ok then missing := missing || 'card migration (02)'::text; end if;
 bridge := exists (select from public.upmore_migration_ledger where filename = '20261024130000_career_apply_card_cloud_bridge.sql')
  and to_regclass('career_message_approval_private.cloud_card_enrollments') is not null;
 raise notice 'ready: bridge migration live ...... %', case when bridge then 'yes' else 'NO' end;
 if not bridge then missing := missing || 'bridge migration (03)'::text; end if;

 select value into a from public.career_watch_kv where user_id = uid and key = 'career:account';
 epoch := coalesce((a->>'epoch')::bigint, 0);
 ok := a is not null and coalesce(a->>'paused', 'false') = 'false';
 raise notice 'ready: career account (not paused)  %', case when a is null then 'NO (no career:account row: one career chat turn writes it)' when ok then 'yes' else 'NO (paused)' end;
 if not ok then missing := missing || 'career account'::text; end if;

 ok := exists (select from public.career_apply_cloud_resumes where user_id = uid and privacy_epoch = epoch);
 raise notice 'ready: resume stored for the cloud  %', case when ok then 'yes' else 'NO (the person uploads it)' end;
 if not ok then missing := missing || 'cloud resume'::text; end if;

 select enabled, daily, privacy_epoch into o from public.career_apply_cloud_optin where user_id = uid;
 ok := coalesce(o.enabled, false) and coalesce(o.daily, 15) <= 15 and o.privacy_epoch = epoch;
 raise notice 'ready: opted in, at most 15 a day . %', case when o is null or o.enabled is null then 'NO (the person opts in in chat)'
  when ok then format('yes (daily %s)', coalesce(o.daily, 15)) else format('NO (enabled %s, daily %s, epoch %s/%s)', o.enabled, o.daily, o.privacy_epoch, epoch) end;
 if not ok then missing := missing || 'opt-in'::text; end if;

 i := coalesce(public.career_apply_cloud_waiver_left(uid, 'lever', now()), 0);
 raise notice 'ready: Lever waiver sends left .... %', case when i > 0 then i::text else 'NO (0)' end;
 if i <= 0 then missing := missing || 'waiver'::text; end if;

 if bridge then
  execute 'select career_message_approval_private.cloud_eligible($1, now())' into ok using uid;
  execute 'select max(expires_at)::text from career_message_approval_private.cloud_card_enrollments where user_id = $1 and revoked_at is null and expires_at > now()' into v using uid;
  raise notice 'ready: enrolled for the card ...... %', case when ok then format('yes (until %s)', v) else 'NO' end;
  if not ok then missing := missing || 'enrollment'::text; end if;
  execute 'select count(*) from career_message_approval_private.cloud_card_enrollments where user_id <> $1 and revoked_at is null and expires_at > now()' into i using uid;
  raise notice 'ready: no one else enrolled ....... %', case when i = 0 then 'yes' else format('NO (%s)', i) end;
  if i <> 0 then missing := missing || 'another enrollment'::text; end if;
 else
  raise notice 'ready: enrolled for the card ...... NO (bridge not live)';
  missing := missing || 'enrollment'::text;
 end if;

 select count(*) into i from public.career_apply_cloud_optin where enabled and user_id <> uid;
 raise notice 'ready: no one else opted in ....... %', case when i = 0 then 'yes' else format('NO (%s)', i) end;
 if i <> 0 then missing := missing || 'another opt-in'::text; end if;
 select count(*) into i from public.career_apply_batch_approvals where revoked_at is null and used_at is null;
 raise notice 'ready: no unused batch approvals .. %', case when i = 0 then 'yes' else format('NO (%s: CAREER_AGENT_SUBMIT would arm them)', i) end;
 if i <> 0 then missing := missing || 'unused batch approvals'::text; end if;
 select count(*) into i from public.career_apply_jobs where state in ('queued', 'driving');
 raise notice 'ready: nothing queued or driving .. %', case when i = 0 then 'yes' else format('NO (%s)', i) end;
 if i <> 0 then missing := missing || 'jobs in flight'::text; end if;

 ok := public.career_apply_cloud_enabled() and public.career_apply_agent_submit_enabled();
 raise notice 'ready: both switches on .......... %', case when ok then 'yes'
  else format('NO (CAREER_CLOUD_APPLY %s, CAREER_AGENT_SUBMIT %s)', public.career_apply_cloud_enabled(), public.career_apply_agent_submit_enabled()) end;
 if not ok then missing := missing || 'switches'::text; end if;

 raise notice 'READY FOR TAP: %', case when cardinality(missing) = 0 then 'yes' else 'no (missing: ' || array_to_string(missing, ', ') || ')' end;
end $$;
rollback;
