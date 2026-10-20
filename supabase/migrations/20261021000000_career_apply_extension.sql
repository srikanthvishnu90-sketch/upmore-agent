-- WO-031: the browser extension records each application the person approved in it, on the same queue as every other
-- application (career_apply_jobs, D-014: one stack), signed in as the person. Nothing new is stored: the row is a
-- career_apply_jobs row, read only by its owner (career_apply_owner_read), erased with the person (profiles cascade).
--
-- The extension calls this after the person's one tap and before it clicks the site's own Submit. The payload must be the
-- signed-in person's, from the extension, for their current account (privacy epoch, version, expiry); its hash is computed
-- here and must equal the approval the extension sends (the hash of the card the person approved). Every rule of the queue
-- holds, by calling career_apply_enqueue: one per posting, one per company per 30 days, the person's own daily limit.
-- The row starts as a drive already claimed (state driving, one attempt, a lease), so no other worker ever drives it; the
-- extension records the employer's answer with career_apply_finish_own, and a drive it never finishes is marked unknown
-- after 15 minutes by the next own claim, never re-driven. An earlier attempt at the same posting that never reached the
-- employer (not_submitted, failed) is replaced, so a stopped attempt can be tried again.
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
 delete from public.career_apply_jobs where user_id = u and job_id = p_payload->>'job_id' and state in ('not_submitted', 'failed');
 j := public.career_apply_enqueue(p_payload, h, h, public.career_apply_daily_limit(u));
 update public.career_apply_jobs set state = 'driving', attempts = 1, claimed_at = clock_timestamp(), lease_token = gen_random_uuid(),
  updated_at = clock_timestamp() where id = j.id returning * into j;
 return jsonb_build_object('id', j.id, 'lease', j.lease_token, 'payload_hash', j.payload_hash);
end $$;

revoke all on function public.career_apply_extension_begin_own(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_extension_begin_own(jsonb, text) to authenticated;
