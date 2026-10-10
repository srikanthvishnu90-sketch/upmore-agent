begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000017','queue17@example.invalid');
insert into public.agent_settings(user_id,buffer) values('00000000-0000-0000-0000-000000000017',50);
create schema queue17;
create table queue17.rows(n integer,obligation uuid,task uuid,attempt uuid);
insert into queue17.rows select n,gen_random_uuid(),gen_random_uuid(),case when n<=7 then gen_random_uuid() else null end from generate_series(1,8)n;
insert into public.agent_obligations(id,user_id,source_key,creditor,reference,provider_account_id,status,amount_due_cents)
 select obligation,'00000000-0000-0000-0000-000000000017','queue-'||n,'Synthetic bill','invoice-'||n,'account','verified',100 from queue17.rows;
insert into public.agent_workflow_tasks(id,user_id,obligation_id,obligation_revision,state,plan,snapshot_hash,approved_at,approved_snapshot)
 select task,'00000000-0000-0000-0000-000000000017',obligation,1,'authorized','{}',repeat('a',64),now(),
 jsonb_build_object('adapter_id','queue-rail','reference','invoice-'||n,'provider_account_id','account','expires_at',now()+interval '10 minutes') from queue17.rows;
insert into public.agent_payment_attempts(id,user_id,task_id,obligation_id,idempotency_key,adapter_id,provider_payment_id,amount_cents,currency,status,lease_token,lease_until)
 select attempt,'00000000-0000-0000-0000-000000000017',task,obligation,'queue-key-'||n,'queue-rail','payment-'||n,100,'USD',case when n<=5 then 'settled' else 'unknown' end,
 case when n=7 then gen_random_uuid() else null end,case when n=7 then now()+interval '1 minute' else null end from queue17.rows where attempt is not null;
select t.ok(jsonb_array_length(public.agent_payment_due_attempts(array['queue-rail'],10))=6,'active leases excluded from due queue');
select t.ok(jsonb_array_length(public.agent_payment_due_attempts(array['unconfigured-rail'],10))=0,'unconfigured adapters cannot occupy queue');
select t.ok(jsonb_array_length(public.agent_payment_due_tasks(array['queue-rail'],5))=1,'existing payment attempts do not consume fresh reservation quota');
select t.ok(public.agent_payment_due_tasks(array['queue-rail'],5)->0->>'id'=(select task::text from queue17.rows where n=8),'approved new task remains independently eligible');
create table queue17.claim as select public.agent_payment_claim((select attempt from queue17.rows where n=1),45) r;
select t.ok((select last_checked_at is not null and next_check_at>now() from public.agent_payment_attempts where id=(select attempt from queue17.rows where n=1)),'claim advances fairness timestamp and durable due time');
select t.ok(public.agent_payment_claim((select attempt from queue17.rows where n=1),45) is null,'leased or future-due attempt cannot be claimed again');
select public.agent_payment_uncertain((select attempt from queue17.rows where n=1),(select (r->>'lease_token')::uuid from queue17.claim));
select t.ok((select status='settled' and lease_token is null and lease_until is null and last_checked_at is not null and next_check_at>now()+interval '20 seconds' from public.agent_payment_attempts where id=(select attempt from queue17.rows where n=1)),'null creditor lookup preserves settlement, releases lease and applies backoff');
select t.ok(exists(select 1 from jsonb_array_elements(public.agent_payment_due_attempts(array['queue-rail'],5))a where a->>'id'=(select attempt::text from queue17.rows where n=6)),'newer unknown attempt advances after old settlement check');
create function queue17.event() returns jsonb language sql as $$select jsonb_build_object('provider_event_id','queue-event','provider_payment_id','payment-1','idempotency_key','queue-key-1','reference','invoice-1','provider_account_id','account','currency','USD','amount_cents',100,'status','settled')$$;
select public.agent_payment_record_event((select attempt from queue17.rows where n=1),'queue-rail',queue17.event());
update public.agent_payment_attempts set last_checked_at='2000-01-01',next_check_at=now()-interval '1 second',lease_token=gen_random_uuid(),lease_until=now()+interval '45 seconds' where id=(select attempt from queue17.rows where n=1);
select t.ok((public.agent_payment_record_event((select attempt from queue17.rows where n=1),'queue-rail',queue17.event())->>'duplicate')::boolean,'duplicate provider event retains original financial outcome');
select t.ok((select last_checked_at>'2000-01-01' and next_check_at>now() and check_backoff>0 and lease_token is null and status='settled' from public.agent_payment_attempts where id=(select attempt from queue17.rows where n=1)),'duplicate lookup advances timestamp, due time and releases lease');
update public.agent_payment_attempts set check_backoff=10,next_check_at=now()-interval '1 second',lease_token=gen_random_uuid(),lease_until=now()+interval '45 seconds' where id=(select attempt from queue17.rows where n=1);
select public.agent_payment_uncertain((select attempt from queue17.rows where n=1),(select lease_token from public.agent_payment_attempts where id=(select attempt from queue17.rows where n=1)));
select t.ok((select next_check_at<=now()+interval '1 hour' and next_check_at>=now()+interval '30 seconds' and check_backoff=10 from public.agent_payment_attempts where id=(select attempt from queue17.rows where n=1)),'backoff has an enforced upper bound');
grant usage on schema queue17 to authenticated;
select t.must_fail($$select public.agent_payment_due_tasks(array['queue-rail'],null)$$,'invalid payment queue limit','null task limit cannot disable queue bounds');
select t.must_fail($$select public.agent_payment_due_attempts(array['queue-rail'],null)$$,'invalid payment queue limit','null attempt limit cannot disable queue bounds');
select t.must_fail($$select public.agent_payment_claim((select attempt from queue17.rows where n=6),null)$$,'invalid payment lease','null lease cannot bypass lock duration limits');
grant select on queue17.rows to authenticated;
set role authenticated;
select t.must_fail($$select public.agent_payment_due_tasks(array['queue-rail'],5)$$,'permission denied','owner client cannot inspect global queue');
select t.must_fail($$select public.agent_payment_record_event_core17((select attempt from queue17.rows where n=1),'queue-rail','{}')$$,'permission denied','legacy event core is private to wrapper');
reset role;
rollback;
