-- Local recovery preparation only. User-reported submission/closure is never
-- provider acceptance, entitlement, successful recovery or external authority.
create table if not exists public.agent_recovery_cases (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('bank_fee','duplicate_charge','stale_hold')),
 identity_hash text not null,material_hash text not null,
 version integer not null default 1 check(version between 1 and 2147483647),
 status text not null default 'open' check(status in ('open','user_reported_submitted','needs_review','closed_user')),
 source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='array'),
 amount_cents bigint not null check(amount_cents between 1 and 9007199254740991),currency text not null check(currency='USD'),
 deadline date,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,id),unique(user_id,kind,identity_hash)
);
create table if not exists public.agent_recovery_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,
 case_id uuid not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(user_id,request_id),foreign key(user_id,case_id) references public.agent_recovery_cases(user_id,id) on delete cascade
);
create table if not exists public.agent_recovery_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,case_id uuid not null,request_id uuid not null,
 event text not null,case_version integer not null,evidence jsonb not null,created_at timestamptz not null default now(),
 unique(user_id,request_id),foreign key(user_id,case_id) references public.agent_recovery_cases(user_id,id) on delete cascade
);
create index if not exists recovery_case_owner_page on public.agent_recovery_cases(user_id,created_at desc,id);
create or replace function public.agent_recovery_case_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' and not exists(select 1 from auth.users where id=old.user_id) then return old;end if;
 if tg_op<>'UPDATE' then raise exception 'recovery source evidence is immutable';end if;
 if (to_jsonb(new)-'status'-'version'-'updated_at') is distinct from (to_jsonb(old)-'status'-'version'-'updated_at') then
  raise exception 'recovery source evidence is immutable';
 end if;
 return new;
end $$;
drop trigger if exists recovery_case_immutable on public.agent_recovery_cases;
create trigger recovery_case_immutable before update or delete on public.agent_recovery_cases
 for each row execute function public.agent_recovery_case_immutable();
drop trigger if exists recovery_case_no_truncate on public.agent_recovery_cases;
create trigger recovery_case_no_truncate before truncate on public.agent_recovery_cases
 for each statement execute function public.agent_financial_evidence_immutable();
drop trigger if exists recovery_receipt_immutable on public.agent_recovery_receipts;
create trigger recovery_receipt_immutable before update or delete on public.agent_recovery_receipts
 for each row execute function public.agent_financial_evidence_immutable();
drop trigger if exists recovery_receipt_no_truncate on public.agent_recovery_receipts;
create trigger recovery_receipt_no_truncate before truncate on public.agent_recovery_receipts
 for each statement execute function public.agent_financial_evidence_immutable();
drop trigger if exists recovery_event_immutable on public.agent_recovery_events;
create trigger recovery_event_immutable before update or delete on public.agent_recovery_events
 for each row execute function public.agent_financial_evidence_immutable();
drop trigger if exists recovery_event_no_truncate on public.agent_recovery_events;
create trigger recovery_event_no_truncate before truncate on public.agent_recovery_events
 for each statement execute function public.agent_financial_evidence_immutable();
alter table public.agent_recovery_cases enable row level security;
alter table public.agent_recovery_receipts enable row level security;
alter table public.agent_recovery_events enable row level security;
drop policy if exists recovery_case_owner_read on public.agent_recovery_cases;
create policy recovery_case_owner_read on public.agent_recovery_cases for select using(auth.uid()=user_id);
drop policy if exists recovery_receipt_owner_read on public.agent_recovery_receipts;
create policy recovery_receipt_owner_read on public.agent_recovery_receipts for select using(auth.uid()=user_id);
drop policy if exists recovery_event_owner_read on public.agent_recovery_events;
create policy recovery_event_owner_read on public.agent_recovery_events for select using(auth.uid()=user_id);
revoke all on public.agent_recovery_cases,public.agent_recovery_receipts,public.agent_recovery_events from public,anon,authenticated,service_role;
grant select on public.agent_recovery_cases,public.agent_recovery_receipts,public.agent_recovery_events to authenticated;

