-- FEATURE 8 (20261026080008_career_mail_drafts_sent.sql): a follow-up sent from chat is recorded as 'sent' on its mail draft,
-- dated and tied to the outreach draft that carried it; an undated 'sent' and an unknown state are refused; once per key.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000f8','followupsent@example.com');
select t.ok((select count(*)=2 from information_schema.columns where table_schema='public' and table_name='career_mail_drafts' and column_name in ('sent_at','outreach_draft')), 'career_mail_drafts has sent_at and outreach_draft');
insert into public.career_mail_drafts (user_id, draft_key, application_ref, kind, company, text, basis, state, sent_at, outreach_draft)
 values ('00000000-0000-0000-0000-0000000000f8', 'followup:job:F8-1', 'job:F8-1', 'followup', 'Stripe', 'Hello, following up.', 'applied Oct 9; no reply in 16 days', 'sent', now(), gen_random_uuid());
select t.ok((select state = 'sent' from public.career_mail_drafts where draft_key = 'followup:job:F8-1'), 'a sent follow-up is recorded as sent');
select t.must_fail($$insert into public.career_mail_drafts (user_id, draft_key, application_ref, kind, company, text, basis, state)
 values ('00000000-0000-0000-0000-0000000000f8', 'followup:job:F8-2', 'job:F8-2', 'followup', 'Acme', 'x', 'y', 'sent')$$, 'career_mail_drafts_sent_is_dated', 'a sent row without its date and outreach draft is refused');
select t.must_fail($$insert into public.career_mail_drafts (user_id, draft_key, application_ref, kind, company, text, basis, state)
 values ('00000000-0000-0000-0000-0000000000f8', 'followup:job:F8-3', 'job:F8-3', 'followup', 'Acme', 'x', 'y', 'mailed')$$, 'career_mail_drafts_state_check', 'an unknown state is refused');
select t.must_fail($$insert into public.career_mail_drafts (user_id, draft_key, application_ref, kind, company, text, basis)
 values ('00000000-0000-0000-0000-0000000000f8', 'followup:job:F8-1', 'job:F8-1', 'followup', 'Stripe', 'again', 'y')$$, 'career_mail_drafts_once', 'the mail run cannot draft a sent follow-up again');
rollback;
