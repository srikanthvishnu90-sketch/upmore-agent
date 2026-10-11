-- Run after agent_foundation.test.sql (its assertion helpers are reusable).
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000c','c@example.com'),
 ('00000000-0000-0000-0000-00000000000d','d@example.com');
insert into public.agent_settings(user_id) values
 ('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d');

select t.as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select t.must_fail($$insert into public.exec_credential_refs(user_id,merchant_key,vault_name)
 values('00000000-0000-0000-0000-00000000000c','netflix','exec_cred_00000000-0000-0000-0000-00000000000d_netflix')$$,
 'permission denied','a client cannot inject another owner''s credential reference');
select t.must_fail($$insert into public.exec_approvals(user_id,merchant,merchant_key,status)
 values('00000000-0000-0000-0000-00000000000c','X','x','executing')$$,'row-level security','client cannot create an executing approval');
insert into public.exec_approvals(id,user_id,merchant,merchant_key,status,amount)
 values('cccccccc-cccc-cccc-cccc-cccccccccc10','00000000-0000-0000-0000-00000000000c','X','x','approved',10);
select t.must_fail($$update public.exec_approvals set amount=100,status='cancelled'
 where id='cccccccc-cccc-cccc-cccc-cccccccccc10'$$,'immutable','approved payload cannot be rewritten');
update public.exec_approvals set status='cancelled' where id='cccccccc-cccc-cccc-cccc-cccccccccc10';
select t.ok((select status='cancelled' from public.exec_approvals where id='cccccccc-cccc-cccc-cccc-cccccccccc10'),'owner can withdraw an open approval');

reset role;
select t.must_fail($$insert into public.exec_credential_refs(user_id,merchant_key,vault_name)
 values('00000000-0000-0000-0000-00000000000c','netflix','exec_cred_00000000-0000-0000-0000-00000000000d_netflix')$$,
 'namespace','namespace enforced even for privileged writes');
select t.must_fail($$update public.exec_approvals set status='done' where id='cccccccc-cccc-cccc-cccc-cccccccccc10'$$,
 'terminal','stop/cancellation cannot be overwritten by late completion');
insert into public.agent_obligations(id,user_id,source_key,creditor,status,amount_due_cents,due_on)
 values('cccccccc-cccc-cccc-cccc-cccccccccc01','00000000-0000-0000-0000-00000000000c','test:invoice:1','Unknown provider','verified',8450,current_date+1),
 ('dddddddd-dddd-dddd-dddd-dddddddddd01','00000000-0000-0000-0000-00000000000d','test:invoice:1','Other user','verified',20000,current_date+1);
create schema w;
create table w.tasks as select public.agent_workflow_store_plan(
 '00000000-0000-0000-0000-00000000000c','cccccccc-cccc-cccc-cccc-cccccccccc01',1,
 jsonb_build_object('obligation_id','cccccccc-cccc-cccc-cccc-cccccccccc01','obligation_revision',1,'state','awaiting_approval',
 'proposal',jsonb_build_object('expires_at',now()+interval '15 minutes','amount_cents',8450)),repeat('a',64)) as r;
grant usage on schema w to authenticated;
grant select on w.tasks to authenticated;

set role authenticated;
select t.ok((select count(*)=1 from public.agent_obligations),'obligation reads isolate owners');
select t.ok((select count(*)=1 from public.agent_workflow_tasks),'task reads isolate owners');
select t.must_fail($$insert into public.agent_obligations(user_id,source_key,creditor)
 values('00000000-0000-0000-0000-00000000000c','fake','Fake')$$,'permission denied','clients cannot forge authoritative obligations');
select t.must_fail($$update public.agent_workflow_tasks set state='authorized'$$,'permission denied','clients cannot bypass approval RPC');
select t.must_fail($$select public.agent_workflow_store_plan('00000000-0000-0000-0000-00000000000d','dddddddd-dddd-dddd-dddd-dddddddddd01',1,'{}',null)$$,
 'permission denied','service planner cannot be invoked by client');
select t.must_fail($$select public.agent_workflow_approve((select (r->>'id')::uuid from w.tasks),'wrong')$$,
 'proposal changed','approval requires exact snapshot hash');
select public.agent_workflow_approve((select (r->>'id')::uuid from w.tasks),repeat('a',64));
select public.agent_workflow_approve((select (r->>'id')::uuid from w.tasks),repeat('a',64));
select t.ok((select count(*)=1 from public.agent_workflow_events where event='approved'),'approval retry does not duplicate approval event');
select t.ok((select state='authorized' and approved_snapshot=plan->'proposal' from public.agent_workflow_tasks),'approval binds immutable server proposal');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.must_fail($$select public.agent_workflow_approve((select (r->>'id')::uuid from w.tasks),repeat('a',64))$$,
 'task unavailable','cannot approve another user''s task');

reset role;
update public.agent_obligations set amount_due_cents=9000 where id='cccccccc-cccc-cccc-cccc-cccccccccc01';
select t.ok((select revision=2 from public.agent_obligations where id='cccccccc-cccc-cccc-cccc-cccccccccc01'),'changed amount increments revision');
select t.ok((select state='cancelled' and revoked_at is not null from public.agent_workflow_tasks),'changed obligation revokes old authorization');
select t.as_user('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select t.must_fail($$select public.agent_workflow_approve((select (r->>'id')::uuid from w.tasks),repeat('a',64))$$,
 'proposal changed','stale revision cannot be reapproved');
reset role;
select t.must_fail($$select public.agent_workflow_store_plan('00000000-0000-0000-0000-00000000000c',
 'cccccccc-cccc-cccc-cccc-cccccccccc01',1,'{}',null)$$,'obligation changed','stale planner write rejected');
select public.agent_workflow_store_plan('00000000-0000-0000-0000-00000000000c','cccccccc-cccc-cccc-cccc-cccccccccc01',2,
 jsonb_build_object('obligation_id','cccccccc-cccc-cccc-cccc-cccccccccc01','obligation_revision',2,'state','awaiting_approval',
 'proposal',jsonb_build_object('expires_at',now()-interval '1 minute')),repeat('b',64));
set role authenticated;
select t.must_fail($$select public.agent_workflow_approve((select id from public.agent_workflow_tasks where obligation_revision=2),repeat('b',64))$$,
 'proposal expired','late approval cannot execute');
select public.agent_stop_everything();
select t.ok((select count(*)=0 from public.agent_workflow_tasks where state <> 'cancelled'),'stop cancels pending workflow proposals');
select t.must_fail($$select public.agent_workflow_approve((select (r->>'id')::uuid from w.tasks),repeat('a',64))$$,
 'agent stopped','stopped user cannot approve');

select t.ok(public.agent_workflow_rate_bump(),'first workflow request allowed');
do $$ begin for i in 2..120 loop perform public.agent_workflow_rate_bump(); end loop; end $$;
select t.ok(not public.agent_workflow_rate_bump(),'workflow quota atomically stops at 120');
select t.must_fail($$update public.agent_workflow_rate_limits set requests=1$$,'permission denied','client cannot reset quota');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-00000000000c';
select t.ok((select count(*)=0 from public.agent_obligations where user_id='00000000-0000-0000-0000-00000000000c')
 and (select count(*)=0 from public.agent_workflow_tasks where user_id='00000000-0000-0000-0000-00000000000c')
 and (select count(*)=0 from public.agent_workflow_events where user_id='00000000-0000-0000-0000-00000000000c'),
 'account deletion cascades obligations, tasks and workflow events');
