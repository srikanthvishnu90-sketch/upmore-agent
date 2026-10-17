-- SOURCE-ONLY proposal; apply after career_public_research_v1.sql. Not deployed.
-- Retains the existing owner lock, account/version/epoch, service-only RPCs,
-- intent expiry, effect ledger and global one-submit uniqueness constraint.
alter table public.career_task_intents_v1 add column claim_worker uuid,
 add column claim_request uuid, add column claim_generation integer not null default 0,
 add column claim_lease_until timestamptz;

create function public.career_task_owned_grant_v1(i public.career_task_intents_v1) returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('version','career_task_intent/v1','intentId',i.intent_id,'userId',i.user_id,'taskId',i.task_id,'accountVersion',i.authority_account_version,'privacyEpoch',i.privacy_epoch,'leaseToken',i.lease_token,'binding',i.binding,'request',i.private_input,'workerId',i.claim_worker,'claimRequest',i.claim_request,'generation',i.claim_generation);
$$;

create function public.career_task_claim_owned_v1(p_user uuid,p_intent text,p_task text,p_worker uuid,p_request uuid,p_lease uuid default null,p_generation integer default 0) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state not in ('queued','claimed') or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (i.binding->>'action'<>'reconcile' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if p_worker is null or p_request is null or coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or (i.task_id is not null and i.task_id<>p_task) then raise exception 'task binding mismatch';end if;
 if i.state='claimed' then
  if i.claim_worker is null then raise exception 'legacy task claim busy';end if;
  if i.claim_lease_until>now() then
   if i.claim_worker is distinct from p_worker or i.claim_request is distinct from p_request or (p_lease is not null and p_lease is distinct from i.lease_token) then raise exception 'task claim owner mismatch';end if;
   if p_lease is null and exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.intent_id=p_intent) then raise exception 'task effect outcome uncertain';end if;
   return career_task_owned_grant_v1(i);
  end if;
  -- Reclaim is a CAS against an observed generation and is allowed only
  -- before any effect was admitted. Reserved effects also prevent replay.
  if p_generation is distinct from i.claim_generation or p_generation<1 then raise exception 'task stale claim generation';end if;
  if exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.intent_id=p_intent) then raise exception 'task effect outcome uncertain';end if;
 elsif p_generation is distinct from 0 then raise exception 'task stale claim generation';
 end if;
 update career_task_intents_v1 set state='claimed',task_id=p_task,claim_worker=p_worker,claim_request=p_request,claim_generation=claim_generation+1,lease_token=gen_random_uuid(),claim_lease_until=least(expires_at,now()+interval '5 minutes'),updated_at=now() where user_id=p_user and intent_id=p_intent returning * into i;
 return career_task_owned_grant_v1(i);
end $$;

create function public.career_task_claim_readback_v1(p_user uuid,p_intent text,p_worker uuid,p_request uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;a jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into i from career_task_intents_v1 where user_id=p_user and intent_id=p_intent for update;
 select value into a from career_watch_kv where user_id=p_user and key='career:account';
 if a is null or i.intent_id is null or i.state<>'claimed' or i.expires_at<=now() or i.privacy_epoch is distinct from coalesce((a->>'epoch')::bigint,0) or i.authority_account_version is distinct from (a->>'version')::bigint or (i.binding->>'action'<>'reconcile' and a->'paused'='true'::jsonb) then raise exception 'task authority revoked';end if;
 if p_worker is null or p_request is null or i.claim_worker is distinct from p_worker or i.claim_request is distinct from p_request then raise exception 'task claim owner mismatch';end if;
 if exists(select 1 from career_task_effects_v1 e where e.user_id=p_user and e.intent_id=p_intent) then return jsonb_build_object('state','uncertain');end if;
 if i.claim_lease_until<=now() then return jsonb_build_object('state','expired','generation',i.claim_generation);end if;
 return jsonb_build_object('state','claimed','grant',career_task_owned_grant_v1(i));
end $$;

create function public.career_task_pending_owned_v1(p_worker uuid) returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'taskId',i.task_id,'binding',i.binding,'request',i.private_input)),'[]'::jsonb)) from
 (select i.* from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account'
 where p_worker is not null and (i.state='queued' or (i.state='claimed' and i.claim_worker=p_worker and not exists(select 1 from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id)))
 and i.expires_at>now() and i.authority_account_version=(a.value->>'version')::bigint and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0) and (i.binding->>'action'='reconcile' or a.value->'paused' is distinct from 'true'::jsonb) order by i.created_at limit 50)i;
