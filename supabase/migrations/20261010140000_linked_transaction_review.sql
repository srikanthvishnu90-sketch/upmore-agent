-- Auth-bound review reads and atomic interpretation of both transfer legs.
-- These functions cannot change provider facts or authorize money movement.
create index if not exists agent_transaction_review_date_idx on public.agent_financial_transactions(user_id,posted_on desc,account_id,provider_transaction_id)
where presence='observed' and not is_pending;
create index if not exists agent_transaction_review_amount_idx on public.agent_financial_transactions(user_id,currency,amount_cents,account_id)
where presence='observed' and not is_pending;
create table if not exists public.agent_transaction_review_pairs (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(user_id,request_id)
);
alter table public.agent_transaction_review_pairs enable row level security;
drop policy if exists review_pair_owner_read on public.agent_transaction_review_pairs;
create policy review_pair_owner_read on public.agent_transaction_review_pairs for select using(auth.uid()=user_id);
revoke all on public.agent_transaction_review_pairs from anon,authenticated;
revoke insert,update,delete,truncate on public.agent_transaction_reviews,public.agent_transaction_review_pairs from service_role;
grant select on public.agent_transaction_review_pairs to authenticated;
drop trigger if exists review_pair_immutable on public.agent_transaction_review_pairs;
create trigger review_pair_immutable before update or delete on public.agent_transaction_review_pairs
for each row execute function public.agent_financial_evidence_immutable();
drop trigger if exists review_pair_no_truncate on public.agent_transaction_review_pairs;
create trigger review_pair_no_truncate before truncate on public.agent_transaction_review_pairs
for each statement execute function public.agent_financial_evidence_immutable();
drop trigger if exists transaction_review_no_truncate on public.agent_transaction_reviews;
create trigger transaction_review_no_truncate before truncate on public.agent_transaction_reviews
for each statement execute function public.agent_financial_evidence_immutable();

