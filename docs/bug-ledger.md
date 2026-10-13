# Bug Ledger — Upmore Career (separate from the scenario count, per owner rule)

Bugs found during the scenario program live here — never blended into scenario statuses.
Format: BUG-id | found in (SC-id / suite) | symptom | root cause | fix | replay test | status.

| BUG | Found in | Symptom | Root cause | Fix | Replay | Status |
|---|---|---|---|---|---|---|
| BUG-001 | integration (DISC suite) | jobs test expected persona graduation 2028 / id TEST-PERSONA-001; merged fixture was the profile worker's 2027 persona | two fixture schemas authored in parallel branches | ONE canonical persona (class of 2028, persona_id set); 121 profileFromPersona reads the canonical master-profile schema | tests/career-jobs APPE-001 adapter test + career-profile suite (49/49 green) | fixed |
| BUG-002 | SC-074 | reapply cooldown cannot be sourced from CIR data: no CIR record carries a cooldown field and no Goldman Sachs CIR exists, so the check falls back to a labeled 180-day default policy | CIR schema has no cooldown field; CIR set (15 companies) does not include Goldman Sachs | 126-career-track reapplyCheck labels the default explicitly in its reason string and refuses with the computed reopen date (2027-04-03) instead of silently inventing a firm rule | tests/career-track.test.cjs cooldown test + SC-074 runner (status LEARN until CIR data lands) | open — needs CIR schema field `cooldown_days` with a source, or a Goldman CIR |
