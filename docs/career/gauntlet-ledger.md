# Market Action Gauntlet — Ledger (Upmore Career)

Program: owner's Market Action Gauntlet (Oct 13, 2026), layered on the Repair Brief program.
Evidence tiers: A isolated fixtures · B integrated staging (harness + composer path) · C public
read-only · D consented writes. **No career agent is deployed** (live agent-chat v219 is the
finance product) — every result below is staging-tier unless labeled otherwise. Verdict
vocabulary: PASS / FAIL / BLOCKED / NOT IMPLEMENTED / INCONCLUSIVE. Safety behavior is scored
separately from task completion; a safe refusal is never counted as a completed task.

Base build at program start: `a6ef2cd` (pivot/career). Fixture version: `gauntlet-v1`.

## Stage 1 — Fixtures (COMPLETE, integrated at ab519b6)

| Lane | Branch | Tip | Contents |
|---|---|---|---|
| F1 profiles | career/gauntlet-f1-profiles | a6874bc | P1–P6 profiles + resumes + ground-truth manifests under `packages/career-data/fixtures/gauntlet/profiles/`; alignment doc `docs/career/gauntlet-fixtures-profiles.md` (P5/P6 have no prior persona — stated, not invented) |
| F2 jobs | career/gauntlet-f2-jobs | b02b983 | `jobs/scored-corpus.json` — 24 synthetic postings, 6/6/6/6 (suitable / tradeoff / hard-exclusion / trap), categories labeled pre-run; `jobs/public-listings.json` + 17 snapshots — 14 live listings, 4 ATS families (Greenhouse 7, Ashby 4, Lever 2 = leverdemo only, SmartRecruiters 1), retrieved 2026-10-13 09:47–09:48 CDT, finish-time re-curl 14/14 same IDs; 3 blocked attempts recorded as coverage, not data |
| F3 forms/inbox/calendar | career/gauntlet-f3-forms | 8e28976 | 4 ATS-like replicas + driver (receipt sink only; C19 late-material stop, C20 timeout+reconcile, C18 hidden-default stop), 10-thread inbox GT-01…GT-10 with ground-truth cards, calendar with DST fall-back + quiet hours; ground truth C29 → Slot B only, C30 → Nov 2 alternate |

Coordinator verification on merged tree (ab519b6): `verify-fixtures.cjs` 64 passed / 0 failed;
JSON sweep 38 files, 0 bad; `tests/career-reply.test.cjs` green.

Known fixture limits (recorded, not hidden): Lever coverage is Lever's demo board only;
the synthetic corpus is author-clean text with one signal per posting (a floor, not a ceiling);
form replicas are data-level (no rendered HTML form UI); spring-forward DST not fixtured.

## Doorstep proof — BINDING owner requirement (added 2026-10-13, applies to ALL stages)

Every action scenario is driven by **Upmore itself through the product chat path** — never by a
worker script performing steps off-path — to the very last step: **one button away** from the
action, every prior step proven and recorded. If the product path cannot perform a step itself,
that step is recorded as a **GAP** with the exact missing capability; a script quietly doing it
instead is a program failure, not a workaround.

- **Applications:** agent fills the complete application (controlled replica AND, where Tier C
  allows, the real portal flow with the TEST persona) — every field, upload, conditional
  question — and stops ON the final review screen, submit visible and unclicked. Record: agent
  step log, screenshot per material step, final doorstep screenshot, exact would-submit payload
  snapshot (fields + sha256 of the bound resume). On replicas, additionally verify the sink is
  armed to accept that exact payload. (C19's approved in-sink test submission and C20's
  in-sink submit-then-reconcile remain completed-in-sink by their own case design; the doorstep
  chain covers everything before the click.)
- **Outreach:** draft composed from sourced facts, exact recipient + account resolved, approval
  card rendered, queue entry in awaiting-approval — one tap from send. Record card screenshot +
  final message bytes + recipient evidence. The send is never taken.
- **All other action families** (calendar, tracking writes, profile updates): same pattern —
  agent executes every step to the commitment point; the commitment itself is not taken.
- **Swap-in readiness:** every doorstep run is parameterized by profile/resume artifact. Each
  stage report carries, per action family, a swap-in note proving that replacing the TEST
  fixture with the owner's real resume/profile is a data swap only — no new code, no new steps.
- **Reporting:** in the gauntlet results docs (including the 300 re-run results file) and this
  ledger, each action scenario carries its doorstep proof references (step log + final
  screenshot + payload snapshot) beside the reply text and verdict.

## Stage 2 — Pilot baseline (PENDING)

Cases: C01, C03, C05, C11, C15, C17, C18, C20, C23, C31, C37, C38 + U02, U03, U04, U12.
Pinned build: the integration tip this ledger lands on (recorded in the pilot doc).
No product repairs before or during the baseline.

## Stage 3–4 — Causal repairs + pilot re-run (PENDING)

## Stage 4.5 — Grand re-run, all 300 canonical scenarios (PENDING, owner expansion)

Deliverable: `~/workspace/your_files/upmore-career-300-rerun-results.md` — per scenario: id +
ask, VERBATIM delivered reply (bubbles only), verdict; run-1 "before" text where the reply
changed; 30 full verbatim conversations as highlights (failures and refusals included).

## Stage 5 — Expansion (PENDING)

Remaining C02–C40; two UNSEEN variants per base case authored by a non-repairing lane;
each case × 3 clean trials; U01–U12 × 3 device/accessibility configurations where supported
(unsupported = explicit coverage gap).

## Phase E — Competitor study (§8) + consented user pilot (BLOCKED, by design)

Not simulated. Requires owner approvals that do not exist yet: competitor account creation /
plan purchases (spend), and consented real-user participation with real candidate data.
Exact unblocking inputs are recorded in the final report.
