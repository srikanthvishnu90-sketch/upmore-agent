-- Backend gap map G3, executor side (2026-10-23): one approval, one cap, one 30-day ledger, unique confirmation IDs.
-- NOT APPLIED. Like every migration, the owner applies it; nothing here runs on the live project until then.
--
-- 1. The claim re-checks the approval. What the person approved (the payload, its hash, the approval's hash, the
--    person, the posting, the company, the link) never changes under the approval (career_apply_jobs_fixed). Every
--    claim closes, as not sent, a queued application whose payload no longer hashes to its approval
--    (career_apply_void_unsendable), and the cloud refuses one before any other check (career_apply_cloud_refusal).
-- 2. One cap. The person's own daily limit (career_apply_daily_limit) is the most any caller's limit can allow, and
--    one list of counted states (career_apply_counted_states) is the one TS reads too (career_apply.ts COUNTED_STATES).
-- 3. One 30-day ledger (career_apply_ledger): the queue, the extension's employer-confirmation reports, and the old
--    batch stack's submitted records. The queue, apply-by-email and the cloud read it at approval, and every claim
--    reads it again: an application whose company another path applied to after the approval is not sent.
-- 4. Unique confirmation IDs (D-024): an ID another employer's application or report already carries is never kept as
--    proof; what the page said is kept in the evidence (career_apply_jobs_confirmation).
-- Replaces, from their latest applied versions: career_apply_enqueue (20261020050000), career_apply_email_reserve_for
-- (20261021075000), career_apply_claim_own(integer, text), career_apply_claim and career_apply_jobs_fixed
-- (20261021080000), career_apply_cloud_refusal (20261024120000). Applying 20261024130000 (the draft bridge) after this
-- file would replace career_apply_claim_own again without these checks.

-- The hash an approval binds: the expression the queue has always checked at approval.
create or replace function public.career_apply_payload_hash(p jsonb) returns text
language sql immutable set search_path = public, pg_temp as $$
 select encode(sha256(convert_to(public.career_apply_canonical(p), 'UTF8')), 'hex')
$$;

-- The states that mean an application went, or may have gone, to the employer, or is approved to go.
create or replace function public.career_apply_counted_states() returns text[]
language sql immutable as $$
 select array['queued', 'driving', 'confirmed', 'submitted_unconfirmed', 'needs_user', 'unknown_outcome']
$$;

-- A confirmation ID as an employer means it: its letters and digits, upper case ("abc 12345" = "ABC-12345"); null when
-- it carries no digit.
create or replace function public.career_apply_confirmation_key(p text) returns text
language sql immutable set search_path = pg_catalog as $$
 select case when k ~ '[0-9]' and length(k) between 3 and 80 then k end
 from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) as k) x
$$;

-- The old batch stack's record times (module 149: epoch milliseconds or ISO text); anything else is null.
create or replace function public.career_apply_record_time(p text) returns timestamptz
language plpgsql stable set search_path = pg_catalog as $$
begin
 if p ~ '^[0-9]{13}$' then return to_timestamp(p::bigint / 1000.0); end if;
 if p ~ '^[0-9]{10}$' then return to_timestamp(p::bigint); end if;
 if p ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then return p::timestamptz; end if;
 return null;
exception when others then return null;
end $$;

