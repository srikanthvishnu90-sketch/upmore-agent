-- WO-039 (D-010, D-017, D-022): the cloud worker, gated in the database.
--
-- The cloud worker on the owner's VM (workers/career-cloud/) sends approved applications for people who turned it on, and
-- only on a portal family the owner has proven by hand: 3 applications on that family, each sent by a person's own
-- computer or extension (never the cloud), each confirmed by the employer's own email (WO-024's mail events). Below that,
-- the cloud claims nothing on that family (career_apply_cloud_open).
--
-- What this file adds:
--  - career_apply_jobs.source: who sent it ('own_computer' | 'extension' | 'cloud' | 'email'), set once by whoever claims
--    the row and never changed after. Contract for WO-031 (the extension claims with 'extension') and WO-032.
--  - career_apply_jobs.email_confirmed_at / confirmation_mail_hash: the employer's confirmation email, set only by
--    career_apply_confirm_by_mail from a 'received' mail event matched to this application (contract for WO-032).
--  - career_apply_record_own: a hand submission (the owner's terminal runs of scripts/apply.ts) recorded by the person.
--  - career_cloud_settings: CAREER_CLOUD_APPLY (the kill switch; anything but 'on' is off) and owner_user_id (who is told).
--  - career_apply_cloud_optin: the person's own yes in chat, with the terms they were shown; one text turns it off.
--  - career_apply_cloud_resumes: the approved resume the cloud uploads, by its hash, fetched per claimed job only.
--  - career_apply_cloud_events / career_apply_cloud_pauses: every outcome, per portal family and per person, and the
--    auto-throttle (a portal pauses 6 hours at 2% user-facing failures or 2 bot checks in its last 20 attempts; a person
--    pauses until tomorrow, UTC, at 2 bot checks in a day). The person and the owner are told once per pause.
--  - career_apply_cloud_claim / _finish / _resume / _report: the worker's only doors, service role only.
-- Every new table is service-role only: nothing here is read by the app, so nothing is added to the export.

-- ---------------------------------------------------------------------------------------------- who sent it
alter table public.career_apply_jobs add column if not exists source text;
alter table public.career_apply_jobs drop constraint if exists career_apply_jobs_source_check;
alter table public.career_apply_jobs add constraint career_apply_jobs_source_check
  check (source is null or source in ('own_computer', 'extension', 'cloud', 'email'));
alter table public.career_apply_jobs add column if not exists email_confirmed_at timestamptz;
alter table public.career_apply_jobs add column if not exists confirmation_mail_hash text;
alter table public.career_apply_jobs drop constraint if exists career_apply_jobs_mail_confirm_check;
alter table public.career_apply_jobs add constraint career_apply_jobs_mail_confirm_check
  check ((email_confirmed_at is null) = (confirmation_mail_hash is null)
    and (confirmation_mail_hash is null or confirmation_mail_hash ~ '^[a-f0-9]{64}$'));

-- The source is set once and the email confirmation once: a cloud submission can never be relabelled as a hand one.
create or replace function public.career_apply_jobs_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 if old.source is not null and new.source is distinct from old.source then raise exception 'source_fixed'; end if;
 if old.email_confirmed_at is not null and (new.email_confirmed_at is distinct from old.email_confirmed_at
   or new.confirmation_mail_hash is distinct from old.confirmation_mail_hash) then raise exception 'mail_confirmation_fixed'; end if;
 return new;
end $$;
drop trigger if exists career_apply_jobs_fixed on public.career_apply_jobs;
create trigger career_apply_jobs_fixed before update on public.career_apply_jobs
  for each row execute function public.career_apply_jobs_fixed();

-- The portal family of a posting link, the way the engine derives it (149 classifyTarget: the host, https only, no
-- user part). Anything else is null.
create or replace function public.career_apply_portal(p_url text) returns text
language sql immutable set search_path = pg_catalog as $$
 select case
  when h ~ '(^|\.)greenhouse\.io$' then 'greenhouse'
  when h ~ '(^|\.)lever\.co$' then 'lever'
  when h ~ '(^|\.)ashbyhq\.com$' then 'ashby'
  when h ~ '(^|\.)smartrecruiters\.com$' then 'smartrecruiters'
 end from (select lower(substring(p_url from '^https://([^/?#:@]+)(?::[0-9]+)?(?:[/?#]|$)')) as h) x
$$;

-- The employer's name as the queue compares it (career_apply_enqueue's own normalization).
create or replace function public.career_apply_company_key(p text) returns text
language sql immutable set search_path = pg_catalog as $$
 select trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(coalesce(p, '')), '&', ' and '), '[^a-z0-9 ]', ' ', 'g'),
  '\m(inc|llc|ltd|corp|corporation|co|company|the)\M', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- The own-computer claim (WO-021 W4) now records who sends it. Otherwise unchanged from 20261020010000.
