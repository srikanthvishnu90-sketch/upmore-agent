-- Backend gap map G4 (D-011): an application is prepared before the person asks. NOT APPLIED: like every migration, the
-- owner applies it; nothing here runs on the live project until then.
--
-- A posting the person's job alerts already sent them (career_outbox 'alert:<job_id>') is prepared on the server, by the
-- prepare-ahead worker (workers/career-browser/prepare-ahead.ts), with the person's own confirmed answers and the resume
-- tailored to it, into the same career_apply_prepared row their card reads. Nothing is approved, queued or sent here:
-- their card, and their one text, decide (D-014). A posting that asks what no confirmed fact answers is asked of them
-- once (career_apply_questions_put_for), before they ask.
--
-- 1. career_apply_prepare_candidates(p_now, p_per_person, p_limit): the alerted postings worth preparing. A posting is a
--    candidate when it was alerted to the person in the last 14 days, is still open, their account exists and is not
--    paused, no application to it was queued, nothing was prepared for it, it was not tried in the last 7 days
--    (career_apply_prepare_attempts), and the one 30-day ledger does not already hold its company. A posting whose try
--    stopped on questions is a candidate again as soon as the person has answered every one of them. Newest alert
--    first, at most p_per_person a person and p_limit in all.
-- 2. career_apply_prepare_for(p_user, p_posting_job_id, p_payload, p_card_lines): career_apply_prepare_own's checks for
--    the service role on the person's behalf. The payload must be theirs and current; it is stored for their card.
-- 3. career_apply_prepare_ask_for(p_user, p_posting_job_id, p_engine_job_id, p_questions): the questions a try stopped
--    on, stored for the person (career_apply_questions_put_for, ask once), and the try recorded as 'asked'.
--    career_apply_prepare_attempt_for(p_user, p_posting_job_id, p_outcome, p_detail, p_prepared, p_engine_job_id): what
--    one try came to (ready, asked, refused, no_resume, error), so a posting is retried once a week at most and a try is
--    never silent.
-- 4. career_apply_answers_for(p_user): the person's own answers to asked questions (career_apply_answers_own for the
--    service role), the confirmed facts a server-side preparation may use beside what their profile holds.
-- 5. The cover letter drafted ahead (career_apply_question_drafts): when a posting asks for a cover letter typed into a
--    text box, the worker drafts one from the person's confirmed facts (essay_draft.ts, the chat's own drafter) and keeps
--    it beside that open question (career_apply_question_draft_put_for). It is never their answer: the chat shows it whole
--    when they ask for it ("draft 2") and only their "use 2" saves it (career_apply_questions.ts), after which the posting
--    is prepared again with it. career_apply_question_drafts_as(p_user, p_ids) reads the drafts of their open questions.

create table if not exists public.career_apply_prepare_attempts (
 user_id uuid not null references public.profiles(id) on delete cascade,
 posting_job_id text not null check (length(posting_job_id) between 1 and 300),
 outcome text not null check (outcome in ('ready', 'asked', 'refused', 'no_resume', 'error')),
 detail text check (detail is null or length(detail) <= 500),
 prepared_id uuid references public.career_apply_prepared(id) on delete set null,
 engine_job_id text check (engine_job_id is null or length(engine_job_id) between 1 and 300),
 at timestamptz not null default now(),
 primary key (user_id, posting_job_id)
);
alter table public.career_apply_prepare_attempts enable row level security;
revoke all on public.career_apply_prepare_attempts from public, anon, authenticated;