-- One ledger: every application the person sent, may have sent, or approved to send, from every path, since p_since.
-- An extension report of a posting the queue already holds is that application, counted once.
create or replace function public.career_apply_ledger(p_user uuid, p_since timestamptz)
returns table (source text, ref text, company_key text, at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
 select 'queue', j.id::text, public.career_apply_company_key(j.company), j.created_at
  from public.career_apply_jobs j
  where j.user_id = p_user and j.state = any(public.career_apply_counted_states()) and j.created_at > p_since
 union all
 select 'extension', r.id::text, public.career_apply_company_key(r.employer), coalesce(r.observed_at, r.reported_at)
  from public.extension_submission_reports r
  where r.user_id = p_user and coalesce(r.observed_at, r.reported_at) > p_since
  and not exists (select from public.career_apply_jobs j where j.user_id = p_user and j.url = r.posting_url
   and j.state = any(public.career_apply_counted_states()))
 union all
 select 'batch', e->>'canonicalKey', public.career_apply_company_key(e->>'company'), public.career_apply_record_time(e->>'timestamp')
  from public.career_batch_ledgers_v1 l
  cross join lateral jsonb_array_elements(case when jsonb_typeof(l.records) = 'array' then l.records else '[]'::jsonb end) e
  where l.user_id = p_user and e->>'status' = 'submitted' and coalesce(e->>'userId', p_user::text) = p_user::text
  and public.career_apply_record_time(e->>'timestamp') > p_since
$$;

-- Why the ledger refuses one more application to p_company now (other than p_except): 'company_cooldown' (one per
-- company per 30 days, D-011), 'daily_cap' (the smaller of p_daily and the person's own limit, in 24 hours), or null.
create or replace function public.career_apply_ledger_refusal(p_user uuid, p_company text, p_except text, p_now timestamptz, p_daily integer)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare co text := public.career_apply_company_key(p_company);
 lim int := least(coalesce(p_daily, 50), public.career_apply_daily_limit(p_user));
begin
 if co <> '' and exists (select from public.career_apply_ledger(p_user, p_now - interval '30 days') l
  where l.company_key = co and l.ref is distinct from p_except) then return 'company_cooldown'; end if;
 if (select count(*) from public.career_apply_ledger(p_user, p_now - interval '1 day') l where l.ref is distinct from p_except) >= lim then
  return 'daily_cap'; end if;
 return null;
end $$;

-- Closes, as not sent, the queued applications (one person's, or everyone's for p_user null) that may no longer go:
-- the payload no longer hashes to what was approved, or another path applied to the same company since the approval.
create or replace function public.career_apply_void_unsendable(p_user uuid, p_now timestamptz) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare a int; b int;
begin
 update public.career_apply_jobs set state = 'not_submitted', reason = 'not sent: the application changed after it was approved',
  evidence = evidence || jsonb_build_object('closed_at', p_now, 'closed', 'approval_changed'), updated_at = p_now
  where (p_user is null or user_id = p_user) and state = 'queued' and source is null and attempts = 0
  and (approval_hash is distinct from payload_hash or payload_hash is distinct from public.career_apply_payload_hash(payload));
 get diagnostics a = row_count;
 update public.career_apply_jobs q set state = 'not_submitted',
  reason = 'not sent: you already applied to ' || q.company || ' in the last 30 days (recorded after you approved this one)',
  evidence = q.evidence || jsonb_build_object('closed_at', p_now, 'closed', 'company_cooldown'), updated_at = p_now
  where (p_user is null or q.user_id = p_user) and q.state = 'queued' and q.source is null and q.attempts = 0
  and public.career_apply_company_key(q.company) <> ''
  and exists (select from public.career_apply_ledger(q.user_id, p_now - interval '30 days') l
   where l.company_key = public.career_apply_company_key(q.company) and l.ref is distinct from q.id::text);
 get diagnostics b = row_count;
 return a + b;
end $$;

-- D-024: two different employers never share one confirmation ID. An ID another employer's application (anyone's) or
-- extension report already carries is not kept as proof; what the page said stays in the evidence.
create or replace function public.career_apply_jobs_confirmation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text := public.career_apply_confirmation_key(new.confirmation_id); co text := public.career_apply_company_key(new.company);
begin
 if k is null or (tg_op = 'UPDATE' and new.confirmation_id is not distinct from old.confirmation_id) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('career_apply_confirmation:' || k, 0));
 if exists (select from public.career_apply_jobs x where x.id <> new.id and public.career_apply_confirmation_key(x.confirmation_id) = k
     and public.career_apply_company_key(x.company) <> co)
  or exists (select from public.extension_submission_reports r where public.career_apply_confirmation_key(r.confirmation_id) = k
     and public.career_apply_company_key(r.employer) <> co) then
  new.evidence := coalesce(new.evidence, '{}'::jsonb) || jsonb_build_object('confirmation_id_conflict', new.confirmation_id);
  new.confirmation_id := null;
 end if;
 return new;
end $$;
drop trigger if exists career_apply_jobs_confirmation on public.career_apply_jobs;
create trigger career_apply_jobs_confirmation before insert or update of confirmation_id on public.career_apply_jobs
 for each row execute function public.career_apply_jobs_confirmation();
create index if not exists career_apply_jobs_confirmation_key on public.career_apply_jobs (public.career_apply_confirmation_key(confirmation_id))
 where confirmation_id is not null;
create index if not exists extension_submission_reports_confirmation_key
 on public.extension_submission_reports (public.career_apply_confirmation_key(confirmation_id)) where confirmation_id is not null;

