-- HELD rollback for 20261024140000: restores 20261024120000's career_apply_cloud_waiver_left (copied verbatim) and removes
-- the ledger row, in one transaction. Run only on the owner's word.
begin;
create or replace function public.career_apply_cloud_waiver_left(p_user uuid, p_portal text, p_now timestamptz) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(max(greatest(0, w.max_sends - (select count(*) from public.career_apply_jobs x where x.user_id = w.user_id
   and x.source = 'cloud' and x.attempts > 0 and x.claimed_at >= w.created_at and public.career_apply_portal(x.url) = w.portal))), 0)::integer
 from public.career_apply_cloud_gate_waivers w
 where w.user_id = p_user and w.portal = p_portal and w.revoked_at is null and w.created_at <= p_now and w.expires_at > p_now
$$;
revoke all on function public.career_apply_cloud_waiver_left(uuid, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_cloud_waiver_left(uuid, text, timestamptz) to service_role;
delete from public.upmore_migration_ledger where filename = '20261024140000_career_apply_cloud_waiver_counts_sends.sql';
commit;
