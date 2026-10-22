-- Rollback of 20261024100000: restore the live pre-state begin_agent_own (20261024090000's), same grants.
begin;
create or replace function public.career_apply_extension_begin_agent_own(p_payload jsonb, p_approval text, p_batch_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare u uuid := auth.uid(); a public.career_apply_batch_approvals; r jsonb;
begin
 if u is null then raise exception 'not signed in'; end if;
 if not public.career_apply_agent_submit_enabled() then raise exception 'agent submit is off'; end if;
 select * into a from public.career_apply_batch_approvals
  where user_id = u and job_id = p_payload->>'job_id' and batch_hash = p_batch_hash and revoked_at is null and used_at is null
   and approved_at > clock_timestamp() - interval '24 hours'
  order by approved_at desc limit 1 for update;
 if a.id is null then raise exception 'no live batch approval for this posting'; end if;
 r := public.career_apply_extension_begin_own(p_payload, p_approval);
 update public.career_apply_batch_approvals set used_at = clock_timestamp() where id = a.id;
 update public.career_apply_jobs set agent_batch_hash = p_batch_hash where id = (r->>'id')::uuid and user_id = u;
 return r;
end $$;
revoke all on function public.career_apply_extension_begin_agent_own(jsonb, text, text) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_extension_begin_agent_own(jsonb, text, text) to authenticated;
delete from public.upmore_migration_ledger where filename = '20261024100000_career_apply_agent_contract.sql';
commit;
