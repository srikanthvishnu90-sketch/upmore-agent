-- WO-030: a written answer drafted from the person's confirmed facts, only where the employer allows it. The employer's
-- own words about AI help on its application ("I agree to use only my own words ... the use of AI ... will disqualify my
-- application") are on the form, often in a statement a standing consent fills, so they never reach the texting side as
-- an open question. The person's computer now carries them with each written question of that posting (ai_policy), and
-- Trainee reads them before it drafts anything (essay_draft.ts). A posting whose form forbids AI-written answers is never
-- drafted for. Nothing else changes: the person reads their own rows, only career_apply_questions_put_own writes them.
alter table public.career_apply_questions add column if not exists ai_policy text;
alter table public.career_apply_questions drop constraint if exists career_apply_questions_ai_policy_check;
alter table public.career_apply_questions add constraint career_apply_questions_ai_policy_check check (ai_policy is null or length(ai_policy) between 1 and 1200);

-- As before, plus ai_policy: set when given; a later preparation of the same posting that carries none keeps what was
-- read (a policy is never dropped by a form that failed to show it).
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
  insert into public.career_apply_questions (user_id, key, kind, label, type, options, job_ids, company, ai_policy)
  values (u, q->>'key', q->>'kind', q->>'label', coalesce(q->>'type', 'input_text'), coalesce(q->'options', '[]'), array[p_job_id], nullif(q->>'company', ''),
          nullif(btrim(coalesce(q->>'ai_policy', '')), ''))
  on conflict (user_id, key) do update set
   job_ids = case when p_job_id = any(career_apply_questions.job_ids) then career_apply_questions.job_ids
                  else (career_apply_questions.job_ids || p_job_id)[greatest(1, cardinality(career_apply_questions.job_ids) - 198):] end,
   options = case when coalesce((q->>'misfit')::boolean, false) then excluded.options else career_apply_questions.options end,
   state = case when coalesce((q->>'misfit')::boolean, false) then 'open' else career_apply_questions.state end,
   misfit = coalesce((q->>'misfit')::boolean, false) or (career_apply_questions.misfit and career_apply_questions.state = 'open'),
   ai_policy = coalesce(excluded.ai_policy, career_apply_questions.ai_policy),
   updated_at = now();
  n := n + 1;
 end loop;
 return n;
end $$;
revoke all on function public.career_apply_questions_put_own(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_questions_put_own(text, jsonb) to authenticated;