$$;

-- Scope precedes LIMIT. An owned task anchor in the current epoch authorizes
-- inspection of that owner's queued approval/reconcile intents, even though a
-- newer chat turn legitimately advanced the account version since preparation.
create index career_task_owned_scope_v1 on public.career_task_intents_v1(user_id,task_id,claim_worker,privacy_epoch) where claim_worker is not null;
create index career_task_pending_scope_v1 on public.career_task_intents_v1(user_id,(coalesce(task_id,binding->>'task_id')),created_at,intent_id) where state in ('queued','claimed');
create function public.career_task_pending_scoped_v1(p_worker uuid,p_user uuid,p_task text,p_limit integer default 50) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_worker is null or p_user is null or coalesce(p_task,'') !~ '^[a-f0-9]{32}$' or p_limit is null or p_limit<1 or p_limit>50 then raise exception 'invalid task pending scope';end if;
 return (
  select jsonb_build_object('intents',coalesce(jsonb_agg(jsonb_build_object('userId',i.user_id,'intentId',i.intent_id,'taskId',i.task_id,'binding',i.binding,'request',i.private_input) order by i.created_at,i.intent_id),'[]'::jsonb)) from (
   select i.* from career_task_intents_v1 i join career_watch_kv a on a.user_id=i.user_id and a.key='career:account'
   where i.user_id=p_user and coalesce(i.task_id,i.binding->>'task_id')=p_task
   and exists(select 1 from career_task_intents_v1 anchor where anchor.user_id=p_user and anchor.task_id=p_task and anchor.claim_worker=p_worker and anchor.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0))
   and (i.state='queued' or (i.state='claimed' and i.claim_worker=p_worker and not exists(select 1 from career_task_effects_v1 e where e.user_id=i.user_id and e.intent_id=i.intent_id)))
   and i.expires_at>now() and i.authority_account_version=(a.value->>'version')::bigint and i.privacy_epoch=coalesce((a.value->>'epoch')::bigint,0)
   and (i.binding->>'action'='reconcile' or a.value->'paused' is distinct from 'true'::jsonb)
   order by i.created_at,i.intent_id limit p_limit
  )i
 );
end $$;

-- Existing reserve/consume functions already hold the account owner lock.
-- Fence an expired owned lease before reservation or physical admission.
create function public.career_task_owned_lease_fence_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare i career_task_intents_v1;
begin
 if TG_TABLE_NAME='career_task_effects_v1' then
  if TG_OP='INSERT' or (NEW.state='started' and OLD.state is distinct from NEW.state) then
   select * into i from career_task_intents_v1 where user_id=NEW.user_id and intent_id=NEW.intent_id;
   if i.claim_worker is not null and i.claim_lease_until<=now() then raise exception 'task owned lease revoked';end if;
  end if;
 elsif NEW.state='completed' and OLD.state is distinct from NEW.state and OLD.claim_worker is not null and OLD.claim_lease_until<=now() then raise exception 'task owned lease revoked';
 end if;return NEW;
end $$;
create trigger career_task_owned_effect_fence_v1 before insert or update on public.career_task_effects_v1 for each row execute function public.career_task_owned_lease_fence_v1();
create trigger career_task_owned_finish_fence_v1 before update on public.career_task_intents_v1 for each row execute function public.career_task_owned_lease_fence_v1();
revoke all on function public.career_task_owned_grant_v1(public.career_task_intents_v1),public.career_task_claim_owned_v1(uuid,text,text,uuid,uuid,uuid,integer),public.career_task_claim_readback_v1(uuid,text,uuid,uuid),public.career_task_pending_owned_v1(uuid),public.career_task_pending_scoped_v1(uuid,uuid,text,integer),public.career_task_owned_lease_fence_v1() from public,anon,authenticated;
grant execute on function public.career_task_owned_grant_v1(public.career_task_intents_v1),public.career_task_claim_owned_v1(uuid,text,text,uuid,uuid,uuid,integer),public.career_task_claim_readback_v1(uuid,text,uuid,uuid),public.career_task_pending_owned_v1(uuid),public.career_task_pending_scoped_v1(uuid,uuid,text,integer),public.career_task_owned_lease_fence_v1() to service_role;
