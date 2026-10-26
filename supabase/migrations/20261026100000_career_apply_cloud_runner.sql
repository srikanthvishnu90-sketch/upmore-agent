-- Cloud runner (F-RUNNER, 2026-10-26): a dispatcher claims approved applications for the cloud and starts one sandbox per
-- application, under a global and a per-portal concurrency limit. NOT APPLIED: like every migration, the owner applies it.
--
-- Nothing here is a second queue, a second claim or a second cap. Every job is still claimed by the one cloud claim
-- (career_apply_cloud_claim_at: the kill switch, the gate or waiver, the opt-in, the pauses, the person's own pace and the
-- 30-day employer rule in career_apply_cloud_refusal, the 15-minute lease sweep) and finished by career_apply_cloud_finish.
--
-- What this file adds (service role only):
--  - career_apply_cloud_claim_portal_at(limit, now, portal): career_apply_cloud_claim_at restricted to one portal family.
--    It is not written by hand: career_apply_cloud_claim_portal_install() generates it from the installed claim_at's own
--    body with two anchored edits (the candidate families, and the waiver families, are filtered to p_portal), and refuses
--    if either anchor is missing. Re-run it after anything replaces claim_at (the card-cloud bridge, its rollback);
--    career_apply_cloud_runner_missing() reads non-empty until it is.
--  - career_apply_cloud_inflight(now): cloud applications being driven now, in total and per portal family.
--  - career_apply_cloud_dispatch_claim(want, global, per_portal): under one dispatch lock, claims at most `want`
--    applications so that the cloud never drives more than `global` at once, nor more than `per_portal` on one family.
--  - career_apply_cloud_check_rates(days): per portal family and per employer host, how often the cloud met a
--    verification check (bot_check), how often it sent, and how many sent applications have gone 24 hours without the
--    employer's confirmation email: the numbers the fallback to the person's own browser is decided from.

create or replace function public.career_apply_cloud_claim_portal_sql() returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare src text := (select prosrc from pg_proc where oid = 'public.career_apply_cloud_claim_at(integer,timestamptz)'::regprocedure);
 fam_from text := 'unnest(array[''greenhouse'', ''lever'', ''ashby'']) f where public.career_apply_cloud_open(f)';
 fam_to text := 'unnest(array[''greenhouse'', ''lever'', ''ashby'']) f where f = p_portal and public.career_apply_cloud_open(f)';
 wf_from text := 'where w.revoked_at is null and w.expires_at > p_now';
 wf_to text := 'where w.portal = p_portal and w.revoked_at is null and w.expires_at > p_now';
 body text;
begin
 if src is null then raise exception 'career_apply_cloud_claim_at missing'; end if;
 if (length(src) - length(replace(src, fam_from, ''))) / length(fam_from) <> 1 then
  raise exception 'claim_at changed: the family anchor is not there exactly once'; end if;
 body := replace(src, fam_from, fam_to);
 if src like '%career_apply_cloud_gate_waivers w%' then
  if (length(src) - length(replace(src, wf_from, ''))) / length(wf_from) <> 1 then
   raise exception 'claim_at changed: the waiver anchor is not there exactly once'; end if;
  body := replace(body, wf_from, wf_to);
 end if;
 if position('$cr$' in body) > 0 then raise exception 'claim_at body holds the quote tag'; end if;
 return 'create or replace function public.career_apply_cloud_claim_portal_at(p_limit integer, p_now timestamptz, p_portal text) '
  || 'returns setof public.career_apply_jobs language plpgsql security definer set search_path = public, pg_temp as $cr$'
  || body || '$cr$';
end $$;

create or replace function public.career_apply_cloud_claim_portal_install() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 execute public.career_apply_cloud_claim_portal_sql();
 revoke all on function public.career_apply_cloud_claim_portal_at(integer, timestamptz, text) from public, anon, authenticated, service_role;
 return 'installed';
end $$;

-- Empty when the portal claim is exactly the installed claim_at with the portal filter; one line per gap otherwise.
create or replace function public.career_apply_cloud_runner_missing() returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare want text; have text;
begin
 if to_regprocedure('public.career_apply_cloud_claim_portal_at(integer,timestamptz,text)') is null then
  return array['career_apply_cloud_claim_portal_at: not installed']; end if;
 begin
  want := public.career_apply_cloud_claim_portal_sql();
 exception when others then return array['career_apply_cloud_claim_portal_at: ' || sqlerrm]; end;
 have := (select prosrc from pg_proc where oid = 'public.career_apply_cloud_claim_portal_at(integer,timestamptz,text)'::regprocedure);
 if position(have in want) = 0 then
  return array['career_apply_cloud_claim_portal_at: differs from career_apply_cloud_claim_at (run career_apply_cloud_claim_portal_install())']; end if;
 return '{}';
end $$;

select public.career_apply_cloud_claim_portal_install();

