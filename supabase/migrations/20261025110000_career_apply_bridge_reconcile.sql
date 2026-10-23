-- Migration sequencing (backend gap map G3, 2026-10-23): the staged draft card-cloud bridge (20261024130000, NOT
-- APPLIED, kept unchanged as evidence) and the one-ledger file (20261025100000) both replace
-- career_apply_claim_own(integer, text) and career_apply_cloud_refusal. Whichever is applied last wins the two whole:
--   filename order (bridge, then ledger; what apply-rails-and-seed.sh --pending does with both pending): the bridge's
--     maintenance lock, its cloud-bound exclusion, its switch check and its 15-a-day cloud cap are lost from them;
--   the bridge after the ledger (the bridge held and approved later; what tests/db/run.sh does today): the claim's and
--     the cloud's approval re-check and the cloud's one-ledger cooldown are lost;
--   the bridge's rollback (supabase/rollbacks/20261024130000) after the ledger: the same G3 checks are lost.
-- This file closes all three (docs/architect/MIGRATION-SEQUENCING-BRIDGE-LEDGER.md):
--   career_apply_reconcile_bridge(): installs the two as they must be for what is installed: the bridge's with G3's
--     checks when the bridge's tables exist, 20261025100000's otherwise. It runs once here; the launch script runs it
--     again after the bridge or its rollback, and stops unless career_apply_guards_missing() then reads empty.
--   career_apply_guards_missing(): every G3 guarantee, and while the bridge is installed every bridge guarantee, that
--     the live definitions lack; empty when whole.
-- NOT APPLIED. The owner applies migrations; production is frozen.

-- What the live definitions lack: one line per missing guarantee; empty when every one is in place.
create or replace function public.career_apply_guards_missing() returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare out text[] := '{}'; d text; bridge boolean := to_regclass('career_message_approval_private.cloud_bound_jobs') is not null;
begin
 d := pg_get_functiondef('public.career_apply_claim_own(integer,text)'::regprocedure);
 if d !~ 'career_apply_void_unsendable' or d !~ 'career_apply_payload_hash\(payload\)' then out := array_append(out, 'career_apply_claim_own: no approval re-check'); end if;
 if bridge and (d !~ 'career-card-cloud-bridge-maintenance-v1' or d !~ 'cloud_bound_jobs') then
  out := array_append(out, 'career_apply_claim_own: takes cloud-bound jobs'); end if;
 d := pg_get_functiondef('public.career_apply_claim(timestamptz,integer)'::regprocedure);
 if d !~ 'career_apply_void_unsendable' or d !~ 'career_apply_payload_hash' then out := array_append(out, 'career_apply_claim: no approval re-check'); end if;
 d := pg_get_functiondef('public.career_apply_cloud_refusal(public.career_apply_jobs,timestamptz)'::regprocedure);
 if d !~ 'career_apply_payload_hash\(j\.payload\)' then out := array_append(out, 'career_apply_cloud_refusal: no approval re-check'); end if;
 if d !~ 'career_apply_ledger\(' then out := array_append(out, 'career_apply_cloud_refusal: not on the one ledger'); end if;
 if bridge and (d !~ 'cloud_bound_refusal' or d !~ 'cloud_switches_off' or d !~ 'least\(15, coalesce\(o\.daily, 15\)') then
  out := array_append(out, 'career_apply_cloud_refusal: no card binding, switches or cloud cap'); end if;
 d := pg_get_functiondef('public.career_apply_enqueue(jsonb,text,text,integer)'::regprocedure);
 if d !~ 'career_apply_ledger_refusal' then out := array_append(out, 'career_apply_enqueue: not on the one ledger and cap'); end if;
 d := pg_get_functiondef('public.career_apply_email_reserve_for(uuid,jsonb,text,timestamptz)'::regprocedure);
 if d !~ 'career_apply_ledger_refusal' then out := array_append(out, 'career_apply_email_reserve_for: not on the one ledger and cap'); end if;
 d := pg_get_functiondef('public.career_apply_jobs_fixed()'::regprocedure);
 if d !~ 'approval_fixed' then out := array_append(out, 'career_apply_jobs_fixed: approval not frozen'); end if;
 if not exists (select from pg_trigger where tgname = 'career_apply_jobs_confirmation' and tgrelid = 'public.career_apply_jobs'::regclass and tgenabled <> 'D') then
  out := array_append(out, 'career_apply_jobs_confirmation: trigger missing'); end if;
 return out;
end $$;

