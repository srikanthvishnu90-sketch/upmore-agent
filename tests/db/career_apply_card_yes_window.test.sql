-- The card's yes window in the database (20261025170000_career_apply_card_yes_window.sql, SERIAL-1451): an approval more
-- than 10 minutes after the card was shown is refused ('card_stale'); a decline is taken inside 24 hours; an answered
-- card is answered once; an unreadable pace reads 'pace_unreadable' on the answer.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000e4','cardwin@example.com');
insert into public.profiles(id) values('00000000-0000-0000-0000-0000000000e4') on conflict do nothing;
insert into public.career_watch_kv(user_id,key,value) values ('00000000-0000-0000-0000-0000000000e4','career:account','{"epoch":0,"version":0,"paused":false}');
-- as the database owner: card_open_for and card_answer_for are the server's (owner-only), as the scheduled run and the chat's service path call them
create temp table cw (n int, p public.career_apply_prepared);
do $$ declare g int; r public.career_apply_prepared; pl jsonb; begin
 for g in 1..3 loop
  pl := jsonb_build_object('version',1,'user_id','00000000-0000-0000-0000-0000000000e4','job_id','TEST-CW-'||g,'company','CW Employer '||g,'url','https://jobs.lever.co/cw'||g||'/1','fields','[]'::jsonb,'privacy_epoch',0,'account_version',0,'expires_at',now()+interval '1 day');
  insert into public.career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
   values ('00000000-0000-0000-0000-0000000000e4', 'TEST-CW-'||g, 'CW Employer '||g, 'https://jobs.lever.co/cw'||g||'/1', pl, public.career_apply_payload_hash(pl), array['CW Employer '||g||': Analyst','Name: Test Person']) returning * into r;
  insert into cw values (g, r);
 end loop;
end $$;
select t.ok((select count(*)=3 from cw), 'three prepared');
-- Card A, shown 11 minutes ago: an approval is refused as stale; a decline is taken.
create temp table card_a as select * from public.career_apply_card_open_for('00000000-0000-0000-0000-0000000000e4', (select array_agg((p).id) from cw where n <= 2), now() - interval '11 minutes');
select t.must_fail($$select public.career_apply_card_answer_for('00000000-0000-0000-0000-0000000000e4', (select id from card_a), array[1,2], now())$$, 'card_stale', 'a yes 11 minutes after the card: refused by the database too');
select t.ok((select state = 'open' from public.career_apply_cards where id = (select id from card_a)), 'the card stays open: nothing was answered');
select t.ok((select count(*) = 0 from public.career_apply_jobs where user_id = '00000000-0000-0000-0000-0000000000e4'), 'nothing queued');
select t.ok((select jsonb_array_length(public.career_apply_card_answer_for('00000000-0000-0000-0000-0000000000e4', (select id from card_a), '{}', now())) = 2), 'a decline inside 24 hours is taken');
select t.must_fail($$select public.career_apply_card_answer_for('00000000-0000-0000-0000-0000000000e4', (select id from card_a), array[1], now())$$, 'card_answered', 'answered once: a later yes finds it answered');
-- Card B, shown 9 minutes ago: approved; the queue holds it by the shown hash.
create temp table card_b as select * from public.career_apply_card_open_for('00000000-0000-0000-0000-0000000000e4', (select array_agg((p).id) from cw where n = 3), now() - interval '9 minutes');
select t.ok((select (public.career_apply_card_answer_for('00000000-0000-0000-0000-0000000000e4', (select id from card_b), array[1], now()))->0->>'result') = 'queued', 'a yes 9 minutes after the card is taken');
select t.ok((select count(*) = 1 from public.career_apply_jobs where user_id = '00000000-0000-0000-0000-0000000000e4' and state = 'queued'), 'one queued, by the card');
-- An unreadable pace on the answer is named.
do $$ declare r public.career_apply_prepared; pl jsonb; begin
 pl := jsonb_build_object('version',1,'user_id','00000000-0000-0000-0000-0000000000e4','job_id','TEST-CW-4','company','CW Employer 4','url','https://jobs.lever.co/cw4/1','fields','[]'::jsonb,'privacy_epoch',0,'account_version',0,'expires_at',now()+interval '1 day');
 insert into public.career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
  values ('00000000-0000-0000-0000-0000000000e4', 'TEST-CW-4', 'CW Employer 4', 'https://jobs.lever.co/cw4/1', pl, public.career_apply_payload_hash(pl), array['CW Employer 4: Analyst','Name: Test Person']) returning * into r;
 insert into cw values (4, r);
end $$;
create temp table card_c as select * from public.career_apply_card_open_for('00000000-0000-0000-0000-0000000000e4', (select array_agg((p).id) from cw where n = 4), now());
update public.career_watch_kv set value = value || '{"daily_limit":"lots"}' where user_id='00000000-0000-0000-0000-0000000000e4';
select t.ok((select (public.career_apply_card_answer_for('00000000-0000-0000-0000-0000000000e4', (select id from card_c), array[1], now()))->0->>'result') = 'pace_unreadable', 'an unreadable pace is named on the answer, nothing queued');
select t.ok((select count(*) = 1 from public.career_apply_jobs where user_id = '00000000-0000-0000-0000-0000000000e4' and state = 'queued'), 'still one');
rollback;
