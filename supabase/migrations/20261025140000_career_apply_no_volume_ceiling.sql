-- No volume ceiling on the apply path (CAPS-1390; owner, 2026-10-22: no cap on applications or on anything).
-- NOT APPLIED: like every migration, the owner applies it; nothing here runs on the live project until then.
--
-- Trainee imposes no daily number. A person's own daily pace, if they set one (career:account daily_limit), is their
-- instruction and is honored with no maximum. Kept, unchanged: the exact-payload approval on each card
-- (career_apply_jobs_fixed, the claim re-check), idempotency and unique confirmation ids, one application per employer
-- in 30 days (career_apply_ledger), the cloud's gate and pauses, the spend and site limits. Execution pacing (how many
-- the server prepares per run) is the caller's number, no longer clamped here.
-- After 20261025100000 and 20261025110000; coherent in every apply order the bridge draft can take (section 4b: the
-- reconcile the launch scripts run after every apply keeps the own-pace cloud refusal whenever the bridge is absent).

-- 1. The person's own pace, or null (no 25 default, no 50 maximum).
create or replace function public.career_apply_daily_limit(p_user uuid) returns integer
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
 return (select case when value->>'daily_limit' ~ '^[0-9]{1,6}$' and (value->>'daily_limit')::int >= 1 then (value->>'daily_limit')::int end
  from public.career_watch_kv where user_id = p_user and key = 'career:account');
end $$;

-- 2. The ledger refusal: the 30-day employer rule stands; 'daily_cap' only against a pace the person set; p_daily is ignored.
create or replace function public.career_apply_ledger_refusal(p_user uuid, p_company text, p_except text, p_now timestamptz, p_daily integer)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare co text := public.career_apply_company_key(p_company); own integer := public.career_apply_daily_limit(p_user);
begin
 if co <> '' and exists (select from public.career_apply_ledger(p_user, p_now - interval '30 days') l
  where l.company_key = co and l.ref is distinct from p_except) then return 'company_cooldown'; end if;
 if own is not null and (select count(*) from public.career_apply_ledger(p_user, p_now - interval '1 day') l where l.ref is distinct from p_except) >= own then
  return 'daily_cap'; end if;
 return null;
end $$;

-- 3. The queue's enqueue: p_daily is accepted for its callers (any value, or none) and never a ceiling.
create or replace function public.career_apply_enqueue(p_payload jsonb,p_hash text,p_approval text,p_daily integer default null)
returns public.career_apply_jobs language plpgsql set search_path=public,extensions,pg_temp as $$
declare u uuid:=(p_payload->>'user_id')::uuid; j public.career_apply_jobs; why text;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if p_payload->>'version' is distinct from '1' or nullif(p_payload->>'job_id','') is null or nullif(p_payload->>'company','') is null
 or coalesce(p_payload->>'url','') !~ '^https?://' or jsonb_typeof(p_payload->'fields') is distinct from 'array'
 or p_approval is distinct from p_hash or p_hash is distinct from public.career_apply_payload_hash(p_payload)
 or public.career_apply_current(u,p_payload) is distinct from true then raise exception 'invalid or stale application approval'; end if;
 if exists(select from public.career_apply_jobs where user_id=u and job_id=p_payload->>'job_id') then raise exception 'duplicate_job'; end if;
 -- G3's one ledger: every path's applications; the 30-day employer rule, and only the person's own pace if they set one.
 why := public.career_apply_ledger_refusal(u, p_payload->>'company', null, now(), null);
 if why is not null then raise exception '%', why; end if;
 insert into public.career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 values(u,p_payload->>'job_id',p_payload->>'company',p_payload->>'url',p_payload,p_hash,p_approval) returning * into j; return j;
end $$;

-- 4. The cloud: the person's own pace (the number in their opt-in terms, else their account pace), no product number.
-- Installed only while the bridge draft (20261024130000) is not: with the bridge in place the reconcile's merged text
-- (20261025110000) stands, and the bridge's own 15 a day inside it; that file is evidence, unchanged, and its number is
-- named here, not edited. Kept as a function because 4b below needs it again.
create or replace function public.career_apply_cloud_refusal_own_pace() returns void
language plpgsql security definer set search_path = public, pg_temp as $op$
begin
 if to_regclass('career_message_approval_private.cloud_bound_jobs') is not null then return; end if;
 execute $body$create or replace function public.career_apply_cloud_refusal(j public.career_apply_jobs, p_now timestamptz) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare fam text := public.career_apply_portal(j.url); o public.career_apply_cloud_optin; a jsonb; own integer; went text[] :=
 array['driving', 'confirmed', 'submitted_unconfirmed', 'needs_user', 'unknown_outcome']; co text := public.career_apply_company_key(j.company);
