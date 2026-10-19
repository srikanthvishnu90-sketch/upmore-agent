-- WO-021 step 5: the outbox takes one receipt per finished application, and still refuses any other kind or key.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000921','receipt@example.test');
set role service_role;
insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000921','receipt:00000000-0000-4000-8000-0000000009aa','receipt','Applied to TEST Employer: the employer confirmed it on their page.',now());
select t.ok((select count(*)=1 from career_outbox where kind='receipt'),'a receipt is queued');
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000921','receipt:00000000-0000-4000-8000-0000000009aa','receipt','again',now())$$,'career_outbox_once','the same receipt is never queued twice');
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000921','spam:1','receipt','x',now())$$,'career_outbox_key_check','a key of any other kind is refused');
select t.must_fail($$insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000921','receipt:2','promo','x',now())$$,'career_outbox_kind_check','a kind other than alert, report or receipt is refused');
insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000921','alert:TEST-1','alert','an alert still queues',now());
insert into career_outbox(user_id,key,kind,text,deliver_at) values('00000000-0000-4000-8000-000000000921','reply:TEST-1','reply','a reply still queues',now());
select t.ok((select count(*)=3 from career_outbox),'alerts and replies are unchanged');
insert into career_proactive_runs(run_at,users,alerts,held,reports,duplicates,postings,receipts,ms) values(now(),0,0,0,0,0,0,3,1);
select t.ok((select receipts=3 from career_proactive_runs order by id desc limit 1),'a run records its receipts');
reset role;
rollback;