-- What the cloud is driving now: claimed and not yet finished, inside the lease (after 15 minutes the claim sweeps it).
create or replace function public.career_apply_cloud_inflight(p_now timestamptz default clock_timestamp()) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
 select jsonb_build_object('total', count(*),
  'greenhouse', count(*) filter (where public.career_apply_portal(url) = 'greenhouse'),
  'lever', count(*) filter (where public.career_apply_portal(url) = 'lever'),
  'ashby', count(*) filter (where public.career_apply_portal(url) = 'ashby'))
 from public.career_apply_jobs where source = 'cloud' and state = 'driving' and claimed_at > p_now - interval '15 minutes'
$$;

-- The dispatcher's one door. One dispatcher at a time (the transaction lock); the families with the fewest in flight are
-- served first; each family is claimed through the one claim, six at a time, until its share is met or it runs dry.
create or replace function public.career_apply_cloud_dispatch_claim(p_want integer, p_global integer, p_per_portal integer)
returns setof public.career_apply_jobs language plpgsql security definer set search_path = public, pg_temp as $$
declare live jsonb; total int; room int; f text; n int; got int; j public.career_apply_jobs;
begin
 if p_want is null or p_want not between 0 and 500 or p_global is null or p_global not between 1 and 10000
  or p_per_portal is null or p_per_portal not between 1 and 10000 then raise exception 'invalid dispatch limits'; end if;
 perform pg_advisory_xact_lock(hashtextextended('career-cloud-dispatch-v1', 0));
 live := public.career_apply_cloud_inflight(clock_timestamp());
 total := (live->>'total')::int;
 room := least(p_want, p_global - total);
 for f in select x from unnest(array['greenhouse', 'lever', 'ashby']) x order by (live->>x)::int, x loop
  exit when room <= 0;
  n := least(room, p_per_portal - (live->>f)::int);
  while n > 0 loop
   got := 0;
   for j in select * from public.career_apply_cloud_claim_portal_at(least(6, n), clock_timestamp(), f) loop
    got := got + 1;
    return next j;
   end loop;
   n := n - got;
   room := room - got;
   exit when got < 6;
  end loop;
 end loop;
end $$;

-- The numbers behind the fallback decision. A rate always comes with its counts.
create or replace function public.career_apply_cloud_check_rates(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n timestamptz := clock_timestamp(); d int := greatest(1, least(90, coalesce(p_days, 7))); out jsonb;
begin
 with ev as (
  select e.portal, lower(substring(j.url from '^https://([^/?#:@]+)')) as host, e.outcome
  from public.career_apply_cloud_events e join public.career_apply_jobs j on j.id = e.job_id
  where e.source = 'cloud' and e.outcome <> 'confirmed' and e.at > n - make_interval(days => d)
 ), quiet as (
  select lower(substring(url from '^https://([^/?#:@]+)')) as host, count(*) k from public.career_apply_jobs
  where source = 'cloud' and state = 'submitted_unconfirmed' and email_confirmed_at is null
   and claimed_at < n - interval '24 hours' and claimed_at > n - make_interval(days => d) group by 1
 ), by_host as (
  select portal, host, count(*) attempts, count(*) filter (where outcome = 'bot_check') bot_checks,
   count(*) filter (where outcome = 'submitted') submitted from ev group by portal, host
 )
 select jsonb_build_object('at', n, 'days', d,
  'portals', coalesce((select jsonb_agg(jsonb_build_object('portal', portal, 'attempts', a, 'bot_checks', b, 'submitted', s,
     'bot_check_rate', case when a > 0 then round(b::numeric / a, 4) end) order by portal)
    from (select portal, sum(attempts)::int a, sum(bot_checks)::int b, sum(submitted)::int s from by_host group by portal) p), '[]'),
  'hosts', coalesce((select jsonb_agg(jsonb_build_object('portal', h.portal, 'host', h.host, 'attempts', h.attempts,
     'bot_checks', h.bot_checks, 'submitted', h.submitted,
     'bot_check_rate', case when h.attempts > 0 then round(h.bot_checks::numeric / h.attempts, 4) end,
     'unconfirmed_after_24h', coalesce(q.k, 0)) order by h.portal, h.host)
    from by_host h left join quiet q on q.host = h.host), '[]'))
 into out;
 return out;
end $$;

revoke all on function public.career_apply_cloud_claim_portal_sql(), public.career_apply_cloud_claim_portal_install(),
 public.career_apply_cloud_runner_missing(), public.career_apply_cloud_inflight(timestamptz),
 public.career_apply_cloud_dispatch_claim(integer, integer, integer), public.career_apply_cloud_check_rates(integer)
 from public, anon, authenticated, service_role;
grant execute on function public.career_apply_cloud_runner_missing(), public.career_apply_cloud_inflight(timestamptz),
 public.career_apply_cloud_dispatch_claim(integer, integer, integer), public.career_apply_cloud_check_rates(integer) to service_role;
