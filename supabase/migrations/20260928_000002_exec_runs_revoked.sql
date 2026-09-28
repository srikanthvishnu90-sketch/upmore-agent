-- One-tap revoke needs a terminal "revoked" run state (2026-09-28).
-- Runs killed by the user's revoke_all are marked revoked, not failed,
-- so the audit log distinguishes "user stopped this" from "it broke".

alter table public.exec_runs drop constraint if exists exec_runs_status_check;
alter table public.exec_runs
  add constraint exec_runs_status_check
  check (status in ('started','awaiting_otp','done','failed','revoked'));
