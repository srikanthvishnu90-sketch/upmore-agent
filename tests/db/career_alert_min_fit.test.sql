-- F7 (20261026070007_career_alert_min_fit.sql): the fit floor a person may set on their job alerts holds in the database
-- as in code (validPrefs): absent is fine, a whole number from 0 to 100 is kept, anything else is refused; the other
-- settings' shape check still holds beside it.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000007f1','f7fit@example.com');
set role service_role;
insert into public.career_alert_prefs(user_id,tz,prefs,last_checked_at) values
 ('00000000-0000-0000-0000-0000000007f1','America/New_York','{"on":true,"keywords":["data analyst"],"locations":["new york"],"remote_ok":true,"report_hour":8,"quiet_start":22,"quiet_end":7,"max_instant_per_day":3}',now());
select t.ok((select not (prefs ? 'min_fit') from public.career_alert_prefs where user_id='00000000-0000-0000-0000-0000000007f1'),'settings without min_fit are kept (no score floor)');
update public.career_alert_prefs set prefs = prefs || '{"min_fit":60}' where user_id='00000000-0000-0000-0000-0000000007f1';
select t.ok((select (prefs->>'min_fit')::int = 60 from public.career_alert_prefs where user_id='00000000-0000-0000-0000-0000000007f1'),'a whole number from 0 to 100 is kept');
update public.career_alert_prefs set prefs = prefs || '{"min_fit":0}' where user_id='00000000-0000-0000-0000-0000000007f1';
update public.career_alert_prefs set prefs = prefs || '{"min_fit":100}' where user_id='00000000-0000-0000-0000-0000000007f1';
select t.ok(true,'0 and 100 are the ends of the range');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"min_fit":101}' where user_id='00000000-0000-0000-0000-0000000007f1'$$,'career_alert_prefs_min_fit','past 100 is refused');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"min_fit":-1}' where user_id='00000000-0000-0000-0000-0000000007f1'$$,'career_alert_prefs_min_fit','below 0 is refused');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"min_fit":4.5}' where user_id='00000000-0000-0000-0000-0000000007f1'$$,'career_alert_prefs_min_fit','a fraction is refused');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"min_fit":"60"}' where user_id='00000000-0000-0000-0000-0000000007f1'$$,'career_alert_prefs_min_fit','a string is refused');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"min_fit":null}' where user_id='00000000-0000-0000-0000-0000000007f1'$$,'career_alert_prefs_min_fit','a null is refused (the code removes the key to clear it)');
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"max_instant_per_day":11}' where user_id='00000000-0000-0000-0000-0000000007f1'$$,'career_alert_prefs_shape','the other settings are still checked');
reset role;
select t.as_user('00000000-0000-0000-0000-0000000007f1');
set role authenticated;
select t.must_fail($$update public.career_alert_prefs set prefs = prefs || '{"min_fit":0}'$$,'permission denied','a person cannot set it directly (the service role does)');
reset role;
rollback;
