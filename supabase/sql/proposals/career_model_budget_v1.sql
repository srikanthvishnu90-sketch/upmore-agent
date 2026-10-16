-- SOURCE-ONLY proposal. No campaign row is seeded: absence/unreconciled state
-- must deny calls. Muse must scaffold a forward migration and reconcile the
-- original shared $5 before any enablement. No real allowance is created here.
create table public.career_model_campaign_v1 (
 campaign text primary key check(campaign='owner-shared-5usd'),
 provider text not null check(provider='openai'), model text not null,
 price_key text not null check(price_key ~ '^[a-f0-9]{64}$'),
 limit_micros bigint not null check(limit_micros between 1 and 5000000),
 opening_micros bigint not null check(opening_micros>=0),
 current_micros bigint not null default 0 check(current_micros>=0),
 reconciled boolean not null default false, expires_at timestamptz not null,
 check(opening_micros+current_micros<=limit_micros)
);
create table public.career_model_reservations_v1 (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null references agent_threads(id), turn_key text not null, request_hash text not null,
 payload_hash text not null, revision bigint not null, account_version bigint not null, epoch bigint not null,
 bound_micros bigint not null check(bound_micros between 1 and 25000),
 state text not null default 'reserved' check(state in ('reserved','started','recorded','unknown','not_sent')),
 cost_micros bigint, usage jsonb, expires_at timestamptz not null default now()+interval '30 seconds',
 unique(user_id,thread_id,turn_key)
);
create index career_model_unknown_v1 on public.career_model_reservations_v1(state) where state='unknown';
alter table public.career_model_campaign_v1 enable row level security;
alter table public.career_model_reservations_v1 enable row level security;
revoke all on public.career_model_campaign_v1,public.career_model_reservations_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.career_model_campaign_v1,public.career_model_reservations_v1 to service_role;
create policy career_model_campaign_backend on public.career_model_campaign_v1 for all to service_role using(true) with check(true);
create policy career_model_reservation_backend on public.career_model_reservations_v1 for all to service_role using(true) with check(true);
create function public.career_model_context_current_v1(p_user uuid,p_thread uuid,p_revision bigint,p_version bigint,p_epoch bigint) returns boolean language sql security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from agent_threads t left join agent_flow_state f on f.thread_id=t.id and f.user_id=p_user left join career_watch_kv a on a.user_id=p_user and a.key='career:account'
 where t.id=p_thread and t.user_id=p_user and coalesce((f.state#>>'{career,revision}')::bigint,0)=p_revision and coalesce((a.value->>'version')::bigint,0)=p_version and coalesce((a.value->>'epoch')::bigint,0)=p_epoch and a.value->'paused' is distinct from 'true'::jsonb);
$$;
create function public.career_model_budget_reserve_v1(p_user uuid,p_thread uuid,p_key text,p_hash text,p_payload text,p_revision bigint,p_version bigint,p_epoch bigint,p_provider text,p_model text,p_price text,p_bound bigint) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c career_model_campaign_v1;r career_model_reservations_v1;
begin
 if p_user is null or p_thread is null or coalesce(p_key,'') !~ '^[A-Za-z0-9_-]{1,128}$' or coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' or coalesce(p_payload,'') !~ '^[a-f0-9]{64}$' or coalesce(p_bound,0) not between 1 and 25000 or p_revision is null or p_version is null or p_epoch is null then return jsonb_build_object('ok',false,'reason','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch) then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd' for update;
 if c.campaign is null or not c.reconciled or c.expires_at<=now() or c.provider is distinct from p_provider or c.model is distinct from p_model or c.price_key is distinct from p_price then return jsonb_build_object('ok',false,'reason','budget_unavailable');end if;
 select * into r from career_model_reservations_v1 where user_id=p_user and thread_id=p_thread and turn_key=p_key;
 if r.id is not null then return jsonb_build_object('ok',false,'reason',case when r.request_hash<>p_hash or r.payload_hash<>p_payload then 'turn_key_conflict' else 'already_reserved' end);end if;
 if (select count(*) from career_model_reservations_v1 where state='unknown')>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 if c.opening_micros+c.current_micros+p_bound>c.limit_micros then return jsonb_build_object('ok',false,'reason','budget_exhausted');end if;
 insert into career_model_reservations_v1(user_id,thread_id,turn_key,request_hash,payload_hash,revision,account_version,epoch,bound_micros)values(p_user,p_thread,p_key,p_hash,p_payload,p_revision,p_version,p_epoch,p_bound) returning * into r;
 update career_model_campaign_v1 set current_micros=current_micros+p_bound where campaign=c.campaign;
 return jsonb_build_object('ok',true,'ticket',r.id,'boundMicros',r.bound_micros);
end $$;
create function public.career_model_budget_consume_v1(p_user uuid,p_ticket uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r career_model_reservations_v1;c career_model_campaign_v1;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into r from career_model_reservations_v1 where id=p_ticket and user_id=p_user for update;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd' for update;
 if r.id is null or r.state<>'reserved' or r.expires_at<=now() or c.campaign is null or not c.reconciled or c.expires_at<=now() or not career_model_context_current_v1(p_user,r.thread_id,r.revision,r.account_version,r.epoch) then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 update career_model_reservations_v1 set state='started' where id=r.id;
 return jsonb_build_object('ok',true,'ticket',r.id);
end $$;
create function public.career_model_budget_settle_v1(p_user uuid,p_ticket uuid,p_outcome text,p_cost bigint,p_usage jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r career_model_reservations_v1;charged bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into r from career_model_reservations_v1 where id=p_ticket and user_id=p_user for update;
 if r.id is null or coalesce(p_outcome,'') not in ('recorded','unknown','not_sent') then raise exception 'invalid owned model settlement';end if;
 if (p_outcome='not_sent' and (r.state not in ('reserved','not_sent') or p_cost is distinct from 0)) or (p_outcome='recorded' and (r.state not in ('started','recorded') or p_cost is null or p_cost<0 or p_cost>r.bound_micros or jsonb_typeof(p_usage) is distinct from 'object')) or (p_outcome='unknown' and r.state not in ('started','unknown')) then raise exception 'invalid model effect outcome';end if;
 charged:=case when p_outcome='unknown' then r.bound_micros else p_cost end;
 if r.state in ('recorded','unknown','not_sent') then
  if r.state<>p_outcome or r.cost_micros is distinct from charged or r.usage is distinct from p_usage then raise exception 'model settlement conflict';end if;
 else
  perform 1 from career_model_campaign_v1 where campaign='owner-shared-5usd' for update;
  if not found then raise exception 'model campaign missing during settlement';end if;
  update career_model_campaign_v1 set current_micros=current_micros-r.bound_micros+charged where campaign='owner-shared-5usd';
  update career_model_reservations_v1 set state=p_outcome,cost_micros=charged,usage=p_usage where id=r.id;
 end if;
 return jsonb_build_object('ok',true,'state',p_outcome,'contextCurrent',career_model_context_current_v1(p_user,r.thread_id,r.revision,r.account_version,r.epoch));
end $$;
revoke all on function public.career_model_context_current_v1(uuid,uuid,bigint,bigint,bigint),public.career_model_budget_reserve_v1(uuid,uuid,text,text,text,bigint,bigint,bigint,text,text,text,bigint),public.career_model_budget_consume_v1(uuid,uuid),public.career_model_budget_settle_v1(uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.career_model_context_current_v1(uuid,uuid,bigint,bigint,bigint),public.career_model_budget_reserve_v1(uuid,uuid,text,text,text,bigint,bigint,bigint,text,text,text,bigint),public.career_model_budget_consume_v1(uuid,uuid),public.career_model_budget_settle_v1(uuid,uuid,text,bigint,jsonb) to service_role;
