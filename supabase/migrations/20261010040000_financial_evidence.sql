-- Canonical server-side bank evidence; all money is exact signed minor units.
-- Read-only connectors do not establish payment authority or complete coverage.
create table if not exists public.agent_financial_accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null check(length(account_id) between 1 and 200),
  provider text not null check(provider='simplefin'), provider_account_id text not null,
  name text not null, institution text, currency text not null check(currency ~ '^[A-Z]{3}$'),
  account_kind text not null default 'unknown'
    check(account_kind in ('checking','savings','cash','credit','investment','loan','other','unknown')),
  balance_cents bigint check(balance_cents between -9007199254740991 and 9007199254740991),
  available_cents bigint check(available_cents between -9007199254740991 and 9007199254740991),
  raw_balance text, balance_as_of timestamptz, fetched_at timestamptz not null,
  sync_error boolean not null default false, status text not null default 'active' check(status in ('active','disconnected')),
  primary key(user_id,account_id), unique(user_id,account_id,currency), unique(user_id,provider,provider_account_id)
);
create table if not exists public.agent_financial_transactions (
  user_id uuid not null, account_id text not null, provider_transaction_id text not null,
  currency text not null, amount_cents bigint check(amount_cents between -9007199254740991 and 9007199254740991),
  raw_amount text, posted_on date, merchant_raw text not null, merchant_key text not null,
  is_pending boolean not null, is_transfer boolean not null default false,
  pending_provider_id text, presence text not null default 'observed' check(presence in ('observed','not_seen','superseded')),
  fetched_at timestamptz not null,
  primary key(user_id,account_id,provider_transaction_id),
  foreign key(user_id,account_id,currency) references public.agent_financial_accounts(user_id,account_id,currency) on delete cascade,
  check(is_pending or posted_on is not null)
);
create index if not exists agent_financial_transactions_history_idx on public.agent_financial_transactions(user_id,posted_on,account_id);
create table if not exists public.agent_account_preferences (
  user_id uuid not null, account_id text not null,
  account_kind text not null check(account_kind in ('checking','savings','cash','credit','investment','loan','other','unknown')),
  updated_at timestamptz not null default now(), primary key(user_id,account_id),
  foreign key(user_id,account_id) references public.agent_financial_accounts(user_id,account_id) on delete cascade
);
create table if not exists public.agent_financial_syncs (
  user_id uuid not null references auth.users(id) on delete cascade, provider text not null check(provider='simplefin'),
  fetched_at timestamptz not null, requested_start date, requested_end date,
  errors jsonb not null default '[]'::jsonb check(jsonb_typeof(errors)='array'),
  coverage_complete boolean not null default false check(coverage_complete=false),
  status text not null default 'active' check(status in ('active','error','disconnected')),
  primary key(user_id,provider)
);
alter table public.agent_financial_accounts enable row level security;
alter table public.agent_financial_transactions enable row level security;
alter table public.agent_account_preferences enable row level security;
alter table public.agent_financial_syncs enable row level security;
drop policy if exists financial_accounts_owner_read on public.agent_financial_accounts;
create policy financial_accounts_owner_read on public.agent_financial_accounts for select using(auth.uid()=user_id);
drop policy if exists financial_transactions_owner_read on public.agent_financial_transactions;
create policy financial_transactions_owner_read on public.agent_financial_transactions for select using(auth.uid()=user_id);
drop policy if exists financial_preferences_owner_read on public.agent_account_preferences;
create policy financial_preferences_owner_read on public.agent_account_preferences for select using(auth.uid()=user_id);
drop policy if exists financial_syncs_owner_read on public.agent_financial_syncs;
create policy financial_syncs_owner_read on public.agent_financial_syncs for select using(auth.uid()=user_id);
revoke insert,update,delete on public.agent_financial_accounts,public.agent_financial_transactions,
 public.agent_account_preferences,public.agent_financial_syncs from anon,authenticated;
