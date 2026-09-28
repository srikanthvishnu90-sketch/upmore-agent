-- OTP handoff for the execution agent (2026-09-26).
-- Runs can pause at 'awaiting_otp' while the Browserbase session (created
-- with keepAlive) survives; submit_otp resumes the SAME session.
-- The OTP code itself is never stored — only the session id + hint.

alter table public.exec_runs drop constraint if exists exec_runs_status_check;
alter table public.exec_runs
  add constraint exec_runs_status_check
  check (status in ('started','awaiting_otp','done','failed'));

alter table public.exec_runs add column if not exists browserbase_session_id text;
alter table public.exec_runs add column if not exists otp_hint text;

create index if not exists exec_runs_session_idx
  on public.exec_runs (browserbase_session_id);
