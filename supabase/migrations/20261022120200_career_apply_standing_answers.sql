-- WO-074: standing answers. A standing answer is the person's own statement for a class of application question (how they
-- hear about jobs, relatives at the employer, work rights by country, office and place), given once in the answer-once
-- panel and kept exactly like any other saved answer, in career_apply_questions, under its class key
-- (standing:how_heard, standing:relatives_at_employer, standing:work_rights, standing:office). The key check and the
-- form-answer function's key check gain these four keys and nothing else; every other rule is unchanged. Which questions a
-- statement answers, and how, is decided by code on the person's computer (standing_answers.ts); the database only keeps
-- the person's own words.
alter table public.career_apply_questions drop constraint if exists career_apply_questions_key_check;
alter table public.career_apply_questions add constraint career_apply_questions_key_check
 check (key ~ '^(fact:[a-z0-9_]{1,60}|label:[0-9a-f]{16}|job:[0-9a-f]{16}|standing:(how_heard|relatives_at_employer|work_rights|office))$');

create or replace function public.career_apply_questions_answer_from_form_own(p_job_id text, p_answers jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); a jsonb; n integer := 0; k text; ans text;
begin
 if u is null then raise exception 'not signed in'; end if;
 if nullif(p_job_id, '') is null or length(p_job_id) > 300 or jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > 60 then
  raise exception 'invalid answers'; end if;
 for a in select * from jsonb_array_elements(p_answers) loop
  k := a->>'key';
  ans := btrim(coalesce(a->>'answer', ''));
  if k is null or k !~ '^(fact:[a-z0-9_]{1,60}|label:[0-9a-f]{16}|job:[0-9a-f]{16}|standing:(how_heard|relatives_at_employer|work_rights|office))$' or length(ans) not between 1 and 2000 then
   raise exception 'invalid answer'; end if;
  if exists (select from public.career_apply_questions where user_id = u and key = k) then
   update public.career_apply_questions set state = 'answered', answer = ans, misfit = false, answered_at = now(), updated_at = now()
    where user_id = u and key = k and state = 'open' and p_job_id = any(job_ids);
   if found then n := n + 1; end if;
  else
   if (select count(*) from public.career_apply_questions where user_id = u) >= 500 then raise exception 'too many questions'; end if;
   insert into public.career_apply_questions (user_id, key, kind, label, type, options, job_ids, company, state, answer, answered_at)
   values (u, k, a->>'kind', left(btrim(coalesce(a->>'label', '')), 600), left(coalesce(nullif(a->>'type', ''), 'input_text'), 40),
    coalesce(a->'options', '[]'), array[p_job_id], nullif(left(coalesce(a->>'company', ''), 200), ''), 'answered', ans, now());
   n := n + 1;
  end if;
 end loop;
 return n;
end $$;
revoke all on function public.career_apply_questions_answer_from_form_own(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_questions_answer_from_form_own(text, jsonb) to authenticated;
