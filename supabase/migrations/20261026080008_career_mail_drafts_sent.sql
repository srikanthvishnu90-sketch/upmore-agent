-- FEATURE 8 (DIAGNOSIS-2026-10-25 §2.4): a follow-up or thank-you the person approved in chat and Trainee sent from their
-- own Gmail is recorded on its mail draft as 'sent', with when and the outreach draft that carried it, so the one read
-- model (career_standing.ts) never calls it due again and the mail run never drafts it again (career_mail_drafts_once).
-- A follow-up sent while only due (never drafted by the run) is inserted here as 'sent' under the run's own key.
-- Idempotent: safe to apply twice.
alter table public.career_mail_drafts drop constraint if exists career_mail_drafts_state_check;
alter table public.career_mail_drafts add constraint career_mail_drafts_state_check check (state in ('drafted', 'dismissed', 'sent'));
alter table public.career_mail_drafts add column if not exists sent_at timestamptz;
alter table public.career_mail_drafts add column if not exists outreach_draft uuid;
alter table public.career_mail_drafts drop constraint if exists career_mail_drafts_sent_is_dated;
alter table public.career_mail_drafts add constraint career_mail_drafts_sent_is_dated check (state <> 'sent' or (sent_at is not null and outreach_draft is not null));
