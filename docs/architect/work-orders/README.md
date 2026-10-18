# Work-order queue

Each builder takes the lowest `ready` order assigned to it (or `any`) whose dependencies are `done`.
Only the architect edits this table. Every capability is tested through the text simulator (WO-004); the
real texting channel is last (D-009).

| WO | Title | Status | Depends on | Milestone | Assignee |
|---|---|---|---|---|---|
| [001](WO-001-green-gate.md) | One green gate on trunk | ready | — | M0 | Codex |
| [002](WO-002-agent-brain.md) | The agent brain (model + tools), behind a flag | ready | 001 | M1 | Codex |
| [003](WO-003-eval-runner.md) | Eval runner and rubric judge | ready | 001 | M1 | Muse |
| [004](WO-004-conversation-simulator.md) | One conversation interface + the text simulator | ready | 001 | M1 | Muse |
| [005](WO-005-approvals-outreach-tailoring.md) | Approvals by reply ("yes" approves the exact card), outreach email (simulated outbox), tailoring and cover-letter tools | ready | 002, 004 | M1 | Codex |
| [006](WO-006-job-ingestion.md) | Real jobs: cloud ingestion of 300+ boards into a postings table; search_jobs ranked by fit | ready | 001 | M2 | Muse |
| 007 | Alerts and daily/weekly job reports as proactive messages (simulator `/clock`) | drafting | 004, 006 | M2 | Muse |
| 008 | Resumes in and out: read PDF/DOCX/photo, tailored resume + cover letter rendered to PDF, short-link pages for long content | drafting | 005 | M3 | Codex |
| 009 | Batch apply: approved, tailored applications through a hosted browser, employer-confirmed (needs D-003) | drafting | 005, 006, 008 | M4 | Codex |
| 010 | Training: mock interviews run and graded from the banks; weak spots drilled | drafting | 002 | M5 | Codex |
| 011 | Delete shelved finance code and its tests | drafting | 001 | M0 | any |
| 012 | Trainee web app replaces the finance app (pipeline, jobs, resume, approvals) | drafting | 005 | M6 | any |
| 013 | LoopMessage channel: Supabase-backed store, webhook -> handleInbound, delivery with receipts, proactive sends, attachments | drafting | 004, 007 | M6 | Muse |
| 014 | SMS/RCS for Android | drafting | 013 | M6 | Muse |
