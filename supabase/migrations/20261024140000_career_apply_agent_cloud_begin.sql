-- F-030: a begin made in chat becomes a row the cloud can claim. (Numbered 20261024140000: on the line this
-- branch was rebased onto, 20261024120000 is the cloud gate waiver and 20261024130000 the card-cloud bridge;
-- this file applies after both.) career_apply_extension_begin_agent_own
-- (20261024100000) delegates to career_apply_extension_begin_own (20261021120000), which refuses any payload but
-- the extension's and stamps the row it creates 'extension', already driving, with the beginner's lease. That is
-- right for the extension, whose beginner is its driver in the person's own browser, and wrong for a begin the
-- chat path makes for the cloud worker: career_apply_cloud_claim_at takes only rows still queued with source
-- null and attempts 0, so a chat-begun row is never claimed (it is swept to unknown_outcome as if a drive had
-- died), and had it ever been driven and confirmed it would have counted toward the family gate's hand tally
-- (career_apply_cloud_open counts source 'own_computer' or 'extension') -- an agent submission in hand clothing.
-- What this file adds:
--   career_apply_agent_contract_approval    the start checks of 20261024100000, unchanged and in one place: the
--                                            owner's switch, the live approval (locked for update), and the six
--                                            contract rules over the approved entry. Internal: granted to no
--                                            one; the two agent begins are its only callers.
--   career_apply_extension_begin_agent_own  redefined over that helper, its tail exactly as 20261024100000 left
--                                            it (the extension's begin, the approval used, the batch stamped):
--                                            the extension door is unchanged.
--   career_apply_cloud_begin_agent_own     the cloud door for the same approval: the same contract, then the
--                                            payload must be the cloud's (its source says so; it carries the
--                                            destination the person approved and the engine's approval hash --
--                                            the shapes career_apply_cloud_refusal demands at claim time), then
--                                            the row is only enqueued: queued, source null, attempts 0, no
--                                            lease issued. The cloud claim stamps it 'cloud' itself, once,
--                                            from queued (career_apply_jobs_fixed allows a source only so), so
--                                            a chat submission can never count as a hand one -- and a hand
--                                            submission is never begun by this door.
-- Not applied to any database by this change: applying it live is the owner's call.

create or replace function public.career_apply_agent_contract_approval(p_payload jsonb, p_batch_hash text)
returns public.career_apply_batch_approvals language plpgsql security definer set search_path = public, extensions, pg_temp as $$
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

 return a;
end $$;

create or replace function public.career_apply_extension_begin_agent_own(p_payload jsonb, p_approval text, p_batch_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
 u uuid := auth.uid(); a public.career_apply_batch_approvals; r jsonb;
begin
 a := public.career_apply_agent_contract_approval(p_payload, p_batch_hash);
r := public.career_apply_extension_begin_own(p_payload, p_approval);
 update public.career_apply_batch_approvals set used_at = clock_timestamp() where id = a.id;
 update public.career_apply_jobs set agent_batch_hash = p_batch_hash where id = (r->>'id')::uuid and user_id = u;
 return r;
end $$;

create or replace function public.career_apply_cloud_begin_agent_own(p_payload jsonb, p_approval text, p_batch_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
 u uuid := auth.uid(); a public.career_apply_batch_approvals; h text; j public.career_apply_jobs;
begin
 a := public.career_apply_agent_contract_approval(p_payload, p_batch_hash);

 -- The door's own checks: this payload is the cloud worker's, in the shapes the claim will demand of it
 -- (career_apply_cloud_refusal: the destination the person approved, the engine's approval hash). A payload
 -- that could never be claimed is refused here, at the start, not left to die at claim time.
 if p_payload->>'source' is distinct from 'cloud' then raise exception 'agent cloud: source'; end if;
 if coalesce(p_payload->>'destination', '') !~ '^https://' then raise exception 'agent cloud: destination'; end if;
 if coalesce(p_payload->>'engine_approval', '') !~ '^[0-9a-f]{64}$' then raise exception 'agent cloud: engine approval'; end if;

 -- The same start the extension's begin makes (the hash the approval names, the queue's own rules), except the
 -- row is only enqueued: queued, source null, attempts 0, no lease. The cloud claim takes it from there and
 -- stamps it 'cloud' itself. Deliberately no delete of a stopped row, as begin_own makes for its own debris:
 -- a second begin for this posting is the queue's duplicate_job, and the approval stays live (below is only
 -- reached when the enqueue stands; everything here is one transaction).
 h := encode(sha256(convert_to(public.career_apply_canonical(p_payload), 'UTF8')), 'hex');
 if p_approval is null or p_approval is distinct from h then raise exception 'invalid or stale application approval'; end if;
 j := public.career_apply_enqueue(p_payload, h, h, public.career_apply_daily_limit(u));
 update public.career_apply_batch_approvals set used_at = clock_timestamp() where id = a.id;
 update public.career_apply_jobs set agent_batch_hash = p_batch_hash where id = j.id and user_id = u;
 return jsonb_build_object('id', j.id, 'payload_hash', j.payload_hash);
end $$;

revoke all on function public.career_apply_agent_contract_approval(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.career_apply_extension_begin_agent_own(jsonb, text, text) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_extension_begin_agent_own(jsonb, text, text) to authenticated;
revoke all on function public.career_apply_cloud_begin_agent_own(jsonb, text, text) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_cloud_begin_agent_own(jsonb, text, text) to authenticated;