create or replace function public.career_apply_jobs_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 if old.source is not null and new.source is distinct from old.source then raise exception 'source_fixed'; end if;
 -- A source is given by the claim that starts a drive, from queued, and by nothing else.
 if old.source is null and new.source is not null and old.state <> 'queued' then raise exception 'source_fixed'; end if;
 if old.email_confirmed_at is not null and (new.email_confirmed_at is distinct from old.email_confirmed_at
   or new.confirmation_mail_hash is distinct from old.confirmation_mail_hash) then raise exception 'mail_confirmation_fixed'; end if;
 -- G3: what the person approved never changes under the approval. The person, posting, company and link never change;
 -- the payload and its hashes change only when a refused application (not_submitted) is approved again, and then only
 -- to a payload that hashes to its new approval (career_apply_email_reserve_for's fresh yes).
 if new.user_id is distinct from old.user_id or new.job_id is distinct from old.job_id or new.company is distinct from old.company
  or new.url is distinct from old.url then
  raise exception 'approval_fixed: an application''s person, posting, company and link never change'; end if;
 if (new.payload is distinct from old.payload or new.payload_hash is distinct from old.payload_hash or new.approval_hash is distinct from old.approval_hash)
  and (old.state <> 'not_submitted' or new.payload_hash is distinct from public.career_apply_payload_hash(new.payload)
   or new.approval_hash is distinct from new.payload_hash) then
  raise exception 'approval_fixed: an approved application changes only by a new approval of one that was not sent'; end if;
 return new;
end $$;

create or replace function public.career_apply_enqueue(p_payload jsonb,p_hash text,p_approval text,p_daily integer default 25)
returns public.career_apply_jobs language plpgsql set search_path=public,extensions,pg_temp as $$
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
end $$;

create or replace function public.career_apply_email_reserve_for(p_user uuid, p_payload jsonb, p_hash text, p_now timestamptz)
returns public.career_apply_jobs language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare j public.career_apply_jobs; prior public.career_apply_jobs; card jsonb; why text;
begin
 if p_user is null or p_now is null or p_payload is null or p_payload->>'kind' is distinct from 'email' or p_payload->>'version' is distinct from '1'
  or p_payload->>'user_id' is distinct from p_user::text or nullif(p_payload->>'job_id', '') is null or nullif(p_payload->>'company', '') is null
  or coalesce(p_payload->>'url', '') !~ '^https?://'
  or coalesce(p_payload->>'to', '') !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$'
  or length(coalesce(p_payload->>'subject', '')) not between 1 and 200 or p_payload->>'subject' ~ '[\r\n]'
  or length(coalesce(p_payload->>'body', '')) not between 1 and 5000
  or coalesce(p_payload#>>'{attachment,sha256}', '') !~ '^[a-f0-9]{64}$'
  or p_payload ? 'cc' or p_payload ? 'bcc'
  or coalesce(p_hash, '') is distinct from public.career_apply_payload_hash(p_payload) then
  raise exception 'invalid email application'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
 select value into card from public.career_watch_kv where user_id = p_user and key = 'career:email-card' for update;
 if card is null or card->>'state' is distinct from 'shown' or card->>'payload_hash' is distinct from p_hash
  or (card->>'shown_at')::timestamptz < p_now - interval '24 hours' then raise exception 'changed_since_yes'; end if;
 -- One application per posting, except an emailed one Gmail refused (nothing went): a fresh yes may try it once more.
 select * into prior from public.career_apply_jobs where user_id = p_user and job_id = p_payload->>'job_id' for update;
 if found and not (prior.state = 'not_submitted' and prior.source = 'email') then raise exception 'duplicate_job'; end if;
 -- One ledger, one cap (G3): every path's applications, the person's own daily limit.
 why := public.career_apply_ledger_refusal(p_user, p_payload->>'company', null, p_now, null);
 if why is not null then raise exception '%', why; end if;
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
end $$;

create or replace function public.career_apply_cloud_refusal(j public.career_apply_jobs, p_now timestamptz) returns text
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
end $$;

create or replace function public.career_apply_claim_own(p_limit integer, p_source text) returns setof public.career_apply_jobs
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
end $$;

create or replace function public.career_apply_claim(p_now timestamptz,p_limit integer) returns setof public.career_apply_jobs
language sql set search_path=public,pg_temp as $$
 -- G3: close what no longer matches its approval, or whose company another path applied to, before handing anything out.
 select public.career_apply_void_unsendable(null, p_now) where p_now is not null;
 with picked as (select id from public.career_apply_jobs where state='queued' and source is null and public.career_apply_current(user_id,payload)
 and approval_hash=payload_hash and attempts=0 and p_now is not null
 and payload_hash=public.career_apply_payload_hash(payload)
 order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=p_now,lease_token=gen_random_uuid(),updated_at=p_now,source='cloud'
 from picked where j.id=picked.id returning j.*;
$$;

revoke all on function public.career_apply_ledger(uuid, timestamptz), public.career_apply_ledger_refusal(uuid, text, text, timestamptz, integer),
 public.career_apply_void_unsendable(uuid, timestamptz), public.career_apply_jobs_confirmation() from public, anon, authenticated;
grant execute on function public.career_apply_ledger(uuid, timestamptz), public.career_apply_ledger_refusal(uuid, text, text, timestamptz, integer),
 public.career_apply_void_unsendable(uuid, timestamptz) to service_role;
