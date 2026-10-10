begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000001','biller1@example.com'),('00000000-0000-0000-0000-000000000002','biller2@example.com');
insert into public.agent_settings(user_id) values('00000000-0000-0000-0000-000000000001');
insert into public.agent_biller_connections(id,user_id,provider_key,provider_account_id,capabilities) values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','test_biller','resident','{"read_obligations":true}');
create schema b;
create function b.record(version integer,amount bigint,stamp timestamptz default now()-interval '2 minutes',state text default 'verified') returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('external_id','invoice','source_version',version,'source_hash',repeat(version::text,64),
 'obligation',jsonb_build_object('source_type','biller','provider_key','test_biller','provider_account_id','resident','reference','invoice',
 'creditor','Rent ledger','kind','rent','direction','payable','currency','USD','amount_due_cents',amount,'due_on',current_date+1,
 'status',state,'observed_at',stamp,'autopay','off','evidence',jsonb_build_object('unpaid_confirmed',true))))$$;
select public.agent_biller_ingest('11111111-1111-1111-1111-111111111111',b.record(1,180000));
select t.ok((select status='verified' and amount_due_cents=180000 and provider_account_id='resident' from public.agent_obligations),'current bill is scoped to the authenticated connection');
select t.ok((public.agent_biller_ingest('11111111-1111-1111-1111-111111111111',b.record(1,180000))->>'ignored')::integer=1,'same source revision is idempotent');
select t.ok((select count(*)=1 from public.agent_workflow_events),'refresh retry does not duplicate events');
select t.must_fail($$select public.agent_biller_ingest('11111111-1111-1111-1111-111111111111',jsonb_set(b.record(1,190000),'{0,source_hash}',to_jsonb(repeat('a',64))))$$,'conflicting source revision','same revision with different facts rejects conflict');
select public.agent_workflow_store_plan('00000000-0000-0000-0000-000000000001',(select id from public.agent_obligations),(select revision from public.agent_obligations),
 jsonb_build_object('obligation_id',(select id from public.agent_obligations),'obligation_revision',(select revision from public.agent_obligations),'state','needs_connection'),null);
select public.agent_biller_ingest('11111111-1111-1111-1111-111111111111',b.record(2,175000,now()-interval '1 minute'));
select t.ok((select amount_due_cents=175000 from public.agent_obligations),'new source revision applies amount correction');
select t.ok((select state='cancelled' and revoked_at is not null from public.agent_workflow_tasks),'source correction revokes old task');
select t.ok((public.agent_biller_ingest('11111111-1111-1111-1111-111111111111',b.record(1,180000))->>'ignored')::integer=1,'late old revision cannot restore old payable amount');
select t.must_fail($$select public.agent_biller_ingest('11111111-1111-1111-1111-111111111111',b.record(3,200000,now()-interval '5 minutes'))$$,'timestamp regressed','new version with regressed source age fails');
select public.agent_biller_ingest('11111111-1111-1111-1111-111111111111','[]');
select t.ok((select status='verified' and amount_due_cents=175000 from public.agent_obligations),'missing invoice in response never implies settlement');
select t.must_fail($$select public.agent_biller_ingest('11111111-1111-1111-1111-111111111111',b.record(3,0,now(),'settled'))$$,'application evidence','bank settlement alone cannot mark creditor invoice paid');
select t.must_fail($$select public.agent_biller_ingest('11111111-1111-1111-1111-111111111111',jsonb_set(b.record(3,100),'{0,obligation,provider_account_id}','"different"'))$$,'invalid biller record','another resident or loan cannot be substituted');
select t.as_user('00000000-0000-0000-0000-000000000002');
set role authenticated;
select t.ok((select count(*)=0 from public.agent_biller_connections),'connection reads isolate owners');
select t.ok((select count(*)=0 from public.agent_biller_records),'invoice identities isolate owners');
select t.must_fail($$select public.agent_biller_revoke('11111111-1111-1111-1111-111111111111')$$,'connection unavailable','other user cannot revoke connection');
select t.must_fail($$select public.agent_biller_ingest('11111111-1111-1111-1111-111111111111','[]')$$,'permission denied','client cannot forge authoritative bills');
reset role;
insert into public.agent_obligations(id,user_id,source_key,creditor,source_type,status,due_on) values
 ('aaaaaaaa-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000001','bank-pattern:dismiss','Possible charge','bank','asserted',current_date+1),
 ('aaaaaaaa-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000001','bank-pattern:expire','Old pattern','bank','asserted',current_date-1);
set role authenticated;
select t.must_fail($$select public.agent_obligation_dismiss_candidate('aaaaaaaa-1111-1111-1111-111111111111')$$,'candidate unavailable','candidate dismissal isolates owners');
reset role;
select t.as_user('00000000-0000-0000-0000-000000000001');
set role authenticated;
select public.agent_obligation_dismiss_candidate('aaaaaaaa-1111-1111-1111-111111111111');
select public.agent_obligation_dismiss_candidate('aaaaaaaa-1111-1111-1111-111111111111');
select t.ok((select status='invalid' and revision=2 from public.agent_obligations where id='aaaaaaaa-1111-1111-1111-111111111111'),'dismissal is explicit and idempotent');
select t.must_fail($$select public.agent_obligation_dismiss_candidate((select obligation_id from public.agent_biller_records))$$,'only inferred','an authoritative unpaid invoice cannot be dismissed as a pattern');
select public.agent_biller_revoke('11111111-1111-1111-1111-111111111111');
reset role;
select t.must_fail($$select public.agent_biller_ingest('11111111-1111-1111-1111-111111111111',b.record(3,175000))$$,'connection unavailable','revoked connector blocks subsequent ingestion');
select t.ok((select count(*)=1 from public.agent_biller_records),'revocation retains bill identity history');
select t.ok(public.agent_obligation_expire_candidates('00000000-0000-0000-0000-000000000001',current_date)=1,'past inferred charge expires rather than becoming overdue debt');
select t.ok((select status='verified' from public.agent_obligations where source_type='biller'),'expiry leaves authoritative unpaid bill intact');
rollback;
