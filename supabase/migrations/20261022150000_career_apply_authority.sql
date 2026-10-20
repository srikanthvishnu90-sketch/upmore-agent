-- WO-092: an approval goes stale only when something it depends on changed, never because the person sent a message.
--
-- Why: career_host_commit moves the account's `version` on every chat turn (it is the commit's concurrency counter), and
-- career_apply_current required the version an application was stamped with to equal the account's version. So one
-- ordinary turn ("thanks", "what time is it?") between a card and its "yes" refused every application on the card as
-- stale; an application already queued stayed queued forever (both worker claims filter on career_apply_current) while
-- counting toward the daily cap and the 30-day company rule. The batch and task intents keep their own use of `version`
-- (they are meant to lapse at the next commit), so `version` itself is unchanged here.
--
-- What changes:
-- 1. The account row carries `authority_version`: the `version` at which something an approval depends on last
--    changed: the pause, the privacy epoch (an erase), the stated facts or the preferred places. A trigger keeps it on
--    every write to career:account, whoever writes it; an ordinary turn carries it over unchanged.
-- 2. career_apply_current: an approval is current when the account is not paused, the epoch matches, it has not
--    expired, and nothing it depends on changed after it was stamped (stamped version >= authority_version). The exact
--    payload the person approved is still bound by its hash (unchanged).
-- 3. career_apply_sweep_stale(): a queued application whose approval is no longer current becomes not_submitted with
--    the reason "approval no longer current", so it stops counting toward the cap and the cooldown. Service only; the
--    scheduled run calls it.
-- Follow-up (not here): when the agent's profile facts move from the thread to the person (audit F3), their changes join
-- the authority keys.

create or replace function public.career_account_authority_mark() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare changed boolean;
begin
 if new.key<>'career:account' then return new; end if;
 if tg_op='INSERT' then
  new.value:=new.value||jsonb_build_object('authority_version',coalesce((new.value->>'version')::bigint,0));
  return new;
 end if;
 changed:=coalesce(new.value->'paused','false'::jsonb) is distinct from coalesce(old.value->'paused','false'::jsonb)
  or coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0)
  or new.value->'stated_facts' is distinct from old.value->'stated_facts'
  or new.value->'preferred_locations' is distinct from old.value->'preferred_locations';
 if changed then
  new.value:=new.value||jsonb_build_object('authority_version',coalesce((new.value->>'version')::bigint,0));
 else
  new.value:=new.value||jsonb_build_object('authority_version',coalesce((old.value->>'authority_version')::bigint,0));
 end if;
 return new;
end $$;

drop trigger if exists career_account_authority on public.career_watch_kv;
create trigger career_account_authority before insert or update on public.career_watch_kv
 for each row when (new.key='career:account') execute function public.career_account_authority_mark();

create or replace function public.career_apply_current(p_user uuid,p_payload jsonb) returns boolean
language plpgsql volatile set search_path=public,pg_temp as $$
declare a jsonb;begin
 select value into a from public.career_watch_kv where user_id=p_user and key='career:account';
 return a is not null and coalesce(a->>'paused','false')='false'
 and coalesce((a->>'epoch')::bigint,0)=(p_payload->>'privacy_epoch')::bigint
 and (p_payload->>'account_version')::bigint>=coalesce((a->>'authority_version')::bigint,0)
 and (p_payload->>'account_version')::bigint<=coalesce((a->>'version')::bigint,0)
 and (p_payload->>'expires_at')::timestamptz>clock_timestamp();end
$$;

create or replace function public.career_apply_sweep_stale() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 update public.career_apply_jobs set state='not_submitted',reason='approval no longer current',
  evidence=evidence||jsonb_build_object('reason','approval no longer current','swept_at',now()),updated_at=now()
 where state='queued' and public.career_apply_current(user_id,payload) is distinct from true;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.career_apply_sweep_stale() from public,anon,authenticated;
grant execute on function public.career_apply_sweep_stale() to service_role;
