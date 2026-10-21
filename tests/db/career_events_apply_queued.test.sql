-- WO-100: 20261023100000_career_events_apply_queued.sql. A posting queued from chat is on the person's timeline
-- ('apply_queued'), the person recalls it by kind, an unknown kind is still refused, and every earlier kind still goes in.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000001001','queued-a@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000001001');
set role service_role;
insert into career_events(user_id,at,kind,subject,detail,source) values
 ('00000000-0000-4000-8000-000000001001','2026-10-20T15:00:00Z','apply_queued','1 postings','{"queued":1,"companies":["Stripe"]}','chat'),
 ('00000000-0000-4000-8000-000000001001','2026-10-19T15:00:00Z','outreach_bounced','Dana Lee','{}','chat'),
 ('00000000-0000-4000-8000-000000001001','2026-10-18T15:00:00Z','search','data analyst chicago','{"shown":[{"job_id":"greenhouse:northwind:101"}]}','chat');
select t.must_fail($$insert into career_events(user_id,kind) values('00000000-0000-4000-8000-000000001001','apply_sent')$$,'career_events_kind_check','an unknown kind is still refused');
reset role;
select t.as_user('00000000-0000-4000-8000-000000001001');set role authenticated;
select t.ok((select array_agg(subject)=array['1 postings'] from career_recall_own(array['apply_queued'],null,null,null,50)),'recall by kind apply_queued');
select t.ok((select count(*)=1 from career_recall_own(array['apply_queued'],'Stripe',null,null,50)),'recall by the company in its detail');
select t.must_fail($$select * from career_recall_own(array['apply_sent'],null,null,null,10)$$,'unknown event kind','recall still refuses an unknown kind');
reset role;
rollback;
