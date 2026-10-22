-- Rollback of 20261024120000 (D-010 gate waiver): restore 20261021080000's career_apply_cloud_refusal and
-- career_apply_cloud_claim_at (the live pre-state, md5 of prosrc 60839d70... / 7faefe13...), drop the waiver function and table.
begin;
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
 if not public.career_apply_cloud_open(fam) then return 'gate_closed'; end if;
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
declare c uuid; u uuid; ids uuid[] := '{}'; dead uuid[]; users uuid[]; fams text[]; j public.career_apply_jobs; got int := 0;
 lim int := greatest(0, least(6, coalesce(p_limit, 0)));
begin
 if p_now is null or not public.career_apply_cloud_enabled() then return; end if;
 -- Cloud drives that stopped without a result, and the candidates: queued, approved, of a person who turned the cloud on,
 -- on a family whose gate is open and which is not paused; one person's oldest first, then the next person's (so no one
 -- fills every context). Nothing is locked yet.
 dead := array(select id from public.career_apply_jobs where source = 'cloud' and state = 'driving' and claimed_at < p_now - interval '15 minutes');
 fams := array(select f from unnest(array['greenhouse', 'lever', 'ashby']) f where public.career_apply_cloud_open(f)
  and not exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = f and until > p_now));
 if lim > 0 and cardinality(fams) > 0 then
  ids := array(select x.id from (select q.id, q.created_at, row_number() over (partition by q.user_id order by q.created_at, q.id) rn
        from public.career_apply_jobs q join public.career_apply_cloud_optin o on o.user_id = q.user_id and o.enabled
        where q.state = 'queued' and q.attempts = 0 and q.source is null and q.approval_hash = q.payload_hash
         and public.career_apply_portal(q.url) = any(fams)) x order by x.rn, x.created_at, x.id limit lim * 4);
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
revoke all on function public.career_apply_cloud_refusal(public.career_apply_jobs, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.career_apply_cloud_claim_at(integer, timestamptz) from public, anon, authenticated, service_role;
drop function if exists public.career_apply_cloud_waiver_left(uuid, text, timestamptz);
drop table if exists public.career_apply_cloud_gate_waivers;
delete from public.upmore_migration_ledger where filename = '20261024120000_career_apply_cloud_gate_waiver.sql';
commit;
