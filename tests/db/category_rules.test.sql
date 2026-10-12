-- Category rules (20261012040000_category_rules.sql): the person's own rules, in their own settings row, bounded, with
-- only the chat's categories and never a long digit run.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000c1','rules1@example.com'),('00000000-0000-0000-0000-0000000000c2','rules2@example.com');
select t.as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
insert into public.agent_proactive_settings(user_id) values('00000000-0000-0000-0000-0000000000c1');
select t.ok((select category_rules = '[]'::jsonb from public.agent_proactive_settings),'a new settings row has no category rules');
update public.agent_proactive_settings set category_rules='[{"id":"cr-mv4hjpc0","term":"target","group":"groceries","created_at":"2026-10-12T00:00:00.000Z","text":"recategorize Target as groceries"}]';
select t.ok((select category_rules->0->>'group'='groceries' from public.agent_proactive_settings),'the owner saves a rule in their own row');
select t.must_fail($$update public.agent_proactive_settings set category_rules='[{"term":"target","group":"pets"}]'$$,'category_rules_shape','a category the chat does not count is refused');
select t.must_fail($$update public.agent_proactive_settings set category_rules='[{"group":"groceries"}]'$$,'category_rules_shape','a rule without a term is refused');
select t.must_fail($$update public.agent_proactive_settings set category_rules='[{"term":42,"group":"groceries"}]'$$,'category_rules_shape','a term that is not text is refused');
select t.must_fail($$update public.agent_proactive_settings set category_rules='[{"term":"4111111111111111","group":"groceries"}]'$$,'category_rules_shape','a card number is refused');
select t.must_fail($$update public.agent_proactive_settings set category_rules='{"term":"target","group":"groceries"}'$$,'category_rules_shape','an object instead of a list is refused');
select t.must_fail($$update public.agent_proactive_settings set category_rules=(select jsonb_agg(jsonb_build_object('term','store '||chr(97+(i%26))||chr(97+(i/26)),'group','shopping')) from generate_series(1,41) i)$$,'category_rules_shape','more than 40 rules is refused');
update public.agent_proactive_settings set category_rules=(select jsonb_agg(jsonb_build_object('term','store '||chr(97+(i%26))||chr(97+(i/26)),'group','shopping')) from generate_series(1,40) i);
select t.ok((select jsonb_array_length(category_rules)=40 from public.agent_proactive_settings),'40 rules is the most kept');
reset role;
-- Another owner cannot read or change them.
select t.as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select t.ok((select count(*)=0 from public.agent_proactive_settings),'another owner reads none of these rules');
update public.agent_proactive_settings set category_rules='[]' where user_id='00000000-0000-0000-0000-0000000000c1';
reset role;
select t.ok((select jsonb_array_length(category_rules)=40 from public.agent_proactive_settings where user_id='00000000-0000-0000-0000-0000000000c1'),'another owner''s update changes nothing');
rollback;
