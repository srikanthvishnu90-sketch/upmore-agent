-- SOURCE-ONLY additive proposal. No policy, campaign, allowance or credentials
-- are seeded. Real enablement requires Muse's review and reconciliation of the
-- SAME original shared allowance. Native fixtures are explicitly disposable.
create table public.career_model_pair_policy_v2 (
 policy_digest text primary key check(policy_digest ~ '^[a-f0-9]{64}$'),
 provider text not null check(provider='openai'),
 model text not null check(model in ('gpt-5-nano','gpt-5-mini','gpt-4.1-nano')),
 price_key text not null check(price_key ~ '^[a-f0-9]{64}$'),
 input_nanos bigint not null check(input_nanos between 1 and 10000000),
 cached_nanos bigint not null check(cached_nanos between 0 and input_nanos),
 output_nanos bigint not null check(output_nanos between 1 and 10000000),
 generation_config_digest text not null check(generation_config_digest ~ '^[a-f0-9]{64}$'),
 verification_config_digest text not null check(verification_config_digest ~ '^[a-f0-9]{64}$'),
 max_input_bound bigint not null check(max_input_bound between 1 and 1000000),
 max_generation_output bigint not null check(max_generation_output between 1 and 16384),
 max_verification_output bigint not null check(max_verification_output between 1 and 16384),
 active boolean not null default false
);
-- Equivalent existing storage owns the global obligation and monthly slot.
create unique index career_pair_thread_owner_v2 on public.agent_threads(id,user_id);
create unique index career_pair_ticket_owner_v2 on public.career_model_reservations_v1(id,user_id,thread_id);
create unique index career_pair_monthly_owner_v2 on public.agent_model_calls(id,user_id,thread_id);
create table public.career_model_pairs_v2 (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null,
 turn_key text not null check(turn_key ~ '^[A-Za-z0-9_-]{1,128}$'),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 revision bigint not null check(revision>=0),account_version bigint not null check(account_version>=0),epoch bigint not null check(epoch>=0),
 policy_digest text not null references public.career_model_pair_policy_v2(policy_digest),
 generation_payload text not null check(generation_payload ~ '^[a-f0-9]{64}$'),
 verification_envelope text not null check(verification_envelope ~ '^[a-f0-9]{64}$'),
 parent_bound_micros bigint not null check(parent_bound_micros between 2 and 50000),
 created_at timestamptz not null default clock_timestamp(),deadline timestamptz not null,
 publication_state text not null default 'not_published' check(publication_state in ('not_published','verified_uncommitted','published','stale_context')),
 settlement_revision bigint not null default 0 check(settlement_revision between 0 and 2),
 unique(user_id,thread_id,turn_key),unique(id,user_id,thread_id),
 foreign key(thread_id,user_id)references public.agent_threads(id,user_id)
);
create table public.career_model_pair_legs_v2 (
 pair_id uuid not null,user_id uuid not null,thread_id uuid not null,
 kind text not null check(kind in ('generation','verification')),
 ticket_id uuid not null unique,monthly_id uuid unique,
 config_digest text not null check(config_digest ~ '^[a-f0-9]{64}$'),
 input_bound bigint not null check(input_bound between 1 and 1000000),output_bound bigint not null check(output_bound between 1 and 16384),
 reserved_envelope text not null check(reserved_envelope ~ '^[a-f0-9]{64}$'),
 dispatched_payload text check(dispatched_payload ~ '^[a-f0-9]{64}$'),dispatched_input bigint,dispatched_output bigint,
 started_at timestamptz,settled_at timestamptz,settlement_request_hash text check(settlement_request_hash ~ '^[a-f0-9]{64}$'),
 raw_usage_receipt jsonb,provider_response_id text,
 primary key(pair_id,kind),
 foreign key(pair_id,user_id,thread_id)references public.career_model_pairs_v2(id,user_id,thread_id)on delete cascade,
 foreign key(ticket_id,user_id,thread_id)references public.career_model_reservations_v1(id,user_id,thread_id),
 foreign key(monthly_id,user_id,thread_id)references public.agent_model_calls(id,user_id,thread_id),
 check((dispatched_payload is null and dispatched_input is null and dispatched_output is null and started_at is null)or(dispatched_payload is not null and dispatched_input between 1 and input_bound and dispatched_output between 1 and output_bound and started_at is not null))
);
create index career_pair_owner_thread_v2 on public.career_model_pairs_v2(user_id,thread_id);
alter table public.career_model_pair_policy_v2 enable row level security;
alter table public.career_model_pairs_v2 enable row level security;
alter table public.career_model_pair_legs_v2 enable row level security;
revoke all on public.career_model_pair_policy_v2,public.career_model_pairs_v2,public.career_model_pair_legs_v2 from public,anon,authenticated;
grant select,insert on public.career_model_pair_policy_v2 to service_role;
grant update(active)on public.career_model_pair_policy_v2 to service_role;
grant select,insert,update,delete on public.career_model_pairs_v2,public.career_model_pair_legs_v2 to service_role;
grant select on public.agent_usage to service_role;
-- Existing monthly RLS only defines client owner reads. Keep that policy and
-- RLS intact; invoker RPCs need explicit backend read and reserved-slot refund.
-- Recorded monthly rows remain outside this delete policy.
create policy career_pair_monthly_backend_read_v2 on public.agent_model_calls for select to service_role using(true);
create policy career_pair_monthly_unsent_refund_v2 on public.agent_model_calls for delete to service_role using(state='reserved'and usage is null);
create policy career_pair_policy_backend_v2 on public.career_model_pair_policy_v2 for all to service_role using(true)with check(true);
create policy career_pair_parent_backend_v2 on public.career_model_pairs_v2 for all to service_role using(true)with check(true);
create policy career_pair_leg_backend_v2 on public.career_model_pair_legs_v2 for all to service_role using(true)with check(true);

