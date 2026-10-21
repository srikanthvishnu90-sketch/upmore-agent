-- D-010 as changed by the owner (2026-10-21, 17:31, verified on his phone channel; option (a)): the cloud worker's gate
-- (20261021080000: a portal family opens only after 3 hand/extension applications on it by a named gate tester, each
-- confirmed by the employer's own email) may be waived for ONE named person, ONE portal family, a set number of cloud
-- sends and until a set time: the first approved test batch, nothing wider. Everything else is unchanged and still holds
-- for every waived job: the kill switch CAREER_CLOUD_APPLY must be 'on'; the job must be queued from the person's own
-- approval of the exact payload (approval_hash = payload_hash, an engine approval); the person's opt-in, pauses, their
-- daily limit and the 30-day company rule (career_apply_cloud_refusal, unchanged but for the gate line).
--
-- What this file adds:
--  - career_apply_cloud_gate_waivers: one row per waiver (person, portal, max_sends 1..5, expires_at at most 7 days after
--    it is made, a note). Service-role only; no grant to anyone else; rows are written by the owner's operator only.
--    This migration writes NO row: applied alone it changes nothing (no waiver, no candidate, the gate as before).
--  - career_apply_cloud_waiver_left(person, portal, now): sends left on that person's live waiver for that portal: its
--    max_sends minus the cloud jobs of that person on that portal claimed since the waiver was made; 0 without one.
--  - career_apply_cloud_refusal / career_apply_cloud_claim_at: re-created from 20261021080000 with one change each — a
--    closed gate refuses unless the job's person has sends left on a live waiver for its portal; the claim's candidates
--    include a waived person's jobs on that portal. Every other line is 20261021080000's, byte for byte.
create table if not exists public.career_apply_cloud_gate_waivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  portal text not null check (portal in ('greenhouse', 'lever', 'ashby')),
  max_sends integer not null check (max_sends between 1 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  note text not null check (length(note) between 1 and 500),
  constraint career_apply_cloud_gate_waivers_window check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
alter table public.career_apply_cloud_gate_waivers enable row level security;
revoke all on table public.career_apply_cloud_gate_waivers from public, anon, authenticated;

create or replace function public.career_apply_cloud_waiver_left(p_user uuid, p_portal text, p_now timestamptz) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(max(greatest(0, w.max_sends - (select count(*) from public.career_apply_jobs x where x.user_id = w.user_id
   and x.source = 'cloud' and x.attempts > 0 and x.claimed_at >= w.created_at and public.career_apply_portal(x.url) = w.portal))), 0)::integer
 from public.career_apply_cloud_gate_waivers w
 where w.user_id = p_user and w.portal = p_portal and w.revoked_at is null and w.created_at <= p_now and w.expires_at > p_now
$$;
revoke all on function public.career_apply_cloud_waiver_left(uuid, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_cloud_waiver_left(uuid, text, timestamptz) to service_role;

create or replace function public.career_apply_cloud_refusal(j public.career_apply_jobs, p_now timestamptz) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
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
end $$;

create or replace function public.career_apply_cloud_claim_at(p_limit integer, p_now timestamptz) returns setof public.career_apply_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare c uuid; u uuid; ids uuid[] := '{}'; dead uuid[]; users uuid[]; fams text[]; wf text[]; j public.career_apply_jobs; got int := 0;
 lim int := greatest(0, least(6, coalesce(p_limit, 0)));
begin
 if p_now is null or not public.career_apply_cloud_enabled() then return; end if;
 -- Cloud drives that stopped without a result, and the candidates: queued, approved, of a person who turned the cloud on,
 -- on a family whose gate is open and which is not paused; one person's oldest first, then the next person's (so no one
 -- fills every context). Nothing is locked yet.
 dead := array(select id from public.career_apply_jobs where source = 'cloud' and state = 'driving' and claimed_at < p_now - interval '15 minutes');
 fams := array(select f from unnest(array['greenhouse', 'lever', 'ashby']) f where public.career_apply_cloud_open(f)
  and not exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = f and until > p_now));
 -- 20261024120000: a family whose gate is closed is still a candidate for a person holding a live waiver on it (D-010 as
 -- changed by the owner, 2026-10-21); the refusal below decides each job, the waiver's own count included.
 wf := array(select distinct w.portal from public.career_apply_cloud_gate_waivers w where w.revoked_at is null and w.expires_at > p_now
  and not exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = w.portal and until > p_now));
 if lim > 0 and (cardinality(fams) > 0 or cardinality(wf) > 0) then
  ids := array(select x.id from (select q.id, q.created_at, row_number() over (partition by q.user_id order by q.created_at, q.id) rn
        from public.career_apply_jobs q join public.career_apply_cloud_optin o on o.user_id = q.user_id and o.enabled
        where q.state = 'queued' and q.attempts = 0 and q.source is null and q.approval_hash = q.payload_hash
         and (public.career_apply_portal(q.url) = any(fams)
          or (public.career_apply_portal(q.url) = any(wf) and public.career_apply_cloud_waiver_left(q.user_id, public.career_apply_portal(q.url), p_now) > 0))) x
        order by x.rn, x.created_at, x.id limit lim * 4);
 end if;
 -- Each person's lock first, in user id order, the same order every time (the finish, the enqueue and the own claim also
 -- take the person's lock before any row), so two of them can never wait on each other in a circle.
 users := array(select distinct user_id from public.career_apply_jobs where id = any(dead || ids) order by user_id);
 foreach u in array users loop
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 end loop;
 -- A cloud drive that stopped without a result is unknown, an error in the telemetry, and never re-driven.
 for j in update public.career_apply_jobs set state = 'unknown_outcome',
   reason = 'application outcome unknown: the drive stopped before recording it; not retried',
   evidence = evidence || jsonb_build_object('swept_at', p_now), updated_at = p_now
   where id = any(dead) and source = 'cloud' and state = 'driving' and claimed_at < p_now - interval '15 minutes' returning * loop
  perform public.career_apply_cloud_record(j, 'error', 'unknown_outcome', p_now);
 end loop;
 foreach c in array ids loop
  exit when got >= lim;
  select * into j from public.career_apply_jobs where id = c and state = 'queued' for update skip locked;
  continue when not found;
  continue when public.career_apply_cloud_refusal(j, p_now) is not null;
  update public.career_apply_jobs set state = 'driving', attempts = 1, claimed_at = p_now, lease_token = gen_random_uuid(),
   updated_at = p_now, source = 'cloud' where id = j.id returning * into j;
  got := got + 1;
  return next j;
 end loop;
end $$;

-- Grants as 20261021080000 left them: refusal and claim_at to no one (claim_at is reached through career_apply_cloud_claim).
revoke all on function public.career_apply_cloud_refusal(public.career_apply_jobs, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.career_apply_cloud_claim_at(integer, timestamptz) from public, anon, authenticated, service_role;
