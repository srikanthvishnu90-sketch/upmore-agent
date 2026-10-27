-- ============================================================================
-- ROLLBACK: submit-path migration chain 20261025 (Trainee P2 deploy packet)
-- ============================================================================
-- What this restores:
--   The pre-apply live state of the Upmore project (mrwngntwmnaqrqhupvlt)
--   for the three-migration chain on origin/trunk:
--     20261025100000_career_apply_one_ledger.sql
--     20261025110000_career_apply_bridge_reconcile.sql
--     20261025120000_career_apply_prepare_ahead.sql
--   PART A drops every object that chain CREATES (each verified ABSENT live
--   at capture time, so dropping it returns the schema to the captured state).
--   PART B restores, as restorable CREATE OR REPLACE statements captured
--   verbatim from pg_get_functiondef on the live database, every function
--   that chain REPLACES (6 functions).
--
-- Captured: 2026-10-27 00:41 CDT (America/Chicago), read-only, from the live
--   project mrwngntwmnaqrqhupvlt BEFORE the chain was applied.
--
-- Pre-apply live state this returns to:
--   - The 6 replaced functions at the definitions in PART B.
--   - None of the chain-created functions, tables, indexes or the
--     career_apply_jobs_confirmation trigger present.
--   - career_apply_claim_own has a second live overload,
--     career_apply_claim_own(p_limit integer), which the chain does NOT
--     touch; it is not in this file and must be left alone.
--
-- WARNING: the trigger career_apply_jobs_fixed on public.career_apply_jobs
--   PRE-EXISTS live (verified at capture time). The chain only replaces the
--   career_apply_jobs_fixed() function (restored in PART B); its trigger
--   must NOT be dropped, and this script does not drop it.
--
-- Run as one transaction (begin/commit below). No data is restored: this is
-- a schema/function rollback only.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- PART A: DROP the objects the chain creates (reverse chain order: the
-- 20261025120000 objects first, then 20261025110000, then 20261025100000;
-- within each group, dependents drop before the objects they depend on:
-- trigger and expression indexes before the functions they use, functions
-- before the tables they read).
-- ----------------------------------------------------------------------------

-- A.1  20261025120000_career_apply_prepare_ahead.sql creates (8 functions, 2 tables)
drop function if exists public.career_apply_prepare_candidates(timestamp with time zone, integer, integer);
drop function if exists public.career_apply_prepare_for(uuid, text, jsonb, text[]);
drop function if exists public.career_apply_prepare_attempt_for(uuid, text, text, text, uuid, text);
drop function if exists public.career_apply_prepare_ask_for(uuid, text, text, jsonb);
drop function if exists public.career_apply_answers_for(uuid);
drop function if exists public.career_apply_question_draft_put_for(uuid, text, text, text, text[]);
drop function if exists public.career_apply_question_drafts_as(uuid, uuid[]);
drop function if exists public.career_apply_profile_for(uuid);
drop table if exists public.career_apply_question_drafts;
drop table if exists public.career_apply_prepare_attempts;

-- A.2  20261025110000_career_apply_bridge_reconcile.sql creates (2 functions)
drop function if exists public.career_apply_reconcile_bridge();
drop function if exists public.career_apply_guards_missing();

-- A.3  20261025100000_career_apply_one_ledger.sql creates
--      (trigger first, then its function; indexes before the function they use)
drop trigger if exists career_apply_jobs_confirmation on public.career_apply_jobs;
drop index if exists public.career_apply_jobs_confirmation_key;
drop index if exists public.extension_submission_reports_confirmation_key;
drop function if exists public.career_apply_jobs_confirmation();
drop function if exists public.career_apply_ledger_refusal(uuid, text, text, timestamp with time zone, integer);
drop function if exists public.career_apply_ledger(uuid, timestamp with time zone);
drop function if exists public.career_apply_void_unsendable(uuid, timestamp with time zone);
drop function if exists public.career_apply_payload_hash(jsonb);
drop function if exists public.career_apply_confirmation_key(text);
drop function if exists public.career_apply_record_time(text);
drop function if exists public.career_apply_counted_states();

-- ----------------------------------------------------------------------------
-- PART B: RESTORE the functions the chain replaces, at their captured
-- pre-apply live definitions (verbatim pg_get_functiondef). The captured
-- definitions reference none of the chain-created objects and none of each
-- other, so this order is dependency-safe.
-- ----------------------------------------------------------------------------


