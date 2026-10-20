-- WO-024: application status from the person's own mail. The scheduled career-proactive run reads new mail through the
-- career Google grant, classifies it in code (supabase/functions/_shared/career_mail.ts) and records here only what it
-- found: the kind, the employer, one evidence line and a hash of the message id. No body, no raw message id, no emailed
-- code (a long number cannot be stored). Follow-ups are drafts the person sends themselves; nothing here is ever sent.
-- The person reads their own rows; only the service role writes. Every kind and key the outbox already allows stays.

create table if not exists public.career_mail_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- job:<career_apply_jobs id>, track:<tracker row id>, or mail:<employer> for an application made by hand.
  application_ref text not null check (application_ref ~ '^(job|track|mail):.+$' and length(application_ref) <= 200),
  kind text not null check (kind in ('received', 'rejection', 'interview', 'assessment', 'offer', 'recruiter_reply')),
  company text not null check (length(company) between 1 and 200),
  role text check (length(role) <= 200),
  -- The stage after this message, or null when it did not move one (already there, or flagged).
  stage text check (stage in ('Submitted', 'Recruiter screen', 'OA/assessment', 'Interview rounds', 'Offer', 'Rejected')),
  flagged boolean not null default false,
  evidence text not null check (length(evidence) between 1 and 300 and evidence !~ '[0-9]{6,}'),
  message_hash text not null check (message_hash ~ '^[a-f0-9]{64}$'),
  mail_at timestamptz not null,
  detected_at timestamptz not null default now(),
  constraint career_mail_events_once unique (user_id, message_hash)
);
create index if not exists career_mail_events_user on public.career_mail_events (user_id, mail_at);

create table if not exists public.career_mail_drafts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null check (draft_key ~ '^(followup|thank_you):.+$' and length(draft_key) <= 250),
  application_ref text not null check (application_ref ~ '^(job|track|mail):.+$' and length(application_ref) <= 200),
  kind text not null check (kind in ('followup', 'thank_you')),
  company text not null check (length(company) between 1 and 200),
  role text check (length(role) <= 200),
  text text not null check (length(text) between 1 and 1500),
  basis text not null check (length(basis) between 1 and 200),
  state text not null default 'drafted' check (state in ('drafted', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint career_mail_drafts_once unique (user_id, draft_key)
);

-- How far each person's mail has been read. Service role only: the person has nothing to read here.
create table if not exists public.career_mail_cursors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  read_through timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.career_mail_events enable row level security;
alter table public.career_mail_drafts enable row level security;
alter table public.career_mail_cursors enable row level security;
revoke all on public.career_mail_events, public.career_mail_drafts, public.career_mail_cursors from public, anon, authenticated;
grant select on public.career_mail_events, public.career_mail_drafts to authenticated;
grant all on public.career_mail_events, public.career_mail_drafts, public.career_mail_cursors to service_role;
grant usage, select on sequence public.career_mail_events_id_seq, public.career_mail_drafts_id_seq to service_role;
drop policy if exists career_mail_events_own on public.career_mail_events;
create policy career_mail_events_own on public.career_mail_events for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists career_mail_drafts_own on public.career_mail_drafts;
create policy career_mail_drafts_own on public.career_mail_drafts for select to authenticated using ((select auth.uid()) = user_id);

-- The outbox learns "status" (one text per status-changing email, key status:<message hash>) and "followup" (the text that
-- offers a drafted follow-up, key followup:<draft key>). Every kind 20261020040000 allows stays.
alter table public.career_outbox drop constraint if exists career_outbox_key_check;
alter table public.career_outbox add constraint career_outbox_key_check
  check (key ~ '^(alert|report|reply|receipt|card|status|followup):.+$' and length(key) <= 310);
alter table public.career_outbox drop constraint if exists career_outbox_kind_check;
alter table public.career_outbox add constraint career_outbox_kind_check
  check (kind in ('alert', 'report', 'reply', 'receipt', 'card', 'status', 'followup'));
alter table public.career_proactive_runs add column if not exists statuses int not null default 0 check (statuses >= 0);
alter table public.career_proactive_runs add column if not exists followups int not null default 0 check (followups >= 0);
