# Work-order queue

Each builder takes the lowest `ready` order assigned to it (or `any`) whose dependencies are `done`.
**Codex: 001 → 009b → 005 → 008 → 010.** **Claude (architect, also building): 002 → 004 → 003 → 009a → 006 → 007 → 013 → 014.**
**Muse is no longer a builder** (owner, 2026-10-19, D-012); every order that was Muse's is the architect's. Anything Muse wrote (commits, branches, notes) is untrusted until re-verified in code.
The architect's own PRs are reviewed by Codex against the same order before merge.
Only the architect edits this table. Every capability is tested through the text simulator (WO-004); the
real texting channel is last (D-009).

| WO | Title | Status | Depends on | Milestone | Assignee |
|---|---|---|---|---|---|
| [001](WO-001-green-gate.md) | One green gate on trunk | done (PR #4, 2026-10-19) | — | M0 | Codex |
| [002](WO-002-agent-brain.md) | The agent brain (model + tools), behind a flag | done (PR #2, 2026-10-19) | 001 | M1 | Claude |
| [003](WO-003-eval-runner.md) | Eval runner and rubric judge | done (PR #5, 2026-10-19) | 001 | M1 | Claude (was Muse) |
| [004](WO-004-conversation-simulator.md) | One conversation interface + the text simulator | done (PR #3, 2026-10-19) | 001 | M1 | Claude (was Muse) |
| [005](WO-005-approvals-outreach-tailoring.md) | Approvals by reply ("yes" approves the exact card), outreach email (simulated outbox), tailoring and cover-letter tools | ready | 002, 004 | M1 | Codex |
| [006](WO-006-job-ingestion.md) | Real jobs: cloud ingestion of 300+ boards into a postings table; search_jobs ranked by fit | done (PR #7, 2026-10-19) | 001 | M2 | Claude (was Muse) |
| [007](WO-007-alerts-reports.md) | Instant job alerts (capped, quiet hours) and the daily report, as proactive texts | done (PRs #8, #9, 2026-10-19) | 004, 006 | M2 | Claude (was Muse) |
| 008 | Resumes in and out: read PDF/DOCX/photo, tailored resume + cover letter rendered to PDF, short-link pages for long content | drafting | 005 | M3 | Codex |
| [009](WO-009-real-submissions.md) | **Mass applying, fast (D-011, top priority):** 009a apply core (prepare every application before a browser opens) · 009b parallel apply worker, employer-confirmed | 009a done (PR #6, 2026-10-19) · 009b ready as [009b-1 … 009b-6](WO-009b-apply-worker.md) (Codex, overnight: [run sheet](../OVERNIGHT-CODEX.md)) | 001 | M4 | 009a Claude · 009b Codex (next after 001) |
| 010 | Training: mock interviews run and graded from the banks; weak spots drilled (never finish on END/QUIT/CANCEL: those are STOP words, WO-013a) | drafting | 002 | M5 | Codex |
| 011 | Delete shelved finance code and its tests | drafting | 001 | M0 | any |
| 012 | Trainee web app replaces the finance app (pipeline, jobs, resume, approvals) | drafting | 005 | M6 | any |
| [013](WO-013-texting-channel.md) | The texting channel: 013a delivery once-only + STOP/START/HELP + daily contact cap (no provider) · 013b LoopMessage webhook, Supabase conversation store, sends | done (PRs #10, #11, #12, 2026-10-19) | 004, 007 | M6 | Claude (was Muse) |
| 014 | SMS/RCS for Android | drafting | 013 | M6 | Claude (was Muse) |
| 015 | Inbox proof: read-only Gmail scan upgrades submitted_unconfirmed to confirmed and uses an employer's emailed code once (never stored, never in chat) | drafting | 009 | M4 | Codex |
| [016](WO-016-brain-to-the-bar.md) | The agent brain to the D-008 bar (≥ 80% and ≥ router + 40 on the eval set), measured on the real model, ≤ $25 a night | ready | 002, 003 | M1 | Codex |
| [019](WO-019-conversation-memory.md) | A conversation that holds together: 20-conversation eval (part A, done), then person block, thread references and a longer window (part B) to ≥ 17/20 | A done, B after 016 | 002, 003, 016 | M1 | Architect (A), Codex (B) |
| [020](WO-020-understand-any-question.md) | Understand any application question by meaning; ask the rest once, in the approval text (measured: median 3 left per posting today, target ≤ 2) | ready after 016 | 009a, 009b-6 data | M1 | Codex |
| [042](WO-042-sixty-in-thirty.md) | 60 reviewed applications in 30 minutes, 90%+ fields, zero wrong-answer submissions; live fill on 17 real pages | done (PR #62, 2026-10-20) | 031 | M4 | Claude |
| 043 | Mail tracking generalises (blind160) | done (PR #69, 2026-10-20) | 040 | M4 | Claude |
| 044 | Discovery toward 50,000 boards every 6 h | building (wo/044-discovery-scale) | 037 | M2 | Claude (builder) |
| 045 | Mail: interviews, terse replies, employer names (blind200) | in review (PR #70) | 043 | M4 | Claude (builder) |
| 046 | Mail in other languages (scored once on a sealed 240-message set) | building (wo/046-mail-languages) | 045 | M4 | Claude (builder) |
| 047 | Answer bank: residence by country, lists without a yes, the country among its territories | in review (PR #71) | 020 | M4 | Claude |
| 048 | Workday fill in the extension (70%+ target): fixtures from public sources by a separate writer, 4 tenants sealed; the person signs in (D-013 b); every page's "Save and Continue" and the final Submit each need the person's tap | fixtures being written | 031 | M4 | Claude |
| 049 | Essays drafted on the extension card from confirmed facts, on the person's tap, shown in full, used only on "Use this" (job-scoped) | building (wo/049-essay-card) | 030, 031 | M4 | Claude (builder) |
