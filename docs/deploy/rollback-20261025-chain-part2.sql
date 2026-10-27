-- ============================================================================
-- ROLLBACK PART 2: submit-path migration chain 20261025130000-20261025180000
-- (Trainee P2 deploy packet)
-- ============================================================================
-- What this restores:
--   The live state of the Upmore project (mrwngntwmnaqrqhupvlt) AS OF
--   migration 20261025120000 -- i.e. the state after part 1's chain
--   (20261025100000 / 110000 / 120000) was applied and BEFORE any of
--   20261025130000-20261025180000 is applied. It is the rollback for
--   applying, in order:
--     20261025130000_career_apply_wanted_candidates.sql
--     20261025140000_career_apply_no_volume_ceiling.sql
--     20261025150000_career_apply_pace_parse.sql
--     20261025160000_career_apply_pace_state.sql
--     20261025170000_career_apply_card_yes_window.sql
--     20261025180000_career_outbox_card_id.sql
--   PART A drops every object that later chain CREATES (each verified
--   ABSENT live at capture time) and restores the career_cloud_optin daily
--   check constraint that 140000 relaxes. PART B restores, as restorable
--   CREATE OR REPLACE statements captured verbatim from pg_get_functiondef
--   on the live database, every function the later chain REPLACES
--   (8 functions, each captured exactly once, length- and md5-verified
--   against live at capture time).
--
-- Relationship to part 1:
--   rollback-20261025-chain.sql (part 1) remains the rollback for
--   20261025100000-20261025120000: it restores the PRE-100000 live state.
--   This file (part 2) restores the AS-OF-120000 state. To roll the whole
--   20261025100000-20261025180000 sequence back, run THIS FILE FIRST,
--   then part 1.
--
-- Captured: 2026-10-27 00:49 CDT (America/Chicago), read-only, from the
--   live project mrwngntwmnaqrqhupvlt, before 130000-180000 were applied.
--
-- The 140000 rename, specifically:
--   140000 renames live career_apply_reconcile_bridge() (the 110000
--   version) to career_apply_reconcile_bridge_20261025110000() and then
--   creates its own career_apply_reconcile_bridge(). PART A drops the
--   renamed copy; PART B's captured CREATE OR REPLACE then overwrites the
--   140000 body under the original name, restoring the 110000 version.
--   Net effect: exactly one reconcile_bridge, at the captured definition.
--
-- Run as one transaction (begin/commit below). No data is restored: this
-- is a schema/function rollback only. (180000's career_outbox.card_id
-- column is dropped, which discards any values written into it after
-- 180000 is applied; that is inherent to undoing that migration.)
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- PART A: DROP the objects the later chain creates (reverse chain order:
-- 180000 first, then 160000, then 140000; 130000, 150000 and 170000 create
-- nothing -- they only replace functions, restored in PART B).
-- ----------------------------------------------------------------------------

-- A.1  20261025180000_career_outbox_card_id.sql creates (index + column)
drop index if exists public.career_outbox_card_id;
alter table public.career_outbox drop column if exists card_id;

-- A.2  20261025160000_career_apply_pace_state.sql creates (2 functions)
drop function if exists public.career_apply_pace_set(uuid, text);
drop function if exists public.career_apply_pace_state(uuid);

-- A.3  20261025140000_career_apply_no_volume_ceiling.sql creates (1 function),
-- renames reconcile_bridge, and relaxes the cloud-optin daily check.
drop function if exists public.career_apply_cloud_refusal_own_pace();
-- The renamed 110000 copy (see the header note): dropped here; PART B
-- restores the original name with the captured 110000 definition.
drop function if exists public.career_apply_reconcile_bridge_20261025110000();
-- Constraint restored to its captured live definition:
--   career_apply_cloud_optin_daily_check  CHECK (((daily >= 1) AND (daily <= 50)))
-- AMENDED 2026-10-27 (Codex review point): after 140000, a row may legally
-- hold daily > 50, and re-adding the 1-50 check would FAIL on such a row.
-- At capture time the table held 0 rows, so none could exist then; rows
-- created while the chain is live are clamped to the old ceiling first
-- (with a notice), so the constraint add below cannot fail on data.
do $$
declare n int;
begin
  select count(*) into n from public.career_apply_cloud_optin where daily > 50;
  if n > 0 then
    raise notice 'rollback part2: clamping % cloud_optin rows with daily > 50 down to 50 before restoring the 1-50 check', n;
    update public.career_apply_cloud_optin set daily = 50 where daily > 50;
  end if;