create or replace function public.agent_recovery_case_json(c public.agent_recovery_cases)
returns jsonb language sql stable set search_path=public as $$
 select to_jsonb(c)||jsonb_build_object('source_stale',exists(
  select 1 from jsonb_array_elements(c.source_snapshot) s
  left join public.agent_financial_transactions t on t.user_id=c.user_id
   and t.account_id=s->>'account_id' and t.provider_transaction_id=s->>'provider_transaction_id'
  where t.fact_hash is distinct from s->>'fact_hash' or t.presence is distinct from 'observed'
   or t.is_pending is distinct from (s->>'is_pending')::boolean),
  'recovered_cents',null,'recovery_verification','unavailable_user_report_only')
$$;
revoke all on function public.agent_recovery_case_json(public.agent_recovery_cases) from public,anon,authenticated,service_role;

create or replace function public.agent_recovery_case_open(p_request uuid,p_kind text,p_evidence jsonb,p_due_on date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();request jsonb;prior public.agent_recovery_receipts;c public.agent_recovery_cases;
 r jsonb;tx public.agent_financial_transactions;snapshots jsonb:='[]';identities jsonb:='[]';idh text;mh text;result jsonb;
 a jsonb;b jsonb;dedup boolean:=false;
begin
 if uid is null then raise exception 'authenticated recovery owner required';end if;
 if p_request is null or p_kind is null or p_kind not in ('bank_fee','duplicate_charge','stale_hold')
  or jsonb_typeof(p_evidence) is distinct from 'array' then raise exception 'invalid recovery request';end if;
 if jsonb_array_length(p_evidence)<>case when p_kind='duplicate_charge' then 2 else 1 end then raise exception 'invalid recovery evidence count';end if;
 if p_due_on is not null and (not isfinite(p_due_on) or p_due_on<date '0001-01-01' or p_due_on>date '9999-12-31') then raise exception 'invalid recovery deadline';end if;
 request:=jsonb_build_object('action','open','kind',p_kind,'evidence',p_evidence,'due_on',p_due_on);
 -- Same order as ingestion/review locking; all request receipts and case
 -- identity dedup for this owner serialize without touching external systems.
 perform pg_advisory_xact_lock(hashtextextended('financial-sync:'||uid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('recovery-case:'||uid::text,0));
 select * into prior from public.agent_recovery_receipts where user_id=uid and request_id=p_request;
 if found then
  if prior.request is distinct from request then raise exception 'recovery request changed';end if;
  select * into c from public.agent_recovery_cases where id=prior.case_id and user_id=uid;
  return prior.result||jsonb_build_object('replay',true,'current_version',c.version,'superseded',c.version<>(prior.result->'case'->>'version')::integer);
 end if;
 for r in select value from jsonb_array_elements(p_evidence) order by value->>'account_id',value->>'transaction_id' loop
  if jsonb_typeof(r) is distinct from 'object' or (select count(*) from jsonb_object_keys(r))<>3
   or exists(select 1 from jsonb_object_keys(r) k where k not in ('account_id','transaction_id','fact_hash'))
   or jsonb_typeof(r->'account_id') is distinct from 'string' or jsonb_typeof(r->'transaction_id') is distinct from 'string'
   or jsonb_typeof(r->'fact_hash') is distinct from 'string' or r->>'fact_hash' !~ '^[a-f0-9]{64}$'
   or length(r->>'account_id') not between 1 and 200 or length(r->>'transaction_id') not between 1 and 200
   or r->>'account_id'<>btrim(r->>'account_id') or r->>'transaction_id'<>btrim(r->>'transaction_id')
   or r->>'account_id' ~ '[[:cntrl:]]' or r->>'transaction_id' ~ '[[:cntrl:]]'
  then raise exception 'invalid recovery evidence';end if;
  if identities @> jsonb_build_array(jsonb_build_array(r->>'account_id',r->>'transaction_id')) then raise exception 'duplicate recovery evidence identity';end if;
  identities:=identities||jsonb_build_array(jsonb_build_array(r->>'account_id',r->>'transaction_id'));
  select * into tx from public.agent_financial_transactions where user_id=uid and account_id=r->>'account_id'
   and provider_transaction_id=r->>'transaction_id';
  if not found then raise exception 'owned recovery transaction unavailable';end if;
  if tx.fact_hash is distinct from r->>'fact_hash' then raise exception 'recovery source facts changed';end if;
  if tx.presence<>'observed' or tx.currency<>'USD' or tx.amount_cents is null or tx.amount_cents>=0
   or tx.is_transfer or tx.posted_on is null or tx.posted_on>current_date
   or not isfinite(tx.posted_on) or tx.posted_on<date '0001-01-01' then raise exception 'recovery needs current negative USD bank facts';end if;
  if (p_kind='stale_hold' and (not tx.is_pending or current_date-tx.posted_on<7))
   or (p_kind<>'stale_hold' and tx.is_pending) then raise exception 'recovery posting state does not match candidate';end if;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('user_id',tx.user_id,'account_id',tx.account_id,
   'provider_transaction_id',tx.provider_transaction_id,'fact_hash',tx.fact_hash,'revision',tx.revision,'currency',tx.currency,
   'amount_cents',tx.amount_cents,'posted_on',tx.posted_on,'is_pending',tx.is_pending,'is_transfer',tx.is_transfer,
   'presence',tx.presence,'merchant_raw',tx.merchant_raw,'merchant_key',tx.merchant_key,'fetched_at',tx.fetched_at));
 end loop;
 a:=snapshots->0;b:=snapshots->1;
 if p_kind='duplicate_charge' and (a->>'account_id' is distinct from b->>'account_id'
  or coalesce(a->>'merchant_key','')='' or a->>'merchant_key' is distinct from b->>'merchant_key'
  or a->>'amount_cents' is distinct from b->>'amount_cents'
  or abs((a->>'posted_on')::date-(b->>'posted_on')::date)>3) then raise exception 'duplicate candidate facts do not match';end if;
 if p_kind='bank_fee' and (-(a->>'amount_cents')::bigint>50000
  or a->>'merchant_raw' ~* '\m(refund|reversal|reversed|credit|waived|waiver|courtesy|rebate|adjustment)\M'
  or not (a->>'merchant_raw' ~* '\m(overdraft|nsf|insufficient funds|returned item|maintenance|service charge|service fee|account fee|late fee|late payment fee|paper statement fee)\M'
   or a->>'merchant_raw' ~* '\m(atm|foreign|international)\M.*\mfee\M'
   or a->>'merchant_raw' ~* '\mod[[:space:]]+fee\M')) then raise exception 'unsupported fee candidate';end if;
 idh:=encode(sha256(convert_to(identities::text,'UTF8')),'hex');
 mh:=encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'source_snapshot',snapshots,'deadline',p_due_on)::text,'UTF8')),'hex');
 select * into c from public.agent_recovery_cases where user_id=uid and kind=p_kind and identity_hash=idh for update;
 if found then dedup:=true;
 else
  if exists(select 1 from public.agent_recovery_cases other,
   lateral jsonb_array_elements(other.source_snapshot) s,
   lateral jsonb_array_elements(snapshots) fresh
   where other.user_id=uid and other.status<>'closed_user'
    and s->>'account_id'=fresh->>'account_id'
    and s->>'provider_transaction_id'=fresh->>'provider_transaction_id') then
   raise exception 'active recovery case already covers source transaction';
  end if;
  insert into public.agent_recovery_cases(user_id,kind,identity_hash,material_hash,source_snapshot,amount_cents,currency,deadline)
   values(uid,p_kind,idh,mh,snapshots,-(a->>'amount_cents')::bigint,'USD',p_due_on) returning * into c;
 end if;
 result:=jsonb_build_object('case',public.agent_recovery_case_json(c),'replay',false,'deduplicated',dedup,'current_version',c.version,'superseded',false);
 insert into public.agent_recovery_receipts(user_id,request_id,case_id,request,result) values(uid,p_request,c.id,request,result);
 insert into public.agent_recovery_events(user_id,case_id,request_id,event,case_version,evidence)
  values(uid,c.id,p_request,case when dedup then 'linked_existing' else 'opened' end,c.version,
   jsonb_build_object('material_hash',c.material_hash,'source_stale',result->'case'->'source_stale','user_deadline',p_due_on,'external_effect',false));
 return result;
