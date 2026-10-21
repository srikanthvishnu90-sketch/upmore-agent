-- LOOP TASK 1 FIX 1 (FIXER lane, 2026-10-20) — batch control-hook
-- semantics: account-version divergence is NOT a user cancellation.
--
-- The defect (live, census BL-025 + the loop's iteration-0 baseline):
-- 20261016010000's career_batch_control_hook_v1 cancelled every
-- queued batch intent (and marked claimed ones uncertain) whenever
-- the intent's authority_account_version differed from the account
-- row's current version. The account `version` is a concurrency
-- counter that career_host_commit bumps on EVERY committed chat
-- turn — including the product's own stated-facts commits on the
-- very next turn after an apply ask. It was never a revocation
-- signal: 19 of 26 prepare intents on the gauntlet account stand
-- cancelled, most within seconds of creation, while the chat reply
-- claimed the handoff. The same version pin in
-- career_batch_pending_v1 / career_batch_claim_v1 made even a
-- surviving intent unlistable and unclaimable, so a hook-only fix
-- would leave the queue dead.
--
-- The correction (data layer, the hook's semantics — not a
-- workaround): the revocation signals are the ones that are
-- actually the user's or the privacy layer's acts —
--   * the account row is DELETED (the account is gone);
--   * the privacy EPOCH changes (a privacy reset; the epoch-change
--     scrub of bindings/runs below is unchanged);
--   * the account is PAUSED (the user's own halt act).
-- The version equality gates come out of all three functions.
-- authority_account_version stays on the intent as its
-- recorded-at-birth value (audit + the commit-time check inside
-- career_batch_turn_commit_v1, which validates the version the
-- committing turn itself produced and is unchanged).
--
-- Guard: tests/db/career/15-career-batch-hook-semantics.test.sql
-- (fail-first on 20261016010000: scenario A reproduces the cancel;
-- green after this migration; pause/epoch/delete still revoke).
create or replace function public.career_batch_control_hook_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; epoch_changed boolean;
begin
 if coalesce(new.key,old.key)<>'career:account' then return null;end if;
 u:=coalesce(new.user_id,old.user_id);
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 epoch_changed:=tg_op='DELETE' or (tg_op='UPDATE' and coalesce((new.value->>'epoch')::bigint,0)<>coalesce((old.value->>'epoch')::bigint,0));
 update career_batch_intents_v1 i set state=case when i.state='claimed' then 'uncertain' else 'cancelled' end,updated_at=now()
  where i.user_id=u and i.state in ('queued','claimed') and (tg_op='DELETE' or new.value->'paused'='true'::jsonb or i.privacy_epoch is distinct from coalesce((new.value->>'epoch')::bigint,0));
 if epoch_changed then
  update career_batch_intents_v1 set private_input=null,result=null,
   binding=jsonb_build_object('version','career_batch_intent/v1','intent_id',intent_id,'user_id',user_id,'action',binding->>'action','run_id',run_id,'request_hash',request_hash),updated_at=now() where user_id=u;
  delete from career_batch_runs_v1 where user_id=u;
 end if;
 return null;
end $$;

create or replace function public.career_batch_pending_v1() returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'binding',i.binding,'request',i.private_input)),'[]'::jsonb)) from (select i.* from career_batch_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account' where i.state='queued' and i.expires_at>now() and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) and a.value->'paused' is distinct from 'true'::jsonb order by i.created_at limit 50)i;
$$;

create or replace function public.career_batch_claim_v1(p_user uuid,p_intent text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_batch_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_batch_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if i.intent_id is null then raise exception 'batch intent missing';end if;
 if a is null or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or a->'paused'='true'::jsonb or i.expires_at<=now() or i.state<>'queued' then raise exception 'batch authority revoked';end if;
 update career_batch_intents_v1 set state='claimed',lease_token=gen_random_uuid(),expires_at=now()+interval '60 minutes',updated_at=now() where user_id=p_user and intent_id=p_intent returning * into i;
 return jsonb_build_object('claimed',true,'intentId',p_intent,'userId',p_user,'leaseToken',i.lease_token,'binding',i.binding,'request',i.private_input);
end $$;