grant select on public.agent_financial_accounts,public.agent_financial_transactions,
 public.agent_account_preferences,public.agent_financial_syncs to authenticated;

create or replace function public.agent_financial_ingest(p_user uuid,p_batch jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a jsonb; t jsonb; stamp timestamptz; previous timestamptz; n_accounts integer:=0; n_transactions integer:=0;
begin
  -- Serialize account snapshots and a disconnect against this ingestion.
  perform pg_advisory_xact_lock(hashtextextended('financial-sync:'||p_user::text,0));
  perform user_id from public.simplefin_connections where user_id=p_user for update;
  if not found then raise exception 'bank connection unavailable'; end if;
  if p_batch->>'ok' is distinct from 'true' or jsonb_typeof(p_batch->'accounts') is distinct from 'array'
    or jsonb_typeof(p_batch->'transactions') is distinct from 'array' or jsonb_typeof(p_batch->'errors') is distinct from 'array' then
    raise exception 'invalid bank batch';
  end if;
  stamp := (p_batch->>'fetched_at')::timestamptz;
  if stamp is null or stamp>now()+interval '1 minute' then raise exception 'invalid fetch timestamp'; end if;
  select fetched_at into previous from public.agent_financial_syncs where user_id=p_user and provider='simplefin';
  if previous is not null and previous>stamp then return jsonb_build_object('ok',true,'ignored_stale_batch',true); end if;
  for a in select value from jsonb_array_elements(p_batch->'accounts') loop
    if a->>'provider' <> 'simplefin' or a->>'account_id' is distinct from 'simplefin:'||(a->>'provider_account_id') then
      raise exception 'account namespace mismatch';
    end if;
    if exists(select 1 from public.agent_financial_accounts where user_id=p_user and account_id=a->>'account_id' and currency is distinct from a->>'currency') then
      raise exception 'account currency changed';
    end if;
    insert into public.agent_financial_accounts(user_id,account_id,provider,provider_account_id,name,institution,currency,
      account_kind,balance_cents,available_cents,raw_balance,balance_as_of,fetched_at,sync_error,status)
    values(p_user,a->>'account_id','simplefin',a->>'provider_account_id',a->>'name',a->>'institution',a->>'currency',
      a->>'account_kind',(a->>'balance_cents')::bigint,(a->>'available_cents')::bigint,a->>'raw_balance',
      (a->>'balance_as_of')::timestamptz,stamp,jsonb_array_length(p_batch->'errors')>0,'active')
    on conflict(user_id,account_id) do update set name=excluded.name,institution=excluded.institution,
      balance_cents=case when excluded.balance_as_of is null or agent_financial_accounts.balance_as_of is null or excluded.balance_as_of>=agent_financial_accounts.balance_as_of
        then excluded.balance_cents else agent_financial_accounts.balance_cents end,
      available_cents=case when excluded.balance_as_of is null or agent_financial_accounts.balance_as_of is null or excluded.balance_as_of>=agent_financial_accounts.balance_as_of
        then excluded.available_cents else agent_financial_accounts.available_cents end,
      raw_balance=case when excluded.balance_as_of is null or agent_financial_accounts.balance_as_of is null or excluded.balance_as_of>=agent_financial_accounts.balance_as_of
        then excluded.raw_balance else agent_financial_accounts.raw_balance end,
      balance_as_of=case when excluded.balance_as_of is null or agent_financial_accounts.balance_as_of is null or excluded.balance_as_of>=agent_financial_accounts.balance_as_of
        then excluded.balance_as_of else agent_financial_accounts.balance_as_of end,
      fetched_at=stamp,sync_error=excluded.sync_error,status='active';
    n_accounts:=n_accounts+1;
  end loop;
  -- Disappearing pending rows become unknown, never fabricated cancellations.
  if jsonb_array_length(p_batch->'errors')=0 then
    update public.agent_financial_transactions tx set presence='not_seen'
      where tx.user_id=p_user and tx.is_pending and tx.presence='observed'
      and exists(select 1 from jsonb_array_elements(p_batch->'accounts') as entry(value) where entry.value->>'account_id'=tx.account_id);
  end if;
  for t in select value from jsonb_array_elements(p_batch->'transactions') loop
    insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,
      raw_amount,posted_on,merchant_raw,merchant_key,is_pending,is_transfer,pending_provider_id,fetched_at)
    values(p_user,t->>'account_id',t->>'provider_transaction_id',t->>'currency',(t->>'amount_cents')::bigint,
      t->>'raw_amount',(t->>'posted_on')::date,t->>'merchant_raw',t->>'merchant_key',(t->>'is_pending')::boolean,
      (t->>'is_transfer')::boolean,t->>'pending_provider_id',stamp)
    on conflict(user_id,account_id,provider_transaction_id) do update
      set amount_cents=excluded.amount_cents,raw_amount=excluded.raw_amount,posted_on=excluded.posted_on,
        merchant_raw=excluded.merchant_raw,merchant_key=excluded.merchant_key,is_pending=excluded.is_pending,
        is_transfer=excluded.is_transfer,pending_provider_id=excluded.pending_provider_id,fetched_at=stamp,presence='observed'
      where agent_financial_transactions.is_pending or not excluded.is_pending;
    if not (t->>'is_pending')::boolean and t->>'pending_provider_id' is not null then
      update public.agent_financial_transactions set presence='superseded'
        where user_id=p_user and account_id=t->>'account_id' and provider_transaction_id=t->>'pending_provider_id' and is_pending;
    end if;
    n_transactions:=n_transactions+1;
  end loop;
  insert into public.agent_financial_syncs(user_id,provider,fetched_at,requested_start,requested_end,errors,status)
    values(p_user,'simplefin',stamp,(p_batch->>'requested_start')::date,(p_batch->>'requested_end')::date,p_batch->'errors',
      case when jsonb_array_length(p_batch->'errors')>0 then 'error' else 'active' end)
    on conflict(user_id,provider) do update set fetched_at=stamp,requested_start=excluded.requested_start,
      requested_end=excluded.requested_end,errors=excluded.errors,status=excluded.status;
  return jsonb_build_object('ok',true,'accounts',n_accounts,'transactions',n_transactions,'coverage_complete',false);
