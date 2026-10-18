# WO-001: One green gate on trunk

Status: ready · Depends on: — · Size cap: ~400 changed lines (deleting finance tests from the gate does not count)

## Why
CI has had zero green runs since 2026-10-15, on every branch including v229. A red gate accepts
anything, so nothing can be reviewed. Trunk needs one fast gate that is green, covers only code
that ships (career + shared), and fails on any real regression.

## Outcome
`bash scripts/gate.sh` exits 0 on trunk and is the only required CI job. It runs in under 10
minutes on `ubuntu-24.04`.

## Files
- `scripts/gate.sh` (new)
- `.github/workflows/ci.yml` (replace: one job `gate` that runs `scripts/gate.sh`; keep the
  `database` job if `tests/db/run.sh` is green on career migrations, otherwise list why in the PR)
- the minimum code or test files needed to fix the real failures below (list each in the PR)

## What the gate runs
1. `deno test -A --no-check --ignore=tests/architect/pending tests/architect/` (architect tests that have landed;
   `pending/` holds tests for orders not built yet and is excluded)
2. `node --test tests/career-*.test.cjs` plus any non-finance shared test the career path imports
   (router-bundle, chat input, CORS, thread ownership, identity redaction, secret scan). Finance
   tests (money, brokerage, plaid, simplefin, alpaca, rent, budgets, the megadoc/capability-list/
   teardown/methods/realworld report generators, Agent100) leave the gate. Do not delete them in
   this order; WO-007 deletes the finance code and its tests together.
3. Career edge tests under `tests/edge/` that exercise `handler-career.ts`, `career_host.js`,
   `career_task_bridge.js`, `career_persistence.js`, `model_gateway.ts` (list them explicitly in
   `gate.sh`; no globs that drag finance in).
4. `python3 scripts/build-router-core.py --career-only --check`
5. `deno check supabase/functions/agent-chat/index-career.ts`

## The known red tests (from the v229 merge record) and what to do
- 9 Chromium drive tests (`D11`–`D14`, `career-portal-submit-integrity`): make them run on the CI
  runner (install Chromium via the runner's package manager or Playwright's cached browser). If a
  test then fails for a product reason, fix the product. Do not mark them skipped.
- `career-gauntlet-r2` "tolerated SC-300 C37 pins" (R2, R2A): these pin wording from the retired
  gauntlet. Delete these two assertions only, and say so in the PR.
- `career-portal-answer-map` (2 fact-kind coverage fails): fix by adding the missing derivations
  or by classifying the kinds as exempt with a reason, per the module's own contract.
- `142-career-router.js` uses inline regex modifiers `(?i:…)` (around lines 4229–4230), which are a
  SyntaxError on Node 22 and accepted on Deno: rewrite those patterns without inline modifiers so
  both runtimes agree.

## Acceptance
- CI on the PR: the single `gate` job is green.
- `scripts/gate.sh` prints one summary line per step and a final `GATE OK` / `GATE FAILED`.
- The PR lists every test that left the gate (by file) and every test assertion deleted (by name).

## Demo
`bash scripts/gate.sh` on a clean clone of the PR branch → `GATE OK`. Then break one career test on
purpose locally (e.g. change an expected stage in `tests/career-track*.test.cjs`) → `GATE FAILED`.

## Out of scope
Deleting finance code (WO-007), any product behavior change other than the regex rewrite.
