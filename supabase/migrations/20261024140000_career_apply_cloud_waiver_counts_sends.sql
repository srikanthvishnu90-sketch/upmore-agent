-- Item 16, held for the owner's call (option B): a waiver counts the applications that may have been sent, not every
-- claim. 20261024120000's career_apply_cloud_waiver_left counts every cloud job of that person on that portal claimed
-- since the waiver was made, so a drive the worker stopped before anything left the browser (a question to ask, a
-- changed form, a revoked card) used up one of the 5 sends. Here such a job is not counted, and only such a job: its
-- state is not_submitted AND the worker recorded its one outcome as 'not_sent' (worker.ts settle: a by-design refusal
-- before the effect). Everything else still counts: a drive in flight (no outcome yet), an unknown outcome, an error,
-- a bot check, an interrupted run, a page or email confirmation. Nothing else changes: the signature, the grants, the
-- window and the 5-send ceiling are 20261024120000's; the refusal and the claim call this function unchanged.
-- Rollback: docs/apply/held-waiver-sends/rollback.sql restores 20261024120000's body byte for byte.
create or replace function public.career_apply_cloud_waiver_left(p_user uuid, p_portal text, p_now timestamptz) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(max(greatest(0, w.max_sends - (select count(*) from public.career_apply_jobs x where x.user_id = w.user_id
   and x.source = 'cloud' and x.attempts > 0 and x.claimed_at >= w.created_at and public.career_apply_portal(x.url) = w.portal
   and not (x.state = 'not_submitted'
    and exists (select from public.career_apply_cloud_events e where e.job_id = x.id and e.outcome = 'not_sent')
    and not exists (select from public.career_apply_cloud_events e where e.job_id = x.id and e.outcome <> 'not_sent'))))), 0)::integer
 from public.career_apply_cloud_gate_waivers w
 where w.user_id = p_user and w.portal = p_portal and w.revoked_at is null and w.created_at <= p_now and w.expires_at > p_now
$$;
revoke all on function public.career_apply_cloud_waiver_left(uuid, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_cloud_waiver_left(uuid, text, timestamptz) to service_role;