begin
 if j.state <> 'queued' or j.attempts <> 0 or j.source is not null or j.approval_hash is distinct from j.payload_hash
  or j.payload_hash is distinct from public.career_apply_payload_hash(j.payload)
  or coalesce(j.payload->>'engine_approval', '') !~ '^[0-9a-f]{64}$' then return 'not_approved'; end if;
 if public.career_apply_current(j.user_id, j.payload) is distinct from true then return 'stale'; end if;
 if fam is null or fam not in ('greenhouse', 'lever', 'ashby') then return 'portal_not_cloud'; end if;
 if coalesce(j.payload->>'destination', '') !~ '^https://' then return 'person_submits'; end if;
 if not public.career_apply_cloud_open(fam) and public.career_apply_cloud_waiver_left(j.user_id, fam, p_now) <= 0 then return 'gate_closed'; end if;
 select * into o from public.career_apply_cloud_optin where user_id = j.user_id;
 select value into a from public.career_watch_kv where user_id = j.user_id and key = 'career:account';
 if o.user_id is null or not o.enabled or o.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint, 0) then return 'not_opted_in'; end if;
 if exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = fam and until > p_now) then
  return 'portal_paused'; end if;
 if exists (select from public.career_apply_cloud_pauses where scope = 'person' and user_id = j.user_id and until > p_now) then
  return 'person_paused'; end if;
 own := coalesce(o.daily, public.career_apply_daily_limit(j.user_id));
 if own is not null and (select count(*) from public.career_apply_jobs where user_id = j.user_id and state = any(went) and claimed_at > p_now - interval '1 day') >= own then
  return 'daily_limit'; end if;
 if co <> '' and exists (select from public.career_apply_ledger(j.user_id, p_now - interval '30 days') l
  where l.company_key = co and l.ref is distinct from j.id::text) then
  return 'company_cooldown'; end if;
 return null;
end $$;$body$;
end $op$;
select public.career_apply_cloud_refusal_own_pace();

-- 4b. The reconcile (20261025110000) re-creates career_apply_cloud_refusal from its own two texts, and the launch scripts
-- run it after every apply (scripts/launch/verify-claim-guards.sql; tests/db/run.sh too). Its no-bridge text carries the
-- ledger's 25. From here the reconcile is the same function under its dated name, and the name the scripts call ends by
-- installing the own-pace text again whenever the bridge is absent: no apply order brings a product number back. (Should
-- 20261025110000 itself ever be applied again after this file, it re-creates the name with its own text; apply this file
-- again after it.)
do $$ begin
 if to_regprocedure('public.career_apply_reconcile_bridge_20261025110000()') is null then
  alter function public.career_apply_reconcile_bridge() rename to career_apply_reconcile_bridge_20261025110000;
 end if;
end $$;
create or replace function public.career_apply_reconcile_bridge() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare r text;
begin
 r := public.career_apply_reconcile_bridge_20261025110000();
 perform public.career_apply_cloud_refusal_own_pace();
 return r;
end $$;
revoke all on function public.career_apply_reconcile_bridge(), public.career_apply_reconcile_bridge_20261025110000(), public.career_apply_cloud_refusal_own_pace()
 from public, anon, authenticated, service_role;
select public.career_apply_reconcile_bridge();

-- 5. The cloud opt-in's daily number is the person's own, with no maximum.
alter table public.career_apply_cloud_optin drop constraint if exists career_apply_cloud_optin_daily_check;
alter table public.career_apply_cloud_optin add constraint career_apply_cloud_optin_daily_check check (daily is null or daily >= 1);

-- 6. The server prepare's candidates: the caller's pacing numbers as given, not clamped to 25 per person or 200 in all.
create or replace function public.career_apply_prepare_candidates(p_now timestamptz, p_per_person integer, p_limit integer)
returns table (user_id uuid, job_id text, company text, title text, url text, location text, description text, epoch bigint, version bigint)
language sql stable security definer set search_path = public, pg_temp as $$
 with s as (
  select o.user_id, substr(o.key, 7) as job_id, o.created_at as at
  from public.career_outbox o
  where o.kind = 'alert' and o.key like 'alert:%' and o.created_at > p_now - interval '14 days'
  union all
  select w.user_id, w.posting_key as job_id, w.queued_at as at
  from public.career_apply_wanted w
  where w.state = 'waiting'
 ), a as (
  select s.user_id, s.job_id, max(s.at) as alerted_at from s group by s.user_id, s.job_id
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
 from c where c.rn <= greatest(0, coalesce(p_per_person, 0))
 order by c.alerted_at desc, c.user_id, c.job_id
 limit greatest(0, coalesce(p_limit, 0))
$$;