-- RESTORE: public.career_apply_jobs_fixed() -- replaced by 20261025100000 (function only; its trigger pre-exists, see header warning)
CREATE OR REPLACE FUNCTION public.career_apply_jobs_fixed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if old.source is not null and new.source is distinct from old.source then raise exception 'source_fixed'; end if;
 -- A source is given by the claim that starts a drive, from queued, and by nothing else.
 if old.source is null and new.source is not null and old.state <> 'queued' then raise exception 'source_fixed'; end if;
 if old.email_confirmed_at is not null and (new.email_confirmed_at is distinct from old.email_confirmed_at
   or new.confirmation_mail_hash is distinct from old.confirmation_mail_hash) then raise exception 'mail_confirmation_fixed'; end if;
 return new;
end $function$;

-- RESTORE: public.career_apply_enqueue(p_payload jsonb, p_hash text, p_approval text, p_daily integer) -- replaced by 20261025100000
CREATE OR REPLACE FUNCTION public.career_apply_enqueue(p_payload jsonb, p_hash text, p_approval text, p_daily integer DEFAULT 25)
 RETURNS career_apply_jobs
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare u uuid:=(p_payload->>'user_id')::uuid; j public.career_apply_jobs; co text; counted text[]:=array['queued','driving','confirmed','submitted_unconfirmed','needs_user','unknown_outcome'];
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if p_payload->>'version' is distinct from '1' or nullif(p_payload->>'job_id','') is null or nullif(p_payload->>'company','') is null
 or coalesce(p_payload->>'url','') !~ '^https?://' or jsonb_typeof(p_payload->'fields') is distinct from 'array' or p_daily is null or p_daily not between 1 and 50
 or p_approval is distinct from p_hash or p_hash is distinct from encode(sha256(convert_to(public.career_apply_canonical(p_payload),'UTF8')),'hex')
 or public.career_apply_current(u,p_payload) is distinct from true then raise exception 'invalid or stale application approval'; end if;
 if exists(select from public.career_apply_jobs where user_id=u and job_id=p_payload->>'job_id') then raise exception 'duplicate_job'; end if;
 co:=trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(p_payload->>'company'),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g'));
 if co<>'' and exists(select from public.career_apply_jobs where user_id=u and state=any(counted) and created_at>now()-interval '30 days'
 and trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(company),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g'))=co) then raise exception 'company_cooldown'; end if;
 if (select count(*) from public.career_apply_jobs where user_id=u and state=any(counted) and created_at>now()-interval '1 day')>=p_daily then raise exception 'daily_cap'; end if;
 insert into public.career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 values(u,p_payload->>'job_id',p_payload->>'company',p_payload->>'url',p_payload,p_hash,p_approval) returning * into j; return j;
end $function$;

-- RESTORE: public.career_apply_email_reserve_for(p_user uuid, p_payload jsonb, p_hash text, p_now timestamp with time zone) -- replaced by 20261025100000
CREATE OR REPLACE FUNCTION public.career_apply_email_reserve_for(p_user uuid, p_payload jsonb, p_hash text, p_now timestamp with time zone)
 RETURNS career_apply_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare j public.career_apply_jobs; prior public.career_apply_jobs; card jsonb; co text; counted text[] := array['queued','driving','confirmed','submitted_unconfirmed','needs_user','unknown_outcome'];
begin
 if p_user is null or p_now is null or p_payload is null or p_payload->>'kind' is distinct from 'email' or p_payload->>'version' is distinct from '1'
  or p_payload->>'user_id' is distinct from p_user::text or nullif(p_payload->>'job_id', '') is null or nullif(p_payload->>'company', '') is null
  or coalesce(p_payload->>'url', '') !~ '^https?://'
  or coalesce(p_payload->>'to', '') !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$'
  or length(coalesce(p_payload->>'subject', '')) not between 1 and 200 or p_payload->>'subject' ~ '[\r\n]'
  or length(coalesce(p_payload->>'body', '')) not between 1 and 5000
  or coalesce(p_payload#>>'{attachment,sha256}', '') !~ '^[a-f0-9]{64}$'
  or p_payload ? 'cc' or p_payload ? 'bcc'
  or coalesce(p_hash, '') is distinct from encode(sha256(convert_to(public.career_apply_canonical(p_payload), 'UTF8')), 'hex') then
  raise exception 'invalid email application'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
 select value into card from public.career_watch_kv where user_id = p_user and key = 'career:email-card' for update;
 if card is null or card->>'state' is distinct from 'shown' or card->>'payload_hash' is distinct from p_hash
  or (card->>'shown_at')::timestamptz < p_now - interval '24 hours' then raise exception 'changed_since_yes'; end if;
 -- One application per posting, except an emailed one Gmail refused (nothing went): a fresh yes may try it once more.
 select * into prior from public.career_apply_jobs where user_id = p_user and job_id = p_payload->>'job_id' for update;
 if found and not (prior.state = 'not_submitted' and prior.source = 'email') then raise exception 'duplicate_job'; end if;
 co := trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(p_payload->>'company'),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g'));
 if co <> '' and exists (select from public.career_apply_jobs where user_id = p_user and state = any(counted) and created_at > p_now - interval '30 days'
  and trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(company),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g')) = co) then
  raise exception 'company_cooldown'; end if;
 if (select count(*) from public.career_apply_jobs where user_id = p_user and state = any(counted) and created_at > p_now - interval '1 day')
  >= public.career_apply_daily_limit(p_user) then raise exception 'daily_cap'; end if;
 if prior.id is not null then
  -- The same tracked application, sent again under a new lease; the refused attempt is kept in its evidence.
  update public.career_apply_jobs set payload = p_payload, payload_hash = p_hash, approval_hash = p_hash, state = 'driving', attempts = 1,
   claimed_at = p_now, lease_token = gen_random_uuid(), reason = null, confirmation_id = null,
   evidence = jsonb_build_object('earlier_attempt', prior.evidence), created_at = p_now, updated_at = p_now
   where id = prior.id returning * into j;
 else
  insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, attempts, claimed_at, lease_token, source, created_at, updated_at)
  values (p_user, p_payload->>'job_id', p_payload->>'company', p_payload->>'url', p_payload, p_hash, p_hash, 'driving', 1, p_now, gen_random_uuid(), 'email', p_now, p_now)
  returning * into j;
 end if;
 update public.career_watch_kv set value = card || jsonb_build_object('state', 'sending', 'application', j.id), updated_at = p_now
  where user_id = p_user and key = 'career:email-card';
 return j;
end $function$;

-- RESTORE: public.career_apply_cloud_refusal(j public.career_apply_jobs, p_now timestamp with time zone) -- replaced by 20261025100000 and again by 20261025110000
CREATE OR REPLACE FUNCTION public.career_apply_cloud_refusal(j career_apply_jobs, p_now timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare fam text := public.career_apply_portal(j.url); o public.career_apply_cloud_optin; a jsonb; went text[] :=
 array['driving', 'confirmed', 'submitted_unconfirmed', 'needs_user', 'unknown_outcome']; co text := public.career_apply_company_key(j.company);
begin
 if j.state <> 'queued' or j.attempts <> 0 or j.source is not null or j.approval_hash is distinct from j.payload_hash
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
 if co <> '' and exists (select from public.career_apply_jobs x where x.user_id = j.user_id and x.id <> j.id and x.state = any(went)
  and coalesce(x.claimed_at, x.created_at) > p_now - interval '30 days' and public.career_apply_company_key(x.company) = co) then
  return 'company_cooldown'; end if;
 return null;
end $function$;

-- RESTORE: public.career_apply_claim(p_now timestamp with time zone, p_limit integer) -- replaced by 20261025100000
CREATE OR REPLACE FUNCTION public.career_apply_claim(p_now timestamp with time zone, p_limit integer)
 RETURNS SETOF career_apply_jobs
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
 with picked as (select id from public.career_apply_jobs where state='queued' and source is null and public.career_apply_current(user_id,payload)
 and approval_hash=payload_hash and attempts=0 and p_now is not null
 order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=p_now,lease_token=gen_random_uuid(),updated_at=p_now,source='cloud'
 from picked where j.id=picked.id returning j.*;
$function$;

-- RESTORE: public.career_apply_claim_own(p_limit integer, p_source text) -- replaced by 20261025100000 and again by 20261025110000 (the 1-arg overload is untouched)
CREATE OR REPLACE FUNCTION public.career_apply_claim_own(p_limit integer, p_source text)
 RETURNS SETOF career_apply_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare u uuid:=auth.uid(); n timestamptz:=clock_timestamp();
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_source is null or p_source not in ('own_computer', 'extension') then raise exception 'invalid apply source'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 update public.career_apply_jobs set state='unknown_outcome',
  reason='application outcome unknown: the drive stopped before recording it; not retried',
  evidence=evidence||jsonb_build_object('swept_at',n),updated_at=n
  where user_id=u and state='driving' and claimed_at<n-interval '15 minutes' and source is distinct from 'cloud';
 return query
 with picked as (select id from public.career_apply_jobs where user_id=u and state='queued' and source is null
  and public.career_apply_current(user_id,payload) and approval_hash=payload_hash and attempts=0
  order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=n,lease_token=gen_random_uuid(),updated_at=n,source=p_source
  from picked where j.id=picked.id returning j.*;
end $function$;

commit;
