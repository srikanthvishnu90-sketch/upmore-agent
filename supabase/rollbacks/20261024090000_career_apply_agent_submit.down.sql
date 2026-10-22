-- Rollback of supabase/migrations/20261024090000_career_apply_agent_submit.sql (WO-101, the agent submits a batch the
-- person approved, behind the owner's CAREER_AGENT_SUBMIT switch). Run by the OWNER only, never by an agent, and only
-- after the switch is off and the extension has stopped sending:
--   psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/rollbacks/20261024090000_career_apply_agent_submit.down.sql
-- What it undoes, in the reverse of the migration's order:
--   the three RPCs and the switch reader; the table public.career_apply_batch_approvals (its index and owner-read policy
--   go with it); career_apply_jobs.agent_batch_hash and its check; the CAREER_AGENT_SUBMIT row; the settings key check,
--   back to the list 20261021080000_career_apply_cloud.sql set: CAREER_CLOUD_APPLY, owner_user_id, gate_user_ids.
-- It keeps everything earlier: career_apply_extension_begin_own (the person's own tap), career_cloud_settings and its
-- other rows (CAREER_CLOUD_APPLY stays as it is), every career_apply_jobs row.
-- It LOSES data: every batch approval row (what the person approved, when, used or revoked) and each job's
-- agent_batch_hash. docs/apply/DEPLOY-LIVE-APPLY.md (Rollback) has the read-only query that saves them first.
-- Idempotent: a second run changes nothing. tests/db/career_apply_agent_submit_down.test.sql proves up, down, down, up.
-- After it, the extension's agent path fails closed: career_apply_extension_begin_agent_own no longer exists, so every
-- agent-approved start is refused; the person's own tap (career_apply_extension_begin_own) is unchanged.
-- A later trainee-go-live.sh run applies the migration again (its mark, public.career_apply_batch_approvals, is gone),
-- with the switch off.
drop function if exists public.career_apply_extension_begin_agent_own(jsonb, text, text);
drop function if exists public.career_apply_batch_revoke_own();
drop function if exists public.career_apply_batch_approve_own(jsonb);
-- No cascade anywhere: anything unexpected that depends on these stops the rollback (one transaction, nothing changed).
drop table if exists public.career_apply_batch_approvals;

alter table public.career_apply_jobs drop constraint if exists career_apply_jobs_agent_batch_hash_check;
alter table public.career_apply_jobs drop column if exists agent_batch_hash;

-- The switch row first: the narrower key check below would refuse to be added while it is there.
delete from public.career_cloud_settings where key = 'CAREER_AGENT_SUBMIT';
drop function if exists public.career_apply_agent_submit_enabled();
alter table public.career_cloud_settings drop constraint if exists career_cloud_settings_key_check;
alter table public.career_cloud_settings add constraint career_cloud_settings_key_check
  check (key in ('CAREER_CLOUD_APPLY', 'owner_user_id', 'gate_user_ids'));
