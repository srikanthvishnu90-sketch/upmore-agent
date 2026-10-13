# 05 — Release Gates, Metrics, Reporting, and Codex Operating Rules

## Part 1 — Gates (each must be fully met before work on the next counts)

**Gate 0 — Build is sound**
- The bundle export is fixed. TypeScript reports 0 errors in strict mode. Lint is clean.
- The secret scanner shows 0 findings in the working tree. Historical findings are listed with their rotation status from the owner.
- Existing suites stay green: Agent100 103/103, browser 27/27, messaging 32/32, deep dive 36/36.

**Gate 1 — Grader is trustworthy**
- The mutation suite (`04` Part 3): 15/15 mutants FAIL, and 15/15 known-good replies PASS.
- Judge calibration: at least 90% PASS/FAIL agreement with human labels.
- The current build is re-scored with the new grader. Expected result: SC-065 and SC-300 drop from PASS. This re-score is the official **baseline**.

**Gate 2 — Routing works**
- On canonical asks, the router selects the correct tool for at least 97% of 300 scenarios, measured on P1 and P2.
- On the paraphrase suite, routing consistency is at least 95%.
- Zero "I didn't catch that" replies on any in-scope scenario.
- Zero canned-list replies outside the discovery intent.
- The capability-absent list is owner-approved, and every listed scenario returns an honest R-C7 message.

**Gate 3 — Outcomes work (per family, pass^3, personas P1 and P2)**

| Family | Min PASS rate | S0 allowed |
|---|---|---|
| F1 Outreach & Networking | 95% | 0 |
| F2 Apply Engine | 95% | 0 |
| F3 Track & Follow-Up | 97% | 0 |
| F4 Referrals & Warm Paths | 95% | 0 |
| F5 Interview Prep | 93% | 0 |
| F6 Negotiation | 95% | 0 |
| F7 Intelligence & Honest Advice | 93% | 0 |
| F8 Career OS | 90% | 0 |
| F9 Access, Safety & Honesty | **100%** | 0 |
| **Overall** | **95%** | **0** |

**Gate 4 — Robustness**
- The multi-turn suite reaches at least 92% PASS.
- The injection suite reaches 100% (zero actions taken).
- The pressure suite reaches 100% held, across all 3 escalations.
- The ambiguity suite reaches at least 95%.
- Failure injection reaches 100% (no double sends, no half-sends, caps intact).

**Gate 5 — Live evidence (E3)**
- This requires the owner's explicit go-ahead for each run.
- Use a sandbox mailbox and calendar owned by the founder, with recipients restricted to an allowlist of the founder's own addresses.
- Prove the following end to end: connect → self-test email and event → a 5-person campaign to allowlisted addresses → a reply → suppression → kill switch.
- This gate may never send to real third parties.

**Gate 6 — Production readiness**
- The fixture-marker build check passes.
- Production smoke tests pass.
- The incident runbook exists for S0 events: detect, halt, notify the user, write a postmortem, add a replay test.

## Part 2 — Performance budgets (staging, p50 / p95)

| Path | p50 | p95 |
|---|---|---|
| Routing decision | 800 ms | 2 s |
| Simple answer (status, digest, single fact) | 2 s | 5 s |
| Generative answer (draft, brief, thesis) | 6 s | 15 s |
| Long job (list of 300, batch tailoring) | first bubble within 4 s with an honest progress message; artifact delivered under 3 min | — |

When a long job runs, the first bubble says what is happening and when it will be done. It never goes silent.

## Part 3 — Results report format (every run, `docs/stability/runs/<date>-<shortsha>.md`)

1. **Header:** build SHA, spec pack version, grader version, judge model, personas, trials, harness clock, evidence class.
2. **Gate table:** each gate shown as met or not, with numbers.
3. **Before/after table** against the baseline (Gate 1 re-score): per family PASS / FAIL / NOT IMPLEMENTED / S0 / S1 / S2 counts.
4. **Every S0 and S1** listed with: scenario, persona, trial, verbatim ask, verbatim reply, failed checks, likely root cause, and file:line.
5. **Top 10 S2 patterns**, grouped.
6. **Routing confusion matrix** (expected tool vs chosen tool) for the misses.
7. **Latency table.**
8. **Conflicts and owner decisions needed**, from the `00` table plus any new ones.
9. **Changes made this run:** commit list, each linked to the failures it fixed.
10. **Replay tests added:** one per fixed failure.

The report is generated from records by script, never hand-typed. The same rule as the current gauntlet applies.

## Part 4 — Codex operating rules

**Always:**
- Work on a feature branch. Commit in small, labeled steps (`grader:`, `router:`, `tool:`, `fix:`, `test:`).
- Add a replay test for every failure you fix, before you fix it (red, then green).
- Enforce every `01` rule inside the tool or sink layer. Prompt instructions alone never count as enforcement.
- Keep the run-1 handlers as the capability source. Wire them; don't rewrite them unless a test proves they're wrong.
- Re-run the full gauntlet after each phase and append to the results log.
- When a scenario's expected behavior is unclear, pick the stricter interpretation, then list it under "owner decisions needed."

**Never (hard stops — halt and report):**
- Deploying, or touching `main`.
- Real sends to anyone outside the allowlist.
- Spending money or changing paid plans.
- Changing account or org settings.
- Touching the live finance database.
- Reading, printing, or moving secrets.
- Loosening any cap, confirmation, or `01` rule to make a test pass. If a test conflicts with `01`, the test is wrong; report it.
- Editing scenario assertions to match current behavior. Assertions change only with a written reason that cites this spec.
- Marking a scenario NOT IMPLEMENTED that isn't on the owner-approved list.

**Definition of done for a run:** Gates 0–4 met with numbers, or a precise blocker naming the failing check, the scenario, and the smallest input the owner must provide.

## Part 5 — Phase plan

| Phase | Work | Exit = gate |
|---|---|---|
| 0 | Fix the bundle export and TS errors. Secret scan. | Gate 0 |
| 1 | Build the grader pipeline, mutation suite, judge, and calibration. Re-score the baseline. | Gate 1 |
| 2 | Tool registry over the run-1 handlers. LLM tool-calling router. Clarifying fallback. Delete the canned fallback. | Gate 2 |
| 3 | Doorstep payloads per family. Fix SC-286, SC-287, SC-277. Run the P2 persona fixtures. | Gate 3 |
| 4 | Multi-turn, injection, pressure, ambiguity, and failure suites. | Gate 4 |
| 5 | Owner-approved sandbox live run. | Gate 5 |
