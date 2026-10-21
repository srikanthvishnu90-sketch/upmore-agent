-- WO-102 at the agent's start: the database keeps the submission-quality contract too, not only the extension.
-- 20261024090000 (live, unchanged) lets the agent start an application only while the owner's CAREER_AGENT_SUBMIT is
-- 'on' and a live approval of this posting by this batch hash exists. This redefines
-- career_apply_extension_begin_agent_own (same signature, same grants) so that it also reads the entry the person
-- approved (career_apply_batch_approvals.entry, the extension's BatchPosting from batchPlan) and refuses unless:
--   1 quarantine version   the entry's quarantine_version is d007-v1 (constant here: a version bump invalidates every
--                          approval made under an older one)
--   2 manifest             the entry's manifest_hash is 64 hex and the payload carries the same, and the payload's
--                          quarantine_version is d007-v1 too (reviewPayload binds both into the approved payload's hash)
--   3 ledger               one ledger row per answer and per answer only, each for this posting, with non-empty
--                          fact_refs and source_refs arrays of non-blank strings, a confirmation_event_id, and a
--                          derivation_rule of verbatim, option-exact, option-yes-no, checkbox-yes-no or attachment
--   4 quarantined fact     no fact_ref (nor an answer's factId) is F-027..F-079, and no source_ref names the owner-delegated
--                          or answer-all delegation (D-007)
--   5 payload              every payload field is Trainee's (no page, you, drafted, fixed or workday field: an agent start
--                          sends only Trainee's approved answers), the fields are exactly the entry's answers by name, and
--                          each field's factId is its ledger row's first fact_ref
--   6 withdrawn answer     every fact_ref text-answer:<id> is a career_apply_questions row of this person, still answered
-- Each refusal is its own message ('agent contract: ...'); a refusal raises, so nothing is recorded and the approval is
-- not used (it stays live). Everything before (switch, approval, then career_apply_extension_begin_own's rules) holds.
-- Not applied to any database by this change: applying it live is the owner's call.
create or replace function public.career_apply_extension_begin_agent_own(p_payload jsonb, p_approval text, p_batch_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
 u uuid := auth.uid(); a public.career_apply_batch_approvals; r jsonb; e jsonb; l jsonb; f text;
 qv constant text := 'd007-v1';
 rules constant text[] := array['verbatim', 'option-exact', 'option-yes-no', 'checkbox-yes-no', 'attachment'];
 uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
 if u is null then raise exception 'not signed in'; end if;
 if not public.career_apply_agent_submit_enabled() then raise exception 'agent submit is off'; end if;
 select * into a from public.career_apply_batch_approvals
  where user_id = u and job_id = p_payload->>'job_id' and batch_hash = p_batch_hash and revoked_at is null and used_at is null
   and approved_at > clock_timestamp() - interval '24 hours'
  order by approved_at desc limit 1 for update;
 if a.id is null then raise exception 'no live batch approval for this posting'; end if;
 e := a.entry;

 -- 1 the quarantine rules the approval was made under
 if e->>'quarantine_version' is distinct from qv then raise exception 'agent contract: quarantine version'; end if;

 -- 2 the trusted fact manifest, the same in the approved entry and in the payload
 if coalesce(e->>'manifest_hash', '') !~ '^[0-9a-f]{64}$' or p_payload->>'manifest_hash' is distinct from e->>'manifest_hash'
  or p_payload->>'quarantine_version' is distinct from qv then
  raise exception 'agent contract: manifest';
 end if;

 -- 3 the ledger: complete, one row per answer
 if jsonb_typeof(e->'ledger') is distinct from 'array' or jsonb_typeof(e->'answers') is distinct from 'array' then
  raise exception 'agent contract: ledger';
 end if;
 for l in select x from jsonb_array_elements(e->'ledger') x loop
  if jsonb_typeof(l) is distinct from 'object' or l->>'application_id' is distinct from e->>'jobId'
   or jsonb_typeof(l->'fact_refs') is distinct from 'array' or jsonb_array_length(l->'fact_refs') = 0
   or exists (select 1 from jsonb_array_elements(l->'fact_refs') x where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '')
   or jsonb_typeof(l->'source_refs') is distinct from 'array'
   or exists (select 1 from jsonb_array_elements(l->'source_refs') x where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '')
   or jsonb_typeof(l->'confirmation_event_id') is distinct from 'string' or btrim(l->>'confirmation_event_id') = ''
   or not coalesce(l->>'derivation_rule' = any(rules), false) then
   raise exception 'agent contract: ledger';
  end if;
 end loop;
 if (select array_agg(x->>'name' order by x->>'name') from jsonb_array_elements(e->'answers') x)
    is distinct from (select array_agg(x->>'field_id' order by x->>'field_id') from jsonb_array_elements(e->'ledger') x) then
  raise exception 'agent contract: ledger';
 end if;

 -- 4 nothing from the quarantine (D-007): F-027..F-079 or the answer-all delegation
 if exists (select 1 from jsonb_array_elements(e->'ledger') x, jsonb_array_elements_text(x->'fact_refs') fr where fr ~ '^F-0*(2[7-9]|[3-6][0-9]|7[0-9])$')
  or exists (select 1 from jsonb_array_elements(e->'answers') x where coalesce(x->>'factId', '') ~ '^F-0*(2[7-9]|[3-6][0-9]|7[0-9])$')
  or exists (select 1 from jsonb_array_elements(e->'ledger') x, jsonb_array_elements_text(x->'source_refs') s where s ~* '(owner-delegated|answer-all)') then
  raise exception 'agent contract: quarantined fact';
 end if;

 -- 5 the payload sends exactly the approved answers, each on the fact its ledger row names
 if jsonb_typeof(p_payload->'fields') is distinct from 'array'
  or exists (select 1 from jsonb_array_elements(p_payload->'fields') x where x->>'source' is distinct from 'trainee')
  or (select array_agg(x->>'name' order by x->>'name') from jsonb_array_elements(p_payload->'fields') x)
     is distinct from (select array_agg(x->>'name' order by x->>'name') from jsonb_array_elements(e->'answers') x)
  or exists (select 1 from jsonb_array_elements(p_payload->'fields') x
   where x->>'factId' is distinct from (select y->'fact_refs'->>0 from jsonb_array_elements(e->'ledger') y where y->>'field_id' = x->>'name' limit 1)) then
  raise exception 'agent contract: payload not the approved answers';
 end if;

 -- 6 every text answer behind it is still this person's, answered
 for f in select fr from jsonb_array_elements(e->'ledger') x, jsonb_array_elements_text(x->'fact_refs') fr where fr like 'text-answer:%' loop
  if substr(f, 13) !~ uuid_re or not exists (select 1 from public.career_apply_questions q
    where q.id = substr(f, 13)::uuid and q.user_id = u and q.state = 'answered') then
   raise exception 'agent contract: withdrawn answer';
  end if;
 end loop;

 r := public.career_apply_extension_begin_own(p_payload, p_approval);
 update public.career_apply_batch_approvals set used_at = clock_timestamp() where id = a.id;
 update public.career_apply_jobs set agent_batch_hash = p_batch_hash where id = (r->>'id')::uuid and user_id = u;
 return r;
end $$;
revoke all on function public.career_apply_extension_begin_agent_own(jsonb, text, text) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_extension_begin_agent_own(jsonb, text, text) to authenticated;
