-- WO-026 (20261020110000_career_connector.sql): the Connector's double opt-in. Every refusal of connector_propose_for,
-- and that nothing identifying about either person is readable by the other before both said yes.
begin;
reset role;
-- 1-20 are named people; 101-590 fill the network toward the 500 it needs to open.
create temp table u(n int primary key, id uuid);
insert into u select n, ('00000000-0000-4000-8026-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, 20) n union all
 select n, ('00000000-0000-4000-8026-' || lpad(n::text, 12, '0'))::uuid from generate_series(101, 591) n;
grant select on u to authenticated, service_role, anon;
insert into auth.users(id, email) select id, 'conn-' || n || '@example.test' from u;
insert into profiles(id) select id from u;
create or replace function pg_temp.uid(k int) returns uuid language sql stable as $$ select id from u where n = k $$;
-- A student who asked to meet someone at JPMorgan, and an alum there who offered to talk.
create temp table fx(k text primary key, v jsonb);
grant select on fx to authenticated, service_role;
insert into fx values
 ('a_facts', '[{"id":"school:university-of-michigan","kind":"school","value":"University of Michigan","source":"career:F-003"}]'),
 ('a_needs', '[{"id":"need:meet:jpmorgan","kind":"meet","value":"JPMorgan","source":"chat: \"connect me with someone at JPM\""}]'),
 ('b_facts', '[{"id":"employer:jpmorgan","kind":"employer","value":"JPMorgan","source":"chat: \"I work at JPMorgan\""},{"id":"name:first","kind":"name","value":"Maya","source":"career:basics.name"}]'),
 ('b_offers', '[{"id":"offer:advice:jpmorgan","kind":"advice","value":"JPMorgan","source":"chat: \"I can talk to students about JPMorgan\""}]'),
 ('peer_facts', '[{"id":"target_role:analyst","kind":"target_role","value":"analyst","source":"career:preferences.roles"}]'),
 ('peer_needs', '[{"id":"need:prep:analyst","kind":"prep","value":"analyst","source":"chat: \"find me a prep partner for analyst interviews\""}]');
create temp table cite(k text primary key, v jsonb);
grant select on cite to authenticated, service_role;
insert into cite values
 ('ab', '{"a":["need:meet:jpmorgan"],"b":["employer:jpmorgan","offer:advice:jpmorgan"]}'),
 ('peer', '{"a":["need:prep:analyst"],"b":["need:prep:analyst"]}');

-- Joining: the person's own profile, verified never set by them.
select t.as_user(pg_temp.uid(1)::text); set role authenticated;
select t.ok((select opted_in and not verified and role = 'student' from connector_opt_in_own('student', (select v from fx where k='a_needs'), '[]', (select v from fx where k='a_facts'))),
 'a person joins as a student; verified stays false');
select t.must_fail($$select connector_opt_in_own('student', '[{"id":"need:x","kind":"meet","value":"JPMorgan"}]', '[]', '[]')$$, 'invalid connector profile', 'a need without its source is refused');
select t.must_fail($$select connector_opt_in_own('student', '[]', '[]', '[{"id":"f1","value":"x","source":"chat"},{"id":"f1","value":"y","source":"chat"}]')$$, 'invalid connector profile', 'two items with one id are refused');
select t.must_fail($$select connector_opt_in_own('ceo', '[]', '[]', '[]')$$, 'invalid connector profile', 'an unknown role is refused');
select t.must_fail($$update connector_profiles set verified = true$$, 'permission denied', 'a person cannot set verified on their own profile');
select t.must_fail($$insert into connector_profiles(user_id, role, verified, opted_in) values (auth.uid(), 'mentor', true, true)$$, 'permission denied', 'a person cannot write their profile row directly');
reset role;
set role service_role;
select connector_opt_in_as(pg_temp.uid(2), 'alumni', '[]', (select v from fx where k='b_offers'), (select v from fx where k='b_facts'));
select connector_opt_in_as(pg_temp.uid(3), 'mentor', '[]', (select v from fx where k='b_offers'), (select v from fx where k='b_facts'));
select connector_opt_in_as(pg_temp.uid(k), 'candidate', (select v from fx where k='peer_needs'), '[]', (select v from fx where k='peer_facts')) from generate_series(4, 18) k;
reset role;

-- A profile is readable only by its owner; introductions and blocks have no direct read at all.
select t.as_user(pg_temp.uid(1)::text); set role authenticated;
select t.ok((select count(*) = 1 and bool_and(user_id = auth.uid()) from connector_profiles), 'a person reads only their own profile, never a directory');
select t.must_fail($$select * from connector_intros$$, 'permission denied', 'introductions are not readable directly');
select t.must_fail($$select * from connector_blocks$$, 'permission denied', 'blocks are not readable directly');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(2), 'meet', 'x', 'y', (select v from cite where k='ab'))$$, 'permission denied', 'a person cannot propose');
select t.must_fail($$select connector_verify_for(auth.uid(), true)$$, 'permission denied', 'a person cannot verify themselves');
select t.must_fail($$select connector_opt_in_core(pg_temp.uid(2), 'student', '[]', '[]', '[]', null, now())$$, 'permission denied', 'a person cannot write another''s profile through the core');
select t.must_fail($$select connector_my_proposals_as(pg_temp.uid(2))$$, 'permission denied', 'a person cannot read another''s proposals');
select t.ok((select connector_open() = false), 'the network is closed below 500');
reset role;

