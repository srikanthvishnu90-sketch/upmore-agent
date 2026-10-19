-- WO-021 W4 (D-017: the person's own browser is the default path). The person's own computer runs their approved
-- applications while signed in as them. It claims and finishes only that person's rows, at the database's own clock;
-- the service key never leaves the operator, and one person's computer can never drive another person's application.
-- Same rules as career_apply_claim and career_apply_finish: a paused account, changed facts or an expired approval is
-- never driven, one attempt only, and a drive that stopped without a result is unknown and never re-driven.
create or replace function public.career_apply_claim_own(p_limit integer) returns setof public.career_apply_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); n timestamptz:=clock_timestamp();
begin
 if u is null then raise exception 'not signed in'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 update public.career_apply_jobs set state='unknown_outcome',
  reason='application outcome unknown: the drive stopped before recording it; not retried',
  evidence=evidence||jsonb_build_object('swept_at',n),updated_at=n
  where user_id=u and state='driving' and claimed_at<n-interval '15 minutes';
 return query
 with picked as (select id from public.career_apply_jobs where user_id=u and state='queued'
  and public.career_apply_current(user_id,payload) and approval_hash=payload_hash and attempts=0
  order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=n,lease_token=gen_random_uuid(),updated_at=n
  from picked where j.id=picked.id returning j.*;
end $$;

create or replace function public.career_apply_finish_own(p_id uuid,p_lease uuid,p_state text,p_evidence jsonb default '{}')
returns public.career_apply_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or octet_length(p_evidence::text)>65536 then
  raise exception 'invalid apply evidence'; end if;
 if not exists(select from public.career_apply_jobs where id=p_id and user_id=u and lease_token=p_lease) then
  raise exception 'invalid apply claim'; end if;
 return public.career_apply_finish(p_id,p_lease,p_state,p_evidence);
end $$;

revoke all on function public.career_apply_claim_own(integer),public.career_apply_finish_own(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.career_apply_claim_own(integer),public.career_apply_finish_own(uuid,uuid,text,jsonb) to authenticated;
