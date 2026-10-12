-- IOU log (20261012050000_ious.sql): the person's own notes of who owes whom, in their own settings row, bounded,
-- with a name, a direction, whole cents and a status, and never a long digit run.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000d1','iou1@example.com'),('00000000-0000-0000-0000-0000000000d2','iou2@example.com');
select t.as_user('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
insert into public.agent_proactive_settings(user_id) values('00000000-0000-0000-0000-0000000000d1');
select t.ok((select ious = '[]'::jsonb from public.agent_proactive_settings),'a new settings row has no IOUs');
update public.agent_proactive_settings set ious='[{"id":"iou-mv4hjpc0","name":"mom","direction":"i_owe","amount_cents":20000,"status":"open","note":"","created_on":"2026-10-12"}]';
select t.ok((select ious->0->>'name'='mom' from public.agent_proactive_settings),'the owner saves an IOU in their own row');
select t.must_fail($$update public.agent_proactive_settings set ious='[{"name":"mom","direction":"lent","amount_cents":100,"status":"open"}]'$$,'ious_shape','a direction other than i_owe or owes_me is refused');
select t.must_fail($$update public.agent_proactive_settings set ious='[{"name":"mom","direction":"i_owe","amount_cents":0,"status":"open"}]'$$,'ious_shape','a zero amount is refused');
select t.must_fail($$update public.agent_proactive_settings set ious='[{"name":"mom","direction":"i_owe","amount_cents":12.5,"status":"open"}]'$$,'ious_shape','a fraction of a cent is refused');
select t.must_fail($$update public.agent_proactive_settings set ious='[{"name":"mom","direction":"i_owe","amount_cents":10000001,"status":"open"}]'$$,'ious_shape','more than $100,000 is refused');
select t.must_fail($$update public.agent_proactive_settings set ious='[{"name":"mom","direction":"i_owe","amount_cents":"200","status":"open"}]'$$,'ious_shape','an amount that is not a number is refused');
select t.must_fail($$update public.agent_proactive_settings set ious='[{"direction":"i_owe","amount_cents":100,"status":"open"}]'$$,'ious_shape','an IOU without a name is refused');
select t.must_fail($$update public.agent_proactive_settings set ious='[{"name":"mom","direction":"i_owe","amount_cents":100,"status":"forgiven"}]'$$,'ious_shape','a status other than open or settled is refused');
select t.must_fail($$update public.agent_proactive_settings set ious='[{"name":"mom","direction":"i_owe","amount_cents":100,"status":"open","note":"ssn 123456789"}]'$$,'ious_shape','an identity number is refused');
select t.must_fail($$update public.agent_proactive_settings set ious='{"name":"mom"}'$$,'ious_shape','an object instead of a list is refused');
select t.must_fail($$update public.agent_proactive_settings set ious=(select jsonb_agg(jsonb_build_object('name','friend '||chr(97+(i%26))||chr(97+(i/26)),'direction','owes_me','amount_cents',100,'status','open')) from generate_series(1,41) i)$$,'ious_shape','more than 40 IOUs is refused');
update public.agent_proactive_settings set ious=(select jsonb_agg(jsonb_build_object('name','friend '||chr(97+(i%26))||chr(97+(i/26)),'direction','owes_me','amount_cents',100,'status','settled')) from generate_series(1,40) i);
select t.ok((select jsonb_array_length(ious)=40 from public.agent_proactive_settings),'40 IOUs is the most kept');
reset role;
-- Another owner cannot read or change them.
select t.as_user('00000000-0000-0000-0000-0000000000d2');
set role authenticated;
select t.ok((select count(*)=0 from public.agent_proactive_settings),'another owner reads none of these IOUs');
update public.agent_proactive_settings set ious='[]' where user_id='00000000-0000-0000-0000-0000000000d1';
reset role;
select t.ok((select jsonb_array_length(ious)=40 from public.agent_proactive_settings where user_id='00000000-0000-0000-0000-0000000000d1'),'another owner''s update changes nothing');
rollback;
