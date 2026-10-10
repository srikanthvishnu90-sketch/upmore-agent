-- Immutable normalized ingestion and fact revisions. User interpretations
-- are separate records; they never rewrite the provider's financial facts.
create table if not exists public.agent_financial_ingestions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 batch_hash text not null,normalized_batch jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),unique(user_id,batch_hash)
);
create table if not exists public.agent_transaction_revisions (
 user_id uuid not null references auth.users(id) on delete cascade,account_id text not null,provider_transaction_id text not null,
 revision integer not null, fact_hash text not null,snapshot jsonb not null,
 captured_at timestamptz not null default now(),
 primary key(user_id,account_id,provider_transaction_id,revision)
);
alter table public.agent_financial_transactions add column if not exists fact_hash text;
alter table public.agent_financial_transactions add column if not exists revision integer not null default 0;
create or replace function public.agent_transaction_fact_json(t public.agent_financial_transactions)
returns jsonb language sql immutable as $$
 select to_jsonb(t)-'fetched_at'-'revision'-'fact_hash'
$$;
create or replace function public.agent_transaction_revision_guard()
returns trigger language plpgsql set search_path=public as $$
declare h text;
begin
 h:=encode(sha256(convert_to(public.agent_transaction_fact_json(new)::text,'UTF8')),'hex');
 new.fact_hash:=h;
 if tg_op='INSERT' then new.revision:=1;
 elsif old.fact_hash is not distinct from h then new.revision:=old.revision;return new;
 else new.revision:=old.revision+1;end if;
 return new;
end $$;
drop trigger if exists agent_transaction_revision_guard on public.agent_financial_transactions;
create trigger agent_transaction_revision_guard before insert or update on public.agent_financial_transactions
for each row execute function public.agent_transaction_revision_guard();
-- BEFORE INSERT also runs for a subsequently rejected ON CONFLICT insert.
-- Journal only the row effect that actually occurred, in an AFTER trigger.
create or replace function public.agent_transaction_revision_capture()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='UPDATE' and old.fact_hash is not distinct from new.fact_hash then return new;end if;
 insert into public.agent_transaction_revisions(user_id,account_id,provider_transaction_id,revision,fact_hash,snapshot)
 values(new.user_id,new.account_id,new.provider_transaction_id,new.revision,new.fact_hash,to_jsonb(new));
 return new;
end $$;
drop trigger if exists agent_transaction_revision_capture on public.agent_financial_transactions;
create trigger agent_transaction_revision_capture after insert or update on public.agent_financial_transactions
for each row execute function public.agent_transaction_revision_capture();
-- Imported history starts with a baseline snapshot, not a claim that old
-- provider payloads have been recovered.
update public.agent_financial_transactions set revision=revision where fact_hash is null;
alter table public.agent_financial_transactions alter column fact_hash set not null;

create or replace function public.agent_financial_evidence_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' and not exists(select 1 from auth.users where id=old.user_id) then return old;end if;
 raise exception 'financial evidence is immutable';
end $$;
drop trigger if exists financial_ingestion_immutable on public.agent_financial_ingestions;
create trigger financial_ingestion_immutable before update or delete on public.agent_financial_ingestions
for each row execute function public.agent_financial_evidence_immutable();
drop trigger if exists transaction_revision_immutable on public.agent_transaction_revisions;
create trigger transaction_revision_immutable before update or delete on public.agent_transaction_revisions
for each row execute function public.agent_financial_evidence_immutable();

-- Keep the original ingestion implementation private. The public service
-- entrypoint journals each distinct accepted/ignored normalized batch.
do $$begin
 if to_regprocedure('public.agent_financial_ingest_base(uuid,jsonb)') is null then
   alter function public.agent_financial_ingest(uuid,jsonb) rename to agent_financial_ingest_base;
 end if;
