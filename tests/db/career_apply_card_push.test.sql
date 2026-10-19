-- WO-022 step 3 from the scheduled run (20261020040000_career_apply_card_push.sql): the card goes into the person's
-- texting thread as Upmore's last word and into the outbox once, in one transaction, and only when nothing else is open,
-- nobody is mid-conversation, and the text carries every line of every application on it.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000941','push-a@example.test'),('00000000-0000-4000-8000-000000000942','push-b@example.test'),
 ('00000000-0000-4000-8000-000000000943','push-c@example.test'),('00000000-0000-4000-8000-000000000944','push-d@example.test');
insert into profiles(id) select id from auth.users where email like 'push-%@example.test';
insert into agent_threads(id,user_id,title) values
 ('00000000-0000-4000-8000-0000000009a1','00000000-0000-4000-8000-000000000941','Texts'),
 ('00000000-0000-4000-8000-0000000009a3','00000000-0000-4000-8000-000000000943','Texts'),
 ('00000000-0000-4000-8000-0000000009a4','00000000-0000-4000-8000-000000000944','Texts');
-- A texts with a thread; B has no texting contact; C texted STOP; D is mid-conversation.
insert into channel_contacts(contact,user_id,thread_id,opted_out) values
 ('+15550009401','00000000-0000-4000-8000-000000000941','00000000-0000-4000-8000-0000000009a1',false),
 ('+15550009403','00000000-0000-4000-8000-000000000943','00000000-0000-4000-8000-0000000009a3',true),
 ('+15550009404','00000000-0000-4000-8000-000000000944','00000000-0000-4000-8000-0000000009a4',false);
insert into career_outbox(user_id,key,kind,text,deliver_at,created_at) values
 ('00000000-0000-4000-8000-000000000944','reply:push-d','reply','Here are three jobs.',now(),now()-interval '5 minutes');
insert into agent_messages(thread_id,role,content,meta) values
 ('00000000-0000-4000-8000-0000000009a1','assistant','Want alerts for data jobs?','{"intent":"agent"}');
insert into career_apply_prepared(user_id,job_id,company,url,payload,payload_hash,card_lines)
 select u, 'TEST-PUSH-'||right(u::text,2)||'-'||n, 'Push Employer '||n, 'https://jobs.lever.co/test/'||n, '{}'::jsonb, repeat(n::text,64),
  array['Push Employer '||n, 'Email:   t@example.test', 'Sends to https://jobs.lever.co/test/'||n]
 from unnest(array['00000000-0000-4000-8000-000000000941','00000000-0000-4000-8000-000000000942','00000000-0000-4000-8000-000000000943',
  '00000000-0000-4000-8000-000000000944']::uuid[]) u, generate_series(1,3) n;
create temp table txt as select u.id as user_id, string_agg('Push Employer '||n||E'\nEmail: t@example.test\nSends to https://jobs.lever.co/test/'||n, E'\n\n' order by n) as t
 from auth.users u, generate_series(1,2) n where u.email like 'push-%@example.test' group by u.id;
create temp table ids as select user_id, array_agg(id order by job_id) filter (where job_id like '%-1' or job_id like '%-2') as two,
 array_agg(id) filter (where job_id like '%-3') as third from career_apply_prepared where job_id like 'TEST-PUSH-%' group by user_id;
grant select on txt, ids to authenticated, service_role;

set role service_role;
create temp table pushed as select career_apply_card_push_as(i.user_id, i.two, t.t) as card
 from ids i join txt t using (user_id) where i.user_id = '00000000-0000-4000-8000-000000000941';
reset role;
select t.ok((select card is not null from pushed),'a ready card is pushed into the texting thread');
select t.ok((select state='open' and jsonb_array_length(items)=2 from career_apply_cards where id=(select card from pushed)),'the card is open with the two applications');
select t.ok((select array_agg(state order by job_id)=array['shown','shown','ready'] from career_apply_prepared where user_id='00000000-0000-4000-8000-000000000941'),'only the two on it are shown');
select t.ok((select meta->>'intent'='career_apply_card' and meta->>'card_id'=(select card::text from pushed) and content=(select t from txt where user_id='00000000-0000-4000-8000-000000000941')
 from agent_messages where thread_id='00000000-0000-4000-8000-0000000009a1' order by id desc limit 1),'the card is the thread''s last word, word for word');
select t.ok((select count(*)=1 and bool_and(kind='card' and status='queued') from career_outbox where key='card:'||(select card from pushed)),'and queued in the outbox once');

set role service_role;
select t.ok((select career_apply_card_push_as(user_id, third, 'Push Employer 3 Email: t@example.test Sends to https://jobs.lever.co/test/3') is null from ids
 where user_id='00000000-0000-4000-8000-000000000941'),'nothing more while a card from the last 24 hours is open');
select t.ok((select career_apply_card_push_as(i.user_id, i.two, t.t) is null from ids i join txt t using (user_id) where i.user_id='00000000-0000-4000-8000-000000000942'),'no texting thread: nothing pushed');
select t.ok((select career_apply_card_push_as(i.user_id, i.two, t.t) is null from ids i join txt t using (user_id) where i.user_id='00000000-0000-4000-8000-000000000943'),'texted STOP: nothing pushed');
select t.ok((select career_apply_card_push_as(i.user_id, i.two, t.t) is null from ids i join txt t using (user_id) where i.user_id='00000000-0000-4000-8000-000000000944'),'mid-conversation: nothing pushed');
reset role;
select t.ok((select count(*)=0 from career_apply_cards where user_id in ('00000000-0000-4000-8000-000000000942','00000000-0000-4000-8000-000000000943','00000000-0000-4000-8000-000000000944')),'and no card was opened for them');
update career_outbox set created_at=now()-interval '31 minutes' where key='reply:push-d';
set role service_role;
select t.must_fail($$select career_apply_card_push_as(user_id, two, 'Push Employer 1 and 2, trust me') from ids where user_id='00000000-0000-4000-8000-000000000944'$$,
 'does not carry every line','a text without every card line is refused');
select t.ok((select career_apply_card_push_as(i.user_id, i.two, t.t) is not null from ids i join txt t using (user_id) where i.user_id='00000000-0000-4000-8000-000000000944'),'after 30 quiet minutes the card goes');
-- A card left unanswered for a day no longer holds the next one back; the new card closes it.
reset role;
update career_apply_cards set shown_at=now()-interval '25 hours' where id=(select card from pushed);
set role service_role;
create temp table pushed2 as select career_apply_card_push_as(user_id, third, 'Push Employer 3'||E'\n'||'Email: t@example.test'||E'\n'||'Sends to https://jobs.lever.co/test/3') as card
 from ids where user_id='00000000-0000-4000-8000-000000000941';
reset role;
select t.ok((select card is not null from pushed2) and (select state='answered' from career_apply_cards where id=(select card from pushed)),'a day-old card is closed by the next one');
set role service_role;
select t.must_fail($$select career_apply_card_answer_as('00000000-0000-4000-8000-000000000941',(select card from pushed),array[1])$$,'card_answered','the closed card approves nothing');
reset role;
select t.as_user('00000000-0000-4000-8000-000000000941');set role authenticated;
select t.must_fail($$select career_apply_card_push_as('00000000-0000-4000-8000-000000000941',(select third from ids where user_id='00000000-0000-4000-8000-000000000941'),'x')$$,'permission denied','a person cannot push a card');
reset role;
rollback;
