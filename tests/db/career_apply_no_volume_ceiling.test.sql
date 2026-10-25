-- No volume ceiling (20261025140000_career_apply_no_volume_ceiling.sql, CAPS-1390): no product daily number; a person's
-- own pace, if set, holds with no maximum; the 30-day employer rule, the gates and the approval checks are untouched.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000d1','nc1@example.com'),('00000000-0000-0000-0000-0000000000d2','nc2@example.com');
insert into public.profiles(id) values('00000000-0000-0000-0000-0000000000d1'),('00000000-0000-0000-0000-0000000000d2') on conflict do nothing;
set role service_role;
insert into public.career_watch_kv(user_id,key,value) values
 ('00000000-0000-0000-0000-0000000000d1','career:account','{"epoch":0,"version":0,"paused":false}'),
 ('00000000-0000-0000-0000-0000000000d2','career:account','{"epoch":0,"version":0,"paused":false,"daily_limit":"2"}');
select t.ok(public.career_apply_daily_limit('00000000-0000-0000-0000-0000000000d1') is null, 'no pace set: no product number (null), not 25');
select t.ok(public.career_apply_daily_limit('00000000-0000-0000-0000-0000000000d2') = 2, 'a pace the person set is theirs');
update public.career_watch_kv set value = value || '{"daily_limit":"400"}' where user_id='00000000-0000-0000-0000-0000000000d1';
select t.ok(public.career_apply_daily_limit('00000000-0000-0000-0000-0000000000d1') = 400, 'their own pace has no maximum (400 is kept, not clamped to 50)');
update public.career_watch_kv set value = value - 'daily_limit' where user_id='00000000-0000-0000-0000-0000000000d1';
-- 60 applications in a day, each to its own employer, count in the ledger (the extension's reports count, as G3 proved).
insert into public.extension_submission_reports (user_id, employer, role, posting_url, confirmation_text, tracker_record, observed_at)
 select '00000000-0000-0000-0000-0000000000d1', 'Employer ' || g, 'Analyst', 'https://jobs.lever.co/emp' || g || '/1', 'Thanks for applying', '{}', now() - interval '1 hour' from generate_series(1, 60) g;
select t.ok((select count(*) from public.career_apply_ledger('00000000-0000-0000-0000-0000000000d1', now() - interval '1 day')) = 60, 'sixty in the ledger today');
select t.ok(public.career_apply_ledger_refusal('00000000-0000-0000-0000-0000000000d1', 'Employer 61', null, now(), 25) is null, 'a 61st, to a new employer, is not refused: no product ceiling, and a caller''s 25 does not bind');
select t.ok(public.career_apply_ledger_refusal('00000000-0000-0000-0000-0000000000d1', 'Employer 7', null, now(), null) = 'company_cooldown', 'the same employer within 30 days still is');
-- The person who set a pace of 2 a day: the third is refused by their own number.
insert into public.extension_submission_reports (user_id, employer, role, posting_url, confirmation_text, tracker_record, observed_at)
 select '00000000-0000-0000-0000-0000000000d2', 'Pace Co ' || g, 'Analyst', 'https://jobs.lever.co/pace' || g || '/1', 'Thanks for applying', '{}', now() - interval '1 hour' from generate_series(1, 2) g;
select t.ok(public.career_apply_ledger_refusal('00000000-0000-0000-0000-0000000000d2', 'Pace Co 3', null, now(), 50) = 'daily_cap', 'their own pace of 2 holds, whatever a caller passes');
-- The cloud opt-in keeps the person's own number without a maximum.
insert into public.career_apply_cloud_optin (user_id, enabled, terms, daily, privacy_epoch) values ('00000000-0000-0000-0000-0000000000d1', true, 'TEST terms', 300, 0);
select t.ok((select daily from public.career_apply_cloud_optin where user_id='00000000-0000-0000-0000-0000000000d1') = 300, 'a cloud pace of 300 a day is the person''s own, not clamped to 50');
select t.must_fail($$insert into public.career_apply_cloud_optin (user_id, enabled, terms, daily, privacy_epoch) values ('00000000-0000-0000-0000-0000000000d2', true, 'TEST terms', 0, 0)$$, 'career_apply_cloud_optin_daily_check', 'zero is not a pace');
-- The server prepare's candidates are not clamped to 25 per person: 30 queued postings, 30 candidates.
insert into public.career_postings(job_id,provider,board,company,title,location,url,description,first_seen_at,last_seen_at)
 select 'greenhouse:ncco' || g || ':' || g, 'greenhouse', 'ncco' || g, 'NC Co ' || g, 'Analyst', 'Chicago, IL', 'https://boards.greenhouse.io/ncco' || g || '/jobs/' || g, 'Analyst role.', now(), now() from generate_series(1, 30) g;
select public.career_apply_want_put_for('00000000-0000-0000-0000-0000000000d2',
 (select jsonb_agg(jsonb_build_object('posting_key', 'greenhouse:ncco' || g || ':' || g, 'url', 'https://job-boards.greenhouse.io/ncco' || g || '/jobs/' || g, 'company', 'NC Co ' || g, 'title', 'Analyst')) from generate_series(1, 30) g));
select t.ok((select count(*) from public.career_apply_prepare_candidates(now(), 30, 500) c where c.user_id='00000000-0000-0000-0000-0000000000d2') = 30, 'thirty candidates when the caller asks for thirty (no 25 clamp)');
select t.ok((select count(*) from public.career_apply_prepare_candidates(now(), 5, 500) c where c.user_id='00000000-0000-0000-0000-0000000000d2') = 5, 'the caller''s own pacing number still paces a run');
rollback;
