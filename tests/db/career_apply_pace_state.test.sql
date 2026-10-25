-- Absent, set, unreadable (20261025160000_career_apply_pace_state.sql, SERIAL-1430): only a missing or null key is no
-- preference; a stored value that is not a whole number from 1 to 2147483647 is unreadable and refuses, never unlimited and
-- never changed; the setter refuses the same values at the point the person sets them.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000e3','pacestate@example.com');
insert into public.profiles(id) values('00000000-0000-0000-0000-0000000000e3') on conflict do nothing;
set role service_role;
insert into public.career_watch_kv(user_id,key,value) values ('00000000-0000-0000-0000-0000000000e3','career:account','{"epoch":3,"version":5,"paused":false}');
create temp table ps_cases(v jsonb, state text, pace integer, label text);
insert into ps_cases values
 (null, 'none', null, 'absent key'), ('null', 'none', null, 'json null'),
 ('"lots"', 'unreadable', null, 'text'), ('"1,000"', 'unreadable', null, 'thousands separator'), ('"0x10"', 'unreadable', null, 'hex'), ('"-3"', 'unreadable', null, 'negative text'), ('-3', 'unreadable', null, 'negative'),
 ('0', 'unreadable', null, 'zero (not no preference)'), ('"0"', 'unreadable', null, '"0"'), ('"NaN"', 'unreadable', null, 'NaN text'), ('7.9', 'unreadable', null, '7.9 is not floored'), ('"1e3"', 'unreadable', null, '"1e3"'),
 ('""', 'unreadable', null, 'empty string'), ('true', 'unreadable', null, 'true'), ('{}', 'unreadable', null, 'object'),
 ('7', 'set', 7, '7'), ('"7"', 'set', 7, '"7"'), ('" 7 "', 'set', 7, 'padded'), ('"+7"', 'set', 7, 'plus'), ('1000000', 'set', 1000000, 'a million'),
 ('2147483647', 'set', 2147483647, 'int4 max'), ('2147483648', 'unreadable', null, 'past int4: unreadable, not saturated'), ('"99999999999"', 'unreadable', null, 'eleven digits');
do $$ declare c record; st record; begin
 for c in select * from ps_cases loop
  if c.v is null then update public.career_watch_kv set value = value - 'daily_limit' where user_id='00000000-0000-0000-0000-0000000000e3';
  else update public.career_watch_kv set value = jsonb_set(value, '{daily_limit}', c.v) where user_id='00000000-0000-0000-0000-0000000000e3'; end if;
  select * into st from public.career_apply_pace_state('00000000-0000-0000-0000-0000000000e3');
  perform t.ok(st.state = c.state and st.pace is not distinct from c.pace, format('pace state %s: got (%s, %s), want (%s, %s)', c.label, st.state, coalesce(st.pace::text,'null'), c.state, coalesce(c.pace::text,'null')));
  perform t.ok(public.career_apply_daily_limit('00000000-0000-0000-0000-0000000000e3') is not distinct from c.pace, format('daily_limit %s: %s', c.label, coalesce(public.career_apply_daily_limit('00000000-0000-0000-0000-0000000000e3')::text,'null')));
 end loop;
end $$;
-- The ledger: an unreadable pace refuses at the tap (and at the extension's begin and the email reserve, which share it).
update public.career_watch_kv set value = value || '{"daily_limit":"lots"}' where user_id='00000000-0000-0000-0000-0000000000e3';
select t.ok(public.career_apply_ledger_refusal('00000000-0000-0000-0000-0000000000e3', 'Any Employer', null, now(), null) = 'pace_unreadable', 'an unreadable pace refuses: not unlimited');
create temp table ps_in as select jsonb_build_object('version',1,'user_id','00000000-0000-0000-0000-0000000000e3','job_id','TEST-PS-1','company','PS Employer','url','https://jobs.lever.co/ps/1','fields','[]'::jsonb,'privacy_epoch',3,'account_version',5,'expires_at',now()+interval '1 hour') p;
select t.must_fail($$select career_apply_enqueue(p,career_apply_payload_hash(p),career_apply_payload_hash(p),null) from ps_in$$,'pace_unreadable','the queue refuses the tap while the pace is unreadable');
-- The cloud claim reads the same state (its text, and after the reconcile the launch scripts run).
select t.ok((select prosrc like '%pace_unreadable%' from pg_proc where proname = 'career_apply_cloud_refusal'), 'the cloud refusal stops on an unreadable pace');
reset role;
select public.career_apply_reconcile_bridge();
set role service_role;
select t.ok((select prosrc like '%pace_unreadable%' from pg_proc where proname = 'career_apply_cloud_refusal'), 'and still does after the reconcile');
-- The setter: what is kept, what is refused, and the account's epoch and version untouched.
select t.ok((public.career_apply_pace_set('00000000-0000-0000-0000-0000000000e3', '7')->>'pace')::int = 7, 'set to 7');
select t.ok((select value->>'daily_limit' = '7' and value->>'epoch' = '3' and value->>'version' = '5' from public.career_watch_kv where user_id='00000000-0000-0000-0000-0000000000e3' and key='career:account'), 'stored as 7; epoch and version untouched');
select t.ok(public.career_apply_ledger_refusal('00000000-0000-0000-0000-0000000000e3', 'Any Employer', null, now(), null) is null, 'readable again: admitted');
select t.ok((public.career_apply_pace_set('00000000-0000-0000-0000-0000000000e3', '2147483647')->>'pace')::int = 2147483647, 'the largest pace the column holds');
select t.must_fail($$select public.career_apply_pace_set('00000000-0000-0000-0000-0000000000e3', '2147483648')$$, 'invalid pace', 'past the column: refused, not saturated');
select t.must_fail($$select public.career_apply_pace_set('00000000-0000-0000-0000-0000000000e3', '0')$$, 'invalid pace', 'zero refused');
select t.must_fail($$select public.career_apply_pace_set('00000000-0000-0000-0000-0000000000e3', 'lots')$$, 'invalid pace', 'text refused');
select t.must_fail($$select public.career_apply_pace_set('00000000-0000-0000-0000-0000000000e3', '7.9')$$, 'invalid pace', 'a fraction refused');
select t.ok((select value->>'daily_limit' = '2147483647' from public.career_watch_kv where user_id='00000000-0000-0000-0000-0000000000e3' and key='career:account'), 'a refused set stores nothing');
select t.ok(public.career_apply_pace_set('00000000-0000-0000-0000-0000000000e3', 'none')->>'state' = 'none', 'none clears it');
select t.ok((select value ? 'daily_limit' = false from public.career_watch_kv where user_id='00000000-0000-0000-0000-0000000000e3' and key='career:account'), 'the key is gone, not null');
select t.ok((select state from public.career_apply_pace_state('00000000-0000-0000-0000-0000000000e3')) = 'none', 'and that is no preference');
reset role;
select t.as_user('00000000-0000-0000-0000-0000000000e3');set role authenticated;
select t.must_fail($$select public.career_apply_pace_set('00000000-0000-0000-0000-0000000000e3', '7')$$,'permission denied','the setter is the service''s, as the chat calls it');
reset role;
rollback;
