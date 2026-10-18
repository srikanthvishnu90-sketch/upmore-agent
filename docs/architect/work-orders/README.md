# Work-order queue

Each builder takes the lowest `ready` order assigned to it (or `any`) whose dependencies are `done`. Only the architect edits this table.

| WO | Title | Status | Depends on | Milestone | Assignee |
|---|---|---|---|---|---|
| [001](WO-001-green-gate.md) | One green gate on trunk | ready | — | M0 | Codex |
| [002](WO-002-agent-brain.md) | The agent brain (model + tools), behind a flag | ready | 001 | M1 | Codex |
| [003](WO-003-eval-runner.md) | Eval runner and rubric judge | ready | 001 | M1 | Muse |
| 004 | Agent brain v2: tailoring, outreach drafts, approvals card | drafting | 002, 003 | M1 | Codex |
| 005 | Job ingestion in the cloud: boards -> postings table, ranking with scoreFit | drafting | 001 | M2 | Muse |
| 006 | Alerts and daily job report by text | drafting | 005 | M2 | Muse |
| 007 | Delete shelved finance code and its tests | drafting | 001 | M0 | any |
| 008 | Texting channel: anyone can text to sign up; replies and proactive messages delivered; resume photos/PDFs received | drafting | 001 | M1 | Muse |
| 009 | SMS/RCS for Android users and approvals by reply ("yes" approves the exact card) | drafting | 008 | M2 | Muse |
