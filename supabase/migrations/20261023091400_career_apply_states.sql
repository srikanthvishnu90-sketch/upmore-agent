-- WO-091d: every application row ends, and says what is known about it (docs/architect/work-orders/WO-091d-apply-states.md).
--
-- Before this file a drive the browser extension began but never finished stayed 'driving' forever: no receipt, not in
-- tracking, still holding a place under the daily limit and the company rule, and a retry was refused with "You already
-- applied". A rejected or interrupted attempt was terminal, and a page that asked the person for a check after the click
-- (needs_user) could never be recorded as the person finished it.
--
-- What this file adds or redefines (additive, idempotent; no existing migration is edited):
--  - state 'interrupted': a drive that stopped before Trainee recorded a click. Nothing is known to have been sent.
--  - career_apply_sweep_own(): the person's own drives from the extension past their 30-minute lease end. With a click
--    reported (career_apply_clicked_own) they are unknown_outcome, never retried; without one, interrupted. The begin and
--    the enqueue run the same sweep first; career_apply_sweep_drives (below) runs it for everyone, every source.
--  - career_apply_clicked_own(id, lease): the extension says the site's Submit was clicked, after the click.
--  - career_apply_finish_own: as 20261020010000, and a finish the extension kept on the computer (offline, a closed
--    browser) lands after the sweep under the drive's own lease, once: what the page showed replaces the sweep's guess.
--  - career_apply_resolve_own(id): needs_user -> submitted_unconfirmed, the person finished it on the page themselves.
--  - career_apply_release_own(id): a failed attempt (the employer's form refused it in place) may be approved once more,
--    on the person's own tap; never by itself.
--  - career_apply_retriable(state, evidence): what a new approval of the same posting may replace: interrupted, a stop
--    before the click, a submit the browser itself refused, a released failure. Nothing else: the employer may have it.
--  - career_apply_counts(state): what holds a place under the daily limit and the company rule: queued, a drive (of any
--    age: age alone never frees a drive that may have reached the employer), sent (confirmed, submitted_unconfirmed) and
--    unknown. Never needs_user, interrupted, failed or not_submitted. A stale drive stops counting only when a sweep ends
--    it as interrupted (no click reported); swept as unknown it still counts.
--  - career_apply_enqueue: as 20261020050000, counting with career_apply_counts after sweeping the person's own stale
--    extension drives under the same lock (so a crashed attempt that never clicked is freed by the next yes, never by
--    age); duplicate_job names the row's state and id ("duplicate_job: failed <id>"), so the extension says what happened
--    and offers the person's own edge.
--  - career_apply_sweep_drives(): the scheduled service sweep (scripts/launch/schedule-career-proactive.sql, every 15
--    minutes), every person, every source: an extension drive as above; a worker's drive (own computer, cloud, email),
--    which reports no click, is unknown_outcome (it may have sent), the cloud's recorded in its telemetry as the cloud
--    claim does. Service only.
--  - career_apply_extension_begin_own: as 20261021120000, plus the sweep first, and career_apply_retriable for what may be
--    replaced. The same posting while its drive is live is still duplicate_job (WO-031).
--  - career_apply_extension_resume_own(payload, approval): the begin's answer was lost (offline, a restarted worker) and
--    the person approves the same card again: the same live drive and its lease, only for the same approval and only while
--    no click was reported. Anything else is refused.

alter table public.career_apply_jobs drop constraint if exists career_apply_jobs_state_check;
alter table public.career_apply_jobs add constraint career_apply_jobs_state_check check (state in ('queued', 'driving', 'confirmed',
 'submitted_unconfirmed', 'needs_user', 'failed', 'not_submitted', 'unknown_outcome', 'interrupted'));

create or replace function public.career_apply_retriable(p_state text, p_evidence jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
 select coalesce(p_state = 'interrupted'
  or (p_state = 'not_submitted' and (p_evidence->>'reason' = 'stopped before the click'
   or p_evidence->>'reason' like 'interrupted before the click%' or p_evidence->>'reason' like 'the browser refused the submit%'))
  or (p_state = 'failed' and p_evidence ? 'released_at'), false)
$$;

create or replace function public.career_apply_counts(p_state text) returns boolean
language sql immutable set search_path = pg_catalog as $$
 select coalesce(p_state in ('queued', 'driving', 'confirmed', 'submitted_unconfirmed', 'unknown_outcome'), false)
$$;

create or replace function public.career_apply_sweep_ext(p_user uuid, p_now timestamptz) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
 update public.career_apply_jobs set
  state = case when evidence ? 'click_reported_at' then 'unknown_outcome' else 'interrupted' end,
  reason = case when evidence ? 'click_reported_at'
   then 'application outcome unknown: the browser stopped after the click, before recording what the employer answered; not retried'
   else 'interrupted: the browser stopped before Trainee recorded a click; nothing is known to have been sent' end,
  evidence = evidence || jsonb_build_object('swept_at', p_now), updated_at = p_now
  where user_id = p_user and state = 'driving' and source = 'extension' and claimed_at < p_now - interval '30 minutes';
 get diagnostics n = row_count;
 return n;
end $$;

-- The scheduled sweep: every person's stale drives, every source, each person under their own lock (taken in user id
-- order, as the cloud claim does). A worker reports no click, so its stale drive may have sent: unknown, never retried.
create or replace function public.career_apply_sweep_drives() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n timestamptz := clock_timestamp(); u uuid; total integer := 0; j public.career_apply_jobs;
begin
 for u in select distinct user_id from public.career_apply_jobs where state = 'driving' and claimed_at < n - interval '30 minutes' order by user_id loop
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
  total := total + public.career_apply_sweep_ext(u, n);
  for j in update public.career_apply_jobs set state = 'unknown_outcome',
    reason = 'application outcome unknown: the drive stopped before recording it; not retried',
    evidence = evidence || jsonb_build_object('swept_at', n), updated_at = n
    where user_id = u and state = 'driving' and source is distinct from 'extension' and claimed_at < n - interval '30 minutes' returning * loop
   if j.source = 'cloud' then perform public.career_apply_cloud_record(j, 'error', 'unknown_outcome', n); end if;
   total := total + 1;
  end loop;
 end loop;
 return total;
end $$;

create or replace function public.career_apply_sweep_own() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'not signed in'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 return public.career_apply_sweep_ext(u, clock_timestamp());
end $$;

create or replace function public.career_apply_clicked_own(p_id uuid, p_lease uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'not signed in'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 update public.career_apply_jobs set evidence = evidence || jsonb_build_object('click_reported_at', clock_timestamp()), updated_at = clock_timestamp()
  where id = p_id and user_id = u and lease_token = p_lease and state = 'driving' and not (evidence ? 'click_reported_at');
 return found;
end $$;

create or replace function public.career_apply_finish_own(p_id uuid, p_lease uuid, p_state text, p_evidence jsonb default '{}')
returns public.career_apply_jobs language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); swept jsonb;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or octet_length(p_evidence::text) > 65536 then
  raise exception 'invalid apply evidence'; end if;
 if not exists (select from public.career_apply_jobs where id = p_id and user_id = u and lease_token = p_lease) then
  raise exception 'invalid apply claim'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 -- A finish the extension kept while the row was swept: the drive's own lease, once, from interrupted or unknown.
 update public.career_apply_jobs set state = 'driving', updated_at = clock_timestamp()
  where id = p_id and user_id = u and lease_token = p_lease and source = 'extension' and state in ('interrupted', 'unknown_outcome')
   and evidence ? 'swept_at'
  returning evidence->'swept_at' into swept;
 return public.career_apply_finish(p_id, p_lease, p_state,
  case when swept is null then p_evidence else p_evidence || jsonb_build_object('late_after_sweep', swept) end);
end $$;

create or replace function public.career_apply_resolve_own(p_id uuid) returns public.career_apply_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); j public.career_apply_jobs; n timestamptz := clock_timestamp();
begin
 if u is null then raise exception 'not signed in'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 update public.career_apply_jobs set state = 'submitted_unconfirmed', reason = 'finished by the person on the employer''s page',
  evidence = evidence || jsonb_build_object('finished_by', 'person', 'finished_at', n), updated_at = n
  where id = p_id and user_id = u and state = 'needs_user' returning * into j;
 if not found then raise exception 'invalid apply transition'; end if;
 return j;
