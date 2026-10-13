# Bug Ledger — Upmore Career (separate from the scenario count, per owner rule)

Bugs found during the scenario program live here — never blended into scenario statuses.
Format: BUG-id | found in (SC-id / suite) | symptom | root cause | fix | replay test | status.

| BUG | Found in | Symptom | Root cause | Fix | Replay | Status |
|---|---|---|---|---|---|---|
| BUG-001 | integration (DISC suite) | jobs test expected persona graduation 2028 / id TEST-PERSONA-001; merged fixture was the profile worker's 2027 persona | two fixture schemas authored in parallel branches | ONE canonical persona (class of 2028, persona_id set); 121 profileFromPersona reads the canonical master-profile schema | tests/career-jobs APPE-001 adapter test + career-profile suite (49/49 green) | fixed |