-- Cold start: below 500 opted-in, unpaused profiles nothing is proposed.
insert into connector_profiles(user_id, opted_in, role, facts, needs) select id, true, 'candidate', '[]', '[]' from u where n between 101 and 581;
select t.ok((select count(*) = 499 from connector_profiles where opted_in and not paused), '499 in the network');
set role service_role;
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(2), 'meet', 'why a', 'why b', (select v from cite where k='ab'))$$, 'connector_closed', 'below 500 profiles nothing is proposed');
reset role;
insert into connector_profiles(user_id, opted_in, role, paused) select id, true, 'candidate', true from u where n = 582;
set role service_role;
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(2), 'meet', 'why a', 'why b', (select v from cite where k='ab'))$$, 'connector_closed', 'a paused profile does not count toward 500');
reset role;
insert into connector_profiles(user_id, opted_in, role) select id, true, 'candidate' from u where n = 583;
insert into connector_profiles(user_id, opted_in, role) select id, false, 'candidate' from u where n = 584;
select t.ok((select connector_open()), 'open at 500');

set role service_role;
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(584), 'meet', 'why a', 'why b', (select v from cite where k='ab'))$$, 'not_opted_in', 'someone who has not opted in is never proposed');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(19), 'meet', 'why a', 'why b', (select v from cite where k='ab'))$$, 'not_opted_in', 'someone with no profile is never proposed');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(582), 'meet', 'why a', 'why b', (select v from cite where k='ab'))$$, 'not_opted_in', 'a paused person is never proposed');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(3), 'meet', 'why a', 'why b', (select v from cite where k='ab'))$$, 'unverified', 'an unverified mentor is never proposed');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(2), 'meet', 'why a', 'why b', '{"a":[],"b":["employer:jpmorgan"]}')$$, 'missing_cites', 'no fact from one side, no intro');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(2), 'meet', 'why a', 'why b', '{"a":["school:harvard"],"b":["employer:jpmorgan"]}')$$, 'missing_cites', 'a cited fact the profile does not hold is refused');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(2), 'meet', 'why a', 'why b', '{"a":["need:meet:jpmorgan"]}')$$, 'missing_cites', 'cites must name both sides');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(2), 'meet', '', 'why b', (select v from cite where k='ab'))$$, 'invalid proposal', 'a proposal with no why is refused');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(1), 'meet', 'x', 'y', (select v from cite where k='ab'))$$, 'invalid proposal', 'nobody is proposed to themselves');
create temp table ab as select * from connector_propose_for(pg_temp.uid(1), pg_temp.uid(2), 'meet',
 'You asked to meet someone at JPMorgan. An alum who works there offered to talk with students about it.',
 'A student wants to meet someone at JPMorgan, and you offered to talk about your work there.', (select v from cite where k='ab'));
