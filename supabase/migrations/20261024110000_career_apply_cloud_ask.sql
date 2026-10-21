-- Ask, never guess (owner goal 2026-10-21): when the apply engine stops because a required field has no confirmed fact
-- (needs_answers), that field becomes a question to the person, not a dead stop and never a guess. The question is an
-- open career_apply_questions row: the row the texting side asks over Messages (career_apply_questions.ts) and the next
-- preparation reads back as the person's own answer (text-answer:<row id>, which the WO-102 answer contract trusts).
-- The person's computer already wrote these rows (career_apply_questions_put_own); the cloud worker now writes the same
-- rows, for the job it holds the live lease on and only that job's person (career_apply_cloud_ask). Both go through one
-- writer, career_apply_questions_put_for, the body of 20261020070000's put_own unchanged but for whose rows they are.

create or replace function public.career_apply_questions_put_for(u uuid, p_job_id text, p_questions jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare q jsonb; n integer := 0;
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

create or replace function public.career_apply_questions_put_own(p_job_id text, p_questions jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
begin
 return public.career_apply_questions_put_for(auth.uid(), p_job_id, p_questions);
end $$;

-- The cloud worker's door: only for a cloud job it holds the live lease on, still driving; the rows are that job's person's.
create or replace function public.career_apply_cloud_ask(p_id uuid, p_lease uuid, p_questions jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.career_apply_jobs;
begin
 select * into j from public.career_apply_jobs where id = p_id and lease_token = p_lease and state = 'driving' and source = 'cloud';
 if not found then raise exception 'invalid apply claim'; end if;
 return public.career_apply_questions_put_for(j.user_id, j.job_id, p_questions);
end $$;

revoke all on function public.career_apply_questions_put_for(uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.career_apply_questions_put_own(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_questions_put_own(text, jsonb) to authenticated;
revoke all on function public.career_apply_cloud_ask(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_cloud_ask(uuid, uuid, jsonb) to service_role;
