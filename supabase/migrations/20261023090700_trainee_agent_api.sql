-- WO-097: other agents act for the person (Codex, the person's own AI agent), with the person's grant.
--
-- If the person can do a task, an agent acting for them should be able to. Until now an outside agent had no way to read
-- the person's confirmed facts, saved answers, resume or approved applications, so it failed. This file adds:
--
--  - trainee_agent_grants: one row per agent the person allowed: a label, the scopes they chose, created, last used,
--    revoked. Only the SHA-256 of the token is stored; the token itself is returned once, by the mint, and never again.
--    Scopes: read_profile, read_answers, read_resume, read_approved_applications, report_submission.
--  - trainee_agent_calls: every call an agent made with a known token (allowed or refused), ids only: the grant, the
--    person, the operation, the outcome, the application id when there is one. No fact, answer, payload or file here.
--  - The person's own doors (their session; the person is auth.uid(), never an argument): mint, revoke, list grants, read
--    the calls. Nobody reads the tables directly.
--  - The agent's doors (service role only; the edge function trainee-agent-api calls them with the SHA-256 of the bearer
--    token, never with a user id): each one resolves the grant from the token hash, refuses a revoked token, a missing
--    scope or a 61st call in a minute, writes the call to the audit, and only then reads that grant's own person's rows.
--    No door takes a user id, so no door can reach another person.
--      get_profile          confirmed facts only (a fact waiting for the person's yes is never returned)
--      get_saved_answers    the answers the person gave to application questions (career_apply_questions, answered)
--      get_resume           the approved resume kept for the person (by hash), or a tailored one stored for them
--      list_approved        approved applications whose approval is still current, with the exact payload and its hash
--      begin_submission     claims one approved application for the agent (like the extension's begin): the payload
--                           hash must be the approved one, and the approval must still be current
--      report_submission    the agent's outcome on an application it claimed: submitted or blocked, with evidence
--    None of them creates, changes or widens an approval, and none of them writes a fact (D-007): approving stays the
--    person's own act, on their card.
--  - career_apply_jobs.source learns 'agent' (who sent it). The hand-submission gate (career_apply_gate_status) counts
--    own_computer and extension only, so an agent's submission never opens the cloud gate.
--  - Never LinkedIn or Indeed (owner rule): an approved application whose link, or the address its payload submits to, is
--    on LinkedIn or Indeed is never listed to an agent and never claimed by one (trainee_agent_host_forbidden, on the
--    parsed host). The person applies there themselves.
--  - An erase ("forget my career profile" raises the privacy epoch) revokes every grant the person made.
-- Additive and idempotent: new tables and functions, a widened check, one trigger.

-- ------------------------------------------------------------------------------------------------ the grants
create table if not exists public.trainee_agent_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  label text not null check (length(label) between 1 and 80),
  scopes text[] not null check (cardinality(scopes) between 1 and 5
    and scopes <@ array['read_profile', 'read_answers', 'read_resume', 'read_approved_applications', 'report_submission']::text[]),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  -- Refusals past twice the rate limit in one minute are counted here instead of written as rows (a flood never grows
  -- the audit table without bound).
  unlogged_refusals bigint not null default 0 check (unlogged_refusals >= 0)
);
create index if not exists trainee_agent_grants_user on public.trainee_agent_grants (user_id, created_at);

create table if not exists public.trainee_agent_calls (
  id bigserial primary key,
  grant_id uuid not null references public.trainee_agent_grants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  op text not null check (op in ('get_profile', 'get_saved_answers', 'get_resume', 'download_resume', 'list_approved_applications',
    'begin_submission', 'report_submission')),
  outcome text not null check (outcome in ('ok', 'revoked', 'scope', 'rate_limited', 'invalid', 'not_found', 'hash_mismatch',
    'not_ready', 'stale', 'forbidden_host')),
  application_id uuid,
  at timestamptz not null default now()
);
create index if not exists trainee_agent_calls_grant on public.trainee_agent_calls (grant_id, at);
create index if not exists trainee_agent_calls_user on public.trainee_agent_calls (user_id, at);

alter table public.trainee_agent_grants enable row level security;
alter table public.trainee_agent_calls enable row level security;
revoke all on public.trainee_agent_grants, public.trainee_agent_calls from public, anon, authenticated;
grant all on public.trainee_agent_grants, public.trainee_agent_calls to service_role;
revoke all on sequence public.trainee_agent_calls_id_seq from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------ who sent it: 'agent'
alter table public.career_apply_jobs drop constraint if exists career_apply_jobs_source_check;
alter table public.career_apply_jobs add constraint career_apply_jobs_source_check
  check (source is null or source in ('own_computer', 'extension', 'cloud', 'email', 'agent'));

-- ------------------------------------------------------------------------------------------------ never LinkedIn or Indeed
-- The host of a link, parsed (scheme, then the authority up to the first / ? # or backslash, without a user part, port or
-- trailing dot, lower case), is forbidden when one of its labels is "linkedin" or "indeed" followed by more labels
-- (www.linkedin.com, uk.indeed.com, indeed.co.uk, www.linkedin.com.evil.com), or it is lnkd.in or under it. A host that
-- only contains the word (notlinkedin.com) or a query string naming them is not. No readable host fails closed.
create or replace function public.trainee_agent_host_forbidden(p_url text) returns boolean
language sql immutable set search_path = pg_catalog as $$
 select coalesce(h = '' or h ~ '(^|\.)(linkedin|indeed)\.' or h ~ '(^|\.)lnkd\.in$', true)
 from (select rtrim(lower(regexp_replace(regexp_replace(substring(p_url from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#\\]*)'), '^.*@', ''),
   ':[0-9]*$', '')), '.') as h) x
$$;
-- An application is forbidden when its link or any address its payload names (url, destination, apply_url, posting_url) is.
create or replace function public.trainee_agent_job_forbidden(p_url text, p_payload jsonb) returns boolean
language sql immutable set search_path = public, pg_catalog as $$
 select public.trainee_agent_host_forbidden(p_url) or exists (select from unnest(array[p_payload->>'url', p_payload->>'destination',
  p_payload->>'apply_url', p_payload->>'posting_url']) u where u is not null and public.trainee_agent_host_forbidden(u))
$$;

-- ------------------------------------------------------------------------------------------------ the person's doors
-- Mint: the raw token is made here (three gen_random_uuid() values, about 366 random bits; pgcrypto is not assumed),
-- returned once, and only its SHA-256 is stored. At most 10 live grants a person.
create or replace function public.trainee_agent_grant_mint_own(p_label text, p_scopes text[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); lbl text := btrim(coalesce(p_label, '')); sc text[]; tok text; g public.trainee_agent_grants;
begin
 if u is null then raise exception 'not signed in'; end if;
 if not exists (select from public.profiles where id = u) then raise exception 'no profile'; end if;
 if length(lbl) not between 1 and 80 or lbl ~ '[[:cntrl:]]' then raise exception 'invalid label'; end if;
 if p_scopes is null or cardinality(p_scopes) = 0 or exists (select from unnest(p_scopes) s where s is null
   or s not in ('read_profile', 'read_answers', 'read_resume', 'read_approved_applications', 'report_submission')) then
  raise exception 'invalid scopes'; end if;
 sc := array(select distinct s from unnest(p_scopes) s order by s);
 perform pg_advisory_xact_lock(hashtextextended('trainee_agent_grants:' || u::text, 0));
 if (select count(*) from public.trainee_agent_grants where user_id = u and revoked_at is null) >= 10 then
  raise exception 'too many agent grants'; end if;
 tok := 'tra_' || translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
   || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=' || chr(10), '-_');
 insert into public.trainee_agent_grants (user_id, token_hash, label, scopes)
 values (u, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), lbl, sc) returning * into g;
 return jsonb_build_object('id', g.id, 'token', tok, 'label', g.label, 'scopes', to_jsonb(g.scopes), 'created_at', g.created_at);
end $$;

-- Revoke: true when this call revoked it, false when it was revoked already. Another person's grant is "not your grant".
create or replace function public.trainee_agent_grant_revoke_own(p_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); r timestamptz;
begin
 if u is null then raise exception 'not signed in'; end if;
 select revoked_at into r from public.trainee_agent_grants where id = p_id and user_id = u for update;
 if not found then raise exception 'not your grant'; end if;
 if r is not null then return false; end if;
 update public.trainee_agent_grants set revoked_at = clock_timestamp() where id = p_id and user_id = u;
 return true;
end $$;

-- The person's grants, never the hash.
create or replace function public.trainee_agent_grants_own()
returns table (id uuid, label text, scopes text[], created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
 if auth.uid() is null then raise exception 'not signed in'; end if;
 return query select g.id, g.label, g.scopes, g.created_at, g.last_used_at, g.revoked_at from public.trainee_agent_grants g
  where g.user_id = auth.uid() order by g.created_at desc, g.id;
end $$;

-- What the person's agents did, newest first.
create or replace function public.trainee_agent_calls_own(p_limit integer default 100)
returns table (grant_id uuid, op text, outcome text, application_id uuid, at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
 if auth.uid() is null then raise exception 'not signed in'; end if;
 return query select c.grant_id, c.op, c.outcome, c.application_id, c.at from public.trainee_agent_calls c
  where c.user_id = auth.uid() order by c.at desc, c.id desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- ------------------------------------------------------------------------------------------------ the gate of every agent call
-- One grant, one operation, one scope. Refusals are returned (never raised), so the audit row they write is kept.
-- 60 calls a minute a grant, refused calls included.
create or replace function public.trainee_agent_enter_grant(p_grant uuid, p_op text, p_scope text, p_application uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.trainee_agent_grants; n integer; cid bigint; refusal text;
begin
 perform pg_advisory_xact_lock(hashtextextended('trainee_agent_grant:' || coalesce(p_grant::text, ''), 0));
 select * into g from public.trainee_agent_grants where id = p_grant for update;
 if not found then return jsonb_build_object('ok', false, 'refusal', 'unauthorized'); end if;
 select count(*) into n from public.trainee_agent_calls where grant_id = g.id and at > clock_timestamp() - interval '1 minute';
 refusal := case when g.revoked_at is not null then 'revoked' when n >= 60 then 'rate_limited'
  when not (p_scope = any(g.scopes)) then 'scope' end;
 if refusal is not null then
  if n < 120 then
   insert into public.trainee_agent_calls (grant_id, user_id, op, outcome, application_id) values (g.id, g.user_id, p_op, refusal, p_application);
  else
   update public.trainee_agent_grants set unlogged_refusals = unlogged_refusals + 1 where id = g.id;
  end if;
  return jsonb_build_object('ok', false, 'refusal', refusal, 'grant_id', g.id);
 end if;
 update public.trainee_agent_grants set last_used_at = clock_timestamp() where id = g.id;
 insert into public.trainee_agent_calls (grant_id, user_id, op, outcome, application_id) values (g.id, g.user_id, p_op, 'ok', p_application)
  returning id into cid;
 return jsonb_build_object('ok', true, 'grant_id', g.id, 'user_id', g.user_id, 'call_id', cid);
end $$;

create or replace function public.trainee_agent_enter(p_token_hash text, p_op text, p_scope text, p_application uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare gid uuid;
begin
 if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok', false, 'refusal', 'unauthorized'); end if;
 select id into gid from public.trainee_agent_grants where token_hash = p_token_hash;
 if not found then return jsonb_build_object('ok', false, 'refusal', 'unauthorized'); end if;
 return public.trainee_agent_enter_grant(gid, p_op, p_scope, p_application);
end $$;

-- An allowed call that the operation itself then refused: its audit row says why.
create or replace function public.trainee_agent_refuse(p_entered jsonb, p_refusal text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
 update public.trainee_agent_calls set outcome = p_refusal where id = (p_entered->>'call_id')::bigint;
 return jsonb_build_object('ok', false, 'refusal', p_refusal, 'grant_id', p_entered->'grant_id');
end $$;

-- ------------------------------------------------------------------------------------------------ the agent's doors
-- Confirmed facts only. The person's facts live on their career threads (agent_flow_state.state.career.stores.profile);
-- each fact is taken once, at its newest thread, and returned only if that newest copy is confirmed: a fact confirmed
-- once and then edited back to a draft is not returned.
create or replace function public.trainee_agent_get_profile(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; u uuid; facts jsonb;
begin
 e := public.trainee_agent_enter(p_token_hash, 'get_profile', 'read_profile', null);
 if not (e->>'ok')::boolean then return e; end if;
 u := (e->>'user_id')::uuid;
 with threads as (
   select s.state, s.updated_at from public.agent_flow_state s
   where s.user_id = u and s.state #>> '{career,scope,userId}' = u::text order by s.updated_at desc limit 50),
 every_fact as (
   select x.f, row_number() over (order by t.updated_at desc, x.i) as ord
   from threads t cross join lateral jsonb_array_elements(case when jsonb_typeof(t.state #> '{career,stores,profile,facts}') = 'array'
     then t.state #> '{career,stores,profile,facts}' else '[]'::jsonb end) with ordinality as x(f, i)
   where jsonb_typeof(x.f) = 'object'),
 newest as (
   select distinct on (coalesce(f->>'id', md5(f::text))) f, ord from every_fact order by coalesce(f->>'id', md5(f::text)), ord)
 select coalesce(jsonb_agg(f order by ord), '[]'::jsonb) into facts from (
   select f, ord from newest
   where coalesce(f->>'needs_confirmation', 'false') = 'false' and coalesce(f->>'status', 'confirmed') = 'confirmed'
   order by ord limit 500) c;
 return jsonb_build_object('ok', true, 'grant_id', e->'grant_id', 'facts', facts);
end $$;

-- The answers the person gave to application questions, each with how far it travels (key: fact: every employer,
-- label: one exact wording, job: one posting).
create or replace function public.trainee_agent_get_saved_answers(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; u uuid; rows_ jsonb;
begin
 e := public.trainee_agent_enter(p_token_hash, 'get_saved_answers', 'read_answers', null);
 if not (e->>'ok')::boolean then return e; end if;
 u := (e->>'user_id')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'key', q.key, 'kind', q.kind, 'label', q.label, 'type', q.type, 'options', q.options,
   'answer', q.answer, 'answered_at', q.answered_at, 'job_ids', to_jsonb(q.job_ids), 'company', q.company) order by q.answered_at, q.id), '[]'::jsonb)
  into rows_ from public.career_apply_questions q where q.user_id = u and q.state = 'answered' and q.answer is not null;
 return jsonb_build_object('ok', true, 'grant_id', e->'grant_id', 'answers', rows_);
end $$;

-- The resume: the approved file kept for the person at their current privacy epoch (the newest, or the one with this
-- hash), else a tailored PDF stored for them under that hash. Never the bytes here: the edge function hands out a link
-- valid for 5 minutes, and the kept file's link comes back through trainee_agent_resume_download.
create or replace function public.trainee_agent_get_resume(p_token_hash text, p_sha256 text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; u uuid; ep bigint; r record;
begin
 e := public.trainee_agent_enter(p_token_hash, 'get_resume', 'read_resume', null);
 if not (e->>'ok')::boolean then return e; end if;
 u := (e->>'user_id')::uuid;
 if p_sha256 is not null and p_sha256 !~ '^[a-f0-9]{64}$' then return public.trainee_agent_refuse(e, 'invalid'); end if;
 select coalesce((value->>'epoch')::bigint, 0) into ep from public.career_watch_kv where user_id = u and key = 'career:account';
 select x.sha256, x.filename, octet_length(x.bytes) as size into r from public.career_apply_cloud_resumes x
  where x.user_id = u and x.privacy_epoch = coalesce(ep, 0) and (p_sha256 is null or x.sha256 = p_sha256)
  order by x.created_at desc limit 1;
 if found then
  return jsonb_build_object('ok', true, 'grant_id', e->'grant_id', 'resume',
   jsonb_build_object('source', 'kept', 'sha256', r.sha256, 'filename', r.filename, 'bytes', r.size));
 end if;
 if p_sha256 is not null and exists (select from storage.objects o where o.bucket_id = 'career-resumes' and o.name = u::text || '/' || p_sha256 || '.pdf') then
  return jsonb_build_object('ok', true, 'grant_id', e->'grant_id', 'resume',
   jsonb_build_object('source', 'tailored', 'sha256', p_sha256, 'filename', p_sha256 || '.pdf', 'path', u::text || '/' || p_sha256 || '.pdf'));
 end if;
 return public.trainee_agent_refuse(e, 'not_found');
end $$;

-- The signed link's download: by grant id (the link carries it, signed by the edge function), re-checked here, so a
-- grant revoked after the link was made downloads nothing.
create or replace function public.trainee_agent_resume_download(p_grant uuid, p_sha256 text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; u uuid; ep bigint; r public.career_apply_cloud_resumes;
begin
 e := public.trainee_agent_enter_grant(p_grant, 'download_resume', 'read_resume', null);
 if not (e->>'ok')::boolean then return e; end if;
 u := (e->>'user_id')::uuid;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then return public.trainee_agent_refuse(e, 'invalid'); end if;
 select coalesce((value->>'epoch')::bigint, 0) into ep from public.career_watch_kv where user_id = u and key = 'career:account';
 select * into r from public.career_apply_cloud_resumes x where x.user_id = u and x.sha256 = p_sha256 and x.privacy_epoch = coalesce(ep, 0);
 if not found then return public.trainee_agent_refuse(e, 'not_found'); end if;
 return jsonb_build_object('ok', true, 'grant_id', e->'grant_id', 'filename', r.filename, 'sha256', r.sha256, 'b64', encode(r.bytes, 'base64'));
end $$;

-- Approved applications an agent may send now: queued, not claimed by any worker, approved by the exact hash of the stored
-- payload, and still current (the account is not paused, its privacy epoch and version are the approval's, and the
-- approval has not expired). The exact payload and its hash, as the person approved them.
create or replace function public.trainee_agent_list_approved(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare e jsonb; u uuid; rows_ jsonb;
begin
 e := public.trainee_agent_enter(p_token_hash, 'list_approved_applications', 'read_approved_applications', null);
 if not (e->>'ok')::boolean then return e; end if;
 u := (e->>'user_id')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'job_id', j.job_id, 'company', j.company, 'url', j.url, 'payload', j.payload,
   'payload_hash', j.payload_hash, 'resume_sha256', j.resume_sha256, 'approved_at', j.created_at, 'expires_at', j.payload->>'expires_at')
   order by j.created_at, j.id), '[]'::jsonb) into rows_
  from (select * from public.career_apply_jobs x where x.user_id = u and x.state = 'queued' and x.source is null and x.attempts = 0
   and x.approval_hash = x.payload_hash
   and x.payload_hash = encode(sha256(convert_to(public.career_apply_canonical(x.payload), 'UTF8')), 'hex')
   and public.career_apply_current(u, x.payload) and not public.trainee_agent_job_forbidden(x.url, x.payload)
   order by x.created_at, x.id limit 50) j;
 return jsonb_build_object('ok', true, 'grant_id', e->'grant_id', 'applications', rows_);
end $$;

-- The agent claims one approved application before it submits (as the extension's begin): only with the approved
-- payload's exact hash, only while the approval is current, only a row no worker holds, never on LinkedIn or Indeed. One
-- attempt; a drive the agent never reports is marked unknown after 15 minutes and never re-driven.
create or replace function public.trainee_agent_begin_submission(p_token_hash text, p_application uuid, p_payload_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare e jsonb; u uuid; j public.career_apply_jobs; n timestamptz := clock_timestamp();
begin
 e := public.trainee_agent_enter(p_token_hash, 'begin_submission', 'report_submission', p_application);
 if not (e->>'ok')::boolean then return e; end if;
 u := (e->>'user_id')::uuid;
 if p_application is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then return public.trainee_agent_refuse(e, 'invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 update public.career_apply_jobs set state = 'unknown_outcome',
  reason = 'application outcome unknown: the agent stopped before recording it; not retried',
  evidence = evidence || jsonb_build_object('swept_at', n), updated_at = n
  where user_id = u and state = 'driving' and source = 'agent' and claimed_at < n - interval '15 minutes';
 select * into j from public.career_apply_jobs where id = p_application and user_id = u for update;
 if not found then return public.trainee_agent_refuse(e, 'not_found'); end if;
 if public.trainee_agent_job_forbidden(j.url, j.payload) then return public.trainee_agent_refuse(e, 'forbidden_host'); end if;
 if p_payload_hash is distinct from j.payload_hash or j.approval_hash is distinct from j.payload_hash
  or p_payload_hash is distinct from encode(sha256(convert_to(public.career_apply_canonical(j.payload), 'UTF8')), 'hex') then
  return public.trainee_agent_refuse(e, 'hash_mismatch'); end if;
 if j.state <> 'queued' or j.source is not null or j.attempts <> 0 then return public.trainee_agent_refuse(e, 'not_ready'); end if;
 if public.career_apply_current(u, j.payload) is distinct from true then return public.trainee_agent_refuse(e, 'stale'); end if;
 update public.career_apply_jobs set state = 'driving', source = 'agent', attempts = 1, claimed_at = n, lease_token = gen_random_uuid(),
  evidence = evidence || jsonb_build_object('agent_grant_id', e->>'grant_id'), updated_at = n
  where id = j.id returning * into j;
 return jsonb_build_object('ok', true, 'grant_id', e->'grant_id', 'application_id', j.id, 'lease', j.lease_token, 'payload_hash', j.payload_hash);
end $$;

-- The agent's outcome on the application it claimed, recorded like every drive (career_apply_finish): 'submitted' is
-- submitted_unconfirmed until the employer's email confirms it (a page's confirmation is kept as evidence), 'blocked' is
-- needs_user with the agent's reason. Only the grant that claimed it, with its lease and the approved payload's hash.
create or replace function public.trainee_agent_report_submission(p_token_hash text, p_application uuid, p_lease uuid, p_payload_hash text,
  p_outcome text, p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; u uuid; j public.career_apply_jobs; ev jsonb; st text; why text;
begin
 e := public.trainee_agent_enter(p_token_hash, 'report_submission', 'report_submission', p_application);
 if not (e->>'ok')::boolean then return e; end if;
 u := (e->>'user_id')::uuid;
 ev := coalesce(p_evidence, '{}'::jsonb);
 why := btrim(coalesce(ev->>'reason', ''));
 if p_application is null or p_lease is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
  or p_outcome is null or p_outcome not in ('submitted', 'blocked') or jsonb_typeof(ev) <> 'object' or octet_length(ev::text) > 16384
  or (ev ? 'reason' and jsonb_typeof(ev->'reason') <> 'string') or length(why) > 300
  or (p_outcome = 'blocked' and length(why) = 0)
  or (ev ? 'confirmation_id' and (jsonb_typeof(ev->'confirmation_id') <> 'string' or length(ev->>'confirmation_id') not between 1 and 200))
  or (ev ? 'page_confirmation' and jsonb_typeof(ev->'page_confirmation') <> 'boolean') then
  return public.trainee_agent_refuse(e, 'invalid'); end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 select * into j from public.career_apply_jobs where id = p_application and user_id = u for update;
 if not found then return public.trainee_agent_refuse(e, 'not_found'); end if;
 if p_payload_hash is distinct from j.payload_hash or j.approval_hash is distinct from j.payload_hash then
  return public.trainee_agent_refuse(e, 'hash_mismatch'); end if;
 if j.state <> 'driving' or j.source is distinct from 'agent' or j.lease_token is distinct from p_lease
  or j.evidence->>'agent_grant_id' is distinct from e->>'grant_id' then return public.trainee_agent_refuse(e, 'not_ready'); end if;
 st := case when p_outcome = 'blocked' then 'needs_user' when ev->'page_confirmation' = 'true'::jsonb then 'confirmed' else 'submitted_unconfirmed' end;
 ev := ev || jsonb_build_object('source', 'agent', 'agent_grant_id', e->>'grant_id', 'agent_outcome', p_outcome,
  'reason', case when p_outcome = 'blocked' then 'blocked: ' || why when why <> '' then why else 'submitted by the person''s agent' end);
 j := public.career_apply_finish(j.id, p_lease, st, ev);
 return jsonb_build_object('ok', true, 'grant_id', e->'grant_id', 'application_id', j.id, 'state', j.state);
end $$;

-- ------------------------------------------------------------------------------------------------ an erase revokes every grant
create or replace function public.trainee_agent_on_erase() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if new.key = 'career:account' and coalesce((new.value->>'epoch')::bigint, 0) >
    (case when tg_op = 'UPDATE' then coalesce((old.value->>'epoch')::bigint, 0) else 0 end) then
  update public.trainee_agent_grants set revoked_at = clock_timestamp() where user_id = new.user_id and revoked_at is null;
 end if;
 return new;
end $$;
drop trigger if exists trainee_agent_on_erase on public.career_watch_kv;
create trigger trainee_agent_on_erase after insert or update on public.career_watch_kv
 for each row when (new.key = 'career:account') execute function public.trainee_agent_on_erase();

-- ------------------------------------------------------------------------------------------------ who may call what
revoke all on function public.trainee_agent_grant_mint_own(text, text[]), public.trainee_agent_grant_revoke_own(uuid),
 public.trainee_agent_grants_own(), public.trainee_agent_calls_own(integer),
 public.trainee_agent_enter_grant(uuid, text, text, uuid), public.trainee_agent_enter(text, text, text, uuid),
 public.trainee_agent_refuse(jsonb, text), public.trainee_agent_get_profile(text), public.trainee_agent_get_saved_answers(text),
 public.trainee_agent_get_resume(text, text), public.trainee_agent_resume_download(uuid, text), public.trainee_agent_list_approved(text),
 public.trainee_agent_begin_submission(text, uuid, text), public.trainee_agent_report_submission(text, uuid, uuid, text, text, jsonb),
 public.trainee_agent_on_erase(), public.trainee_agent_host_forbidden(text), public.trainee_agent_job_forbidden(text, jsonb)
 from public, anon, authenticated, service_role;
grant execute on function public.trainee_agent_grant_mint_own(text, text[]), public.trainee_agent_grant_revoke_own(uuid),
 public.trainee_agent_grants_own(), public.trainee_agent_calls_own(integer) to authenticated;
grant execute on function public.trainee_agent_get_profile(text), public.trainee_agent_get_saved_answers(text),
 public.trainee_agent_get_resume(text, text), public.trainee_agent_resume_download(uuid, text), public.trainee_agent_list_approved(text),
 public.trainee_agent_begin_submission(text, uuid, text), public.trainee_agent_report_submission(text, uuid, uuid, text, text, jsonb)
 to service_role;