select t.ok((select state = 'proposed' from ab), 'a proposal with real facts from both sides is made');
select t.must_fail($$select connector_propose_for(pg_temp.uid(1), pg_temp.uid(4), 'prep', 'x', 'y', (select v from cite where k='peer'))$$, 'pending', 'one pending proposal at a time (the first person)');
select t.must_fail($$select connector_propose_for(pg_temp.uid(4), pg_temp.uid(2), 'prep', 'x', 'y', '{"a":["need:prep:analyst"],"b":["employer:jpmorgan"]}')$$, 'pending', 'one pending proposal at a time (the second person)');
reset role;
grant select on ab to authenticated, service_role;

-- Before both said yes, neither side can read who the other is.
select t.as_user(pg_temp.uid(2)::text); set role authenticated;
select t.ok((select jsonb_array_length(connector_my_proposals_own()) = 1), 'the alum sees the one proposal');
select t.ok((select x->>'other_user' is null and x->>'why' like 'A student wants%' and x->>'other_role' = 'student'
  and position((select a_user::text from ab) in x::text) = 0 and position('You asked' in x::text) = 0
  from jsonb_array_elements(connector_my_proposals_own()) x), 'before any yes: no id, only their own why and the role kind');
create temp table b_yes as select connector_answer_own((select id from ab), true) v;
select t.ok((select v->>'state' = 'b_yes' and v->>'other_user' is null and position((select a_user::text from ab) in v::text) = 0 from b_yes), 'one yes reveals nothing');
reset role;
select t.as_user(pg_temp.uid(1)::text); set role authenticated;
select t.ok((select x->>'other_user' is null and x->>'my_answer' is null and position((select b_user::text from ab) in x::text) = 0
  and position('Maya' in x::text) = 0 from jsonb_array_elements(connector_my_proposals_own()) x), 'the student still sees no id and no name after the other''s yes');
select t.ok((select (connector_answer_own((select id from ab), true))->>'other_user' = (select b_user::text from ab)), 'both yes: the student now sees who it is');
select t.must_fail($$select connector_answer_own((select id from ab), false)$$, 'intro_answered', 'an intro both said yes to cannot be answered again');
reset role;
select t.as_user(pg_temp.uid(2)::text); set role authenticated;
select t.ok((select (x->>'other_user') = (select a_user::text from ab) from jsonb_array_elements(connector_my_proposals_own()) x), 'both yes: the alum sees who it is');
reset role;
select t.as_user(pg_temp.uid(5)::text); set role authenticated;
select t.must_fail($$select connector_answer_own((select id from ab), true)$$, 'invalid intro', 'someone not on the intro cannot answer it');
select t.ok((select jsonb_array_length(connector_my_proposals_own()) = 0), 'someone not on the intro sees nothing of it');
reset role;
set role service_role;
select t.must_fail($$select connector_propose_for(pg_temp.uid(2), pg_temp.uid(1), 'meet', 'x', 'y', '{"a":["employer:jpmorgan"],"b":["need:meet:jpmorgan"]}')$$, 'repeat', 'a pair is proposed once, ever');
reset role;

-- One side's no closes it and reveals nothing to either side.
set role service_role;
create temp table p45 as select * from connector_propose_for(pg_temp.uid(4), pg_temp.uid(5), 'prep', 'You both want an analyst prep partner.', 'You both want an analyst prep partner.', (select v from cite where k='peer'));
reset role;
grant select on p45 to authenticated, service_role;
select t.as_user(pg_temp.uid(4)::text); set role authenticated;
select connector_answer_own((select id from p45), true);
reset role;
select t.as_user(pg_temp.uid(5)::text); set role authenticated;
select t.ok((select v->>'state' = 'declined' and v->>'other_user' is null from (select connector_answer_own((select id from p45), false) v) z), 'a no closes it and names nobody');
reset role;
select t.as_user(pg_temp.uid(4)::text); set role authenticated;
select t.ok((select x->>'state' = 'declined' and x->>'other_user' is null and position((select b_user::text from p45) in x::text) = 0 from jsonb_array_elements(connector_my_proposals_own()) x), 'the one who said yes learns nothing about who said no');
select t.must_fail($$select connector_answer_own((select id from p45), true)$$, 'intro_closed', 'a declined intro cannot be revived');
reset role;

