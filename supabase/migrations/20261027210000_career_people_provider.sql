-- PEOPLE PROVIDER (D-MN-3, owner 2026-10-27): finding people at scale through a people/email data provider (Hunter.io or
-- Apollo, one adapter interface: supabase/functions/_shared/career_people_provider.ts), into the same career_people store
-- as the person's own sources (20261027010000_career_people.sql). Docs: docs/architect/PEOPLE-PROVIDER-2026-10-27.md.
--
--   career_people (extended)     source 'provider' joins; provider, provider_id, email_status, email_confidence,
--                                sendable, fetched_at, profile_text, same_as. sendable only when the provider itself
--                                verified the address (Hunter "valid", Apollo "verified"); never a guessed pattern.
--   career_provider_cache        one lookup (provider + normalized query: company, titles, seniority, location) shared
--                                by EVERY person: a company is looked up once for everyone inside the cache window.
--   career_provider_people       what that lookup returned (rows, not a blob), keyed to its cache entry. Holds no user id.
--   career_provider_jobs         the lookup queue: one active job per (provider, query) however many people asked;
--                                claimed with FOR UPDATE SKIP LOCKED leases by any number of workers; expired leases
--                                reclaimed; fair across people by virtual rank (one heavy person can't starve another).
--   career_provider_waiters      who is waiting for an active job; on completion each gets the rows copied, deduped.
--   career_provider_state        per provider: blocked_until, set only when the provider REFUSED (429 or out of
--                                credits), shared by every instance. Trainee sets no volume limit of its own (owner,
--                                2026-10-27 19:55: "no person limit, never set a limit").
--   career_provider_lookups      every lookup, API or cache, with HTTP calls, results and credits the provider reported:
--                                the owner's spend view (career_provider_spend).
--
-- Visibility: every table here is service-role only (RLS on, no policies, no grants to anon or authenticated). A person
-- sees provider people only through career_people rows copied for a request THEY made; the shared cache holds no user id.
-- Erase: "forget everything" (account epoch) deletes the person's provider rows with the rest of career_people (N1's
-- trigger) and, here, their waiters and their user id on the lookup ledger (the spend stays, unattributed); account
-- deletion cascades. Idempotent: if not exists / create or replace / drop ... if exists.

-- ---------------------------------------------------------------------------------------------- career_people, extended
alter table public.career_people drop constraint if exists career_people_source_check;
alter table public.career_people add constraint career_people_source_check check (source in ('linkedin_export', 'gmail', 'company_page', 'provider'));
alter table public.career_people add column if not exists provider text check (provider is null or provider in ('hunter', 'apollo'));
alter table public.career_people add column if not exists provider_id text check (provider_id is null or length(provider_id) between 1 and 300);
alter table public.career_people add column if not exists email_status text check (email_status is null or length(email_status) between 1 and 40);
alter table public.career_people add column if not exists email_confidence int check (email_confidence is null or email_confidence between 0 and 100);
alter table public.career_people add column if not exists sendable boolean not null default false;
alter table public.career_people add column if not exists fetched_at timestamptz;
-- A profile link the provider carried (e.g. a LinkedIn URL): kept as text only, never fetched, never a source_url.
alter table public.career_people add column if not exists profile_text text check (profile_text is null or length(profile_text) <= 600);
-- The person's own row this provider row is the same person as (an address the provider found for a contact who had none).
alter table public.career_people add column if not exists same_as bigint references public.career_people(id) on delete set null;
alter table public.career_people drop constraint if exists career_people_provider_shape;
alter table public.career_people add constraint career_people_provider_shape check (
  (source = 'provider') = (provider is not null and provider_id is not null and fetched_at is not null));
alter table public.career_people drop constraint if exists career_people_sendable_verified;
alter table public.career_people add constraint career_people_sendable_verified check (
  not sendable or (source = 'provider' and email is not null and email_status in ('valid', 'verified')));
alter table public.career_people_imports drop constraint if exists career_people_imports_source_check;
alter table public.career_people_imports add constraint career_people_imports_source_check check (source in ('linkedin_export', 'gmail', 'company_page', 'provider'));