end;
$$;
revoke all on function public.agent_financial_ingest(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agent_financial_ingest(uuid,jsonb) to service_role;

create or replace function public.agent_financial_store_candidates(p_user uuid,p_candidates jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c jsonb; n integer:=0; inserted integer;
begin
  perform user_id from public.simplefin_connections where user_id=p_user for share;
  if not found then raise exception 'bank connection unavailable'; end if;
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>500 then
    raise exception 'invalid candidate batch';
  end if;
  for c in select value from jsonb_array_elements(p_candidates) loop
    if c->>'status' is distinct from 'asserted' or c->>'source_type' is distinct from 'bank'
      or c->>'currency' is distinct from 'USD' or c->>'direction' is distinct from 'payable'
      or c->>'source_key' !~ '^bank-pattern:[a-f0-9]{64}$' then raise exception 'invalid inferred candidate'; end if;
    if not exists(select 1 from public.agent_financial_accounts where user_id=p_user
      and account_id=c->>'funding_account_id' and status='active') then raise exception 'candidate account unavailable'; end if;
    insert into public.agent_obligations(user_id,source_key,creditor,kind,direction,currency,amount_due_cents,
      due_on,status,source_type,observed_at,funding_account_id,autopay,evidence)
    values(p_user,c->>'source_key',c->>'creditor','other','payable','USD',(c->>'amount_due_cents')::bigint,
      (c->>'due_on')::date,'asserted','bank',(c->>'observed_at')::timestamptz,c->>'funding_account_id','unknown',c->'evidence')
    on conflict(user_id,source_key) do nothing;
    get diagnostics inserted=row_count;
    n:=n+inserted;
  end loop;
  return jsonb_build_object('new_candidates',n);
end;
$$;
revoke all on function public.agent_financial_store_candidates(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agent_financial_store_candidates(uuid,jsonb) to service_role;

-- Explicit user review promotes an inference to a user-confirmed obligation.
-- Bank evidence is retained, and changed facts revoke earlier task snapshots.
create or replace function public.agent_obligation_confirm_candidate(p_id uuid,p_fields jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.agent_obligations; reviewed jsonb; current_fields jsonb;
begin
  select * into o from public.agent_obligations where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'candidate unavailable'; end if;
  if p_fields->'confirmed' is distinct from 'true'::jsonb or p_fields->>'amount_due_cents' is null or p_fields->>'due_on' is null then
    raise exception 'confirm the current unpaid amount and due date';
  end if;
  reviewed:=jsonb_build_object('creditor',p_fields->>'creditor','amount_due_cents',(p_fields->>'amount_due_cents')::bigint,
    'due_on',(p_fields->>'due_on')::date,'kind',p_fields->>'kind','autopay',p_fields->>'autopay',
    'biller_url',p_fields->>'biller_url','currency',coalesce(p_fields->>'currency',o.currency),
    'direction',coalesce(p_fields->>'direction',o.direction));
  if reviewed->>'currency' is distinct from o.currency or reviewed->>'direction' is distinct from o.direction then
    raise exception 'different bill details require a new review';
  end if;
  if o.source_type='user' and o.evidence->>'bank_candidate_id'=o.id::text then
    current_fields:=jsonb_build_object('creditor',o.creditor,'amount_due_cents',o.amount_due_cents,'due_on',o.due_on,
      'kind',o.kind,'autopay',o.autopay,'biller_url',o.biller_url,'currency',o.currency,'direction',o.direction);
    if reviewed is distinct from current_fields then raise exception 'different bill details require a new review'; end if;
    return to_jsonb(o);
  end if;
  if o.source_type<>'bank' or o.status<>'asserted' then raise exception 'candidate is not awaiting review'; end if;
  update public.agent_obligations set source_type='user',status='verified',creditor=p_fields->>'creditor',
    amount_due_cents=(p_fields->>'amount_due_cents')::bigint,due_on=(p_fields->>'due_on')::date,
    kind=p_fields->>'kind',autopay=p_fields->>'autopay',biller_url=p_fields->>'biller_url',observed_at=now(),
    evidence=o.evidence || jsonb_build_object('bank_candidate_id',o.id,'original_source','bank','user_confirmed',true,'confirmed_at',now())
    where id=o.id returning * into o;
  return to_jsonb(o);
end;
$$;
revoke all on function public.agent_obligation_confirm_candidate(uuid,jsonb) from public,anon;
grant execute on function public.agent_obligation_confirm_candidate(uuid,jsonb) to authenticated;

create or replace function public.agent_financial_disconnect_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.agent_financial_accounts set status='disconnected' where user_id=old.user_id and provider='simplefin';
  update public.agent_financial_syncs set status='disconnected' where user_id=old.user_id and provider='simplefin';
  update public.agent_workflow_tasks t set state='cancelled',revoked_at=now(),updated_at=now()
    where t.user_id=old.user_id and t.state not in ('resolved','cancelled') and exists(
      select 1 from public.agent_obligations o where o.id=t.obligation_id and o.user_id=old.user_id
      and o.funding_account_id in(select account_id from public.agent_financial_accounts where user_id=old.user_id and provider='simplefin'));
  return old;
end;
$$;
drop trigger if exists agent_financial_disconnect_guard on public.simplefin_connections;
create trigger agent_financial_disconnect_guard after delete on public.simplefin_connections
  for each row execute function public.agent_financial_disconnect_guard();