-- What the two functions are, by whether the bridge is installed. Each text is the file it came from, unchanged, or that
-- file with the other's lines added (tests/architect/bridge-ledger-order.test.ts checks both, line by line).
create or replace function public.career_apply_reconcile_bridge() returns text
language plpgsql security definer set search_path = public, pg_temp as $rb$
begin
 -- No claim or cloud check runs on a half-replaced pair: the bridge's own maintenance lock, held exclusively.
 perform pg_advisory_xact_lock(hashtextextended('career-card-cloud-bridge-maintenance-v1', 0));
 if to_regclass('career_message_approval_private.cloud_bound_jobs') is null then
  -- No bridge (never applied, or rolled back by supabase/rollbacks/20261024130000): 20261025100000's own two.
  execute $body$create or replace function public.career_apply_claim_own(p_limit integer, p_source text) returns setof public.career_apply_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); n timestamptz:=clock_timestamp();
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_source is null or p_source not in ('own_computer', 'extension') then raise exception 'invalid apply source'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 -- G3: an application that is no longer exactly what was approved, or whose company another path applied to since,
 -- is closed as not sent before anything is handed out.
 perform public.career_apply_void_unsendable(u, n);
 update public.career_apply_jobs set state='unknown_outcome',
  reason='application outcome unknown: the drive stopped before recording it; not retried',
  evidence=evidence||jsonb_build_object('swept_at',n),updated_at=n
  where user_id=u and state='driving' and claimed_at<n-interval '15 minutes' and source is distinct from 'cloud';
 return query
 with picked as (select id from public.career_apply_jobs where user_id=u and state='queued' and source is null
  and public.career_apply_current(user_id,payload) and approval_hash=payload_hash and attempts=0
  and payload_hash=public.career_apply_payload_hash(payload)
  order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=n,lease_token=gen_random_uuid(),updated_at=n,source=p_source
  from picked where j.id=picked.id returning j.*;
end $$;$body$;
  execute $body$create or replace function public.career_apply_cloud_refusal(j public.career_apply_jobs, p_now timestamptz) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare fam text := public.career_apply_portal(j.url); o public.career_apply_cloud_optin; a jsonb; went text[] :=
 array['driving', 'confirmed', 'submitted_unconfirmed', 'needs_user', 'unknown_outcome']; co text := public.career_apply_company_key(j.company);
begin
 -- G3: what the cloud would send must still be exactly what the person approved.
 if j.state <> 'queued' or j.attempts <> 0 or j.source is not null or j.approval_hash is distinct from j.payload_hash
  or j.payload_hash is distinct from public.career_apply_payload_hash(j.payload)
  or coalesce(j.payload->>'engine_approval', '') !~ '^[0-9a-f]{64}$' then return 'not_approved'; end if;
 if public.career_apply_current(j.user_id, j.payload) is distinct from true then return 'stale'; end if;
 if fam is null or fam not in ('greenhouse', 'lever', 'ashby') then return 'portal_not_cloud'; end if;
 -- A form only the person can submit (prepared with --person-submits: its destination is their own Submit press) is
 -- never the cloud's: a server has no person at the window.
 if coalesce(j.payload->>'destination', '') !~ '^https://' then return 'person_submits'; end if;
 if not public.career_apply_cloud_open(fam) and public.career_apply_cloud_waiver_left(j.user_id, fam, p_now) <= 0 then return 'gate_closed'; end if;
 select * into o from public.career_apply_cloud_optin where user_id = j.user_id;
 select value into a from public.career_watch_kv where user_id = j.user_id and key = 'career:account';
 if o.user_id is null or not o.enabled or o.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint, 0) then return 'not_opted_in'; end if;
 if exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = fam and until > p_now) then
  return 'portal_paused'; end if;
 if exists (select from public.career_apply_cloud_pauses where scope = 'person' and user_id = j.user_id and until > p_now) then
  return 'person_paused'; end if;
 if (select count(*) from public.career_apply_jobs where user_id = j.user_id and state = any(went) and claimed_at > p_now - interval '1 day')
  >= least(coalesce(o.daily, 25), public.career_apply_daily_limit(j.user_id)) then return 'daily_limit'; end if;
 -- G3: one 30-day ledger: an application to this company from any path (the queue, the extension's reports, the old
 -- batch stack) other than this one.
 if co <> '' and exists (select from public.career_apply_ledger(j.user_id, p_now - interval '30 days') l
  where l.company_key = co and l.ref is distinct from j.id::text) then
  return 'company_cooldown'; end if;
 return null;
