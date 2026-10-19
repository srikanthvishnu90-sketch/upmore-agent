-- Ask once (owner target: "every unknown question asked to the user exactly once over iMessage, then never again"). The
-- questions that stop a preparation on the person's computer are stored here, one row per meaning, keyed by how far an
-- answer may travel (answerKey in _shared/question_map.ts): a fact about the person they have not stated, once for every
-- employer ("fact:sponsorship"); a legal statement, a consent or an unmapped question, by its exact wording ("label:" and a
-- hash of the wording: a "no" to "convicted in the last 7 years" never answers "ever convicted"); an essay or a question
-- about one job, for that posting only ("job:" and a hash of posting and wording: "why Stripe" never answers "why Ramp").
-- Trainee asks them by text, the answer is saved here, and the next preparation on the person's computer reads the
-- answers back as their confirmed facts. The person reads their own rows; only these functions write; an answered
-- question is never asked again unless a new form's options do not fit the answer.
create table if not exists public.career_apply_questions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 key text not null check (key ~ '^(fact:[a-z0-9_]{1,60}|label:[0-9a-f]{16}|job:[0-9a-f]{16})$'),
 kind text not null check (kind in ('fact', 'derived', 'screen', 'attestation', 'consent', 'essay', 'file', 'unknown')),
 label text not null check (length(label) between 1 and 600),
 type text not null check (length(type) between 1 and 40),
 options jsonb not null default '[]' check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 60),
 job_ids text[] not null default '{}' check (cardinality(job_ids) <= 200),
 company text check (company is null or length(company) between 1 and 200),
 state text not null default 'open' check (state in ('open', 'answered')),
 answer text check (answer is null or length(answer) between 1 and 2000),
 misfit boolean not null default false,
 answered_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (user_id, key),
 check (state <> 'answered' or answer is not null)
);
alter table public.career_apply_questions enable row level security;
revoke all on public.career_apply_questions from public, anon, authenticated;
grant select on public.career_apply_questions to authenticated;
grant all on public.career_apply_questions to service_role;
drop policy if exists career_apply_questions_owner_read on public.career_apply_questions;
create policy career_apply_questions_owner_read on public.career_apply_questions for select to authenticated using ((select auth.uid()) = user_id);
create index if not exists career_apply_questions_open on public.career_apply_questions (user_id, created_at) where state = 'open';

-- The person's computer records what stopped a preparation. A question already answered comes back open only when this
-- form's options do not fit the saved answer (the computer says so with p_misfit); its answer is kept for the person to
-- see what did not fit. At most 500 questions a person.
create or replace function public.career_apply_questions_put_own(p_job_id text, p_questions jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); q jsonb; n integer := 0;
begin
 if u is null then raise exception 'not signed in'; end if;
 if nullif(p_job_id, '') is null or length(p_job_id) > 300 or jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) > 60 then
  raise exception 'invalid questions'; end if;
 for q in select * from jsonb_array_elements(p_questions) loop
  if (select count(*) from public.career_apply_questions where user_id = u) >= 500
   and not exists (select from public.career_apply_questions where user_id = u and key = q->>'key') then raise exception 'too many questions'; end if;
  insert into public.career_apply_questions (user_id, key, kind, label, type, options, job_ids, company)
  values (u, q->>'key', q->>'kind', q->>'label', coalesce(q->>'type', 'input_text'), coalesce(q->'options', '[]'), array[p_job_id], nullif(q->>'company', ''))
  on conflict (user_id, key) do update set
   job_ids = case when p_job_id = any(career_apply_questions.job_ids) then career_apply_questions.job_ids
                  else (career_apply_questions.job_ids || p_job_id)[greatest(1, cardinality(career_apply_questions.job_ids) - 198):] end,
   options = case when coalesce((q->>'misfit')::boolean, false) then excluded.options else career_apply_questions.options end,
   state = case when coalesce((q->>'misfit')::boolean, false) then 'open' else career_apply_questions.state end,
   misfit = coalesce((q->>'misfit')::boolean, false) or (career_apply_questions.misfit and career_apply_questions.state = 'open'),
   updated_at = now();
  n := n + 1;
 end loop;
 return n;
end $$;

-- The answers, for the person's computer to read back as their confirmed facts before the next preparation.
create or replace function public.career_apply_answers_own()
returns table (id uuid, key text, kind text, answer text, answered_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
 select id, key, kind, answer, answered_at from public.career_apply_questions where user_id = auth.uid() and state = 'answered' order by answered_at
$$;

-- The texting path (service role, acting for the person who texted): the open questions, oldest first, and an answer.
create or replace function public.career_apply_questions_open_as(p_user uuid, p_limit integer)
returns setof public.career_apply_questions language sql stable security definer set search_path = public, pg_temp as $$
 select * from public.career_apply_questions where user_id = p_user and state = 'open' order by created_at, id limit least(greatest(coalesce(p_limit, 5), 1), 20)
$$;
create or replace function public.career_apply_question_answer_for(p_user uuid, p_id uuid, p_answer text)
returns public.career_apply_questions language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.career_apply_questions;
begin
 if p_user is null or p_id is null or p_answer is null or length(btrim(p_answer)) not between 1 and 2000 then raise exception 'invalid answer'; end if;
 update public.career_apply_questions set state = 'answered', answer = btrim(p_answer), misfit = false, answered_at = now(), updated_at = now()
  where id = p_id and user_id = p_user returning * into r;
 if not found then raise exception 'not your question'; end if;
 return r;
end $$;
create or replace function public.career_apply_question_answer_as(p_user uuid, p_id uuid, p_answer text) returns public.career_apply_questions
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_question_answer_for(p_user, p_id, p_answer) $$;
create or replace function public.career_apply_question_answer_own(p_id uuid, p_answer text) returns public.career_apply_questions
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_question_answer_for(auth.uid(), p_id, p_answer) $$;

revoke all on function public.career_apply_questions_put_own(text, jsonb), public.career_apply_answers_own(), public.career_apply_questions_open_as(uuid, integer),
 public.career_apply_question_answer_for(uuid, uuid, text), public.career_apply_question_answer_as(uuid, uuid, text), public.career_apply_question_answer_own(uuid, text)
 from public, anon, authenticated, service_role;
grant execute on function public.career_apply_questions_put_own(text, jsonb), public.career_apply_answers_own(), public.career_apply_question_answer_own(uuid, text) to authenticated;
grant execute on function public.career_apply_questions_open_as(uuid, integer), public.career_apply_question_answer_as(uuid, uuid, text) to service_role;