end $$;
revoke all on function public.agent_financial_ingest_base(uuid,jsonb) from public,anon,authenticated,service_role;
create or replace function public.agent_financial_ingest(p_user uuid,p_batch jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare h text;r jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('financial-sync:'||p_user::text,0));
 perform user_id from public.simplefin_connections where user_id=p_user for update;
 if not found then raise exception 'bank connection unavailable';end if;
 h:=encode(sha256(convert_to(p_batch::text,'UTF8')),'hex');
 select result into r from public.agent_financial_ingestions where user_id=p_user and batch_hash=h;
 if found then return r||jsonb_build_object('replayed_batch',true);end if;
 r:=public.agent_financial_ingest_base(p_user,p_batch);
 insert into public.agent_financial_ingestions(user_id,batch_hash,normalized_batch,result) values(p_user,h,p_batch,r);
 return r;
end $$;
revoke all on function public.agent_financial_ingest(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agent_financial_ingest(uuid,jsonb) to service_role;

create table if not exists public.agent_transaction_reviews (
 user_id uuid not null references auth.users(id) on delete cascade,account_id text not null,provider_transaction_id text not null,
 review_revision integer not null,request_id uuid not null,request jsonb not null,
 fact_hash text not null,kind text not null check(kind in ('expense','income','refund','internal_transfer','credit_payment','loan_proceeds','other','unknown')),
 category text,linked_account_id text,linked_transaction_id text,linked_fact_hash text,
 created_at timestamptz not null default now(),
 primary key(user_id,account_id,provider_transaction_id,review_revision),unique(user_id,request_id)
);
drop trigger if exists transaction_review_immutable on public.agent_transaction_reviews;
create trigger transaction_review_immutable before update or delete on public.agent_transaction_reviews
for each row execute function public.agent_financial_evidence_immutable();

create or replace function public.agent_transaction_review(p_request uuid,p_review jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();tx public.agent_financial_transactions;linked public.agent_financial_transactions;
 prior public.agent_transaction_reviews;original public.agent_transaction_reviews;v integer;kind text;cat text;total numeric;
begin
 if uid is null then raise exception 'authenticated review owner required';end if;
 -- Serialize reviews, refund totals and linked-leg interpretation for one owner.
 perform pg_advisory_xact_lock(hashtextextended('financial-sync:'||uid::text,0));
 perform id from auth.users where id=uid for no key update;
 if not found then raise exception 'authenticated review owner required';end if;
 if p_request is null or jsonb_typeof(p_review) is distinct from 'object'
 or exists(select 1 from jsonb_object_keys(p_review) k where k not in ('account_id','transaction_id','fact_hash','kind','category','linked_account_id','linked_transaction_id','linked_fact_hash'))
 then raise exception 'invalid transaction review';end if;
 select * into prior from public.agent_transaction_reviews where user_id=uid and request_id=p_request;
 if found then
   if prior.request is distinct from p_review then raise exception 'review request changed';end if;
   return to_jsonb(prior);
 end if;
 kind:=p_review->>'kind';cat:=nullif(trim(p_review->>'category'),'');
 if kind is null or kind not in ('expense','income','refund','internal_transfer','credit_payment','loan_proceeds','other','unknown')
 or length(cat)>80 or cat ~ '[[:cntrl:]]' then raise exception 'invalid transaction review';end if;
 select * into tx from public.agent_financial_transactions where user_id=uid and account_id=p_review->>'account_id'
 and provider_transaction_id=p_review->>'transaction_id' for update;
 if not found then raise exception 'transaction unavailable';end if;
 if tx.fact_hash is distinct from p_review->>'fact_hash' then raise exception 'transaction facts changed';end if;
 if tx.currency<>'USD' or tx.amount_cents is null or tx.is_pending or tx.presence<>'observed' then raise exception 'review needs observed posted USD facts';end if;
 if (kind='expense' and tx.amount_cents>=0) or (kind in ('income','refund','loan_proceeds') and tx.amount_cents<=0)
 then raise exception 'classification contradicts money direction';end if;
 if kind in ('refund','internal_transfer','credit_payment') then
   select * into linked from public.agent_financial_transactions where user_id=uid
   and account_id=p_review->>'linked_account_id' and provider_transaction_id=p_review->>'linked_transaction_id' for update;
   if not found or (linked.account_id=tx.account_id and linked.provider_transaction_id=tx.provider_transaction_id)
     then raise exception 'owned linked transaction required';end if;
   if linked.fact_hash is distinct from p_review->>'linked_fact_hash' or linked.currency<>tx.currency
      or linked.is_pending or linked.presence<>'observed' or linked.amount_cents is null
     then raise exception 'linked transaction facts changed';end if;
   if kind in ('internal_transfer','credit_payment') then
     if linked.account_id=tx.account_id or tx.amount_cents=0 or linked.amount_cents<>-tx.amount_cents
       then raise exception 'matching opposite account legs required';end if;
     if cat is not null then raise exception 'transfer is not a spending category';end if;
   else
     select * into original from public.agent_transaction_reviews where user_id=uid and account_id=linked.account_id
       and provider_transaction_id=linked.provider_transaction_id order by review_revision desc limit 1;
     if not found or original.kind<>'expense' or original.fact_hash<>linked.fact_hash
       or linked.amount_cents>=0 or tx.posted_on<linked.posted_on then raise exception 'current reviewed original expense required';end if;
     if cat is not null and cat is distinct from original.category then raise exception 'refund category must match original expense';end if;
     cat:=original.category;
     select coalesce(sum(t.amount_cents),0) into total from public.agent_financial_transactions t
     join (select distinct on(account_id,provider_transaction_id) * from public.agent_transaction_reviews where user_id=uid
           order by account_id,provider_transaction_id,review_revision desc) r
       on r.account_id=t.account_id and r.provider_transaction_id=t.provider_transaction_id and r.user_id=t.user_id
     where t.user_id=uid and r.kind='refund' and r.fact_hash=t.fact_hash and r.linked_fact_hash=linked.fact_hash
       and r.linked_account_id=linked.account_id and r.linked_transaction_id=linked.provider_transaction_id
       and t.presence='observed' and not t.is_pending
       and not(t.account_id=tx.account_id and t.provider_transaction_id=tx.provider_transaction_id);
     if total+tx.amount_cents> -linked.amount_cents then raise exception 'refund exceeds original expense';end if;
   end if;
 elsif p_review ? 'linked_account_id' or p_review ? 'linked_transaction_id' or p_review ? 'linked_fact_hash' then
   raise exception 'unexpected linked transaction';
 end if;
 select coalesce(max(review_revision),0)+1 into v from public.agent_transaction_reviews
 where user_id=uid and account_id=tx.account_id and provider_transaction_id=tx.provider_transaction_id;
 insert into public.agent_transaction_reviews(user_id,account_id,provider_transaction_id,review_revision,request_id,request,fact_hash,kind,category,
 linked_account_id,linked_transaction_id,linked_fact_hash)
 values(uid,tx.account_id,tx.provider_transaction_id,v,p_request,p_review,tx.fact_hash,kind,cat,linked.account_id,linked.provider_transaction_id,linked.fact_hash)
 returning * into prior;
 return to_jsonb(prior);
end $$;
revoke all on function public.agent_transaction_review(uuid,jsonb) from public,anon,service_role;
grant execute on function public.agent_transaction_review(uuid,jsonb) to authenticated;

alter table public.agent_financial_ingestions enable row level security;
alter table public.agent_transaction_revisions enable row level security;
alter table public.agent_transaction_reviews enable row level security;
drop policy if exists ingestion_owner_read on public.agent_financial_ingestions;
create policy ingestion_owner_read on public.agent_financial_ingestions for select using(auth.uid()=user_id);
drop policy if exists revision_owner_read on public.agent_transaction_revisions;
create policy revision_owner_read on public.agent_transaction_revisions for select using(auth.uid()=user_id);
drop policy if exists review_owner_read on public.agent_transaction_reviews;
create policy review_owner_read on public.agent_transaction_reviews for select using(auth.uid()=user_id);
revoke insert,update,delete,truncate on public.agent_financial_ingestions,public.agent_transaction_revisions,public.agent_transaction_reviews from anon,authenticated;
grant select on public.agent_financial_ingestions,public.agent_transaction_revisions,public.agent_transaction_reviews to authenticated;