end $$;
alter table public.career_apply_cloud_optin drop constraint if exists career_apply_cloud_optin_daily_check;
alter table public.career_apply_cloud_optin add constraint career_apply_cloud_optin_daily_check CHECK (((daily >= 1) AND (daily <= 50)));

-- ----------------------------------------------------------------------------
-- PART B: RESTORE the functions the later chain replaces, at the exact
-- live definitions captured 2026-10-27 00:49 CDT (pg_get_functiondef,
-- verbatim). Each appears exactly once. prosrc md5 / definition length:

--   career_apply_prepare_candidates: prosrc md5 915cba80ac3db6857443b44a6a18a689, definition 2359 chars (md5 5486579e97a16bb4cd9808b75d3eba4b)
--   career_apply_daily_limit: prosrc md5 e8c335af888de39c76b2a73bb46dd8ac, definition 430 chars (md5 4c00182ae3ba2d5f89e4e04d16c04569)
--   career_apply_ledger_refusal: prosrc md5 d28264bccfb2d049de61738f614dfe31, definition 823 chars (md5 a6c945a01b961c4aeb63018ea4a54c8d)
--   career_apply_enqueue: prosrc md5 c9456c07cd9e4c61a22ece762f32442a, definition 1597 chars (md5 265ef2d825979e7134a48b4b7a9f61d5)
--   career_apply_reconcile_bridge: prosrc md5 2ce2a0911663b203b22d749760e68da4, definition 10219 chars (md5 72d7944fa9fa0d0180aff62df1fa36de)
--   career_apply_cloud_refusal: prosrc md5 a34ced316218090f8c1b37e8f891b0a1, definition 2807 chars (md5 64cd71f74e478b2d3304d24d30908323)
--   career_apply_card_answer_for: prosrc md5 0fa4606113dd8486dcc04e187503619c, definition 2330 chars (md5 f98fdf374c29e670c9928925e5f107fb)
--   career_apply_card_push_for: prosrc md5 dcd527b403318a44b1a9f28ec9f602f9, definition 2852 chars (md5 3175381495e25abe32feaf3bf770962f)
-- ----------------------------------------------------------------------------

