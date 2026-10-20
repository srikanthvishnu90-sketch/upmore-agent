-- WO-042 (merging WO-031 onto trunk): 20261021075000_career_apply_ops added career_apply_jobs.source ("who drove it": the
-- gate counts the hand submissions confirmed by the employer's email per portal, source own_computer or extension, before
-- cloud apply unlocks, D-022). WO-031's career_apply_extension_begin_own predates the column and left it null, so an
-- application the person approved in the extension counted for nothing toward the gate and read as driven by nobody. It
-- is redefined here, after the column exists, the same in every other way, with source 'extension'.
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
 delete from public.career_apply_jobs where user_id = u and job_id = p_payload->>'job_id' and state = 'not_submitted'
  and evidence->>'reason' = 'stopped before the click';
 j := public.career_apply_enqueue(p_payload, h, h, public.career_apply_daily_limit(u));
 update public.career_apply_jobs set state = 'driving', source = 'extension', attempts = 1, claimed_at = clock_timestamp(), lease_token = gen_random_uuid(),
  updated_at = clock_timestamp() where id = j.id returning * into j;
 return jsonb_build_object('id', j.id, 'lease', j.lease_token, 'payload_hash', j.payload_hash);
end $$;

revoke all on function public.career_apply_extension_begin_own(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_extension_begin_own(jsonb, text) to authenticated;

-- Ask once, from the form (WO-042). A question a posting could not answer is stored by career_apply_questions_put_own;
-- when the person answers it on the employer's form themselves and approves that exact card, and the application goes,
-- their answer is kept here under the same key the text path uses, so the next form reads it back as a confirmed answer
-- and the question is never asked again. Only a question still open is answered, only one this posting raised, and an
-- answer the person gave by text is never replaced. At most 60 answers a call and 500 questions a person, as for put_own.
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
  if k is null or k !~ '^(fact:[a-z0-9_]{1,60}|label:[0-9a-f]{16}|job:[0-9a-f]{16})$' or length(ans) not between 1 and 2000 then
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
