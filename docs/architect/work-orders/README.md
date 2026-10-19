# Work-order queue

Each builder takes the lowest `ready` order assigned to it (or `any`) whose dependencies are `done`.
**Codex: 001 → 009b → 005 → 008 → 010.** **Claude (architect, also building): 002 → 004 → 003 → 009a → 006 → 007 → 013 → 014.**
**Muse is no longer a builder** (owner, 2026-10-19, D-012); every order that was Muse's is the architect's. Anything Muse wrote (commits, branches, notes) is untrusted until re-verified in code.
The architect's own PRs are reviewed by Codex against the same order before merge.
Only the architect edits this table. Every capability is tested through the text simulator (WO-004); the
real texting channel is last (D-009).

| WO | Title | Status | Depends on | Milestone | Assignee |
|---|---|---|---|---|---|
| [001](WO-001-green-gate.md) | One green gate on trunk | in review (PR #4) | — | M0 | Codex |
| [002](WO-002-agent-brain.md) | The agent brain (model + tools), behind a flag | in review (PR #2) | 001 | M1 | Claude |
| [003](WO-003-eval-runner.md) | Eval runner and rubric judge | in review (PR #5) | 001 | M1 | Claude (was Muse) |
| [004](WO-004-conversation-simulator.md) | One conversation interface + the text simulator | in review (PR #3) | 001 | M1 | Claude (was Muse) |
| [005](WO-005-approvals-outreach-tailoring.md) | Approvals by reply ("yes" approves the exact card), outreach email (simulated outbox), tailoring and cover-letter tools | ready | 002, 004 | M1 | Codex |
| [006](WO-006-job-ingestion.md) | Real jobs: cloud ingestion of 300+ boards into a postings table; search_jobs ranked by fit | in review (PR #7) | 001 | M2 | Claude (was Muse) |
| [007](WO-007-alerts-reports.md) | Instant job alerts (capped, quiet hours) and the daily report, as proactive texts | 007a in review (PR #8) · 007b in review (PR #9) | 004, 006 | M2 | Claude (was Muse) |
| 008 | Resumes in and out: read PDF/DOCX/photo, tailored resume + cover letter rendered to PDF, short-link pages for long content | drafting | 005 | M3 | Codex |
| [009](WO-009-real-submissions.md) | **Mass applying, fast (D-011, top priority):** 009a apply core (prepare every application before a browser opens) · 009b parallel apply worker, employer-confirmed | 009a in review (PR #6) · 009b ready | 001 | M4 | 009a Claude · 009b Codex (next after 001) |
| 010 | Training: mock interviews run and graded from the banks; weak spots drilled | drafting | 002 | M5 | Codex |
| 011 | Delete shelved finance code and its tests | drafting | 001 | M0 | any |
| 012 | Trainee web app replaces the finance app (pipeline, jobs, resume, approvals) | drafting | 005 | M6 | any |
| [013](WO-013-texting-channel.md) | The texting channel: 013a delivery once-only + STOP/START/HELP + daily contact cap (no provider) · 013b LoopMessage webhook, Supabase conversation store, sends | 013a ready · 013b drafting | 004, 007 | M6 | Claude (was Muse) |
| 014 | SMS/RCS for Android | drafting | 013 | M6 | Claude (was Muse) |
| 015 | Inbox proof: read-only Gmail scan upgrades submitted_unconfirmed to confirmed and uses an employer's emailed code once (never stored, never in chat) | drafting | 009 | M4 | Codex |