-- At most 3 proposals in 7 days per person.
set role service_role;
create temp table cap1 as select * from connector_propose_for(pg_temp.uid(4), pg_temp.uid(6), 'prep', 'x', 'y', (select v from cite where k='peer'));
select connector_answer_as(pg_temp.uid(6), (select id from cap1), false);
create temp table cap2 as select * from connector_propose_for(pg_temp.uid(4), pg_temp.uid(7), 'prep', 'x', 'y', (select v from cite where k='peer'));
select connector_answer_as(pg_temp.uid(7), (select id from cap2), false);
select t.must_fail($$select connector_propose_for(pg_temp.uid(4), pg_temp.uid(8), 'prep', 'x', 'y', (select v from cite where k='peer'))$$, 'weekly_cap', 'a fourth proposal in 7 days is refused');
select t.must_fail($$select connector_propose_for(pg_temp.uid(8), pg_temp.uid(4), 'prep', 'x', 'y', (select v from cite where k='peer'))$$, 'weekly_cap', 'the cap holds for either side');
reset role;
update connector_intros set proposed_at = proposed_at - interval '8 days' where a_user = pg_temp.uid(4) or b_user = pg_temp.uid(4);
set role service_role;
select t.ok((select state = 'proposed' from connector_propose_for(pg_temp.uid(4), pg_temp.uid(8), 'prep', 'x', 'y', (select v from cite where k='peer'))), 'after 7 days a proposal can be made again');
reset role;

-- A block stops proposals both ways; the blocker never gets the other's id.
set role service_role;
create temp table p910 as select * from connector_propose_for(pg_temp.uid(9), pg_temp.uid(10), 'prep', 'x', 'y', (select v from cite where k='peer'));
reset role;
grant select on p910 to authenticated, service_role;
select t.as_user(pg_temp.uid(9)::text); set role authenticated;
select t.ok((select v = '{"blocked":true,"reported":false}'::jsonb from (select connector_block_own((select id from p910), 'not relevant') v) z), 'a block returns no id');
select t.ok((select x->>'state' = 'declined' from jsonb_array_elements(connector_my_proposals_own()) x), 'a block declines the waiting proposal');
reset role;
-- The pair itself is never proposed again; the block is what stops it whoever is first.
delete from connector_intros where id = (select id from p910);
set role service_role;
select t.must_fail($$select connector_propose_for(pg_temp.uid(9), pg_temp.uid(10), 'prep', 'x', 'y', (select v from cite where k='peer'))$$, 'blocked', 'blocked: never proposed (blocker first)');
select t.must_fail($$select connector_propose_for(pg_temp.uid(10), pg_temp.uid(9), 'prep', 'x', 'y', (select v from cite where k='peer'))$$, 'blocked', 'blocked: never proposed (blocked first)');
reset role;

-- A report hides the reporter from the reported person, even after both said yes, and is flagged for review.
set role service_role;
create temp table p1112 as select * from connector_propose_for(pg_temp.uid(11), pg_temp.uid(12), 'prep', 'x', 'y', (select v from cite where k='peer'));
select connector_answer_as(pg_temp.uid(11), (select id from p1112), true);
select t.ok((select (connector_answer_as(pg_temp.uid(12), (select id from p1112), true))->>'other_user' = pg_temp.uid(11)::text), 'both yes');
select t.ok((select (connector_block_as(pg_temp.uid(12), (select id from p1112), 'rude', true))->>'reported' = 'true'), 'reported');
select t.ok((select x->>'other_user' is null from jsonb_array_elements(connector_my_proposals_as(pg_temp.uid(11))) x), 'the reported person no longer sees who reported them');
select t.ok((select count(*) = 1 from connector_blocks where blocker = pg_temp.uid(12) and reported and reviewed_at is null), 'the report waits for human review');
select t.must_fail($$select connector_followup_for((select id from p1112), 'introduced')$$, 'followup_refused', 'a reported intro is never introduced');
reset role;

