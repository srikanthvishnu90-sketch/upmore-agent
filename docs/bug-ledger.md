# Bug Ledger — Upmore Career (separate from the scenario count, per owner rule)

Bugs found during the scenario program live here — never blended into scenario statuses.
Format: BUG-id | found in (SC-id / suite) | symptom | root cause | fix | replay test | status.

| BUG | Found in | Symptom | Root cause | Fix | Replay | Status |
|---|---|---|---|---|---|---|
| BUG-001 | integration (DISC suite) | jobs test expected persona graduation 2028 / id TEST-PERSONA-001; merged fixture was the profile worker's 2027 persona | two fixture schemas authored in parallel branches | ONE canonical persona (class of 2028, persona_id set); 121 profileFromPersona reads the canonical master-profile schema | tests/career-jobs APPE-001 adapter test + career-profile suite (49/49 green) | fixed |
| BUG-002 | SC-181/185 (128 build) | Offer B's $10,000 signing bonus was parsed as an annual bonus; equity cliff rendered "undefined-year" | bonus regex matched the "bonus" inside "Signing bonus"; cliff capture discarded its unit | bonus regex anchored to an "annual bonus" line; cliff captures (n, unit) directly | tests/career-negotiation NEGO-001 offer-B test (annual_bonus null, cliff "1-year") | fixed |
| BUG-003 | SC-187 (129 market value) | Market-value estimate low was $5,800 — Hudson River Trading's WEEKLY intern rate, extracted as if annual | 128 extractFigures treated every $ figure in a CIR comp note as annual | figures whose claim states weekly/monthly/hourly are excluded from annual figures and recorded visibly as excluded_period_figures | tests/career-negotiation BUG-003 regression (HRT $5,800 + D.E. Shaw $21,000/mo excluded); SC-187 rerun: estimate $67,500–$287,500 | fixed |