create function public.career_model_pair_read_v2(p_user uuid,p_pair uuid)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p career_model_pairs_v2;g jsonb;v jsonb;known bigint;held bigint;uncertain bigint;terminal bigint;possible bigint;confirmed bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from career_model_pairs_v2 where id=p_pair and user_id=p_user;
 if p.id is null or not exists(select 1 from agent_threads where id=p.thread_id and user_id=p_user)then return jsonb_build_object('ok',false,'reason','not_found');end if;
 select jsonb_object_agg(l.kind,jsonb_build_object('kind',l.kind,'ticket',r.id,'monthly_call_id',l.monthly_id,'bound_micros',r.bound_micros,'state',r.state,'cost_micros',r.cost_micros,'dispatch_payload',l.dispatched_payload,'config_digest',l.config_digest,'receipt_ref',case when l.settlement_request_hash is not null then l.ticket_id::text else null end)) into g
 from career_model_pair_legs_v2 l join career_model_reservations_v1 r on r.id=l.ticket_id and r.user_id=l.user_id and r.thread_id=l.thread_id where l.pair_id=p.id and l.user_id=p_user and l.thread_id=p.thread_id;
 v:=g->'verification';g:=g->'generation';
 select coalesce(sum(r.cost_micros)filter(where r.state='recorded'),0),coalesce(sum(r.bound_micros)filter(where r.state='reserved'),0),coalesce(sum(r.bound_micros)filter(where r.state in('started','unknown')),0),count(*)filter(where r.state in('recorded','unknown','not_sent')),count(*)filter(where r.state in('started','recorded','unknown')),count(*)filter(where r.state='recorded'and l.raw_usage_receipt is not null)
 into known,held,uncertain,terminal,possible,confirmed from career_model_pair_legs_v2 l join career_model_reservations_v1 r on r.id=l.ticket_id and r.user_id=p_user and r.thread_id=p.thread_id where l.pair_id=p.id and l.user_id=p_user and l.thread_id=p.thread_id;
 return jsonb_build_object('ok',true,'pair_id',p.id,'generation',g,'verification',v,'parent_bound_micros',p.parent_bound_micros,'known_cost_micros',known,'held_micros',held,'uncertain_micros',uncertain,'accounting_state',case when uncertain>0 then 'uncertain'when terminal=2 then 'settled'else 'reserved'end,'publication_state',p.publication_state,'settlement_revision',p.settlement_revision,'deadline',p.deadline,'provider_calls_possible',possible,'provider_calls_confirmed',confirmed,'dispatch_count_basis','started legs may have dispatched; only recorded receipts confirm responses','contextCurrent',career_model_context_current_v1(p_user,p.thread_id,p.revision,p.account_version,p.epoch));
