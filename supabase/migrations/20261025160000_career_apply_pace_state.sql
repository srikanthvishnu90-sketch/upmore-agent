-- Absent, set, or unreadable: the person's pace in three states (SERIAL-1430, 2026-10-25). A stored daily_limit that is
-- present but not a pace ("lots", "1,000", "0x10", "-3", "0", "7.9", a number past what the integer columns hold) is not
-- permission for unlimited queueing and not a pace either: it is unreadable, and every path that reads the pace treats it
-- as unknown (the chat queues nothing and says how to fix it; the ledger refuses with 'pace_unreadable'). Only a missing
-- or null key is "no preference". A pace is a whole number from 1 to 2147483647 (int4, what career_apply_daily_limit
-- returns and career_apply_cloud_optin.daily holds); nothing is floored, saturated or otherwise silently changed, and
-- career_apply_pace_set refuses anything else at the point the person sets it. The pattern is the TypeScript PACE_RE,
-- character for character (tests/architect/pace-parse.test.ts reads it from this file).
-- NOT APPLIED: the owner applies migrations. After 20261025150000, which this replaces for career_apply_daily_limit and
-- extends for career_apply_ledger_refusal (20261025140000's text otherwise).

create or replace function public.career_apply_pace_state(p_user uuid) returns table (state text, pace integer, raw text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare PACE_RE constant text := '^\s*\+?[0-9]+\s*$'; r text; n numeric;
begin
 select value->>'daily_limit' into r from public.career_watch_kv where user_id = p_user and key = 'career:account';
 if r is null then return query select 'none'::text, null::integer, null::text; return; end if;
 if r !~ PACE_RE then return query select 'unreadable'::text, null::integer, r; return; end if;
 n := btrim(r)::numeric;
 if n < 1 or n > 2147483647 then return query select 'unreadable'::text, null::integer, r; return; end if;
 return query select 'set'::text, n::integer, r;
end $$;

-- The pace, or null when none is set or the stored value is unreadable (its callers that must tell the two apart ask
-- career_apply_pace_state).
create or replace function public.career_apply_daily_limit(p_user uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
 select s.pace from public.career_apply_pace_state(p_user) s where s.state = 'set'
$$;

-- The ledger refusal: an unreadable pace refuses before anything else is weighed; then 20261025140000's rule unchanged.
create or replace function public.career_apply_ledger_refusal(p_user uuid, p_company text, p_except text, p_now timestamptz, p_daily integer)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare co text := public.career_apply_company_key(p_company); st record;
begin
 select * into st from public.career_apply_pace_state(p_user);
 if st.state = 'unreadable' then return 'pace_unreadable'; end if;
 if co <> '' and exists (select from public.career_apply_ledger(p_user, p_now - interval '30 days') l
  where l.company_key = co and l.ref is distinct from p_except) then return 'company_cooldown'; end if;
 if st.state = 'set' and (select count(*) from public.career_apply_ledger(p_user, p_now - interval '1 day') l where l.ref is distinct from p_except) >= st.pace then
  return 'daily_cap'; end if;
 return null;
end $$;

-- The person sets or clears their pace. Only a whole number from 1 to 2147483647 is kept; 'none' (or null) clears it;
-- anything else is refused here, with the rule in the message, and nothing is stored. The account's epoch and version
-- are left as they are: a pace is not a fact approvals depend on.
create or replace function public.career_apply_pace_set(p_user uuid, p_pace text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare PACE_RE constant text := '^\s*\+?[0-9]+\s*$'; a jsonb; n numeric;
begin
 if p_user is null then raise exception 'invalid pace: no person'; end if;
 select value into a from public.career_watch_kv where user_id = p_user and key = 'career:account';
 a := coalesce(a, '{"version":0,"epoch":0}'::jsonb);
 if p_pace is null or lower(btrim(p_pace)) in ('none', 'no', 'off', 'clear') then
  a := a - 'daily_limit';
  insert into public.career_watch_kv (user_id, key, value) values (p_user, 'career:account', a)
   on conflict (user_id, key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('state', 'none', 'pace', null);
 end if;
 if p_pace !~ PACE_RE then raise exception 'invalid pace: a whole number from 1 to 2147483647, or none (got %)', p_pace; end if;
 n := btrim(p_pace)::numeric;
 if n < 1 or n > 2147483647 then raise exception 'invalid pace: a whole number from 1 to 2147483647, or none (got %)', p_pace; end if;
 a := a || jsonb_build_object('daily_limit', n::integer);
 insert into public.career_watch_kv (user_id, key, value) values (p_user, 'career:account', a)
  on conflict (user_id, key) do update set value = excluded.value, updated_at = now();
 return jsonb_build_object('state', 'set', 'pace', n::integer);
end $$;

-- The cloud: the same unknown stops the claim. 20261025140000's own-pace refusal with one check added; installed only
-- while the bridge draft is absent (the reconcile the launch scripts run calls this by name, so every apply order ends
-- with it). With the bridge installed the reconcile's merged text stands, as before.
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
 -- SERIAL-1430: a saved pace that cannot be read is unknown, never "no limit": the cloud claims nothing on it.
 if (select s.state from public.career_apply_pace_state(j.user_id) s) = 'unreadable' then return 'pace_unreadable'; end if;
 own := coalesce(o.daily, public.career_apply_daily_limit(j.user_id));
 if own is not null and (select count(*) from public.career_apply_jobs where user_id = j.user_id and state = any(went) and claimed_at > p_now - interval '1 day') >= own then
  return 'daily_limit'; end if;
 if co <> '' and exists (select from public.career_apply_ledger(j.user_id, p_now - interval '30 days') l
  where l.company_key = co and l.ref is distinct from j.id::text) then
  return 'company_cooldown'; end if;
 return null;
end $$;$body$;
end $op$;
select public.career_apply_reconcile_bridge();

revoke all on function public.career_apply_pace_state(uuid), public.career_apply_pace_set(uuid, text) from public, anon, authenticated;
grant execute on function public.career_apply_pace_state(uuid), public.career_apply_pace_set(uuid, text) to service_role;