end $$;$body$;
  return 'ledger';
 end if;
 -- The bridge installed: its two, each with G3's checks.
 execute $body$create or replace function public.career_apply_claim_own(p_limit integer, p_source text) returns setof public.career_apply_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); n timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('career-card-cloud-bridge-maintenance-v1',0));
 if u is null then raise exception 'not signed in'; end if;
 if p_source is null or p_source not in ('own_computer', 'extension') then raise exception 'invalid apply source'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 n:=clock_timestamp();
 -- G3: an application that is no longer exactly what was approved, or whose company another path applied to since,
 -- is closed as not sent before anything is handed out.
 perform public.career_apply_void_unsendable(u, n);
 update public.career_apply_jobs set state='unknown_outcome',
  reason='application outcome unknown: the drive stopped before recording it; not retried',
  evidence=evidence||jsonb_build_object('swept_at',n),updated_at=n
  where user_id=u and state='driving' and claimed_at<n-interval '15 minutes' and source is distinct from 'cloud';
 return query
 with picked as (select id from public.career_apply_jobs where user_id=u and state='queued' and source is null
  and not exists(select 1 from career_message_approval_private.cloud_bound_jobs b where b.job_row_id=career_apply_jobs.id)
  and public.career_apply_current(user_id,payload) and approval_hash=payload_hash and attempts=0
  and payload_hash=public.career_apply_payload_hash(payload)
  order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=n,lease_token=gen_random_uuid(),updated_at=n,source=p_source
  from picked where j.id=picked.id returning j.*;
end $$;$body$;
 execute $body$create or replace function public.career_apply_cloud_refusal(j public.career_apply_jobs, p_now timestamptz) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare fam text := public.career_apply_portal(j.url); o public.career_apply_cloud_optin; a jsonb; went text[] :=
 array['driving', 'confirmed', 'submitted_unconfirmed', 'needs_user', 'unknown_outcome']; co text := public.career_apply_company_key(j.company);
begin
 if career_message_approval_private.cloud_bound_refusal(j,p_now,true) is not null then
  return coalesce(career_message_approval_private.cloud_bound_refusal(j,p_now,true),'not_card_approved'); end if;
 if not public.career_apply_cloud_enabled() or not public.career_apply_agent_submit_enabled() then return 'cloud_switches_off'; end if;
 -- G3: what the cloud would send must still be exactly what the person approved.
 if j.state <> 'queued' or j.attempts <> 0 or j.source is not null or j.approval_hash is distinct from j.payload_hash
  or j.payload_hash is distinct from public.career_apply_payload_hash(j.payload)
  or coalesce(j.payload->>'engine_approval', '') !~ '^[0-9a-f]{64}$' then return 'not_approved'; end if;
 if public.career_apply_current(j.user_id, j.payload) is distinct from true then return 'stale'; end if;
 if fam is null or fam not in ('greenhouse', 'lever', 'ashby') then return 'portal_not_cloud'; end if;
 -- A form only the person can submit (prepared with --person-submits: its destination is their own Submit press) is
 -- never the cloud's: a server has no person at the window.
 if coalesce(j.payload->>'destination', '') !~ '^https://' then return 'person_submits'; end if;
 if not public.career_apply_cloud_open(fam) and public.career_apply_cloud_waiver_left(j.user_id, fam, p_now) <= 0 then return 'gate_closed'; end if;
 select * into o from public.career_apply_cloud_optin where user_id = j.user_id;
 select value into a from public.career_watch_kv where user_id = j.user_id and key = 'career:account';
 if o.user_id is null or not o.enabled or o.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint, 0) then return 'not_opted_in'; end if;
 if exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = fam and until > p_now) then
  return 'portal_paused'; end if;
 if exists (select from public.career_apply_cloud_pauses where scope = 'person' and user_id = j.user_id and until > p_now) then
  return 'person_paused'; end if;
 if (select count(*) from public.career_apply_jobs where user_id = j.user_id and state = any(went) and claimed_at > p_now - interval '1 day')
  >= least(15, coalesce(o.daily, 15), public.career_apply_daily_limit(j.user_id)) then return 'daily_limit'; end if;
 -- G3: one 30-day ledger: an application to this company from any path (the queue, the extension's reports, the old
 -- batch stack) other than this one.
 if co <> '' and exists (select from public.career_apply_ledger(j.user_id, p_now - interval '30 days') l
  where l.company_key = co and l.ref is distinct from j.id::text) then
  return 'company_cooldown'; end if;
 return null;
end $$;$body$;
 return 'merged';
end $rb$;

revoke all on function public.career_apply_guards_missing(), public.career_apply_reconcile_bridge() from public, anon, authenticated, service_role;
grant execute on function public.career_apply_guards_missing() to service_role;

select public.career_apply_reconcile_bridge();
