# Work-order queue

Codex takes the lowest `ready` order whose dependencies are `done`. Only the architect edits this table.

| WO | Title | Status | Depends on | Milestone |
|---|---|---|---|---|
| [001](WO-001-green-gate.md) | One green gate on trunk | ready | — | M0 |
| [002](WO-002-agent-brain.md) | The agent brain (model + tools), behind a flag | ready | 001 | M1 |
| [003](WO-003-eval-runner.md) | Eval runner and rubric judge | ready | 001 | M1 |
| 004 | Agent brain v2: tailoring, outreach drafts, approvals card | drafting | 002, 003 | M1 |
| 005 | Job ingestion in the cloud: boards -> postings table, ranking with scoreFit | drafting | 001 | M2 |
| 006 | Alerts and daily job report by text | drafting | 005 | M2 |
| 007 | Delete shelved finance code and its tests | drafting | 001 | M0 |