create or replace function public.career_apply_claim_own(p_limit integer) returns setof public.career_apply_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); n timestamptz:=clock_timestamp();
begin
 if u is null then raise exception 'not signed in'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 update public.career_apply_jobs set state='unknown_outcome',
  reason='application outcome unknown: the drive stopped before recording it; not retried',
  evidence=evidence||jsonb_build_object('swept_at',n),updated_at=n
  where user_id=u and state='driving' and claimed_at<n-interval '15 minutes';
 return query
 with picked as (select id from public.career_apply_jobs where user_id=u and state='queued' and source is null
  and public.career_apply_current(user_id,payload) and approval_hash=payload_hash and attempts=0
  order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=n,lease_token=gen_random_uuid(),updated_at=n,source='own_computer'
  from picked where j.id=picked.id returning j.*;
end $$;

-- The 009b-1 pool claim has no caller and no gate. Anything it claims is the cloud's, so it can never open the gate.
create or replace function public.career_apply_claim(p_now timestamptz,p_limit integer) returns setof public.career_apply_jobs
language sql set search_path=public,pg_temp as $$
 with picked as (select id from public.career_apply_jobs where state='queued' and source is null and public.career_apply_current(user_id,payload)
 and approval_hash=payload_hash and attempts=0 and p_now is not null
 order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=p_now,lease_token=gen_random_uuid(),updated_at=p_now,source='cloud'
 from picked where j.id=picked.id returning j.*;
$$;

-- ---------------------------------------------------------------------------------------------- the gate
-- True only when at least 3 applications on this family were sent by a person's own computer or extension and each was
-- confirmed by the employer's own email: the application is 'confirmed', its mail confirmation is set, and the 'received'
-- mail event it names is still there for that person and application. A cloud submission never counts.
create or replace function public.career_apply_cloud_open(p_portal text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(p_portal in ('greenhouse', 'lever', 'ashby'), false) and (
  select count(*) from public.career_apply_jobs j
  where j.state = 'confirmed' and j.source in ('own_computer', 'extension') and j.email_confirmed_at is not null
   and public.career_apply_portal(j.url) = p_portal
   and exists (select from public.career_mail_events e where e.user_id = j.user_id and e.application_ref = 'job:' || j.id
    and e.kind = 'received' and not e.flagged and e.message_hash = j.confirmation_mail_hash)
 ) >= 3
$$;

-- The upgrade from the employer's email (contract for WO-032): a 'received' event WO-024 matched to this application
-- (application_ref job:<id>) turns a sent application into 'confirmed' with the mail's time and hash. Only an application
-- that went (sent, unknown, or confirmed on the page) is upgraded; once set, it is never changed.
create or replace function public.career_apply_confirm_by_mail(p_user uuid, p_job uuid, p_message_hash text)
returns public.career_apply_jobs language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.career_apply_jobs; e public.career_mail_events;
begin
 select * into e from public.career_mail_events where user_id = p_user and message_hash = p_message_hash
  and application_ref = 'job:' || p_job and kind = 'received' and not flagged;
 if not found then raise exception 'no_confirmation_mail'; end if;
 select * into j from public.career_apply_jobs where id = p_job and user_id = p_user for update;
 if not found then raise exception 'invalid application'; end if;
 if j.email_confirmed_at is not null then return j; end if;
 if j.state not in ('submitted_unconfirmed', 'unknown_outcome', 'confirmed') then raise exception 'not_sent'; end if;
 update public.career_apply_jobs set state = 'confirmed', email_confirmed_at = e.mail_at, confirmation_mail_hash = e.message_hash,
  updated_at = now() where id = p_job returning * into j;
 if j.source = 'cloud' then perform public.career_apply_cloud_record(j, 'confirmed', null, now()); end if;
 return j;
end $$;

-- A hand submission, recorded by the person who made it (the owner's terminal runs: scripts/apply.ts --person-submits,
-- then `approve-first.ts record <evidence folder>`). It counts toward the gate only after the employer's email confirms it.
create or replace function public.career_apply_record_own(p_job_id text, p_company text, p_url text, p_state text)
returns public.career_apply_jobs language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare u uuid := auth.uid(); p jsonb; h text; j public.career_apply_jobs; n timestamptz := clock_timestamp();
begin
 if u is null then raise exception 'not signed in'; end if;
 if nullif(btrim(coalesce(p_job_id, '')), '') is null or length(p_job_id) > 300 or nullif(btrim(coalesce(p_company, '')), '') is null
  or length(p_company) > 200 or public.career_apply_portal(p_url) is null or length(p_url) > 2000
  or p_state is null or p_state not in ('submitted_unconfirmed', 'confirmed', 'unknown_outcome') then
  raise exception 'invalid hand submission'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 if exists (select from public.career_apply_jobs where user_id = u and job_id = p_job_id) then raise exception 'duplicate_job'; end if;
 p := jsonb_build_object('version', 1, 'user_id', u, 'job_id', p_job_id, 'company', p_company, 'url', p_url, 'fields', '[]'::jsonb,
  'recorded', 'hand');
 h := encode(sha256(convert_to(public.career_apply_canonical(p), 'UTF8')), 'hex');
 insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, attempts, claimed_at,
  reason, source, updated_at)
 values (u, p_job_id, p_company, p_url, p, h, h, p_state, 1, n, 'recorded by hand', 'own_computer', n) returning * into j;
 return j;
end $$;

-- ---------------------------------------------------------------------------------------------- settings and opt-in
create table if not exists public.career_cloud_settings (
  key text primary key check (key in ('CAREER_CLOUD_APPLY', 'owner_user_id')),
  value text not null check (length(value) <= 200),
  updated_at timestamptz not null default now()
);
-- The kill switch: off until the owner sets CAREER_CLOUD_APPLY to 'on'; any other value is off.
create or replace function public.career_apply_cloud_enabled() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce((select value = 'on' from public.career_cloud_settings where key = 'CAREER_CLOUD_APPLY'), false)
$$;

create table if not exists public.career_apply_cloud_optin (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  -- The words the person said yes to, exactly as shown.
  terms text not null default '' check (length(terms) <= 1500),
  daily integer check (daily between 1 and 50),
  privacy_epoch bigint,
  turned_on_at timestamptz,
  turned_off_at timestamptz,
  updated_at timestamptz not null default now()
);

-- On: the terms the person said yes to, at their own daily limit (D-011: 25 by default, 50 at most), for their account as
-- it is now (an erase makes it lapse). Off: at once; the resume the cloud kept for them is removed with it.
create or replace function public.career_apply_cloud_optin_as(p_user uuid, p_on boolean, p_terms text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a jsonb; d int;
begin
 if p_user is null or p_on is null then raise exception 'invalid cloud opt-in'; end if;
 if p_on then
  if p_terms is null or length(btrim(p_terms)) not between 1 and 1500 then raise exception 'invalid cloud opt-in'; end if;
  select value into a from public.career_watch_kv where user_id = p_user and key = 'career:account';
  if a is null then raise exception 'no_account'; end if;
  if coalesce(a->>'paused', 'false') <> 'false' then raise exception 'account_paused'; end if;
  d := public.career_apply_daily_limit(p_user);
  insert into public.career_apply_cloud_optin (user_id, enabled, terms, daily, privacy_epoch, turned_on_at, updated_at)
  values (p_user, true, p_terms, d, coalesce((a->>'epoch')::bigint, 0), now(), now())
  on conflict (user_id) do update set enabled = true, terms = excluded.terms, daily = excluded.daily,
   privacy_epoch = excluded.privacy_epoch, turned_on_at = excluded.turned_on_at, updated_at = now();
  return jsonb_build_object('enabled', true, 'daily', d);
 end if;
 update public.career_apply_cloud_optin set enabled = false, turned_off_at = now(), updated_at = now() where user_id = p_user;
 delete from public.career_apply_cloud_resumes where user_id = p_user;
 return jsonb_build_object('enabled', false);
end $$;
create or replace function public.career_apply_cloud_optin_get(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce((select jsonb_build_object('enabled', enabled, 'daily', daily, 'terms', terms) from public.career_apply_cloud_optin
  where user_id = p_user), jsonb_build_object('enabled', false))
$$;

-- ---------------------------------------------------------------------------------------------- the resume
-- The approved resume, uploaded by the person's own computer when they turn the cloud on, kept by its hash. The worker
-- reads it only for a job it holds the lease on, and only the file that job was approved with.
create table if not exists public.career_apply_cloud_resumes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  filename text not null check (length(filename) between 1 and 200 and filename !~ '[/\\]' and filename !~ '^\.'),
  bytes bytea not null check (octet_length(bytes) between 1 and 5242880),
  privacy_epoch bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, sha256)
);
create or replace function public.career_apply_cloud_resume_put_own(p_filename text, p_b64 text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); b bytea; h text; a jsonb;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_b64 is null or length(p_b64) > 7200000 then raise exception 'invalid resume'; end if;
 b := decode(p_b64, 'base64');
 h := encode(sha256(b), 'hex');
 select value into a from public.career_watch_kv where user_id = u and key = 'career:account';
 if a is null then raise exception 'no_account'; end if;
 insert into public.career_apply_cloud_resumes (user_id, sha256, filename, bytes, privacy_epoch)
 values (u, h, p_filename, b, coalesce((a->>'epoch')::bigint, 0))
 on conflict (user_id, sha256) do update set filename = excluded.filename, bytes = excluded.bytes, privacy_epoch = excluded.privacy_epoch;
 return h;
end $$;

-- ---------------------------------------------------------------------------------------------- telemetry and throttle
create table if not exists public.career_apply_cloud_events (
  id bigserial primary key,
  job_id uuid references public.career_apply_jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  portal text not null check (portal in ('greenhouse', 'lever', 'ashby', 'smartrecruiters')),
  source text not null default 'cloud' check (source in ('own_computer', 'extension', 'cloud')),
  outcome text not null check (outcome in ('submitted', 'confirmed', 'bot_check', 'error', 'not_sent')),
  error_kind text check (error_kind is null or (length(error_kind) <= 80 and error_kind ~ '^[A-Za-z0-9_:. -]*$')),
  at timestamptz not null default now()
);
-- One attempt per application, and its email confirmation once.
create unique index if not exists career_apply_cloud_events_attempt on public.career_apply_cloud_events (job_id) where outcome <> 'confirmed';
create unique index if not exists career_apply_cloud_events_confirmed on public.career_apply_cloud_events (job_id) where outcome = 'confirmed';
create index if not exists career_apply_cloud_events_portal on public.career_apply_cloud_events (portal, id desc);
create index if not exists career_apply_cloud_events_user on public.career_apply_cloud_events (user_id, at);

create table if not exists public.career_apply_cloud_pauses (
  id bigserial primary key,
  scope text not null check (scope in ('portal', 'person')),
  portal text check (portal in ('greenhouse', 'lever', 'ashby', 'smartrecruiters')),
  user_id uuid references public.profiles(id) on delete cascade,
  reason text not null check (length(reason) between 1 and 300),
  until timestamptz not null,
  created_at timestamptz not null default now(),
  check ((scope = 'portal' and portal is not null and user_id is null) or (scope = 'person' and user_id is not null and portal is null))
);
create index if not exists career_apply_cloud_pauses_live on public.career_apply_cloud_pauses (scope, until);

-- The outbox learns "cloud" (a pause, said once: key cloud:pause:<pause id>). Every kind an earlier migration allows stays,
-- including "mock" (20261021020000, WO-035).
alter table public.career_outbox drop constraint if exists career_outbox_key_check;
alter table public.career_outbox add constraint career_outbox_key_check
  check (key ~ '^(alert|report|reply|receipt|card|status|followup|mock|cloud):.+$' and length(key) <= 310);
alter table public.career_outbox drop constraint if exists career_outbox_kind_check;
alter table public.career_outbox add constraint career_outbox_kind_check
  check (kind in ('alert', 'report', 'reply', 'receipt', 'card', 'status', 'followup', 'mock', 'cloud'));

create or replace function public.career_apply_cloud_tell(p_user uuid, p_key text, p_text text, p_now timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if p_user is null or not exists (select from auth.users where id = p_user) then return; end if;
 insert into public.career_outbox (user_id, key, kind, text, deliver_at) values (p_user, p_key, 'cloud', p_text, p_now)
 on conflict (user_id, key) do nothing;
end $$;

-- The throttle, run after every recorded outcome. A portal's window is its last 50 attempts since its last pause began
-- (a pause starts it afresh); a user-facing failure is a bot check or an error. 2% of the window, or 2 bot checks in its
-- last 20 attempts, pauses the portal for the cloud for 6 hours. 2 bot checks for one person in one UTC day pause that
-- person's cloud runs until the next UTC day. The person and the owner are told once per pause; the person's own
-- computer is never paused by this.
create or replace function public.career_apply_cloud_throttle(p_portal text, p_user uuid, p_now timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare since timestamptz; tries int; fails int; bots20 int; why text; pid bigint; owner uuid; bots_today int; nice text;
begin
 owner := nullif((select value from public.career_cloud_settings where key = 'owner_user_id'), '')::uuid;
 nice := initcap(p_portal);
 if not exists (select from public.career_apply_cloud_pauses where scope = 'portal' and portal = p_portal and until > p_now) then
  since := coalesce((select max(created_at) from public.career_apply_cloud_pauses where scope = 'portal' and portal = p_portal), '-infinity');
  select count(*), count(*) filter (where outcome in ('bot_check', 'error')) into tries, fails
   from (select outcome from public.career_apply_cloud_events where portal = p_portal and outcome <> 'confirmed' and at > since
         order by id desc limit 50) w;
  select count(*) filter (where outcome = 'bot_check') into bots20
   from (select outcome from public.career_apply_cloud_events where portal = p_portal and outcome <> 'confirmed' and at > since
         order by id desc limit 20) w;
  if bots20 >= 2 then why := format('bot_check_spike: %s bot checks in the last 20 attempts', bots20);
  elsif tries > 0 and fails * 100 >= 2 * tries then why := format('failure_rate: %s of the last %s attempts failed', fails, tries); end if;
  if why is not null then
   insert into public.career_apply_cloud_pauses (scope, portal, reason, until, created_at)
   values ('portal', p_portal, why, p_now + interval '6 hours', p_now) returning id into pid;
   perform public.career_apply_cloud_tell(p_user, 'cloud:pause:' || pid,
    'Trainee paused sending applications from the cloud on ' || nice || ' for 6 hours: recent attempts there hit a verification '
    || 'check or an error, and pausing protects your name with employers. Nothing you approved is lost. It waits, and your own '
    || 'computer can still send it.', p_now);
   perform public.career_apply_cloud_tell(owner, 'cloud:pause:' || pid,
    'Cloud apply paused on ' || nice || ' until ' || to_char((p_now + interval '6 hours') at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
    || ' UTC (' || replace(why, '_', ' ') || '). The cloud report has the counts (docs/launch/CLOUD-WORKER.md).', p_now);
  end if;
 end if;
 if p_user is not null and not exists (select from public.career_apply_cloud_pauses where scope = 'person' and user_id = p_user and until > p_now) then
  select count(*) into bots_today from public.career_apply_cloud_events where user_id = p_user and outcome = 'bot_check'
   and at >= date_trunc('day', p_now at time zone 'UTC') at time zone 'UTC';
  if bots_today >= 2 then
   insert into public.career_apply_cloud_pauses (scope, user_id, reason, until, created_at)
   values ('person', p_user, format('%s bot checks today', bots_today),
    (date_trunc('day', p_now at time zone 'UTC') + interval '1 day') at time zone 'UTC', p_now) returning id into pid;
   perform public.career_apply_cloud_tell(p_user, 'cloud:pause:' || pid,
    'Two employer sites showed a verification check to the cloud today, so Trainee stopped sending your applications from the '
    || 'cloud until tomorrow. That protects your name. Your own computer can still send them, and the ones that need you are '
    || 'waiting with their links.', p_now);
   perform public.career_apply_cloud_tell(owner, 'cloud:pause:' || pid,
    'Cloud apply paused for one person until tomorrow UTC (' || bots_today || ' bot checks today). The cloud report has the counts (docs/launch/CLOUD-WORKER.md).', p_now);
  end if;
 end if;
end $$;

create or replace function public.career_apply_cloud_record(j public.career_apply_jobs, p_outcome text, p_kind text, p_now timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare fam text := public.career_apply_portal(j.url);
begin
 if fam is null then return; end if;
 insert into public.career_apply_cloud_events (job_id, user_id, portal, source, outcome, error_kind, at)
 values (j.id, j.user_id, fam, coalesce(j.source, 'cloud'), p_outcome, left(p_kind, 80), p_now) on conflict do nothing;
 perform public.career_apply_cloud_throttle(fam, j.user_id, p_now);
end $$;

-- ---------------------------------------------------------------------------------------------- the worker's doors
-- Why the cloud may not claim this application now, or null when it may. Every limit is checked here, at claim time,
-- under the person's lock: the account as approved, the portal family, the gate, the person's opt-in for this account,
-- the portal's and the person's pause, their daily limit (the smaller of the one they agreed to and their current one),
-- and one per company per 30 days.
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
declare c record; j public.career_apply_jobs; got int := 0; lim int := greatest(0, least(6, coalesce(p_limit, 0)));
begin
 if p_now is null or not public.career_apply_cloud_enabled() then return; end if;
 -- An erase (a new privacy epoch) ends the opt-in and removes the resume the cloud kept.
 update public.career_apply_cloud_optin o set enabled = false, turned_off_at = p_now, updated_at = p_now from public.career_watch_kv a
  where o.enabled and a.user_id = o.user_id and a.key = 'career:account' and coalesce((a.value->>'epoch')::bigint, 0) <> o.privacy_epoch;
 delete from public.career_apply_cloud_resumes r using public.career_watch_kv a
  where a.user_id = r.user_id and a.key = 'career:account' and coalesce((a.value->>'epoch')::bigint, 0) <> r.privacy_epoch;
 -- A cloud drive that stopped without a result is unknown, an error in the telemetry, and never re-driven.
 for j in update public.career_apply_jobs set state = 'unknown_outcome',
   reason = 'application outcome unknown: the drive stopped before recording it; not retried',
   evidence = evidence || jsonb_build_object('swept_at', p_now), updated_at = p_now
   where source = 'cloud' and state = 'driving' and claimed_at < p_now - interval '15 minutes' returning * loop
  perform public.career_apply_cloud_record(j, 'error', 'unknown_outcome', p_now);
 end loop;
 for c in select id, user_id from public.career_apply_jobs where state = 'queued' and attempts = 0 and source is null
   and approval_hash = payload_hash order by created_at, id loop
  exit when got >= lim;
  perform pg_advisory_xact_lock(hashtextextended(c.user_id::text, 0));
  select * into j from public.career_apply_jobs where id = c.id and state = 'queued' for update skip locked;
  continue when not found;
  continue when public.career_apply_cloud_refusal(j, p_now) is not null;
  update public.career_apply_jobs set state = 'driving', attempts = 1, claimed_at = p_now, lease_token = gen_random_uuid(),
   updated_at = p_now, source = 'cloud' where id = j.id returning * into j;
  got := got + 1;
  return next j;
 end loop;
end $$;
create or replace function public.career_apply_cloud_claim(p_limit integer) returns setof public.career_apply_jobs
language sql security definer set search_path = public, pg_temp as $$ select * from public.career_apply_cloud_claim_at(p_limit, clock_timestamp()) $$;

-- The approved resume for one job the worker holds: its file name and bytes (base64), only when its hash is the one
-- that job was approved with and it belongs to the person's account as it is now.
create or replace function public.career_apply_cloud_resume(p_id uuid, p_lease uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare j public.career_apply_jobs; r public.career_apply_cloud_resumes;
begin
 select * into j from public.career_apply_jobs where id = p_id and lease_token = p_lease and state = 'driving' and source = 'cloud';
 if not found then raise exception 'invalid apply claim'; end if;
 select * into r from public.career_apply_cloud_resumes x where x.user_id = j.user_id and x.sha256 = j.payload->>'resume_sha256'
  and x.privacy_epoch = (j.payload->>'privacy_epoch')::bigint;
 if not found then return null; end if;
 return jsonb_build_object('filename', r.filename, 'sha256', r.sha256, 'b64', encode(r.bytes, 'base64'));
end $$;

-- The outcome of one cloud drive: the queue's final state (career_apply_finish), its telemetry, then the throttle.
-- The telemetry outcome must agree with the state: only a sent application is 'submitted', and a bot check is never one.
create or replace function public.career_apply_cloud_finish(p_id uuid, p_lease uuid, p_state text, p_evidence jsonb,
 p_outcome text, p_error_kind text default null) returns public.career_apply_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.career_apply_jobs; sent boolean := p_state in ('confirmed', 'submitted_unconfirmed');
begin
 if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or octet_length(p_evidence::text) > 65536 then
  raise exception 'invalid apply evidence'; end if;
 if not exists (select from public.career_apply_jobs where id = p_id and lease_token = p_lease and source = 'cloud') then
  raise exception 'invalid apply claim'; end if;
 if p_outcome is null or p_outcome not in ('submitted', 'bot_check', 'error', 'not_sent') or (p_outcome = 'submitted') <> sent
  or (p_outcome = 'bot_check' and p_state not in ('needs_user', 'not_submitted')) then raise exception 'invalid cloud outcome'; end if;
 j := public.career_apply_finish(p_id, p_lease, p_state, p_evidence);
 perform public.career_apply_cloud_record(j, p_outcome, p_error_kind, clock_timestamp());
 return j;
end $$;

-- The owner's report: per portal family, the gate, the pause, and every outcome with its count over the window, plus the
-- rolling failure rate (last 50 attempts since the last pause) and bot checks in the last 20; per person, their counts
-- and pause. Rates come with their counts, never alone.
create or replace function public.career_apply_cloud_report(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n timestamptz := clock_timestamp(); out_portals jsonb := '[]'; out_people jsonb; p text; since timestamptz; w record;
begin
 foreach p in array array['greenhouse', 'lever', 'ashby'] loop
  since := coalesce((select max(created_at) from public.career_apply_cloud_pauses where scope = 'portal' and portal = p), '-infinity');
  select count(*) as tries, count(*) filter (where outcome in ('bot_check', 'error')) as fails into w
   from (select outcome from public.career_apply_cloud_events where portal = p and outcome <> 'confirmed' and at > since order by id desc limit 50) x;
  out_portals := out_portals || jsonb_build_object(
   'portal', p,
   'gate_open', public.career_apply_cloud_open(p),
   'paused_until', (select max(until) from public.career_apply_cloud_pauses where scope = 'portal' and portal = p and until > n),
   'window_attempts', w.tries, 'window_failures', w.fails,
   'window_failure_rate', case when w.tries > 0 then round(w.fails::numeric / w.tries, 4) end,
   'bot_checks_last_20', (select count(*) filter (where outcome = 'bot_check') from (select outcome from public.career_apply_cloud_events
     where portal = p and outcome <> 'confirmed' and at > since order by id desc limit 20) y),
   'counts', (select coalesce(jsonb_object_agg(outcome, k), '{}') from (select outcome, count(*) k from public.career_apply_cloud_events
     where portal = p and at > n - make_interval(days => greatest(1, least(90, coalesce(p_days, 7)))) group by outcome) z),
   'errors', (select coalesce(jsonb_object_agg(kind, k), '{}') from (select coalesce(error_kind, 'unnamed') kind, count(*) k from public.career_apply_cloud_events
     where portal = p and outcome = 'error' and at > n - make_interval(days => greatest(1, least(90, coalesce(p_days, 7)))) group by 1) z));
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'counts', counts, 'paused_until',
   (select max(until) from public.career_apply_cloud_pauses q where q.scope = 'person' and q.user_id = s.user_id and q.until > n))), '[]')
  into out_people from (select user_id, jsonb_object_agg(outcome, k) counts from (select user_id, outcome, count(*) k
   from public.career_apply_cloud_events where at > n - make_interval(days => greatest(1, least(90, coalesce(p_days, 7))))
   group by user_id, outcome) t group by user_id) s;
 return jsonb_build_object('at', n, 'days', greatest(1, least(90, coalesce(p_days, 7))), 'kill_switch_on', public.career_apply_cloud_enabled(),
  'portals', out_portals, 'people', out_people);
end $$;

-- ---------------------------------------------------------------------------------------------- grants
alter table public.career_cloud_settings enable row level security;
alter table public.career_apply_cloud_optin enable row level security;
alter table public.career_apply_cloud_resumes enable row level security;
alter table public.career_apply_cloud_events enable row level security;
alter table public.career_apply_cloud_pauses enable row level security;
revoke all on public.career_cloud_settings, public.career_apply_cloud_optin, public.career_apply_cloud_resumes,
 public.career_apply_cloud_events, public.career_apply_cloud_pauses from public, anon, authenticated;
grant all on public.career_cloud_settings, public.career_apply_cloud_optin, public.career_apply_cloud_resumes,
 public.career_apply_cloud_events, public.career_apply_cloud_pauses to service_role;
grant usage, select on sequence public.career_apply_cloud_events_id_seq, public.career_apply_cloud_pauses_id_seq to service_role;

revoke all on function public.career_apply_jobs_fixed(), public.career_apply_claim_own(integer), public.career_apply_claim(timestamptz, integer),
 public.career_apply_cloud_open(text), public.career_apply_confirm_by_mail(uuid, uuid, text),
 public.career_apply_record_own(text, text, text, text), public.career_apply_cloud_enabled(), public.career_apply_cloud_optin_as(uuid, boolean, text),
 public.career_apply_cloud_optin_get(uuid), public.career_apply_cloud_resume_put_own(text, text),
 public.career_apply_cloud_tell(uuid, text, text, timestamptz), public.career_apply_cloud_throttle(text, uuid, timestamptz),
 public.career_apply_cloud_record(public.career_apply_jobs, text, text, timestamptz), public.career_apply_cloud_refusal(public.career_apply_jobs, timestamptz),
 public.career_apply_cloud_claim_at(integer, timestamptz), public.career_apply_cloud_claim(integer), public.career_apply_cloud_resume(uuid, uuid),
 public.career_apply_cloud_finish(uuid, uuid, text, jsonb, text, text), public.career_apply_cloud_report(integer)
 from public, anon, authenticated, service_role;
grant execute on function public.career_apply_portal(text), public.career_apply_company_key(text) to service_role;
grant execute on function public.career_apply_claim_own(integer), public.career_apply_record_own(text, text, text, text),
 public.career_apply_cloud_resume_put_own(text, text) to authenticated;
grant execute on function public.career_apply_claim(timestamptz, integer), public.career_apply_cloud_open(text),
 public.career_apply_confirm_by_mail(uuid, uuid, text), public.career_apply_cloud_enabled(), public.career_apply_cloud_optin_as(uuid, boolean, text),
 public.career_apply_cloud_optin_get(uuid), public.career_apply_cloud_claim(integer), public.career_apply_cloud_resume(uuid, uuid),
 public.career_apply_cloud_finish(uuid, uuid, text, jsonb, text, text), public.career_apply_cloud_report(integer) to service_role;