end $$;

create or replace function public.agent_recovery_case_transition(p_request uuid,p_case uuid,p_expected_version integer,p_status text,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();request jsonb;prior public.agent_recovery_receipts;c public.agent_recovery_cases;result jsonb;
begin
 if uid is null then raise exception 'authenticated recovery owner required';end if;
 if p_request is null or p_case is null or p_expected_version is null or p_expected_version not between 1 and 2147483646
  or p_status is null or p_status not in ('user_reported_submitted','closed_user','open')
  or p_confirmed is distinct from true then raise exception 'confirmed recovery transition required';end if;
 request:=jsonb_build_object('action','transition','case_id',p_case,'expected_version',p_expected_version,'status',p_status,'confirmed',p_confirmed);
 perform pg_advisory_xact_lock(hashtextextended('financial-sync:'||uid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('recovery-case:'||uid::text,0));
 select * into prior from public.agent_recovery_receipts where user_id=uid and request_id=p_request;
 if found then
  if prior.request is distinct from request then raise exception 'recovery request changed';end if;
  select * into c from public.agent_recovery_cases where id=prior.case_id and user_id=uid;
  return prior.result||jsonb_build_object('replay',true,'current_version',c.version,'superseded',c.version<>(prior.result->'case'->>'version')::integer);
 end if;
 select * into c from public.agent_recovery_cases where user_id=uid and id=p_case for update;
 if not found then raise exception 'recovery case unavailable';end if;
 if c.version<>p_expected_version then raise exception 'recovery case changed';end if;
 if p_status=c.status then raise exception 'recovery status unchanged';end if;
 if p_status='user_reported_submitted' and c.status not in ('open','needs_review') then raise exception 'reopen recovery case before reporting submission';end if;
 if p_status in ('user_reported_submitted','open') and (public.agent_recovery_case_json(c)->>'source_stale')::boolean then
  raise exception 'recovery source changed; review required';
 end if;
 if p_status='open' and exists(select 1 from public.agent_recovery_cases other,
  lateral jsonb_array_elements(other.source_snapshot) s,
  lateral jsonb_array_elements(c.source_snapshot) original
  where other.user_id=uid and other.id<>c.id and other.status<>'closed_user'
   and s->>'account_id'=original->>'account_id'
   and s->>'provider_transaction_id'=original->>'provider_transaction_id') then
  raise exception 'active recovery case already covers source transaction';
 end if;
 update public.agent_recovery_cases set status=p_status,version=version+1,updated_at=now() where id=c.id and user_id=uid returning * into c;
 result:=jsonb_build_object('case',public.agent_recovery_case_json(c),'replay',false,'current_version',c.version,'superseded',false);
 insert into public.agent_recovery_receipts(user_id,request_id,case_id,request,result) values(uid,p_request,c.id,request,result);
 insert into public.agent_recovery_events(user_id,case_id,request_id,event,case_version,evidence)
  values(uid,c.id,p_request,p_status,c.version,jsonb_build_object('user_report_only',true,'external_effect',false,'source_stale',result->'case'->'source_stale'));
 return result;
end $$;

create or replace function public.agent_recovery_case_page(p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();rows jsonb;
begin
 if uid is null then raise exception 'authenticated recovery owner required';end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'invalid recovery page';end if;
 select coalesce(jsonb_agg(public.agent_recovery_case_json(c) order by c.created_at desc,c.id),'[]'::jsonb) into rows
 from (select * from public.agent_recovery_cases where user_id=uid order by created_at desc,id offset p_offset limit 21) c;
 return jsonb_build_object('owner_id',uid,'cases',case when jsonb_array_length(rows)>20 then rows-20 else rows end,
  'next_offset',case when jsonb_array_length(rows)>20 then p_offset+20 else null end,
  'verified_recovered_cents',null,'recovery_verification','unavailable_user_report_only',
  'coverage','Owned local cases only. User-reported submission or closure is not provider acceptance or cash received.');
end $$;
revoke all on function public.agent_recovery_case_open(uuid,text,jsonb,date),
 public.agent_recovery_case_transition(uuid,uuid,integer,text,boolean),public.agent_recovery_case_page(integer) from public,anon,service_role;
grant execute on function public.agent_recovery_case_open(uuid,text,jsonb,date),
 public.agent_recovery_case_transition(uuid,uuid,integer,text,boolean),public.agent_recovery_case_page(integer) to authenticated;
