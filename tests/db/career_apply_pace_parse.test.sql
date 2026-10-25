-- One rule for the person's pace (20261025150000_career_apply_pace_parse.sql, SERIAL-1420 (a)): the same values as
-- tests/architect/pace-parse.test.ts, read by SQL.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000e1','pace@example.com');
insert into public.profiles(id) values('00000000-0000-0000-0000-0000000000e1') on conflict do nothing;
set role service_role;
insert into public.career_watch_kv(user_id,key,value) values ('00000000-0000-0000-0000-0000000000e1','career:account','{"epoch":0,"version":0,"paused":false}');
create temp table pace_cases(v jsonb, want integer, label text);
insert into pace_cases values
 (null, null, 'unset'), ('""', null, 'empty'), ('" "', null, 'blank'), ('0', null, '0'), ('"0"', null, '"0"'), ('-3', null, '-3'), ('"-3"', null, '"-3"'),
 ('"lots"', null, 'text'), ('"0x10"', null, 'hex'), ('"Infinity"', null, 'Infinity'), ('true', null, 'true'), ('{}', null, 'object'), ('[]', null, 'array'), ('"1,000"', null, 'thousands separator'),
 ('7', 7, '7'), ('"7"', 7, '"7"'), ('" 7 "', 7, 'padded'), ('"+7"', 7, 'plus'), ('7.9', 7, '7.9 floors'), ('"7.9"', 7, '"7.9" floors'), ('"7."', 7, '"7."'), ('".5"', null, '".5"'), ('0.9', null, '0.9'),
 ('100', 100, '100'), ('"1e3"', 1000, '"1e3"'), ('1000000', 1000000, 'a million (was no pace before 150000)'), ('"1000000"', 1000000, '"1000000"'), ('999999999', 999999999, 'the bound'),
 ('1000000000', 999999999, 'above the bound is kept at the bound, not "no limit"'), ('"1e12"', 999999999, '"1e12" at the bound'), ('9007199254740991', 999999999, 'MAX_SAFE_INTEGER at the bound');
do $$ declare c record; got integer; begin
 for c in select * from pace_cases loop
  if c.v is null then update public.career_watch_kv set value = value - 'daily_limit' where user_id='00000000-0000-0000-0000-0000000000e1';
  else update public.career_watch_kv set value = jsonb_set(value, '{daily_limit}', c.v) where user_id='00000000-0000-0000-0000-0000000000e1'; end if;
  got := public.career_apply_daily_limit('00000000-0000-0000-0000-0000000000e1');
  perform t.ok(got is not distinct from c.want, format('pace %s: got %s, want %s', c.label, coalesce(got::text,'null'), coalesce(c.want::text,'null')));
 end loop;
end $$;
-- The pace binds where it is read: a person at 1,000,000 a day is not refused for volume; a person at 7 is, at the 8th.
update public.career_watch_kv set value = value || '{"daily_limit":"1000000"}' where user_id='00000000-0000-0000-0000-0000000000e1';
insert into public.extension_submission_reports (user_id, employer, role, posting_url, confirmation_text, tracker_record, observed_at)
 select '00000000-0000-0000-0000-0000000000e1', 'Pace Emp ' || g, 'Analyst', 'https://jobs.lever.co/paceemp' || g || '/1', 'Thanks', '{}', now() - interval '1 hour' from generate_series(1, 7) g;
select t.ok(public.career_apply_ledger_refusal('00000000-0000-0000-0000-0000000000e1', 'Pace Emp 8', null, now(), null) is null, 'at a pace of a million, the 8th today is admitted');
update public.career_watch_kv set value = value || '{"daily_limit":"7"}' where user_id='00000000-0000-0000-0000-0000000000e1';
select t.ok(public.career_apply_ledger_refusal('00000000-0000-0000-0000-0000000000e1', 'Pace Emp 8', null, now(), null) = 'daily_cap', 'at a pace of 7, the 8th today is refused');
rollback;