end $$;

create function public.career_model_pair_reserve_v2(p_user uuid,p_thread uuid,p_key text,p_hash text,p_revision bigint,p_version bigint,p_epoch bigint,p_policy text,p_generation_payload text,p_verification_envelope text,p_generation_input bigint,p_generation_output bigint,p_verification_input bigint,p_verification_output bigint)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p career_model_pairs_v2;pol career_model_pair_policy_v2;c career_model_campaign_v1;gb bigint;vb bigint;g jsonb;v jsonb;gm jsonb;vm jsonb;result jsonb;
begin
 if p_user is null or p_thread is null or coalesce(p_key,'')!~'^[A-Za-z0-9_-]{1,128}$'or coalesce(p_hash,'')!~'^[a-f0-9]{64}$'or coalesce(p_policy,'')!~'^[a-f0-9]{64}$'or coalesce(p_generation_payload,'')!~'^[a-f0-9]{64}$'or coalesce(p_verification_envelope,'')!~'^[a-f0-9]{64}$'or p_revision is null or p_version is null or p_epoch is null or p_revision<0 or p_version<0 or p_epoch<0 then return jsonb_build_object('ok',false,'reason','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not career_model_context_current_v1(p_user,p_thread,p_revision,p_version,p_epoch)then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 select * into p from career_model_pairs_v2 where user_id=p_user and thread_id=p_thread and turn_key=p_key;
 if p.id is not null then
  if p.request_hash is distinct from p_hash or p.policy_digest is distinct from p_policy or p.generation_payload is distinct from p_generation_payload or p.verification_envelope is distinct from p_verification_envelope or p.revision<>p_revision or p.account_version<>p_version or p.epoch<>p_epoch or not exists(select 1 from career_model_pair_legs_v2 where pair_id=p.id and kind='generation'and input_bound=p_generation_input and output_bound=p_generation_output)or not exists(select 1 from career_model_pair_legs_v2 where pair_id=p.id and kind='verification'and input_bound=p_verification_input and output_bound=p_verification_output)then return jsonb_build_object('ok',false,'reason','turn_key_conflict');end if;
  return career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('is_new',false);
 end if;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p_policy and active for share;
 if pol.policy_digest is null then return jsonb_build_object('ok',false,'reason','policy_unavailable');end if;
 if coalesce(p_generation_input,0)not between 1 and pol.max_input_bound or coalesce(p_verification_input,0)not between 1 and pol.max_input_bound or coalesce(p_generation_output,0)not between 1 and pol.max_generation_output or coalesce(p_verification_output,0)not between 1 and pol.max_verification_output then return jsonb_build_object('ok',false,'reason','invalid_bounds');end if;
 gb:=(p_generation_input*pol.input_nanos+p_generation_output*pol.output_nanos+999)/1000;vb:=(p_verification_input*pol.input_nanos+p_verification_output*pol.output_nanos+999)/1000;
 if gb not between 1 and 25000 or vb not between 1 and 25000 then return jsonb_build_object('ok',false,'reason','invalid_bounds');end if;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd'for update;
 if c.campaign is null or not c.reconciled or c.expires_at<=clock_timestamp()or c.provider is distinct from pol.provider or c.model is distinct from pol.model or c.price_key is distinct from pol.price_key then return jsonb_build_object('ok',false,'reason','budget_unavailable');end if;
 if(select count(*)from(select 1 from career_model_reservations_v1 where state='unknown'or(state='started'and expires_at<=clock_timestamp())limit 3)u)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 if c.opening_micros+c.current_micros+gb+vb>c.limit_micros then return jsonb_build_object('ok',false,'reason','budget_exhausted');end if;
 -- The subtransaction rolls back BOTH global holds and any first monthly slot
 -- when the second slot is unavailable. Legacy monthly admission holds its
 -- existing auth-user quota lock through this outer transaction.
 begin
  insert into career_model_pairs_v2(user_id,thread_id,turn_key,request_hash,revision,account_version,epoch,policy_digest,generation_payload,verification_envelope,parent_bound_micros,deadline)values(p_user,p_thread,p_key,p_hash,p_revision,p_version,p_epoch,p_policy,p_generation_payload,p_verification_envelope,gb+vb,clock_timestamp()+interval '20 seconds')returning * into p;
  g:=career_model_budget_reserve_v1(p_user,p_thread,'p2_'||replace(p.id::text,'-','')||'_g',p_hash,p_generation_payload,p_revision,p_version,p_epoch,pol.provider,pol.model,pol.price_key,gb);
  v:=career_model_budget_reserve_v1(p_user,p_thread,'p2_'||replace(p.id::text,'-','')||'_v',p_hash,p_verification_envelope,p_revision,p_version,p_epoch,pol.provider,pol.model,pol.price_key,vb);
  if g->>'ok'is distinct from 'true'or v->>'ok'is distinct from 'true'then raise exception 'paired global reservation could not be confirmed';end if;
  gm:=agent_model_call_reserve(p_user,p_thread,p.id,0,pol.model);vm:=agent_model_call_reserve(p_user,p_thread,p.id,1,pol.model);
  if gm->>'ok'is distinct from 'true'or vm->>'ok'is distinct from 'true'then raise sqlstate 'P0003'using message='paired monthly quota unavailable';end if;
  update career_model_reservations_v1 set expires_at=p.deadline where id in((g->>'ticket')::uuid,(v->>'ticket')::uuid)and user_id=p_user and thread_id=p_thread;
  insert into career_model_pair_legs_v2(pair_id,user_id,thread_id,kind,ticket_id,monthly_id,config_digest,input_bound,output_bound,reserved_envelope)values(p.id,p_user,p_thread,'generation',(g->>'ticket')::uuid,(gm->>'call_id')::uuid,pol.generation_config_digest,p_generation_input,p_generation_output,p_generation_payload),(p.id,p_user,p_thread,'verification',(v->>'ticket')::uuid,(vm->>'call_id')::uuid,pol.verification_config_digest,p_verification_input,p_verification_output,p_verification_envelope);
  result:=career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('is_new',true);
 exception when sqlstate 'P0003'then return jsonb_build_object('ok',false,'reason','monthly_limit');end;
 return result;
end $$;

create function public.career_model_leg_consume_v2(p_user uuid,p_pair uuid,p_kind text,p_payload text,p_envelope text,p_input bigint,p_output bigint)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p career_model_pairs_v2;l career_model_pair_legs_v2;r career_model_reservations_v1;pol career_model_pair_policy_v2;c career_model_campaign_v1;used jsonb;
begin
 if p_user is null or coalesce(p_kind,'')not in('generation','verification')or coalesce(p_payload,'')!~'^[a-f0-9]{64}$'then return jsonb_build_object('ok',false,'reason','invalid_request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from career_model_pairs_v2 where id=p_pair and user_id=p_user;
 select * into l from career_model_pair_legs_v2 where pair_id=p_pair and user_id=p_user and kind=p_kind for update;
 if p.id is null or l.ticket_id is null then return jsonb_build_object('ok',false,'reason','not_found');end if;
 select * into r from career_model_reservations_v1 where id=l.ticket_id and user_id=p_user and thread_id=p.thread_id for update;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p.policy_digest and active for share;
 select * into c from career_model_campaign_v1 where campaign='owner-shared-5usd'for update;
 if r.id is null or r.state<>'reserved'or p.deadline<=clock_timestamp()or r.expires_at<=clock_timestamp()or not career_model_context_current_v1(p_user,p.thread_id,p.revision,p.account_version,p.epoch)then return jsonb_build_object('ok',false,'reason','context_changed');end if;
 if pol.policy_digest is null or c.campaign is null or not c.reconciled or c.expires_at<=clock_timestamp()or c.provider is distinct from pol.provider or c.model is distinct from pol.model or c.price_key is distinct from pol.price_key or r.provider is distinct from pol.provider or r.model is distinct from pol.model or r.price_key is distinct from pol.price_key or l.config_digest is distinct from(case when p_kind='generation'then pol.generation_config_digest else pol.verification_config_digest end)then return jsonb_build_object('ok',false,'reason','policy_unavailable');end if;
 if(select count(*)from(select 1 from career_model_reservations_v1 where state='unknown'or(state='started'and expires_at<=clock_timestamp())limit 3)u)>=3 then return jsonb_build_object('ok',false,'reason','usage_review_required');end if;
 if p_envelope is distinct from l.reserved_envelope or coalesce(p_input,0)not between 1 and l.input_bound or coalesce(p_output,0)not between 1 and l.output_bound or(p_kind='generation'and(p_payload is distinct from p.generation_payload or p_input<>l.input_bound or p_output<>l.output_bound))then return jsonb_build_object('ok',false,'reason','payload_conflict');end if;
 if p_kind='verification'and not exists(select 1 from career_model_pair_legs_v2 g join career_model_reservations_v1 t on t.id=g.ticket_id and t.user_id=p_user where g.pair_id=p.id and g.user_id=p_user and g.kind='generation'and t.state='recorded'and g.raw_usage_receipt is not null)then return jsonb_build_object('ok',false,'reason','generation_not_recorded');end if;
 used:=career_model_budget_consume_v1(p_user,l.ticket_id);if used->>'ok'is distinct from 'true'then return used;end if;
 update career_model_pair_legs_v2 set dispatched_payload=p_payload,dispatched_input=p_input,dispatched_output=p_output,started_at=clock_timestamp()where pair_id=p.id and user_id=p_user and kind=p_kind;
 return jsonb_build_object('ok',true,'pair_id',p.id,'kind',p_kind,'ticket',l.ticket_id,'payload_sha256',p_payload);
end $$;

create function public.career_model_leg_settle_v2(p_user uuid,p_pair uuid,p_kind text,p_outcome text,p_receipt jsonb)returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p career_model_pairs_v2;l career_model_pair_legs_v2;r career_model_reservations_v1;pol career_model_pair_policy_v2;fingerprint text;valid boolean:=true;u jsonb;details jsonb;prompt bigint;completion bigint;cached bigint:=0;cost bigint;outcome text;normalized jsonb;k text;done jsonb;deleted bigint;
begin
 if p_user is null or coalesce(p_kind,'')not in('generation','verification')or coalesce(p_outcome,'')not in('recorded','unknown','not_sent')then raise exception 'invalid owned pair settlement';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into p from career_model_pairs_v2 where id=p_pair and user_id=p_user for update;
 select * into l from career_model_pair_legs_v2 where pair_id=p_pair and user_id=p_user and kind=p_kind for update;
 if p.id is null or l.ticket_id is null then raise exception 'invalid owned pair settlement';end if;
 select * into r from career_model_reservations_v1 where id=l.ticket_id and user_id=p_user and thread_id=p.thread_id for update;
 select * into pol from career_model_pair_policy_v2 where policy_digest=p.policy_digest;
 if r.id is null or pol.policy_digest is null then raise exception 'pair obligation unavailable';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('outcome',p_outcome,'receipt',p_receipt)::text,'UTF8')),'hex');
 if l.settlement_request_hash is not null then
  if l.settlement_request_hash<>fingerprint then raise exception 'paired settlement conflict';end if;
  return career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('state',r.state,'cost_micros',r.cost_micros);
 end if;
 if p_outcome='not_sent'then
  if r.state<>'reserved'or p_receipt is not null then raise exception 'started calls cannot refund';end if;
  update career_model_pair_legs_v2 set monthly_id=null where pair_id=p.id and user_id=p_user and kind=p_kind;
  delete from agent_model_calls where id=l.monthly_id and user_id=p_user and thread_id=p.thread_id and request_id=p.id and step=case when p_kind='generation'then 0 else 1 end and state='reserved'and usage is null;
  get diagnostics deleted=row_count;if deleted<>1 then raise exception 'monthly refund unconfirmed';end if;
  done:=career_model_budget_settle_v1(p_user,l.ticket_id,'not_sent',0,'{}'::jsonb);outcome:='not_sent';cost:=0;
 else
  if r.state<>'started'or l.dispatched_payload is null then raise exception 'only started legs may settle usage';end if;
  valid:=p_outcome='recorded'and jsonb_typeof(p_receipt)='object'and octet_length(p_receipt::text)<=16384;
  if valid then
   valid:=p_receipt->>'version'='gateway_usage_receipt/v1'and p_receipt->>'provider'=pol.provider and p_receipt->>'configured_model'=pol.model and p_receipt->>'response_model'=pol.model and coalesce(p_receipt->>'response_id','')~'^[A-Za-z0-9_-]{1,128}$'and p_receipt->>'request_body_sha256'=l.dispatched_payload and coalesce(p_receipt->>'response_body_sha256','')~'^[a-f0-9]{64}$'and jsonb_typeof(p_receipt->'usage')='object';
   if p_receipt?'config_digest' and p_receipt->>'config_digest' is distinct from l.config_digest then valid:=false;end if;
   if exists(select 1 from jsonb_object_keys(p_receipt)t(k)where t.k not in('version','provider','configured_model','response_model','response_id','request_body_sha256','response_body_sha256','usage','config_digest'))then valid:=false;end if;
  end if;
  if coalesce(valid,false)then
   u:=p_receipt->'usage';
   if exists(select 1 from jsonb_object_keys(u)t(k)where t.k not in('prompt_tokens','completion_tokens','total_tokens','prompt_tokens_details','completion_tokens_details'))then valid:=false;end if;
   foreach k in array array['prompt_tokens','completion_tokens']loop if jsonb_typeof(u->k)is distinct from 'number'or coalesce(u->>k,'')!~'^[0-9]{1,8}$'then valid:=false;end if;end loop;
   if valid then
    prompt:=(u->>'prompt_tokens')::bigint;completion:=(u->>'completion_tokens')::bigint;
    if prompt>10000000 or completion>10000000 or prompt>l.dispatched_input or completion>l.dispatched_output then valid:=false;end if;
    if u?'total_tokens'then if jsonb_typeof(u->'total_tokens')is distinct from 'number'or coalesce(u->>'total_tokens','')!~'^[0-9]{1,8}$'then valid:=false;elsif(u->>'total_tokens')::bigint<>prompt+completion then valid:=false;end if;end if;
    details:=u->'prompt_tokens_details';
    if details is not null and details<>'null'::jsonb then
     if jsonb_typeof(details)is distinct from 'object'then valid:=false;
     else
      if exists(select 1 from jsonb_object_keys(details)t(k)where t.k<>'cached_tokens')then valid:=false;end if;
      if details?'cached_tokens'then if jsonb_typeof(details->'cached_tokens')is distinct from 'number'or coalesce(details->>'cached_tokens','')!~'^[0-9]{1,8}$'then valid:=false;else cached:=(details->>'cached_tokens')::bigint;end if;end if;
     end if;
    end if;
    details:=u->'completion_tokens_details';
    if details is not null and details<>'null'::jsonb then
     if jsonb_typeof(details)is distinct from 'object'then valid:=false;
     else
      if exists(select 1 from jsonb_object_keys(details)t(k)where t.k<>'reasoning_tokens')then valid:=false;end if;
      if details?'reasoning_tokens'then if jsonb_typeof(details->'reasoning_tokens')is distinct from 'number'or coalesce(details->>'reasoning_tokens','')!~'^[0-9]{1,8}$'then valid:=false;elsif(details->>'reasoning_tokens')::bigint>completion then valid:=false;end if;end if;
     end if;
    end if;
    if cached>prompt then valid:=false;end if;
    if valid then cost:=((prompt-cached)*pol.input_nanos+cached*pol.cached_nanos+completion*pol.output_nanos+999)/1000;if cost>r.bound_micros then valid:=false;end if;end if;
   end if;
  end if;
  if coalesce(valid,false)then
   normalized:=jsonb_build_object('input_tokens',prompt-cached,'output_tokens',completion,'cache_read_tokens',cached,'cache_write_tokens',0);
   perform agent_model_call_record(l.monthly_id,normalized);
   if not exists(select 1 from agent_model_calls m join agent_usage a on a.call_id=m.id and a.user_id=m.user_id and a.thread_id=m.thread_id where m.id=l.monthly_id and m.user_id=p_user and m.thread_id=p.thread_id and m.request_id=p.id and m.step=case when p_kind='generation'then 0 else 1 end and m.state='recorded'and m.usage=normalized and a.model=pol.model and a.input_tokens=prompt-cached and a.output_tokens=completion and a.cache_read_tokens=cached and a.cache_write_tokens=0)then raise exception 'monthly usage readback unconfirmed';end if;
   done:=career_model_budget_settle_v1(p_user,l.ticket_id,'recorded',cost,p_receipt);outcome:='recorded';
  else
   cost:=r.bound_micros;done:=career_model_budget_settle_v1(p_user,l.ticket_id,'unknown',null,null);outcome:='unknown';
  end if;
 end if;
 if done->>'ok'is distinct from 'true'then raise exception 'paired global settlement unconfirmed';end if;
 update career_model_pair_legs_v2 set settlement_request_hash=fingerprint,settled_at=clock_timestamp(),raw_usage_receipt=case when outcome='recorded'then p_receipt else null end,provider_response_id=case when outcome='recorded'then p_receipt->>'response_id'else null end where pair_id=p.id and user_id=p_user and kind=p_kind;
 update career_model_pairs_v2 set settlement_revision=settlement_revision+1 where id=p.id and user_id=p_user;
 return career_model_pair_read_v2(p_user,p.id)||jsonb_build_object('state',outcome,'cost_micros',cost);
end $$;

revoke all on function public.career_model_pair_read_v2(uuid,uuid),public.career_model_pair_reserve_v2(uuid,uuid,text,text,bigint,bigint,bigint,text,text,text,bigint,bigint,bigint,bigint),public.career_model_leg_consume_v2(uuid,uuid,text,text,text,bigint,bigint),public.career_model_leg_settle_v2(uuid,uuid,text,text,jsonb)from public,anon,authenticated;
grant execute on function public.career_model_pair_read_v2(uuid,uuid),public.career_model_pair_reserve_v2(uuid,uuid,text,text,bigint,bigint,bigint,text,text,text,bigint,bigint,bigint,bigint),public.career_model_leg_consume_v2(uuid,uuid,text,text,text,bigint,bigint),public.career_model_leg_settle_v2(uuid,uuid,text,text,jsonb)to service_role;
