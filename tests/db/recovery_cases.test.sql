begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000191','case-owner@example.com'),('00000000-0000-0000-0000-000000000192','case-foreign@example.com');
insert into public.agent_financial_accounts(user_id,account_id,provider,provider_account_id,name,currency,fetched_at)
 select id,'checking','simplefin','upstream','Checking','USD',now() from auth.users where id in ('00000000-0000-0000-0000-000000000191','00000000-0000-0000-0000-000000000192');
insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,is_transfer,fetched_at)
 values
 ('00000000-0000-0000-0000-000000000191','checking','fee','USD',-3500,current_date-2,'Monthly maintenance fee','bank-fee',false,false,now()),
 ('00000000-0000-0000-0000-000000000191','checking','fee-two','USD',-3500,current_date-1,'Monthly maintenance fee','bank-fee',false,false,now()),
 ('00000000-0000-0000-0000-000000000191','checking','hold','USD',-10000,current_date-9,'Hotel','hotel',true,false,now()),
 ('00000000-0000-0000-0000-000000000191','checking','unknown-hold','USD',-10000,null,'Hotel','hotel',true,false,now()),
 ('00000000-0000-0000-0000-000000000191','checking','fresh-hold','USD',-10000,current_date-1,'Hotel','hotel',true,false,now()),
 ('00000000-0000-0000-0000-000000000191','checking','ordinary','USD',-1500,current_date,'Coffee','coffee',false,false,now()),
 ('00000000-0000-0000-0000-000000000191','checking','credit','USD',3500,current_date,'Fee refund','bank-fee',false,false,now()),
 ('00000000-0000-0000-0000-000000000191','checking','transfer','USD',-3500,current_date,'Maintenance fee','bank-fee',false,true,now()),
 ('00000000-0000-0000-0000-000000000192','checking','foreign-fee','USD',-3500,current_date,'Monthly maintenance fee','bank-fee',false,false,now());
create schema recovery_cases_fixture;
create function recovery_cases_fixture.refs(ids text[]) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('account_id',account_id,'transaction_id',provider_transaction_id,'fact_hash',fact_hash) order by provider_transaction_id)
 from public.agent_financial_transactions where user_id=auth.uid() and provider_transaction_id=any(ids)
