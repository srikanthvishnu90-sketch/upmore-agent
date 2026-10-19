-- WO-022: prepared on the person's computer, shown on a card, approved by one text: exactly what was shown is queued.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000931','card-a@example.test'),('00000000-0000-4000-8000-000000000932','card-b@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000931'),('00000000-0000-4000-8000-000000000932');
set role service_role;
insert into career_watch_kv(user_id,key,value) values
 ('00000000-0000-4000-8000-000000000931','career:account','{"epoch":1,"version":1,"paused":false}'),
 ('00000000-0000-4000-8000-000000000932','career:account','{"epoch":1,"version":1,"paused":false}');
reset role;
create temp table pl(n int, p jsonb);
grant select on pl to authenticated, service_role;
insert into pl select n, jsonb_build_object('version',1,'user_id','00000000-0000-4000-8000-000000000931','job_id','TEST-CARD-'||n,
 'company','Card Employer '||n,'url','https://jobs.lever.co/test/'||n,'fields','[{"name":"email","label":"Email","value":"t@example.test","factId":"TEST-1"}]'::jsonb,
 'privacy_epoch',1,'account_version',1,'expires_at',now()+interval '1 hour') from generate_series(1,3) n;

-- The person's computer stores what it prepared; the database computes the hash.
select t.as_user('00000000-0000-4000-8000-000000000931');set role authenticated;
-- (f()).* would call the function once per column: each call below runs once, in FROM.
create temp table prep as select r.* from pl, lateral career_apply_prepare_own(p, array['Card Employer '||n,'Email: t@example.test','Sends to https://jobs.lever.co/test/'||n]) r order by n;
select t.ok((select count(*)=3 and bool_and(state='ready') from prep),'three prepared applications stored');
reset role;
select t.ok((select bool_and(payload_hash=encode(sha256(convert_to(career_apply_canonical(payload),'UTF8')),'hex')) from prep),'the hash is the database''s own');
select t.as_user('00000000-0000-4000-8000-000000000931');set role authenticated;
select t.must_fail($$select career_apply_prepare_own(jsonb_set(p,'{user_id}','"00000000-0000-4000-8000-000000000932"'),array['x']) from pl where n=1$$,'not your application','another person''s payload is refused');
select t.must_fail($$select career_apply_prepare_own(jsonb_set(p,'{privacy_epoch}','2'),array['x']) from pl where n=1$$,'stale','an approval for changed facts is refused');
select t.must_fail($$select career_apply_prepare_own(p,array[]::text[]) from pl where n=1$$,'invalid prepared','a card with no lines is refused');
select t.must_fail($$select career_apply_card_open_as('00000000-0000-4000-8000-000000000931',(select array_agg(id) from prep))$$,'permission denied','a person cannot use the service entry');
reset role;

-- Another person cannot show A's applications on a card.
select t.as_user('00000000-0000-4000-8000-000000000932');set role authenticated;
select t.must_fail($$select career_apply_card_open_own((select array_agg(id) from prep))$$,'invalid card','B cannot open a card of A''s applications');
reset role;

-- A's card: numbered in the order given, each with the hash shown.
select t.as_user('00000000-0000-4000-8000-000000000931');set role authenticated;
create temp table card as select * from career_apply_card_open_own((select array_agg(id order by job_id) from prep));
select t.ok((select jsonb_array_length(items)=3 and state='open' from card),'a card of three, open');
select t.ok((select bool_and((it->>'payload_hash') = (select payload_hash from prep where id=(it->>'prepared_id')::uuid)) from card, jsonb_array_elements(items) it),'each card line carries the hash shown');
select t.must_fail($$select career_apply_card_answer_own((select id from card), array[4])$$,'not_on_card','a number not on the card is refused');
reset role;

-- B cannot answer A's card.
select t.as_user('00000000-0000-4000-8000-000000000932');set role authenticated;
select t.must_fail($$select career_apply_card_answer_own((select id from card), array[1])$$,'invalid card answer','B cannot answer A''s card');
reset role;

-- "yes but not 2": 1 and 3 are queued exactly as shown, 2 is declined; nothing twice.
select t.as_user('00000000-0000-4000-8000-000000000931');set role authenticated;
create temp table ans as select career_apply_card_answer_own((select id from card), array[1,3]) a;
select t.ok((select a = '[{"n":1,"company":"Card Employer 1","result":"queued"},{"n":2,"company":"Card Employer 2","result":"declined"},{"n":3,"company":"Card Employer 3","result":"queued"}]'::jsonb from ans),'yes but not 2: 1 and 3 queued, 2 declined');
select t.must_fail($$select career_apply_card_answer_own((select id from card), array[1,3])$$,'card_answered','a card is answered once');
reset role;
select t.ok((select count(*)=2 from career_apply_jobs where user_id='00000000-0000-4000-8000-000000000931'),'two applications on the queue');
select t.ok((select bool_and(j.approval_hash=p.payload_hash and j.payload=p.payload) from career_apply_jobs j join career_apply_prepared p on p.job_id=j.job_id and p.user_id=j.user_id where j.user_id='00000000-0000-4000-8000-000000000931'),'each queued exactly as shown, approved by the hash shown');
select t.ok((select array_agg(state order by job_id)=array['approved','declined','approved'] from career_apply_prepared where user_id='00000000-0000-4000-8000-000000000931'),'prepared rows record the answer');

-- A posting already applied to is never prepared again; an old card approves nothing.
select t.as_user('00000000-0000-4000-8000-000000000931');set role authenticated;
select t.must_fail($$select career_apply_prepare_own(p,array['x']) from pl where n=1$$,'duplicate_job','a posting already applied to is not prepared again');
reset role;
set role service_role;
insert into career_apply_prepared(user_id,job_id,company,url,payload,payload_hash,card_lines)
 select '00000000-0000-4000-8000-000000000931','TEST-CARD-OLD','Old Employer','https://jobs.lever.co/test/old',jsonb_set(p,'{job_id}','"TEST-CARD-OLD"'),
  encode(sha256(convert_to(career_apply_canonical(jsonb_set(p,'{job_id}','"TEST-CARD-OLD"')),'UTF8')),'hex'),array['Old Employer'] from pl where n=1;
create temp table oldcard as select * from career_apply_card_open_as('00000000-0000-4000-8000-000000000931',(select array_agg(id) from career_apply_prepared where job_id='TEST-CARD-OLD'));
update career_apply_cards set shown_at=now()-interval '25 hours' where id=(select id from oldcard);
select t.must_fail($$select career_apply_card_answer_as('00000000-0000-4000-8000-000000000931',(select id from oldcard),array[1])$$,'card_expired','a card older than 24 hours approves nothing');
reset role;
select t.ok((select count(*)=2 from career_apply_jobs where user_id='00000000-0000-4000-8000-000000000931'),'nothing more was queued');
set role anon;
select t.must_fail($$select career_apply_card_open_own(array[gen_random_uuid()])$$,'permission denied','anon cannot open a card');
reset role;
rollback;
