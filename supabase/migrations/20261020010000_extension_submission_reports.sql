-- SAVED-ANSWERS SYNC — employer-confirmation reports from the Trainee
-- assisted-apply extension (2026-10-20).
-- The extension fills a form in the user's own browser; the USER
-- reviews and clicks Submit (§6.3 — the extension has no submit code
-- path). On the employer's confirmation page the extension captures
-- the employer's own confirmation (module 150's extractConfirmation
-- rules) and reports it to the extension-sync function, which records
-- it HERE: one row per reported submission, scoped to the reporting
-- user, carrying the module 126 tracker record (stage Confirmed, a
-- "confirmation" event sourced employer_record) the product's tracker
-- reads. The row's id is the report's receipt.
-- A row exists only for a confirmation the carried page excerpt
-- re-parses to (the function re-runs module 150's rules server-side);
-- a bare claim never becomes a row.
-- Written and read ONLY by the extension-sync edge function using the
-- service_role key (bypasses RLS). RLS enabled with no policies: the
-- same posture as channel_artifacts / channel_threads. The unique
-- index makes a double report of one confirmation idempotent — the
-- second report returns the first row's receipt.
-- NOT APPLIED by the build lane — operator applies with the rollout,
-- same as every channel migration.
create table if not exists public.extension_submission_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  employer text not null,
  role text not null,
  posting_url text not null,
  posting_key text,
  confirmation_id text,
  confirmation_text text not null,
  success_text boolean not null default false,
  answers_submitted jsonb,
  observed_at timestamptz,
  reported_at timestamptz not null default now(),
  source text not null default 'extension',
  record_class text not null default 'employer_confirmation',
  tracker_record jsonb not null
);

alter table public.extension_submission_reports enable row level security;

create unique index if not exists extension_submission_reports_user_confirmation_uidx
  on public.extension_submission_reports (user_id, confirmation_id)
  where confirmation_id is not null;

create index if not exists extension_submission_reports_user_reported_idx
  on public.extension_submission_reports (user_id, reported_at desc);
