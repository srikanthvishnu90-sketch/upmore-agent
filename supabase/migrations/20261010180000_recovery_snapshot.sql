-- Read-only owner snapshot for recovery preparation. Retained transactions are
-- not proof of a refund, a current balance, complete history or payment authority.
create or replace function public.agent_recovery_snapshot(p_account text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'authenticated recovery owner required';end if;
 if p_account is not null and (length(p_account) not between 1 and 200
  or p_account<>btrim(p_account) or p_account ~ '[[:cntrl:]]' or p_account !~ '[^[:space:]]') then
  raise exception 'invalid recovery account';
 end if;
 -- A single statement gives every related table the same MVCC snapshot.
 -- Bound materialization at limit+1; the extra record detects overflow rather
 -- than letting a server response limit quietly omit part of the scan.
 with owned_accounts as materialized (
  select user_id,account_id,provider,name,institution,currency,account_kind,
   balance_as_of,fetched_at,sync_error,status
  from public.agent_financial_accounts where user_id=uid
   and (p_account is null or account_id=p_account)
  order by account_id limit 1001
 ), owned_transactions as materialized (
  select t.user_id,t.account_id,t.provider_transaction_id,t.currency,t.amount_cents,
   t.posted_on,t.merchant_raw,t.merchant_key,t.is_pending,t.is_transfer,
   t.pending_provider_id,t.presence,t.fetched_at,t.fact_hash,t.revision
  from public.agent_financial_transactions t
  join owned_accounts a on a.user_id=t.user_id and a.account_id=t.account_id
  where t.user_id=uid
  order by t.account_id,t.provider_transaction_id limit 10001
 ), owned_syncs as materialized (
  select user_id,provider,fetched_at,requested_start,requested_end,coverage_complete,status,
   jsonb_array_length(errors) as error_count
  from public.agent_financial_syncs where user_id=uid
 )
 select jsonb_build_object('owner_id',uid,
  'account_count',(select count(*) from owned_accounts),
  'transaction_count',(select count(*) from owned_transactions),
  'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.account_id),'[]'::jsonb) from owned_accounts a),
  'transactions',(select coalesce(jsonb_agg(to_jsonb(t) order by t.account_id,t.provider_transaction_id),'[]'::jsonb) from owned_transactions t),
  'syncs',(select coalesce(jsonb_agg(to_jsonb(s) order by s.provider),'[]'::jsonb) from owned_syncs s)) into result;
 if p_account is not null and (result->>'account_count')::integer=0 then
  raise exception 'recovery account unavailable';
 end if;
 if (result->>'account_count')::integer>1000 or (result->>'transaction_count')::integer>10000 then
  raise exception 'recovery history exceeds processing limit';
 end if;
 return result-'account_count'-'transaction_count';
end $$;
revoke all on function public.agent_recovery_snapshot(text) from public,anon,service_role;
grant execute on function public.agent_recovery_snapshot(text) to authenticated;
