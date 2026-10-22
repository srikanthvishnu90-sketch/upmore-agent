-- DRAFT — NOT APPLIED ANYWHERE. Owner-run only, on the owner's explicit
-- word naming this migration (2026-10-22, #11-2). Until it is applied,
-- the executor's append path is inert: createBatchRpcStore exposes
-- appendLedger only to callers whose transport answers this RPC, and
-- the executor falls back to the v1 whole-array save where the store
-- has no appendLedger.
--
-- career_batch_append_ledger_v2: the race-safe cap-ledger write (S-2,
-- the hard gate for S-1 parallel drain). v1's save replaces the whole
-- records array with no lock and no version, so two concurrent drains
-- for one user read the same base and the last save erases the other's
-- submission records — and the ledger is the cap source, so the loss
-- silently re-opens spent cap room.
--
-- This RPC appends ONLY the caller's new records, merged under the
-- same per-user advisory lock the batch claim/finish RPCs already
-- take, deduplicated by record identity: canonicalKey +
-- confirmationId (falling back to timestamp). ConfirmationId ALONE
-- is not an identity — two employers can mint the same string for
-- different openings (the sandbox boards each start at SBX-0001);
-- the pair is. A retried append after an uncertain transport
-- outcome is therefore a no-op, never a duplicate. It returns the
-- full merged ledger.
--
-- Scope boundary, stated plainly: this fences the ledger WRITE. Cap
-- CHECKS still read the ledger at run start; two independent batches
-- approved for one user and executed concurrently can both pass a
-- stale-base check. The S-1 design shards ONE approved batch (whose
-- set was cap-checked whole at prepare) across executors, so its
-- total can never exceed the checked set; cross-batch concurrency
-- remains serialized by the single-executor drain today and needs
-- its own fencing decision before K>1 executors serve one user.

create function public.career_batch_append_ledger_v2(p_user uuid, p_records jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare cur jsonb; rec jsonb; k text; seen jsonb := '{}'::jsonb; merged jsonb;
begin
  if p_user is null or p_records is null or jsonb_typeof(p_records) <> 'array' then raise exception 'invalid batch ledger append'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select records into cur from career_batch_ledgers_v1 where user_id = p_user;
  cur := coalesce(cur, '[]'::jsonb);
  for rec in select value from jsonb_array_elements(cur) loop
    k := (rec->>'canonicalKey') || '|' || coalesce(rec->>'confirmationId', rec->>'timestamp');
    seen := seen || jsonb_build_object(k, true);
  end loop;
  merged := cur;
  for rec in select value from jsonb_array_elements(p_records) loop
    k := (rec->>'canonicalKey') || '|' || coalesce(rec->>'confirmationId', rec->>'timestamp');
    if not (seen ? k) then
      merged := merged || jsonb_build_array(rec);
      seen := seen || jsonb_build_object(k, true);
    end if;
  end loop;
  insert into career_batch_ledgers_v1(user_id, records, updated_at) values(p_user, merged, now())
  on conflict(user_id) do update set records = excluded.records, updated_at = now();
  return jsonb_build_object('records', merged, 'appended', jsonb_array_length(merged) - jsonb_array_length(cur));
end $$;
revoke all on function public.career_batch_append_ledger_v2(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.career_batch_append_ledger_v2(uuid, jsonb) to service_role;