end $$;

create or replace function public.career_apply_release_own(p_id uuid) returns public.career_apply_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); j public.career_apply_jobs; n timestamptz := clock_timestamp();
begin
 if u is null then raise exception 'not signed in'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 update public.career_apply_jobs set evidence = evidence || jsonb_build_object('released_at', n), updated_at = n
  where id = p_id and user_id = u and state = 'failed' and not (evidence ? 'released_at') returning * into j;
 if not found then raise exception 'invalid apply transition'; end if;
 return j;
end $$;

create or replace function public.career_apply_enqueue(p_payload jsonb,p_hash text,p_approval text,p_daily integer default 25)
returns public.career_apply_jobs language plpgsql set search_path=public,extensions,pg_temp as $$
declare u uuid:=(p_payload->>'user_id')::uuid; j public.career_apply_jobs; co text; prior public.career_apply_jobs; n timestamptz:=now();
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if p_payload->>'version' is distinct from '1' or nullif(p_payload->>'job_id','') is null or nullif(p_payload->>'company','') is null
 or coalesce(p_payload->>'url','') !~ '^https?://' or jsonb_typeof(p_payload->'fields') is distinct from 'array' or p_daily is null or p_daily not between 1 and 50
 or p_approval is distinct from p_hash or p_hash is distinct from encode(sha256(convert_to(public.career_apply_canonical(p_payload),'UTF8')),'hex')
 or public.career_apply_current(u,p_payload) is distinct from true then raise exception 'invalid or stale application approval'; end if;
 -- WO-091d (review of #128): the person's own stale extension drives end first, under this lock: one that never clicked is
 -- freed (interrupted), one that clicked stays counted (unknown). Age alone frees nothing.
 perform public.career_apply_sweep_ext(u, clock_timestamp());
 select * into prior from public.career_apply_jobs where user_id=u and job_id=p_payload->>'job_id';
 if found then raise exception 'duplicate_job: % %', prior.state, prior.id; end if;
 co:=public.career_apply_company_key(p_payload->>'company');
 if co<>'' and exists(select from public.career_apply_jobs where user_id=u and public.career_apply_counts(state) and created_at>n-interval '30 days'
 and public.career_apply_company_key(company)=co) then raise exception 'company_cooldown'; end if;
 if (select count(*) from public.career_apply_jobs where user_id=u and public.career_apply_counts(state) and created_at>n-interval '1 day')>=p_daily then raise exception 'daily_cap'; end if;
 insert into public.career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 values(u,p_payload->>'job_id',p_payload->>'company',p_payload->>'url',p_payload,p_hash,p_approval) returning * into j; return j;
end $$;

create or replace function public.career_apply_extension_begin_own(p_payload jsonb, p_approval text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare u uuid := auth.uid(); h text; j public.career_apply_jobs;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or p_payload->>'user_id' is distinct from u::text then raise exception 'not your application'; end if;
 if p_payload->>'source' is distinct from 'extension' or coalesce(p_payload->>'url', '') !~ '^https://' then raise exception 'invalid extension application'; end if;
 h := encode(sha256(convert_to(public.career_apply_canonical(p_payload), 'UTF8')), 'hex');
 if p_approval is null or p_approval is distinct from h then raise exception 'invalid or stale application approval'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 perform public.career_apply_sweep_ext(u, clock_timestamp());
 delete from public.career_apply_jobs where user_id = u and job_id = p_payload->>'job_id' and public.career_apply_retriable(state, evidence);
 j := public.career_apply_enqueue(p_payload, h, h, public.career_apply_daily_limit(u));
 update public.career_apply_jobs set state = 'driving', source = 'extension', attempts = 1, claimed_at = clock_timestamp(), lease_token = gen_random_uuid(),
  updated_at = clock_timestamp() where id = j.id returning * into j;
 return jsonb_build_object('id', j.id, 'lease', j.lease_token, 'payload_hash', j.payload_hash);
end $$;

create or replace function public.career_apply_extension_resume_own(p_payload jsonb, p_approval text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare u uuid := auth.uid(); h text; j public.career_apply_jobs;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or p_payload->>'user_id' is distinct from u::text then raise exception 'not your application'; end if;
 h := encode(sha256(convert_to(public.career_apply_canonical(p_payload), 'UTF8')), 'hex');
 if p_approval is null or p_approval is distinct from h then raise exception 'invalid or stale application approval'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 select * into j from public.career_apply_jobs where user_id = u and job_id = p_payload->>'job_id' and state = 'driving' and source = 'extension'
  and approval_hash = h and not (evidence ? 'click_reported_at') and claimed_at > clock_timestamp() - interval '30 minutes';
 if not found then raise exception 'nothing to resume'; end if;
 return jsonb_build_object('id', j.id, 'lease', j.lease_token, 'payload_hash', j.payload_hash, 'again', true);
end $$;

revoke all on function public.career_apply_retriable(text, jsonb), public.career_apply_counts(text),
 public.career_apply_sweep_ext(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.career_apply_retriable(text, jsonb), public.career_apply_counts(text),
 public.career_apply_sweep_ext(uuid, timestamptz) to service_role;
revoke all on function public.career_apply_sweep_drives() from public, anon, authenticated;
grant execute on function public.career_apply_sweep_drives() to service_role;
revoke all on function public.career_apply_enqueue(jsonb, text, text, integer) from public, anon, authenticated;
grant execute on function public.career_apply_enqueue(jsonb, text, text, integer) to service_role;
revoke all on function public.career_apply_sweep_own(), public.career_apply_clicked_own(uuid, uuid), public.career_apply_resolve_own(uuid),
 public.career_apply_release_own(uuid), public.career_apply_extension_begin_own(jsonb, text), public.career_apply_extension_resume_own(jsonb, text)
 from public, anon, authenticated, service_role;
grant execute on function public.career_apply_sweep_own(), public.career_apply_clicked_own(uuid, uuid), public.career_apply_resolve_own(uuid),
 public.career_apply_release_own(uuid), public.career_apply_extension_begin_own(jsonb, text), public.career_apply_extension_resume_own(jsonb, text)
 to authenticated;
revoke all on function public.career_apply_finish_own(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.career_apply_finish_own(uuid, uuid, text, jsonb) to authenticated;
