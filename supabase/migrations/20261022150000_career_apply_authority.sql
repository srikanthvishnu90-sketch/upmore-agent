-- WO-092: an approval goes stale only when something it depends on changed, never because the person sent a message.
--
-- Why: career_host_commit moves the account's `version` on every chat turn (it is the commit's concurrency counter), and
-- career_apply_current required the version an application was stamped with to equal the account's version. So one
-- ordinary turn ("thanks", "what time is it?") between a card and its "yes" refused every application on the card as
-- stale; an application already queued stayed queued forever (both worker claims filter on career_apply_current) while
-- counting toward the daily cap and the 30-day company rule. Batches had the same fault (finding A4): the account trigger
-- cancelled every queued batch on any account write whose `version` differed from the batch's stamp, so "thanks!" after
-- "apply to 10 analyst roles" cancelled the batch before the worker claimed it (live: 16 cancelled, 0 queued). `version`
-- itself is unchanged here; it stays the chat commit's concurrency counter.
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
-- 4. Batches: career_batch_control_hook_v1 cancels a queued batch (and marks a running one 'uncertain') only on an erase,
--    a pause, an epoch change, or authority_version moving past the version the batch was stamped with (the version its
--    own commit created); career_batch_pending_v1 and career_batch_claim_v1 apply the same rule. The advisory lock and
--    the erase purge are unchanged.
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

-- 4. Batches fence on authority_version, not on every commit. Runs after the BEFORE trigger above, so new.value carries
--    authority_version. Stamped at the version its own commit created; a later change to what it depends on moves
--    authority_version past that stamp.
create or replace function public.career_batch_control_hook_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; epoch_changed boolean;
begin
 if coalesce(new.key,old.key)<>'career:account' then return null;end if;
 u:=coalesce(new.user_id,old.user_id);
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 epoch_changed:=tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0));
 update career_batch_intents_v1 i set state=case when i.state='claimed' then 'uncertain' else 'cancelled' end,updated_at=now()
  where i.user_id=u and i.state in ('queued','claimed') and (tg_op='DELETE' or new.value->'paused'='true'::jsonb
   or coalesce((new.value->>'authority_version')::bigint,0)>i.authority_account_version
   or i.privacy_epoch is distinct from coalesce((new.value->>'epoch')::bigint,0));
 if epoch_changed then
  update career_batch_intents_v1 set private_input=null,result=null,
   binding=jsonb_build_object('version','career_batch_intent/v1','intent_id',intent_id,'user_id',user_id,'action',binding->>'action','run_id',run_id,'request_hash',request_hash),updated_at=now() where user_id=u;
  delete from career_batch_runs_v1 where user_id=u;
 end if;
 return null;
end $$;

create or replace function public.career_batch_pending_v1() returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'binding',i.binding,'request',i.private_input)),'[]'::jsonb)) from (select i.* from career_batch_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account' where i.state='queued' and i.expires_at>now() and i.authority_account_version>=coalesce((a.value->>'authority_version')::bigint,0) and i.authority_account_version<=coalesce((a.value->>'version')::bigint,0) and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) and a.value->'paused' is distinct from 'true'::jsonb order by i.created_at limit 50)i;
$$;

create or replace function public.career_batch_claim_v1(p_user uuid,p_intent text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_batch_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_batch_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if i.intent_id is null then raise exception 'batch intent missing';end if;
 if a is null or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version<coalesce((a->>'authority_version')::bigint,0) or i.authority_account_version>coalesce((a->>'version')::bigint,0) or a->'paused'='true'::jsonb or i.expires_at<=now() or i.state<>'queued' then raise exception 'batch authority revoked';end if;
 update career_batch_intents_v1 set state='claimed',lease_token=gen_random_uuid(),expires_at=now()+interval '60 minutes',updated_at=now() where user_id=p_user and intent_id=p_intent returning * into i;
 return jsonb_build_object('claimed',true,'intentId',p_intent,'userId',p_user,'leaseToken',i.lease_token,'binding',i.binding,'request',i.private_input);
end $$;