-- career_apply_prepare_candidates -- live state as of 120000: 120000 version (replaced by 130000 and again by 140000)
CREATE OR REPLACE FUNCTION public.career_apply_prepare_candidates(p_now timestamp with time zone, p_per_person integer, p_limit integer)
 RETURNS TABLE(user_id uuid, job_id text, company text, title text, url text, location text, description text, epoch bigint, version bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 with a as (
  select o.user_id, substr(o.key, 7) as job_id, max(o.created_at) as alerted_at
  from public.career_outbox o
  where o.kind = 'alert' and o.key like 'alert:%' and o.created_at > p_now - interval '14 days'
  group by o.user_id, substr(o.key, 7)
 ), c as (
  select a.user_id, p.job_id, p.company, p.title, p.url, p.location, p.description,
   coalesce((k.value->>'epoch')::bigint, 0) as epoch, coalesce((k.value->>'version')::bigint, 0) as version,
   row_number() over (partition by a.user_id order by a.alerted_at desc, p.job_id) as rn, a.alerted_at
  from a
  join public.career_postings p on p.job_id = a.job_id and p.closed_at is null
  join public.profiles pr on pr.id = a.user_id
  join public.career_watch_kv k on k.user_id = a.user_id and k.key = 'career:account' and coalesce(k.value->>'paused', 'false') <> 'true'
  where not exists (select from public.career_apply_jobs j where j.user_id = a.user_id and j.job_id = p.job_id)
   and not exists (select from public.career_apply_prepared x where x.user_id = a.user_id and x.job_id = p.job_id)
   and not exists (select from public.career_apply_prepare_attempts t where t.user_id = a.user_id and t.posting_job_id = p.job_id
    and (t.outcome = 'ready'
     or (t.outcome = 'asked' and exists (select from public.career_apply_questions q where q.user_id = a.user_id and q.state = 'open'
      and t.engine_job_id = any(q.job_ids)))
     or (t.outcome <> 'asked' and t.at > p_now - interval '7 days')))
   and public.career_apply_company_key(p.company) <> ''
   and not exists (select from public.career_apply_ledger(a.user_id, p_now - interval '30 days') l
    where l.company_key = public.career_apply_company_key(p.company))
 )
 select c.user_id, c.job_id, c.company, c.title, c.url, c.location, c.description, c.epoch, c.version
 from c where c.rn <= greatest(0, least(coalesce(p_per_person, 0), 25))
 order by c.alerted_at desc, c.user_id, c.job_id
 limit greatest(0, least(coalesce(p_limit, 0), 200))
$function$;

-- career_apply_daily_limit -- live state as of 120000: pre-chain version, 20261020050000 (replaced by 140000, 150000 and 160000)
CREATE OR REPLACE FUNCTION public.career_apply_daily_limit(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 return greatest(1, least(50, coalesce((select case when value->>'daily_limit' ~ '^[0-9]{1,3}$' then (value->>'daily_limit')::int end
  from public.career_watch_kv where user_id = p_user and key = 'career:account'), 25)));
end $function$;

-- career_apply_ledger_refusal -- live state as of 120000: 100000 version (replaced by 140000 and 160000)
CREATE OR REPLACE FUNCTION public.career_apply_ledger_refusal(p_user uuid, p_company text, p_except text, p_now timestamp with time zone, p_daily integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare co text := public.career_apply_company_key(p_company);
 lim int := least(coalesce(p_daily, 50), public.career_apply_daily_limit(p_user));
begin
 if co <> '' and exists (select from public.career_apply_ledger(p_user, p_now - interval '30 days') l
  where l.company_key = co and l.ref is distinct from p_except) then return 'company_cooldown'; end if;
 if (select count(*) from public.career_apply_ledger(p_user, p_now - interval '1 day') l where l.ref is distinct from p_except) >= lim then
  return 'daily_cap'; end if;
 return null;
end $function$;

-- career_apply_enqueue -- live state as of 120000: 100000 version (replaced by 140000)
CREATE OR REPLACE FUNCTION public.career_apply_enqueue(p_payload jsonb, p_hash text, p_approval text, p_daily integer DEFAULT 25)
 RETURNS career_apply_jobs
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare u uuid:=(p_payload->>'user_id')::uuid; j public.career_apply_jobs; why text;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if p_payload->>'version' is distinct from '1' or nullif(p_payload->>'job_id','') is null or nullif(p_payload->>'company','') is null
 or coalesce(p_payload->>'url','') !~ '^https?://' or jsonb_typeof(p_payload->'fields') is distinct from 'array' or p_daily is null or p_daily not between 1 and 50
 or p_approval is distinct from p_hash or p_hash is distinct from public.career_apply_payload_hash(p_payload)
 or public.career_apply_current(u,p_payload) is distinct from true then raise exception 'invalid or stale application approval'; end if;
 if exists(select from public.career_apply_jobs where user_id=u and job_id=p_payload->>'job_id') then raise exception 'duplicate_job'; end if;
 -- G3: one ledger (every path's applications) and one cap (the smaller of the caller's and the person's own limit).
 why := public.career_apply_ledger_refusal(u, p_payload->>'company', null, now(), p_daily);
 if why is not null then raise exception '%', why; end if;
 insert into public.career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 values(u,p_payload->>'job_id',p_payload->>'company',p_payload->>'url',p_payload,p_hash,p_approval) returning * into j; return j;
end $function$;

-- career_apply_reconcile_bridge -- live state as of 120000: 110000 version (140000 renames this one to career_apply_reconcile_bridge_20261025110000 and installs its own under the original name)
CREATE OR REPLACE FUNCTION public.career_apply_reconcile_bridge()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

-- career_apply_cloud_refusal -- live state as of 120000: 100000 version (replaced by 140000 and 160000)
CREATE OR REPLACE FUNCTION public.career_apply_cloud_refusal(j career_apply_jobs, p_now timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

-- career_apply_card_answer_for -- live state as of 120000: pre-chain version (replaced by 170000)
CREATE OR REPLACE FUNCTION public.career_apply_card_answer_for(p_user uuid, p_card uuid, p_approve integer[], p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare c public.career_apply_cards; it jsonb; p public.career_apply_prepared; out jsonb := '[]'; res text; n int;
begin
 if p_user is null or p_card is null or p_now is null then raise exception 'invalid card answer'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 select * into c from public.career_apply_cards where id = p_card and user_id = p_user for update;
 if not found then raise exception 'invalid card answer'; end if;
 if c.state <> 'open' then raise exception 'card_answered'; end if;
 if c.shown_at < p_now - interval '24 hours' then raise exception 'card_expired'; end if;
 if exists (select from unnest(coalesce(p_approve, '{}')) a where a not between 1 and jsonb_array_length(c.items)) then
  raise exception 'not_on_card'; end if;
 for it in select * from jsonb_array_elements(c.items) loop
  n := (it->>'n')::int;
  select * into p from public.career_apply_prepared where id = (it->>'prepared_id')::uuid and user_id = p_user for update;
  if p.payload_hash is distinct from it->>'payload_hash' then res := 'changed';
  elsif n = any(coalesce(p_approve, '{}')) then
   begin
    perform public.career_apply_enqueue(p.payload, p.payload_hash, p.payload_hash, public.career_apply_daily_limit(p_user));
    res := 'queued';
   exception when others then
    res := case when sqlerrm like '%daily_cap%' then 'daily_cap' when sqlerrm like '%company_cooldown%' then 'company_cooldown'
     when sqlerrm like '%duplicate_job%' then 'duplicate' when sqlerrm like '%stale%' then 'stale' else 'refused' end;
   end;
  else res := 'declined'; end if;
  update public.career_apply_prepared set state = case res when 'queued' then 'approved' when 'stale' then 'expired' else 'declined' end, updated_at = p_now where id = p.id;
  out := out || jsonb_build_object('n', n, 'company', p.company, 'result', res);
 end loop;
 update public.career_apply_cards set state = 'answered', answered_at = p_now, answer = jsonb_build_object('approve', to_jsonb(coalesce(p_approve, '{}')), 'results', out) where id = c.id;
 return out;
end $function$;

-- career_apply_card_push_for -- live state as of 120000: pre-chain version (replaced by 180000)
CREATE OR REPLACE FUNCTION public.career_apply_card_push_for(p_user uuid, p_ids uuid[], p_text text, p_now timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare thread uuid; c public.career_apply_cards; home_contact text; seen timestamptz;
begin
 if p_user is null or p_ids is null or cardinality(p_ids) not between 1 and 8 or p_now is null
  or p_text is null or length(p_text) not between 1 and 4000 then raise exception 'invalid card push'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 if exists (select from public.channel_contacts where user_id = p_user and opted_out) then return null; end if;
 select thread_id into thread from public.channel_contacts where user_id = p_user and thread_id is not null order by last_inbound_at desc nulls last, created_at limit 1;
 if thread is null then return null; end if;
 home_contact := public.channel_target(p_user, null);
 if home_contact like 'wa:%' then
  select last_inbound_at into seen from public.channel_contacts where contact = home_contact;
  if seen is null or seen < p_now - interval '23 hours' then return null; end if;
 end if;
 if exists (select from public.career_apply_cards where user_id = p_user and state = 'open' and shown_at >= p_now - interval '24 hours')
  or exists (select from public.career_outbox where user_id = p_user and kind = 'reply' and created_at >= p_now - interval '30 minutes')
  -- WO-032: another prompt still waiting as the thread's last word (an email card, questions, an ask); a card's own last
  -- word is the open-card rule above, which lets a day-old card be replaced.
  or coalesce((select m.meta->>'intent' in ('career_apply_questions', 'career_apply_confirm_which', 'career_apply_email')
                and m.created_at >= p_now - interval '24 hours'
               from public.agent_messages m where m.thread_id = thread and m.role = 'assistant' order by m.id desc limit 1), false)
  or (select count(*) from public.career_apply_prepared where user_id = p_user and state = 'ready' and id = any(p_ids)) <> cardinality(p_ids)
 then return null; end if;
 if exists (select from public.career_apply_prepared p, unnest(p.card_lines) l
            where p.id = any(p_ids) and position(btrim(regexp_replace(l, '\s+', ' ', 'g')) in p_text) = 0) then
  raise exception 'card text does not carry every line'; end if;
 c := public.career_apply_card_open_for(p_user, p_ids, p_now);
 insert into public.agent_messages (thread_id, role, content, meta)
 values (thread, 'assistant', p_text, jsonb_build_object('career', true, 'intent', 'career_apply_card', 'card_id', c.id, 'proactive', true));
 insert into public.career_outbox (user_id, key, kind, text, deliver_at) values (p_user, 'card:' || c.id, 'card', p_text, p_now);
 return c.id;
end $function$;

commit;
