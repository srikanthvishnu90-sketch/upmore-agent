# FAILURES.md — the single failure queue, now in the repo

Before tonight, the live failures of the apply slice lived in chat logs, a side ledger in the workspace, and agents' reports — invisible to anyone reviewing the repo. After this change, FAILURES.md at the repo root is the one queue: five live-proven failures (MUSE-F-001 through F-005), each with the exact input, what should have happened, what actually happened in the bot's own words, and the located mechanism where one is known. HANDOFF.md now also carries the ownership transfer of the preserved fixer work to Claude, the discovery-link fix line, the MUSE-F-005 repair shape — and a collision warning: two different link-liveness designs for MUSE-F-003 now exist, and whoever lands the second one must reconcile them deliberately.

**State note (read before reviewing the diff):** FAILURES.md and the first five HANDOFF.md notes were already committed directly onto `integration/v2-candidate` during the evening (`edf20466`, `50d5fb6f`, `6b6551cf`), so this branch's literal diff is small — the LIVENESS COLLISION note appended to HANDOFF.md, plus `evidence/failures-backlog.md` and this body. This PR is the review unit for the backlog as a whole; the evidence file quotes all five entries verbatim with the slice-drive transcript that backs them.

**Backlog state (all OPEN, all P0):** F-001 apply reply surfaces no roles/links · F-002 batch status unanswerable in chat · F-003 served links never checked (31/60 confirmed live in the audit) · F-004 stale mock state consumed the user's goal statement · F-005 family filter kept 0/595 on the real pool (mechanism: the 600-posting recency window holds zero intern-banded SWE postings; ~197 sit outside it).

**Evidence** — `evidence/failures-backlog.md`: all five entries verbatim, the slice-drive transcript, and the three candidate commits that landed the file. The fixer's full transfer inventory rides in package `muse/2026-10-20-loop-writer` (`evidence/fixer-handoff-inventory.md`).

Nothing in this package is deployed; FAILURES.md entries are FIXED only when a fresh real run proves them, per the mission rules. Real completions: 0.