create or replace function public.agent_transaction_review_pair(p_request uuid,p_review jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();prior public.agent_transaction_review_pairs;opposite jsonb;r jsonb;
begin
 if uid is null then raise exception 'authenticated review owner required';end if;
 if p_request is null or jsonb_typeof(p_review) is distinct from 'object'
 or (p_review->>'kind') is null or p_review->>'kind' not in ('internal_transfer','credit_payment')
 then raise exception 'transfer pair review required';end if;
 perform pg_advisory_xact_lock(hashtextextended('financial-sync:'||uid::text,0));
 select * into prior from public.agent_transaction_review_pairs where user_id=uid and request_id=p_request;
 if found then
   if prior.request is distinct from p_review then raise exception 'review pair request changed';end if;
   return prior.result;
 end if;
 if exists(select 1 from public.agent_transaction_reviews where user_id=uid and request_id=p_request)
 then raise exception 'request already used outside pair';end if;
 opposite:=jsonb_build_object('account_id',p_review->>'linked_account_id','transaction_id',p_review->>'linked_transaction_id',
   'fact_hash',p_review->>'linked_fact_hash','kind',p_review->>'kind','category',null,
   'linked_account_id',p_review->>'account_id','linked_transaction_id',p_review->>'transaction_id','linked_fact_hash',p_review->>'fact_hash');
 -- The existing strict function checks ownership, directions, exact hashes,
 -- currency and allowed fields. Either both inserts commit or neither does.
 r:=jsonb_build_object('review',public.agent_transaction_review(p_request,p_review),
   'linked_review',public.agent_transaction_review(gen_random_uuid(),opposite));
 insert into public.agent_transaction_review_pairs(user_id,request_id,request,result) values(uid,p_request,p_review,r);
 return r;
end $$;
revoke all on function public.agent_transaction_review_pair(uuid,jsonb) from public,anon,service_role;
grant execute on function public.agent_transaction_review_pair(uuid,jsonb) to authenticated;

create or replace function public.agent_transaction_review_page(p_from date,p_to date,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();rows jsonb;
begin
 if uid is null then raise exception 'authenticated review owner required';end if;
 if p_from is null or p_to is null or p_from>p_to or p_offset is null or p_offset<0 or p_offset>100000
 then raise exception 'invalid ledger page';end if;
 select coalesce(jsonb_agg(x.value order by x.posted_on desc,x.account_id,x.provider_transaction_id),'[]'::jsonb) into rows
 from (select to_jsonb(t)||jsonb_build_object('account_name',a.name,'institution',a.institution,'latest_review',r.value) as value,
 t.posted_on,t.account_id,t.provider_transaction_id
 from public.agent_financial_transactions t
 join public.agent_financial_accounts a on a.user_id=t.user_id and a.account_id=t.account_id
 left join lateral (select to_jsonb(v) as value from public.agent_transaction_reviews v
   where v.user_id=t.user_id and v.account_id=t.account_id and v.provider_transaction_id=t.provider_transaction_id
   order by v.review_revision desc limit 1) r on true
 where t.user_id=uid and not t.is_pending and t.presence='observed' and t.posted_on between p_from and p_to
 order by t.posted_on desc,t.account_id,t.provider_transaction_id offset p_offset limit 51) x;
 return jsonb_build_object('ok',true,'rows',case when jsonb_array_length(rows)>50 then rows-50 else rows end,
 'next_offset',case when jsonb_array_length(rows)>50 then p_offset+50 else null end,
 'coverage','Posted records from retained connected history only. Pending activity and missing accounts are not included. Pages can change after a bank refresh.');
end $$;
revoke all on function public.agent_transaction_review_page(date,date,integer) from public,anon,service_role;
grant execute on function public.agent_transaction_review_page(date,date,integer) to authenticated;

create or replace function public.agent_transaction_link_candidates(p_review jsonb,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();source public.agent_financial_transactions;v_kind text;rows jsonb;
begin
 if uid is null then raise exception 'authenticated review owner required';end if;
 if jsonb_typeof(p_review) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_review) k
   where k not in ('account_id','transaction_id','fact_hash','kind')) or p_offset is null or p_offset<0 or p_offset>100000
 then raise exception 'invalid linked record search';end if;
 v_kind:=p_review->>'kind';
 if v_kind is null or v_kind not in ('refund','internal_transfer','credit_payment') then raise exception 'linked classification required';end if;
 select * into source from public.agent_financial_transactions where user_id=uid and account_id=p_review->>'account_id'
   and provider_transaction_id=p_review->>'transaction_id';
 if not found then raise exception 'transaction unavailable';end if;
 if source.fact_hash is distinct from p_review->>'fact_hash' then raise exception 'transaction facts changed';end if;
 if source.currency<>'USD' or source.amount_cents is null or source.is_pending or source.presence<>'observed'
   or source.amount_cents=0 or (v_kind='refund' and source.amount_cents<0)
 then raise exception 'linked search needs observed posted USD facts';end if;
 select coalesce(jsonb_agg(x.value order by x.posted_on desc,x.account_id,x.provider_transaction_id),'[]'::jsonb) into rows
 from (select to_jsonb(t)||jsonb_build_object('account_name',a.name,'institution',a.institution,
 'latest_review',r.value,'remaining_refundable_cents',case when v_kind='refund' then -t.amount_cents-used.amount else null end) as value,
 t.posted_on,t.account_id,t.provider_transaction_id
 from public.agent_financial_transactions t
 join public.agent_financial_accounts a on a.user_id=t.user_id and a.account_id=t.account_id
 left join lateral (select v.kind,v.fact_hash,to_jsonb(v) as value from public.agent_transaction_reviews v
   where v.user_id=t.user_id and v.account_id=t.account_id and v.provider_transaction_id=t.provider_transaction_id
   order by v.review_revision desc limit 1) r on true
 left join lateral (
   select coalesce(sum(f.amount_cents),0) as amount from public.agent_financial_transactions f
   join lateral (select v.* from public.agent_transaction_reviews v where v.user_id=f.user_id and v.account_id=f.account_id
     and v.provider_transaction_id=f.provider_transaction_id order by v.review_revision desc limit 1) fr on true
   where v_kind='refund' and f.user_id=uid and f.presence='observed' and not f.is_pending and f.currency='USD'
     and fr.kind='refund' and fr.fact_hash=f.fact_hash and fr.linked_fact_hash=t.fact_hash
     and fr.linked_account_id=t.account_id and fr.linked_transaction_id=t.provider_transaction_id
     and not(f.account_id=source.account_id and f.provider_transaction_id=source.provider_transaction_id)
 ) used on true
 where t.user_id=uid and not t.is_pending and t.presence='observed' and t.currency=source.currency
   and not(t.account_id=source.account_id and t.provider_transaction_id=source.provider_transaction_id)
   and ((v_kind in ('internal_transfer','credit_payment') and t.account_id<>source.account_id and t.amount_cents=-source.amount_cents)
     or (v_kind='refund' and t.amount_cents<0 and t.posted_on<=source.posted_on and r.kind='expense' and r.fact_hash=t.fact_hash
       and -t.amount_cents-used.amount>=source.amount_cents))
 order by t.posted_on desc,t.account_id,t.provider_transaction_id offset p_offset limit 21) x;
 return jsonb_build_object('ok',true,'rows',case when jsonb_array_length(rows)>20 then rows-20 else rows end,
 'next_offset',case when jsonb_array_length(rows)>20 then p_offset+20 else null end,
 'coverage','Possible matches from retained posted USD history. Matching an amount does not prove a transfer or refund. Choose only a record you recognize.');
end $$;
revoke all on function public.agent_transaction_link_candidates(jsonb,integer) from public,anon,service_role;
grant execute on function public.agent_transaction_link_candidates(jsonb,integer) to authenticated;