$$;
create table recovery_cases_fixture.saved(label text primary key,result jsonb);
grant usage on schema recovery_cases_fixture to authenticated;
grant execute on function recovery_cases_fixture.refs(text[]) to authenticated;
grant all on recovery_cases_fixture.saved to authenticated;
select t.as_user('00000000-0000-0000-0000-000000000191');
set role authenticated;
insert into recovery_cases_fixture.saved values('fee',public.agent_recovery_case_open('00000000-0000-0000-0000-000000001901','bank_fee',recovery_cases_fixture.refs(array['fee']),current_date+7));
select t.ok((select result->'case'->>'amount_cents'='3500' and result->'case'->>'status'='open' and result->'case'->'source_stale'='false'::jsonb and (result->'case'->>'due_on')::date=current_date+7 from recovery_cases_fixture.saved where label='fee'),'case amount original facts and deadline derive from exact reviewed inputs');
select t.ok((select jsonb_array_length(result->'case'->'source_snapshot')=1 and result->'case'->'source_snapshot'->0->>'user_id'=auth.uid()::text and result->'case'->'recovered_cents'='null'::jsonb from recovery_cases_fixture.saved where label='fee'),'source snapshot is owner-bound raw array and recovery remains unknown');
select t.ok((public.agent_recovery_case_open('00000000-0000-0000-0000-000000001901','bank_fee',recovery_cases_fixture.refs(array['fee']),current_date+7)->>'replay')::boolean,'exact open retry returns one immutable receipt');
select t.ok((public.agent_recovery_case_open('00000000-0000-0000-0000-000000001902','bank_fee',recovery_cases_fixture.refs(array['fee']),null)->>'deduplicated')::boolean,'new request cannot duplicate the same owner candidate or replace its deadline');
select t.ok((select count(*)=1 and min(deadline)=current_date+7 from public.agent_recovery_cases),'dedup preserves original immutable deadline');
select t.must_fail($$select public.agent_recovery_case_open('00000000-0000-0000-0000-000000001901','bank_fee',recovery_cases_fixture.refs(array['fee']),null)$$,'request changed','reused request ID cannot change reviewed request terms');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee',recovery_cases_fixture.refs(array['fee'])||'[{"account_id":"checking","transaction_id":"extra","fact_hash":"fake"}]')$$,'evidence count','extra transaction cannot change one-fee scope');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee',jsonb_build_array((recovery_cases_fixture.refs(array['fee'])->0)||jsonb_build_object('amount_cents',1)))$$,'invalid recovery evidence','client cannot provide amount or approval fields');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),null,recovery_cases_fixture.refs(array['fee']))$$,'invalid recovery request','null candidate kind fails closed');
select t.must_fail($$select public.agent_recovery_case_open(null,'bank_fee',recovery_cases_fixture.refs(array['fee']))$$,'invalid recovery request','request identity is required');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee',null)$$,'invalid recovery request','SQL null evidence cannot authorize a case');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee','null')$$,'invalid recovery request','JSON null evidence cannot authorize a case');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee',recovery_cases_fixture.refs(array['ordinary']))$$,'unsupported fee','merchant debit alone is not fee eligibility');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee',recovery_cases_fixture.refs(array['credit']))$$,'negative USD','refund credit cannot become a fee refund request');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee',recovery_cases_fixture.refs(array['transfer']))$$,'negative USD','internal transfer cannot become a recovery charge');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'stale_hold',recovery_cases_fixture.refs(array['unknown-hold']))$$,'negative USD','unknown pending date cannot become a fabricated hold age');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'stale_hold',recovery_cases_fixture.refs(array['fresh-hold']))$$,'posting state','fresh authorization cannot become a stale hold');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'duplicate_charge',recovery_cases_fixture.refs(array['fee','fee-two']))$$,'already covers','different kind or pair cannot overlap an active source claim');
insert into recovery_cases_fixture.saved values('closed',public.agent_recovery_case_transition('00000000-0000-0000-0000-000000001903',(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),1,'closed_user',true));
insert into recovery_cases_fixture.saved values('duplicate',public.agent_recovery_case_open('00000000-0000-0000-0000-000000001904','duplicate_charge',recovery_cases_fixture.refs(array['fee','fee-two'])));
select t.ok((public.agent_recovery_case_open('00000000-0000-0000-0000-000000001905','duplicate_charge',jsonb_build_array(recovery_cases_fixture.refs(array['fee','fee-two'])->1,recovery_cases_fixture.refs(array['fee','fee-two'])->0))->>'deduplicated')::boolean,'sorted source identities deduplicate reversed evidence order');
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),2,'open',true)$$,'already covers','closed case cannot reopen over another active claim');
select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='duplicate'),1,'closed_user',true);
select public.agent_recovery_case_transition('00000000-0000-0000-0000-000000001906',(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),2,'open',true);
select t.ok((public.agent_recovery_case_transition('00000000-0000-0000-0000-000000001903',(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),1,'closed_user',true)->>'superseded')::boolean and
 (public.agent_recovery_case_transition('00000000-0000-0000-0000-000000001903',(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),1,'closed_user',true)->>'current_version')='3','historical transition replay labels superseded receipt and current version');
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),2,'closed_user',true)$$,'case changed','stale expected version cannot overwrite newer status');
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),3,'user_reported_submitted',null)$$,'confirmed recovery','SQL null confirmation cannot report external submission');
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),null,'closed_user',true)$$,'confirmed recovery','SQL null version fails closed');
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),2147483647,'closed_user',true)$$,'confirmed recovery','maximum version cannot overflow increment');
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),3,null,true)$$,'confirmed recovery','SQL null target status fails closed');
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),3,'verified_recovered',true)$$,'confirmed recovery','user cannot assert verified recovery or paid state');
insert into recovery_cases_fixture.saved values('hold',public.agent_recovery_case_open(gen_random_uuid(),'stale_hold',recovery_cases_fixture.refs(array['hold'])));
select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='hold'),1,'user_reported_submitted',true);
select t.ok(public.agent_recovery_case_page()->'verified_recovered_cents'='null'::jsonb and not exists(select 1 from jsonb_array_elements(public.agent_recovery_case_page()->'cases') x where x->'recovered_cents'<>'null'::jsonb),'reported submission and user closure never count as cash recovered');
select t.must_fail($$update public.agent_recovery_cases set status='closed_user'$$,'permission denied','Auth cannot directly rewrite case status');
select t.must_fail($$delete from public.agent_recovery_cases$$,'permission denied','Auth cannot erase immutable source snapshots');
select t.must_fail($$insert into public.agent_recovery_events(user_id,case_id,request_id,event,case_version,evidence) values(auth.uid(),gen_random_uuid(),gen_random_uuid(),'verified',1,'{}')$$,'permission denied','Auth cannot fabricate provider completion events');
reset role;
update public.agent_financial_transactions set amount_cents=-4000 where user_id='00000000-0000-0000-0000-000000000191' and provider_transaction_id='fee';
set role authenticated;
select t.ok((public.agent_recovery_case_open('00000000-0000-0000-0000-000000001901','bank_fee',
 (select jsonb_agg(jsonb_build_object('account_id',s->>'account_id','transaction_id',s->>'provider_transaction_id','fact_hash',s->>'fact_hash'))
 from recovery_cases_fixture.saved f,lateral jsonb_array_elements(f.result->'case'->'source_snapshot') s where f.label='fee'),current_date+7)->'case'->>'source_stale')::boolean,
 'historical open replay recomputes current source staleness even without a case version change');
select t.ok((public.agent_recovery_case_transition('00000000-0000-0000-0000-000000001906',
 (select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),2,'open',true)->'case'->>'source_stale')::boolean,
 'historical transition replay recomputes staleness while preserving original reviewed status');