create or replace function public.career_apply_prepare_candidates(p_now timestamptz, p_per_person integer, p_limit integer)
returns table (user_id uuid, job_id text, company text, title text, url text, location text, description text, epoch bigint, version bigint)
language sql stable security definer set search_path = public, pg_temp as $$
 with a as (
  select o.user_id, substr(o.key, 7) as job_id, max(o.created_at) as alerted_at
  from public.career_outbox o
  where o.kind = 'alert' and o.key like 'alert:%' and o.created_at > p_now - interval '14 days'
  group by o.user_id, substr(o.key, 7)
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
 from c where c.rn <= greatest(0, least(coalesce(p_per_person, 0), 25))
 order by c.alerted_at desc, c.user_id, c.job_id
 limit greatest(0, least(coalesce(p_limit, 0), 200))
$$;

create or replace function public.career_apply_prepare_for(p_user uuid, p_posting_job_id text, p_payload jsonb, p_card_lines text[])
returns public.career_apply_prepared language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare h text; r public.career_apply_prepared;
begin
 if p_user is null or p_payload->>'user_id' is distinct from p_user::text then raise exception 'not their application'; end if;
 if nullif(p_posting_job_id, '') is null then raise exception 'invalid prepared application'; end if;
 if p_payload->>'version' is distinct from '1' or nullif(p_payload->>'job_id', '') is null or nullif(p_payload->>'company', '') is null
  or coalesce(p_payload->>'url', '') !~ '^https?://' or jsonb_typeof(p_payload->'fields') is distinct from 'array'
  or p_card_lines is null or cardinality(p_card_lines) not between 1 and 80
  or exists (select from unnest(p_card_lines) l where l is null or length(l) not between 1 and 600) then
  raise exception 'invalid prepared application'; end if;
 if exists (select from public.career_watch_kv where user_id = p_user and key = 'career:account' and coalesce(value->>'paused', 'false') = 'true') then
  raise exception 'account paused'; end if;
 if public.career_apply_current(p_user, p_payload) is distinct from true then raise exception 'invalid or stale application approval'; end if;
 if exists (select from public.career_apply_jobs where user_id = p_user and job_id in (p_payload->>'job_id', p_posting_job_id)) then
  raise exception 'duplicate_job'; end if;
 h := encode(sha256(convert_to(public.career_apply_canonical(p_payload), 'UTF8')), 'hex');
 insert into public.career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
 values (p_user, p_payload->>'job_id', p_payload->>'company', p_payload->>'url', p_payload, h, p_card_lines)
 on conflict (user_id, job_id, payload_hash) do update set updated_at = now()
 returning * into r;
 perform public.career_apply_prepare_attempt_for(p_user, p_posting_job_id, 'ready', null, r.id, p_payload->>'job_id');
 return r;
end $$;

create or replace function public.career_apply_prepare_attempt_for(p_user uuid, p_posting_job_id text, p_outcome text, p_detail text,
 p_prepared uuid, p_engine_job_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if p_user is null or nullif(p_posting_job_id, '') is null then raise exception 'invalid prepare attempt'; end if;
 insert into public.career_apply_prepare_attempts (user_id, posting_job_id, outcome, detail, prepared_id, engine_job_id, at)
 values (p_user, p_posting_job_id, p_outcome, left(p_detail, 500), p_prepared, nullif(p_engine_job_id, ''), now())
 on conflict (user_id, posting_job_id) do update set outcome = excluded.outcome, detail = excluded.detail,
  prepared_id = coalesce(excluded.prepared_id, public.career_apply_prepare_attempts.prepared_id),
  engine_job_id = coalesce(excluded.engine_job_id, public.career_apply_prepare_attempts.engine_job_id), at = excluded.at;
end $$;

create or replace function public.career_apply_prepare_ask_for(p_user uuid, p_posting_job_id text, p_engine_job_id text, p_questions jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
 if p_user is null or not exists (select from public.profiles where id = p_user) then raise exception 'not their questions'; end if;
 n := public.career_apply_questions_put_for(p_user, p_engine_job_id, p_questions);
 perform public.career_apply_prepare_attempt_for(p_user, p_posting_job_id, 'asked', n::text || ' question(s) asked', null, p_engine_job_id);
 return n;
end $$;

create or replace function public.career_apply_answers_for(p_user uuid)
returns table (id uuid, key text, kind text, answer text, answered_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
 select id, key, kind, answer, answered_at from public.career_apply_questions where user_id = p_user and state = 'answered' order by answered_at
$$;

create table if not exists public.career_apply_question_drafts (
 question_id uuid primary key references public.career_apply_questions(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 text text not null check (length(btrim(text)) between 1 and 2000),
 fact_ids text[] not null default '{}' check (cardinality(fact_ids) <= 20),
 drafted_at timestamptz not null default now()
);
alter table public.career_apply_question_drafts enable row level security;
revoke all on public.career_apply_question_drafts from public, anon, authenticated;

-- The draft goes beside the person's own open written question of that posting, or nowhere (null): never on an answered
-- question, another person's, or a question that is not a written answer.
create or replace function public.career_apply_question_draft_put_for(p_user uuid, p_engine_job_id text, p_key text, p_text text, p_fact_ids text[])
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare q uuid;
begin
 if p_user is null or nullif(p_engine_job_id, '') is null or nullif(p_key, '') is null or p_text is null
  or length(btrim(p_text)) not between 1 and 2000 or cardinality(coalesce(p_fact_ids, '{}')) > 20 then raise exception 'invalid draft'; end if;
 select id into q from public.career_apply_questions
  where user_id = p_user and key = p_key and state = 'open' and kind = 'essay' and p_engine_job_id = any(job_ids);
 if q is null then return null; end if;
 insert into public.career_apply_question_drafts (question_id, user_id, text, fact_ids, drafted_at)
 values (q, p_user, p_text, coalesce(p_fact_ids, '{}'), now())
 on conflict (question_id) do update set text = excluded.text, fact_ids = excluded.fact_ids, drafted_at = excluded.drafted_at;
 return q;
end $$;

create or replace function public.career_apply_question_drafts_as(p_user uuid, p_ids uuid[])
returns table (question_id uuid, text text, fact_ids text[], drafted_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
 select d.question_id, d.text, d.fact_ids, d.drafted_at from public.career_apply_question_drafts d
 join public.career_apply_questions q on q.id = d.question_id and q.user_id = p_user and q.state = 'open'
 where d.user_id = p_user and d.question_id = any(coalesce(p_ids, '{}'))
$$;

revoke all on function public.career_apply_prepare_candidates(timestamptz, integer, integer),
 public.career_apply_prepare_for(uuid, text, jsonb, text[]), public.career_apply_prepare_attempt_for(uuid, text, text, text, uuid, text),
 public.career_apply_prepare_ask_for(uuid, text, text, jsonb), public.career_apply_answers_for(uuid),
 public.career_apply_question_draft_put_for(uuid, text, text, text, text[]), public.career_apply_question_drafts_as(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.career_apply_prepare_candidates(timestamptz, integer, integer),
 public.career_apply_prepare_for(uuid, text, jsonb, text[]), public.career_apply_prepare_attempt_for(uuid, text, text, text, uuid, text),
 public.career_apply_prepare_ask_for(uuid, text, text, jsonb), public.career_apply_answers_for(uuid),
 public.career_apply_question_draft_put_for(uuid, text, text, text, text[]), public.career_apply_question_drafts_as(uuid, uuid[]) to service_role;