-- Mentors and recruiters: verified only by the service role, and a changed role clears it.
set role service_role;
select t.ok((select connector_verify_for(pg_temp.uid(3), true)), 'the service role verifies a mentor');
select t.ok((select state = 'proposed' from connector_propose_for(pg_temp.uid(13), pg_temp.uid(3), 'meet', 'x', 'y', '{"a":["need:prep:analyst"],"b":["employer:jpmorgan"]}')), 'a verified mentor can be proposed');
reset role;
select t.as_user(pg_temp.uid(3)::text); set role authenticated;
select t.ok((select not verified and role = 'recruiter' from connector_opt_in_own('recruiter', '[]', (select v from fx where k='b_offers'), (select v from fx where k='b_facts'))), 'changing role clears verified');
reset role;

-- Follow-through: introduced once, a check-in, one nudge, then recorded; feedback updates the person's own filters.
set role service_role;
select t.ok((select connector_followup_for((select id from ab), 'introduced') = 'introduced'), 'introduced after both yes');
select t.must_fail($$select connector_followup_for((select id from ab), 'nudge')$$, 'followup_refused', 'no proposal nudge after the intro');
select t.ok((select connector_followup_for((select id from ab), 'checkin') = 'introduced'), 'a check-in');
select t.must_fail($$select connector_followup_for((select id from ab), 'checkin')$$, 'followup_refused', 'one check-in only');
select t.ok((select connector_followup_for((select id from ab), 'checkin_nudge') = 'introduced'), 'one nudge');
select t.must_fail($$select connector_followup_for((select id from ab), 'checkin_nudge')$$, 'followup_refused', 'never a second nudge');
reset role;
select t.as_user(pg_temp.uid(1)::text); set role authenticated;
select t.must_fail($$select connector_feedback_own((select id from ab), '{"useful":true}')$$, 'invalid feedback', 'feedback says whether they met');
select t.ok((select v->>'state' = 'met' and v->'my_feedback'->>'useful' = 'true' from (select connector_feedback_own((select id from ab), '{"met":true,"useful":true}', '{"prefer_kinds":["meet"]}') v) z), 'met and useful is recorded');
select t.ok((select filters = '{"prefer_kinds":["meet"]}' from connector_profiles), 'feedback updates the person''s own filters');
reset role;
select t.as_user(pg_temp.uid(2)::text); set role authenticated;
select t.ok((select x->'my_feedback' is null or x->>'my_feedback' is null from jsonb_array_elements(connector_my_proposals_own()) x), 'one side never reads the other side''s feedback');
reset role;
set role service_role;
select t.must_fail($$select connector_feedback_as(pg_temp.uid(4), (select id from p45), '{"met":true}')$$, 'not_introduced', 'no feedback on an intro that never happened');
reset role;

-- Leaving clears the profile and expires what waits; deleting the account deletes everything (cascade).
select t.as_user(pg_temp.uid(13)::text); set role authenticated;
select t.ok((select connector_opt_out_own()), 'a person leaves');
select t.ok((select not opted_in and needs = '[]' and facts = '[]' from connector_profiles), 'leaving clears what the profile held');
reset role;
select t.ok((select state = 'expired' from connector_intros where a_user = pg_temp.uid(13)), 'leaving expires the waiting proposal');
delete from auth.users where id = pg_temp.uid(1);
select t.ok((select count(*) = 0 from connector_profiles where user_id = pg_temp.uid(1)) and (select count(*) = 0 from connector_intros where a_user = pg_temp.uid(1) or b_user = pg_temp.uid(1)),
 'deleting the account deletes the profile and its introductions');
delete from auth.users where id = pg_temp.uid(12);
select t.ok((select count(*) = 0 from connector_blocks where blocker = pg_temp.uid(12)), 'and its blocks');
set role anon;
select t.must_fail($$select connector_my_proposals_own()$$, 'permission denied', 'anon reads nothing');
reset role;
rollback;