-- The one name normalization both sides of a dedupe use (lower, apostrophes dropped, & as "and", punctuation and
-- whitespace runs to one space): "Alex O'Brien" and "alex  obrien" at the same firm are one person.
create or replace function public.career_people_name_key(p_name text, p_company_key text)
returns text language sql immutable parallel safe set search_path = pg_catalog, pg_temp as $$
  select case when p_name is null or btrim(p_name) = '' then null
    else btrim(regexp_replace(replace(translate(lower(p_name), '''’', ''), '&', ' and '), '[[:space:][:punct:]]+', ' ', 'g')) || '|' || coalesce(p_company_key, '') end
$$;
revoke all on function public.career_people_name_key(text, text) from public, anon, authenticated;
grant execute on function public.career_people_name_key(text, text) to service_role;
-- Indexed dedupe lookups (load-tested at 1M rows: tests/db/career_people_provider_scale.test.sql).
create index if not exists career_people_user_email on public.career_people (user_id, email) where email is not null;
create index if not exists career_people_user_name_key on public.career_people (user_id, public.career_people_name_key(name, company_key)) where name is not null;
create index if not exists career_people_provider_company on public.career_people (user_id, company_key, id) where source = 'provider';

-- ---------------------------------------------------------------------------------------------- the shared cache
create table if not exists public.career_provider_cache (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('hunter', 'apollo')),
  query_key text not null check (length(query_key) between 1 and 600),
  company text not null default '' check (length(company) <= 200),
  company_key text not null default '' check (length(company_key) <= 200),
  results int not null default 0 check (results >= 0),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (provider, query_key)
);
create table if not exists public.career_provider_people (
  id bigint generated always as identity primary key,
  cache_id bigint not null references public.career_provider_cache(id) on delete cascade,
  provider text not null check (provider in ('hunter', 'apollo')),
  provider_id text not null check (length(provider_id) between 1 and 300),
  name text not null check (length(name) between 1 and 200),
  email text check (email is null or (length(email) between 3 and 254 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  email_status text not null default 'none' check (length(email_status) between 1 and 40),
  email_confidence int check (email_confidence is null or email_confidence between 0 and 100),
  sendable boolean not null default false,
  company text not null default '' check (length(company) <= 200),
  company_key text not null default '' check (length(company_key) <= 200),
  position text not null default '' check (length(position) <= 300),
  location text not null default '' check (length(location) <= 200),
  source_ref text not null check (length(source_ref) between 1 and 600),
  source_url text check (source_url is null or (length(source_url) <= 2048 and source_url ~ '^https://')),
  profile_text text check (profile_text is null or length(profile_text) <= 600),
  check (not sendable or (email is not null and email_status in ('valid', 'verified'))),
  unique (cache_id, provider_id)
);
create index if not exists career_provider_people_cache on public.career_provider_people (cache_id, id);

-- ---------------------------------------------------------------------------------------------- the queue
create table if not exists public.career_provider_jobs (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('hunter', 'apollo')),
  query_key text not null check (length(query_key) between 1 and 600),
  query jsonb not null check (jsonb_typeof(query) = 'object' and octet_length(query::text) <= 8192),
  cache_seconds int not null check (cache_seconds >= 0),
  vrank bigint not null default 0,
  state text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed')),
  not_before timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  attempts int not null default 0 check (attempts >= 0),
  outcome text check (outcome is null or length(outcome) <= 300),
  cache_id bigint references public.career_provider_cache(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state <> 'running' or (lease_token is not null and lease_until is not null))
);
create unique index if not exists career_provider_jobs_active on public.career_provider_jobs (provider, query_key) where state in ('queued', 'running');
create index if not exists career_provider_jobs_claim on public.career_provider_jobs (vrank, id) where state = 'queued';
create index if not exists career_provider_jobs_lease on public.career_provider_jobs (lease_until) where state = 'running';
create table if not exists public.career_provider_waiters (
  job_id bigint not null references public.career_provider_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, user_id)
);
create index if not exists career_provider_waiters_user on public.career_provider_waiters (user_id, job_id);
create table if not exists public.career_provider_user_clock (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_rank bigint not null default 0
);
create table if not exists public.career_provider_state (
  provider text primary key check (provider in ('hunter', 'apollo')),
  blocked_until timestamptz,
  reason text check (reason is null or reason in ('rate_limited', 'out_of_credits')),
  detail text check (detail is null or length(detail) <= 300),
  updated_at timestamptz not null default now()
);
create table if not exists public.career_provider_lookups (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('hunter', 'apollo')),
  query_key text check (query_key is null or length(query_key) <= 600),
  company text not null default '' check (length(company) <= 200),
  kind text not null check (kind in ('api', 'cache')),
  http_calls int not null default 0 check (http_calls >= 0),
  results int not null default 0 check (results >= 0),
  credits numeric check (credits is null or credits >= 0),
  waiters int not null default 0 check (waiters >= 0),
  outcome text not null check (length(outcome) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists career_provider_lookups_time on public.career_provider_lookups (created_at, provider);
create index if not exists career_provider_lookups_user on public.career_provider_lookups (user_id) where user_id is not null;

alter table public.career_provider_cache enable row level security;
alter table public.career_provider_people enable row level security;
alter table public.career_provider_jobs enable row level security;
alter table public.career_provider_waiters enable row level security;
alter table public.career_provider_user_clock enable row level security;
alter table public.career_provider_state enable row level security;
alter table public.career_provider_lookups enable row level security;
revoke all on public.career_provider_cache, public.career_provider_people, public.career_provider_jobs, public.career_provider_waiters,
  public.career_provider_user_clock, public.career_provider_state, public.career_provider_lookups from public, anon, authenticated;
grant all on public.career_provider_cache, public.career_provider_people, public.career_provider_jobs, public.career_provider_waiters,
  public.career_provider_user_clock, public.career_provider_state, public.career_provider_lookups to service_role;

-- ---------------------------------------------------------------------------------------------- deliver (copy, deduped)
-- One cache entry's people into one person's career_people. Per row, against everything the person already has:
--   same email (any source)                                  -> already known, nothing written
--   same name at the same firm, and that row has an email    -> already known, nothing written
--   same name at the same firm, that row has no email, and the provider found one -> kept, linked (same_as) to it
--   the same provider person from an earlier lookup          -> refreshed in place (status, sendable, fetched_at)
--   otherwise                                                -> a new provider row
create or replace function public.career_provider_deliver(p_user uuid, p_cache bigint)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare r record; known_email bigint; known_name record; inserted int := 0; refreshed int := 0; known int := 0; linked int := 0; n int;
begin
  if p_user is null or p_cache is null then raise exception 'invalid provider delivery'; end if;
  perform pg_advisory_xact_lock(hashtextextended('career_people:' || p_user::text, 0));
  for r in select pp.*, c.fetched_at as c_fetched from career_provider_people pp join career_provider_cache c on c.id = pp.cache_id where pp.cache_id = p_cache order by pp.id loop
    -- the same provider person as before: refresh
    update career_people set email = r.email, email_status = r.email_status, email_confidence = r.email_confidence, sendable = r.sendable,
           position = r.position, fetched_at = r.c_fetched, retrieved_at = now(), source_ref = r.source_ref, source_url = r.source_url, profile_text = r.profile_text
     where user_id = p_user and source = 'provider' and dedupe_key = 'p:' || r.provider || ':' || r.provider_id;
    get diagnostics n = row_count;
    if n > 0 then refreshed := refreshed + 1; continue; end if;
    known_email := null;
    if r.email is not null then
      select id into known_email from career_people where user_id = p_user and email = r.email limit 1;
      if known_email is not null then known := known + 1; continue; end if;
    end if;
    select id, email into known_name from career_people
     where user_id = p_user and name is not null and career_people_name_key(name, company_key) = career_people_name_key(r.name, r.company_key)
     order by (source = 'provider'), id limit 1;
    if known_name.id is not null and (known_name.email is not null or r.email is null) then known := known + 1; continue; end if;
    insert into career_people (user_id, source, name, email, company, company_key, position, source_ref, source_url, dedupe_key, provider, provider_id,
                               email_status, email_confidence, sendable, fetched_at, profile_text, same_as)
    values (p_user, 'provider', r.name, r.email, r.company, r.company_key, r.position, r.source_ref, r.source_url, 'p:' || r.provider || ':' || r.provider_id,
            r.provider, r.provider_id, r.email_status, r.email_confidence, r.sendable, r.c_fetched, r.profile_text, known_name.id)
    on conflict (user_id, source, dedupe_key) do nothing;
    get diagnostics n = row_count;
    inserted := inserted + n;
    if n > 0 and known_name.id is not null then linked := linked + 1; end if;
  end loop;
  return jsonb_build_object('inserted', inserted, 'refreshed', refreshed, 'already_known', known, 'linked', linked);
end $$;
revoke all on function public.career_provider_deliver(uuid, bigint) from public, anon, authenticated;
grant execute on function public.career_provider_deliver(uuid, bigint) to service_role;

-- ---------------------------------------------------------------------------------------------- request
-- A person asks for one lookup. A fresh cache entry (anyone's earlier lookup inside its window): delivered now, recorded
-- as a cache lookup, no provider call. Otherwise the person waits on the one active job for that query (made if none),
-- ranked fairly: max(their own last rank + 1, the lowest rank still queued).
create or replace function public.career_provider_request(p_user uuid, p_provider text, p_query_key text, p_query jsonb, p_cache_seconds int)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare c record; j bigint; rank bigint; floor_rank bigint; d jsonb;
begin
  if p_user is null or p_provider not in ('hunter', 'apollo') or p_query_key is null or length(p_query_key) not between 1 and 600
     or jsonb_typeof(p_query) is distinct from 'object' or p_cache_seconds is null or p_cache_seconds < 0 then
    raise exception 'invalid provider request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('career_provider:' || p_provider || ':' || p_query_key, 0));
  select * into c from career_provider_cache where provider = p_provider and query_key = p_query_key and expires_at > now();
  if c.id is not null then
    d := career_provider_deliver(p_user, c.id);
    insert into career_provider_lookups (user_id, provider, query_key, company, kind, results, outcome)
    values (p_user, p_provider, p_query_key, c.company, 'cache', c.results, 'cache hit');
    return jsonb_build_object('state', 'cached', 'cache_id', c.id, 'company_key', c.company_key, 'fetched_at', c.fetched_at) || d;
  end if;
  select id into j from career_provider_jobs where provider = p_provider and query_key = p_query_key and state in ('queued', 'running');
  if j is null then
    select min(vrank) into floor_rank from career_provider_jobs where state = 'queued';
    insert into career_provider_user_clock (user_id, last_rank) values (p_user, 0) on conflict (user_id) do nothing;
    select greatest(last_rank + 1, coalesce(floor_rank, 0)) into rank from career_provider_user_clock where user_id = p_user for update;
    update career_provider_user_clock set last_rank = rank where user_id = p_user;
    insert into career_provider_jobs (provider, query_key, query, cache_seconds, vrank) values (p_provider, p_query_key, p_query, p_cache_seconds, rank)
    returning id into j;
  end if;
  insert into career_provider_waiters (job_id, user_id) values (j, p_user) on conflict do nothing;
  return jsonb_build_object('state', 'queued', 'job_id', j);
end $$;
revoke all on function public.career_provider_request(uuid, text, text, jsonb, int) from public, anon, authenticated;
grant execute on function public.career_provider_request(uuid, text, text, jsonb, int) to service_role;

-- ---------------------------------------------------------------------------------------------- claim / reclaim
-- Up to p_n queued jobs (a batch size for one worker, not a volume limit), lowest rank first, skipping rows another worker
-- holds and providers that refused (blocked_until in the future). p_user: only jobs that person waits on (the chat turn
-- runs its own asks first; the scheduled drain passes null). Each claim is its own lease.
create or replace function public.career_provider_claim(p_n int, p_lease_seconds int, p_user uuid default null)
returns setof public.career_provider_jobs language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_n is null or p_n < 1 or p_lease_seconds is null or p_lease_seconds < 1 then raise exception 'invalid provider claim'; end if;
  return query
  with pick as (
    select j.id from career_provider_jobs j
    where j.state = 'queued' and j.not_before <= now()
      and not exists (select 1 from career_provider_state s where s.provider = j.provider and s.blocked_until > now())
      and (p_user is null or exists (select 1 from career_provider_waiters w where w.job_id = j.id and w.user_id = p_user))
    order by j.vrank, j.id
    limit p_n
    for update of j skip locked
  )
  update career_provider_jobs j set state = 'running', lease_token = gen_random_uuid(), lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = j.attempts + 1, updated_at = now()
  from pick where j.id = pick.id
  returning j.*;
end $$;
revoke all on function public.career_provider_claim(int, int, uuid) from public, anon, authenticated;
grant execute on function public.career_provider_claim(int, int, uuid) to service_role;

-- A worker that died mid-lookup: its expired lease goes back to the queue (the same rank, so it isn't sent to the back).
create or replace function public.career_provider_reclaim()
returns int language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  with x as (select id from career_provider_jobs where state = 'running' and lease_until < now() for update skip locked)
  update career_provider_jobs j set state = 'queued', lease_token = null, lease_until = null, updated_at = now() from x where j.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.career_provider_reclaim() from public, anon, authenticated;
grant execute on function public.career_provider_reclaim() to service_role;

-- ---------------------------------------------------------------------------------------------- complete
-- The lookup's rows into the shared cache (replacing that query's earlier rows), the job done, every waiter's copy made,
-- one API row on the ledger. Only the lease holder completes it (exactly once): a stale or wrong lease changes nothing.
create or replace function public.career_provider_complete(p_job bigint, p_lease uuid, p_company text, p_company_key text, p_people jsonb,
  p_http_calls int, p_credits numeric)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare j career_provider_jobs; cid bigint; n int; w record; out jsonb := '[]'::jsonb; d jsonb; nw int;
begin
  if jsonb_typeof(p_people) is distinct from 'array' or p_job is null or p_lease is null then raise exception 'invalid provider completion'; end if;
  select * into j from career_provider_jobs where id = p_job;
  if j.id is null then return jsonb_build_object('state', 'lost_lease'); end if;
  perform pg_advisory_xact_lock(hashtextextended('career_provider:' || j.provider || ':' || j.query_key, 0));
  select * into j from career_provider_jobs where id = p_job and state = 'running' and lease_token = p_lease for update;
  if j.id is null then return jsonb_build_object('state', 'lost_lease'); end if;
  insert into career_provider_cache (provider, query_key, company, company_key, results, fetched_at, expires_at)
  values (j.provider, j.query_key, coalesce(p_company, ''), coalesce(p_company_key, ''), jsonb_array_length(p_people), now(), now() + make_interval(secs => j.cache_seconds))
  on conflict (provider, query_key) do update set company = excluded.company, company_key = excluded.company_key, results = excluded.results,
     fetched_at = excluded.fetched_at, expires_at = excluded.expires_at
  returning id into cid;
  delete from career_provider_people where cache_id = cid;
  insert into career_provider_people (cache_id, provider, provider_id, name, email, email_status, email_confidence, sendable, company, company_key, position, location,
                                      source_ref, source_url, profile_text)
  select cid, j.provider, r->>'provider_id', r->>'name', nullif(r->>'email', ''), coalesce(nullif(r->>'email_status', ''), 'none'), (r->>'email_confidence')::int,
         coalesce((r->>'sendable')::boolean, false), coalesce(r->>'company', ''), coalesce(r->>'company_key', ''), coalesce(r->>'position', ''), coalesce(r->>'location', ''),
         r->>'source_ref', nullif(r->>'source_url', ''), nullif(r->>'profile_text', '')
  from jsonb_array_elements(p_people) r
  on conflict (cache_id, provider_id) do nothing;
  get diagnostics n = row_count;
  update career_provider_cache set results = n where id = cid;
  update career_provider_jobs set state = 'done', cache_id = cid, outcome = 'found ' || n, lease_token = null, lease_until = null, updated_at = now() where id = j.id;
  select count(*) into nw from career_provider_waiters where job_id = j.id;
  insert into career_provider_lookups (provider, query_key, company, kind, http_calls, results, credits, waiters, outcome)
  values (j.provider, j.query_key, coalesce(p_company, ''), 'api', greatest(coalesce(p_http_calls, 0), 0), n, p_credits, nw, 'found ' || n);
  for w in select user_id from career_provider_waiters where job_id = j.id order by created_at loop
    d := career_provider_deliver(w.user_id, cid);
    out := out || jsonb_build_array(jsonb_build_object('user_id', w.user_id) || d);
  end loop;
  delete from career_provider_waiters where job_id = j.id;
  return jsonb_build_object('state', 'done', 'cache_id', cid, 'results', n, 'delivered', out);
end $$;
revoke all on function public.career_provider_complete(bigint, uuid, text, text, jsonb, int, numeric) from public, anon, authenticated;
grant execute on function public.career_provider_complete(bigint, uuid, text, text, jsonb, int, numeric) to service_role;

-- The provider refused or failed. rate_limited / out_of_credits: the provider is blocked for every instance until the
-- time it gave (the job back in the queue, same rank, no attempt spent). error: the job retries after p_retry_seconds, and
-- after p_fail_after failed attempts it is failed (said to its waiters). not_wired: failed at once (nothing to call).
create or replace function public.career_provider_fail(p_job bigint, p_lease uuid, p_kind text, p_detail text, p_retry_seconds int, p_http_calls int, p_fail_after int)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare j career_provider_jobs; final boolean;
begin
  if p_kind not in ('rate_limited', 'out_of_credits', 'error', 'not_wired') then raise exception 'invalid provider failure'; end if;
  select * into j from career_provider_jobs where id = p_job and state = 'running' and lease_token = p_lease for update;
  if j.id is null then return jsonb_build_object('state', 'lost_lease'); end if;
  if p_kind in ('rate_limited', 'out_of_credits') then
    insert into career_provider_state (provider, blocked_until, reason, detail, updated_at)
    values (j.provider, now() + make_interval(secs => greatest(coalesce(p_retry_seconds, 60), 1)), p_kind, left(p_detail, 300), now())
    on conflict (provider) do update set blocked_until = greatest(coalesce(career_provider_state.blocked_until, now()), excluded.blocked_until),
       reason = excluded.reason, detail = excluded.detail, updated_at = now();
    update career_provider_jobs set state = 'queued', attempts = greatest(attempts - 1, 0), lease_token = null, lease_until = null,
       not_before = now() + make_interval(secs => greatest(coalesce(p_retry_seconds, 60), 1)), outcome = p_kind, updated_at = now() where id = j.id;
    final := false;
  else
    final := p_kind = 'not_wired' or j.attempts >= greatest(coalesce(p_fail_after, 1), 1);
    update career_provider_jobs set state = case when final then 'failed' else 'queued' end, lease_token = null, lease_until = null,
       not_before = now() + make_interval(secs => greatest(coalesce(p_retry_seconds, 1), 1)), outcome = left(p_kind || ': ' || coalesce(p_detail, ''), 300), updated_at = now() where id = j.id;
  end if;
  insert into career_provider_lookups (provider, query_key, kind, http_calls, results, waiters, outcome)
  values (j.provider, j.query_key, 'api', greatest(coalesce(p_http_calls, 0), 0), 0, (select count(*) from career_provider_waiters where job_id = j.id), left(p_kind || coalesce(': ' || p_detail, ''), 300));
  return jsonb_build_object('state', case when final then 'failed' else 'queued' end);
end $$;
revoke all on function public.career_provider_fail(bigint, uuid, text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.career_provider_fail(bigint, uuid, text, text, int, int, int) to service_role;

-- ---------------------------------------------------------------------------------------------- reads
-- Where one person's asks stand: their waiting jobs (and why they wait) and the provider's refusal, if any.
create or replace function public.career_provider_status(p_user uuid, p_provider text)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'waiting', (select count(*) from career_provider_waiters w join career_provider_jobs j on j.id = w.job_id where w.user_id = p_user and j.state in ('queued', 'running')),
    'failed', (select coalesce(jsonb_agg(jsonb_build_object('job_id', j.id, 'outcome', j.outcome)), '[]'::jsonb) from career_provider_waiters w join career_provider_jobs j on j.id = w.job_id where w.user_id = p_user and j.state = 'failed'),
    'blocked_until', (select blocked_until from career_provider_state where provider = p_provider and blocked_until > now()),
    'blocked_reason', (select reason from career_provider_state where provider = p_provider and blocked_until > now()))
$$;
revoke all on function public.career_provider_status(uuid, text) from public, anon, authenticated;
grant execute on function public.career_provider_status(uuid, text) to service_role;

-- A person's people at these firms, provider rows and their own, one page at a time (keyset on id: indexed and bounded
-- per call; the caller pages for more). A provider row linked (same_as) to their own row is returned with it.
create or replace function public.career_provider_candidates(p_user uuid, p_keys text[], p_after bigint, p_page int)
returns setof jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select to_jsonb(x) from (
    select p.id, p.source, p.name, p.email, p.company, p.company_key, p.position, p.school, p.source_ref, p.source_url, p.provider, p.provider_id,
           p.email_status, p.email_confidence, p.sendable, p.fetched_at, p.same_as, p.connected_on
    from career_people p
    where p.user_id = p_user and p.company_key = any(p_keys) and p.id > coalesce(p_after, 0)
    order by p.id limit greatest(least(coalesce(p_page, 500), 5000), 1)) x
$$;
revoke all on function public.career_provider_candidates(uuid, text[], bigint, int) from public, anon, authenticated;
grant execute on function public.career_provider_candidates(uuid, text[], bigint, int) to service_role;

-- "Every company I applied to": the firms on the person's applications (career_apply_jobs, the ones that went out or are
-- going) and on their tracker (the account record's memory.tracker.rows[].company). Names only; no row is invented.
create or replace function public.career_provider_applied_companies(p_user uuid)
returns setof text language sql stable security invoker set search_path = public, pg_temp as $$
  select distinct on (lower(btrim(c))) btrim(c) from (
    select company as c from career_apply_jobs where user_id = p_user and state not in ('failed', 'not_submitted')
    union all
    select r->>'company' from career_watch_kv kv, jsonb_array_elements(case when jsonb_typeof(kv.value #> '{memory,tracker,rows}') = 'array' then kv.value #> '{memory,tracker,rows}' else '[]'::jsonb end) r
    where kv.user_id = p_user and kv.key = 'career:account'
  ) x where c is not null and btrim(c) <> '' and length(btrim(c)) <= 200
  order by lower(btrim(c))
$$;
revoke all on function public.career_provider_applied_companies(uuid) from public, anon, authenticated;
grant execute on function public.career_provider_applied_companies(uuid) to service_role;

-- The owner's spend: per provider and day, lookups that called the provider, the HTTP calls, the results, the credits the
-- provider reported (Apollo's credits_consumed; Hunter's responses carry none: null), and the cache hits that cost nothing.
create or replace function public.career_provider_spend(p_since timestamptz)
returns setof jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object('provider', provider, 'day', day,
    'api_lookups', count(*) filter (where kind = 'api'), 'http_calls', sum(http_calls), 'results', coalesce(sum(results) filter (where kind = 'api'), 0),
    'credits', sum(credits), 'cache_hits', count(*) filter (where kind = 'cache'), 'refusals', count(*) filter (where outcome like 'rate_limited%' or outcome like 'out_of_credits%'))
  from (select l.*, (l.created_at at time zone 'utc')::date as day from career_provider_lookups l where l.created_at >= p_since) x
  group by provider, day order by day, provider
$$;
revoke all on function public.career_provider_spend(timestamptz) from public, anon, authenticated;
grant execute on function public.career_provider_spend(timestamptz) to service_role;

-- "Forget the people you found for me": the person's provider rows, their waits, their name on the ledger.
create or replace function public.career_provider_forget(p_user uuid)
returns int language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  delete from career_people where user_id = p_user and source = 'provider';
  get diagnostics n = row_count;
  delete from career_people_imports where user_id = p_user and source = 'provider';
  delete from career_provider_waiters where user_id = p_user;
  update career_provider_lookups set user_id = null where user_id = p_user;
  if exists (select 1 from career_people where user_id = p_user and source = 'provider') then raise exception 'forget the provider people: rows remain'; end if;
  return n;
end $$;
revoke all on function public.career_provider_forget(uuid) from public, anon, authenticated;
grant execute on function public.career_provider_forget(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------- erase
-- "Forget everything" moves the account epoch; N1's trigger deletes career_people (provider rows included). This one
-- removes the person's waits and their user id on the lookup ledger.
create or replace function public.career_provider_on_erase() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if new.key = 'career:account' and coalesce((new.value->>'epoch')::bigint, 0) >
    (case when tg_op = 'UPDATE' then coalesce((old.value->>'epoch')::bigint, 0) else 0 end) then
  delete from public.career_people where user_id = new.user_id and source = 'provider';
  delete from public.career_provider_waiters where user_id = new.user_id;
  delete from public.career_provider_user_clock where user_id = new.user_id;
  update public.career_provider_lookups set user_id = null where user_id = new.user_id;
 end if;
 return new;
end $$;
revoke all on function public.career_provider_on_erase() from public, anon, authenticated;
drop trigger if exists career_provider_on_erase on public.career_watch_kv;
create trigger career_provider_on_erase after insert or update on public.career_watch_kv
 for each row when (new.key = 'career:account') execute function public.career_provider_on_erase();