select t.ok((select result->'case'->'source_stale'='false'::jsonb and result->'case'->>'version'='1' and result->'case'->>'status'='open'
 from public.agent_recovery_receipts where request_id='00000000-0000-0000-0000-000000001901'),'replay overlay never mutates immutable original receipt');
select t.ok((public.agent_recovery_case_open(gen_random_uuid(),'bank_fee',recovery_cases_fixture.refs(array['fee']))->'case'->>'source_stale')::boolean,'corrected source deduplicates original case and marks stale');
select t.ok((select amount_cents=3500 and source_snapshot->0->>'amount_cents'='-3500' from public.agent_recovery_cases where kind='bank_fee'),'source correction never silently replaces original material terms');
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),3,'user_reported_submitted',true)$$,'source changed','stale evidence cannot report a prepared case submitted');
select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),3,'closed_user',true);
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),4,'open',true)$$,'source changed','stale evidence cannot reopen without a new review protocol');
reset role;
delete from public.agent_financial_transactions where user_id='00000000-0000-0000-0000-000000000191' and provider_transaction_id='hold';
set role authenticated;
select t.ok(exists(select 1 from jsonb_array_elements(public.agent_recovery_case_page()->'cases') x where x->>'kind'='stale_hold' and (x->>'source_stale')::boolean),'deleted bank source preserves case history and exposes stale source');
reset role;
select t.must_fail($$update public.agent_recovery_cases set source_snapshot='[]'$$,'immutable','privileged caller cannot rewrite original recovery evidence');
select t.must_fail($$delete from public.agent_recovery_cases$$,'immutable','privileged caller cannot erase a living owners recovery case');
select t.must_fail($$update public.agent_recovery_receipts set result='{}'$$,'immutable','immutable receipts cannot be rewritten');
select t.must_fail($$truncate public.agent_recovery_events$$,'immutable','append-only events cannot be truncated');
select t.as_user('00000000-0000-0000-0000-000000000192');
set role authenticated;
select t.ok(public.agent_recovery_case_page()->'cases'='[]'::jsonb and (select count(*)=0 from public.agent_recovery_receipts),'other owner cannot read case IDs or request receipts');
select t.must_fail($$select public.agent_recovery_case_transition(gen_random_uuid(),(select (result->'case'->>'id')::uuid from recovery_cases_fixture.saved where label='fee'),4,'closed_user',true)$$,'case unavailable','other owner cannot update guessed private case');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee',jsonb_build_array(jsonb_build_object('account_id','checking','transaction_id','fee','fact_hash',repeat('a',64))))$$,'transaction unavailable','other owner cannot open a case from foreign transaction IDs');
reset role;
set role service_role;
select t.must_fail($$select public.agent_recovery_case_page()$$,'permission denied','service cannot impersonate private recovery reads');
select t.must_fail($$select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee','[]')$$,'permission denied','service cannot create an owner recovery case');
select t.must_fail($$select * from public.agent_recovery_cases$$,'permission denied','service has no blanket private source snapshot access');
reset role;
set role anon;
select t.must_fail($$select public.agent_recovery_case_page()$$,'permission denied','anonymous caller cannot read even with an owner subject');
reset role;
select t.as_user(null);
set role authenticated;
select t.must_fail($$select public.agent_recovery_case_page()$$,'authenticated recovery owner','missing identity fails closed');
reset role;

-- More than one page: independently owned facts, no artificial count claims.
insert into public.agent_financial_transactions(user_id,account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,merchant_key,is_pending,fetched_at)
 select '00000000-0000-0000-0000-000000000192','checking','page-'||n,'USD',-100,current_date,'Monthly maintenance fee','fee',false,now() from generate_series(1,21) n;
select t.as_user('00000000-0000-0000-0000-000000000192');
set role authenticated;
select public.agent_recovery_case_open(gen_random_uuid(),'bank_fee',recovery_cases_fixture.refs(array['page-'||n])) from generate_series(1,21) n;
select t.ok(jsonb_array_length(public.agent_recovery_case_page()->'cases')=20 and public.agent_recovery_case_page()->>'next_offset'='20' and jsonb_array_length(public.agent_recovery_case_page(20)->'cases')=1 and public.agent_recovery_case_page(20)->'next_offset'='null'::jsonb,'case pagination retains every case with explicit continuation');
select t.must_fail($$select public.agent_recovery_case_page(null)$$,'invalid recovery page','SQL null page offset cannot silently truncate');
select t.must_fail($$select public.agent_recovery_case_page(-1)$$,'invalid recovery page','negative page offset is rejected');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-000000000192';
select t.ok((select count(*)=0 from public.agent_recovery_cases where user_id='00000000-0000-0000-0000-000000000192') and (select count(*)=0 from public.agent_recovery_receipts where user_id='00000000-0000-0000-0000-000000000192'),'owner account deletion cascades permitted retained records without leaking another owner');
rollback;
