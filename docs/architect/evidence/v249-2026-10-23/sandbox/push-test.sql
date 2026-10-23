\set ON_ERROR_STOP 0
begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-0000000000aa');
insert into public.profiles(id) values ('00000000-0000-4000-8000-0000000000aa') on conflict do nothing;
insert into public.agent_threads(id,user_id,title) values ('00000000-0000-4000-8000-0000000000bb','00000000-0000-4000-8000-0000000000aa','TEST');
insert into public.channel_contacts(contact,user_id,thread_id,channel,address,last_inbound_at) values ('tg:12345','00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-0000000000bb','telegram','12345',now()-interval '2 hours');
insert into public.career_apply_questions(id,user_id,key,kind,label,type,options,state) values ('00000000-0000-4000-8000-0000000000cc','00000000-0000-4000-8000-0000000000aa','fact:sponsorship','fact','Will you need sponsorship?','text','[]','open');
select 'questions_push =', public.career_apply_questions_push_for('00000000-0000-4000-8000-0000000000aa', array['00000000-0000-4000-8000-0000000000cc']::uuid[], 'TEST: Will you need sponsorship?', now());
select 'outbox questions rows =', count(*) from public.career_outbox where kind='questions';
rollback;
begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-0000000000aa');
insert into public.profiles(id) values ('00000000-0000-4000-8000-0000000000aa') on conflict do nothing;
select 'link insert:', 1 from (select 1) x;
insert into public.career_outbox(user_id,key,kind,text,deliver_at) values ('00000000-0000-4000-8000-0000000000aa','link:t1','link','TEST link text',now());
select 'outbox link rows =', count(*) from public.career_outbox where kind='link';
rollback;
