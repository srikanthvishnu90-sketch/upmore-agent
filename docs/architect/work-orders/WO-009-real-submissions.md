# WO-009: Real submissions — the apply worker

Status: ready (architecture) · blocked for the live run on D-010 (the first VM) · Depends on: WO-005, WO-006 · Assignee: Codex
Size cap: ~900 lines excluding the architect tests (reuse 149/150 and `workers/career-browser/`; do not rewrite them)

## Why
Zero real applications have ever been submitted. The one armed run (2026-10-15) sent forms with empty required
fields and recorded SUBMITTED from the word "security" on the posting (BUG-207/208/209). The product's core promise
is genuine task completion, so this order makes submission real and makes "submitted" mean the employer confirmed it.

## Design
- **Where it runs:** a self-hosted worker (Node + Playwright + sandboxed Chromium) on a small Linux VM, pulling from a
  queue; not Browserbase (D-003). No proxies, no stealth plugins, no captcha solving.
- **Flow:** the brain proposes `submit_application({ job_id })` (effect **external**) → WO-005 approval card restates
  employer, role, resume version and every answer that will be entered (from confirmed facts only) → YES →
  `admitApplication` → enqueue → worker drives the employer's own form with 149/150 → `classifyOutcome` on what the
  page shows → the person is told the outcome by a proactive text.
- **Outcomes** (the only states): `confirmed` (employer's confirmation and the form gone), `submitted_unconfirmed`
  (page moved, form gone, no confirmation words; upgraded to confirmed later by the employer's email, WO-015),
  `needs_user` (captcha or emailed code: the person gets a link to a live view of that exact page to finish it themselves),
  `failed` (validation errors, named), `not_submitted` (form still open). Nothing else is ever reported as applied.
- **Before the click:** every required field read back from the page must equal its confirmed value; the resume input must
  show the approved file (byte hash); otherwise stop as `not_submitted` with the field named. Never click submit with an
  empty required field.
- **Evidence per attempt:** screenshots before and after submit (stored privately), field readback, final URL, page text
  excerpt, outcome. The person can ask "show me what you sent to Acme".

## Files
- `supabase/functions/_shared/career_apply.ts` (new): `classifyOutcome`, `admitApplication` (pure; tests pin them)
- `supabase/migrations/20261020000000_career_apply_jobs.sql` (new): `career_apply_jobs(id, user_id, job_id, company, payload jsonb,
  payload_hash, approval_hash, state, reason, confirmation_id, attempts, created_at, updated_at, evidence jsonb)`; RLS: owner reads own rows
- `workers/career-browser/`: a `pull` loop against the queue (service-role key from env on the VM), using the existing
  `service.cjs`/`run.cjs` driver path with the loopback-only restriction replaced by an allowlist of the 4 ATS families
  (Greenhouse, Lever, Ashby, SmartRecruiters) on their own domains
- `workers/career-browser/live-view.cjs` (new): a tokenized, single-use, 15-minute page that streams the paused tab
  (CDP screencast) and forwards the person's clicks and keys, for captcha/code handoff
- `supabase/functions/_shared/agent/career_tools.ts`: `submit_application` (external), `application_status` (read)
- `tests/architect/pending/wo-009-apply-outcome.test.ts` → `tests/architect/` (do not edit)
- `tests/career-apply-forms.test.cjs` (new, yours): the fill-readback harness below

## Acceptance (two stages)
1. **Offline:** the 10 WO-009 tests; the fill-readback harness against the saved real form snapshots in
   `docs/career/gauntlet-fixtures-forms.md` sources (or re-captured public form HTML for 24 boards across the 4 families):
   every required field is detected and bound, the resume input mounts, ≥ 95% of required fields read back correctly; any
   unknown required field stops the drive. Gate green.
2. **Live (after D-010):** 10 genuine applications by consenting people (the owner first), each to a job they chose, each
   approved on its card. Report every outcome honestly. The order is done when ≥ 7 of the 10 end `confirmed` (by page or
   by the employer's email) and none is ever reported as applied without that. Captchas handed off count as needing the
   person, not as failures of honesty.

## Out of scope
Workday, iCIMS, Taleo and any account-gated portal (later orders); LinkedIn Easy Apply and Indeed Apply (never).
