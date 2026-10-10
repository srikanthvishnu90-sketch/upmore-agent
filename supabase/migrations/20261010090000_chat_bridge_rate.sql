-- The restored deployed chat bridge needs the same owner-scoped quota as web
-- chat. Explicit impersonation is a service-only backend operation; normal
-- callers continue using agent_rl_bump, which derives auth.uid().
create or replace function public.agent_rl_bump_as(p_user uuid,p_limit integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if p_user is null or p_limit is null or p_limit not between 1 and 60 then raise exception 'invalid chat quota'; end if;
  insert into public.agent_rate_limits(user_id,window_start,count) values(p_user,now(),1)
  on conflict(user_id) do update set
    window_start=case when agent_rate_limits.window_start<now()-interval '60 minutes' then now() else agent_rate_limits.window_start end,
    count=case when agent_rate_limits.window_start<now()-interval '60 minutes' then 1 else least(agent_rate_limits.count+1,61) end
  returning count into n;
  return n<=p_limit;
end;
$$;
revoke all on function public.agent_rl_bump_as(uuid,integer) from public,anon,authenticated;
grant execute on function public.agent_rl_bump_as(uuid,integer) to service_role;
