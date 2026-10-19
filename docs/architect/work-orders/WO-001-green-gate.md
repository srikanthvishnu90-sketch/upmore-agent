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

## Architect hint (2026-10-18, after the first four CI runs)
GitHub's `ubuntu-24.04` runners restrict unprivileged user namespaces through AppArmor
(`kernel.apparmor_restrict_unprivileged_userns=1`), which stops Chromium's sandbox from starting. Keep the sandbox ON and
lift the restriction for the job instead, before `scripts/gate.sh`:
`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`. Do not use `--no-sandbox` or `chromiumSandbox: false`.
If a different step is the failure, say which in the PR.

## Architect ruling (2026-10-19 00:10, from running `scripts/gate.sh` on wo/001-green-gate @ 921ad755)
Career tests: 1666 pass, 52 fail across 19 files. Three causes, three rulings:
1. **Tests that read files outside the repo leave the gate** (they can only pass on the owner's VM; they test the archived
   gauntlet records, D-006). Exclude these files from `scripts/gate.sh` by name, do not edit or delete them:
   `career-a4-carriage-w5`, `career-clock-source-guard`, `career-gauntlet-cvar-a`, `career-gauntlet-cvarb`,
   `career-gauntlet-pilot`, `career-gauntlet-r2`, `career-gauntlet-r2a`, `career-gauntlet-regressions`,
   `career-gauntlet-rerun`, `career-gauntlet-u`, `career-quality-onboarding`, `career-quality-routing`,
   `career-spec-gates`, `career-template-breakup-guard`, `career-wording-backlog-guard` (all `tests/<name>.test.cjs`;
   each fails with ENOENT on `~/workspace/your_files/...`). Add a guard to `gate.sh` that fails if any gated test file
   contains `your_files` or `/workspace/` so this cannot creep back.
   (This replaces the earlier instruction to delete the two SC-300 assertions: restore them; their files leave the gate.)
2. **Browser tests stay in the gate** (`career-portal-browser`, `career-portal-lever-radio`, `career-portal-submit-integrity`):
   they need Chromium's sandbox; use the AppArmor hint above.
3. **`career-alert-watch` is a real defect**: "G7 deadline: a board whose fetch never resolves is cut off at the
   watch-level deadline" and "cycle result is typed and complete" fail with "Promise resolution is still pending but the
   event loop has already resolved" — the deadline path leaves a promise unresolved. Fix the product code (module 151 or
   121's fetch deadline), not the test.

## Architect ruling (2026-10-19, second): Codex's requests and findings
Each finding was re-verified in code before ruling.

- **WO-001 test inputs: approved.** `tests/career-portal-answer-map.test.cjs:43` and `tests/career-quality-grader.test.cjs:82`
  read `$HOME/workspace/your_files/...`. Replace each with an explicit, opt-in input path (an env var such as
  `UPMORE_FACT_BANK` / `UPMORE_GAUNTLET_RECORDS`); with it unset, the answer-map test uses its synthetic `MINI_BANK` (as
  today) and the grader's real-records test skips with its existing message (it is archived evidence, not a gate). The
  owner's real fact bank must never be read by default. Removing the obsolete path comments in the eight tests is
  approved. No assertion changes; the `your_files` / `/workspace/` guard must pass.
- **PR #2 findings: confirmed, all four.** (1) The agent branch skips the host's STOP / resume / erase controls and the
  account-pause gate. (2) Its 20-message history ignores an erase. (3) `confirm_profile_fact` lets the model confirm a
  fact nobody confirmed (a D-007 breach). (4) A turn that saved something and then failed says "nothing saved". The
  architect fixes these on PR #2; Codex does not.
- **PR #3 findings: confirmed, all four.** (1) The simulator's `/as` carries pending attachments to the next person. (2)
  `/reset` leaves that person's queued messages. (3) An empty brain reply still saves state while the person is told
  nothing was saved. (4) `toBubbles` breaks its own contract: over 3,000 generated replies, 114 had a bubble longer than
  700 characters (up to 2,399), 103 had more than 4 bubbles, and long replies lost content without saying so. The
  architect fixes these on PR #3.
- Codex's next step stays WO-001 to green, then WO-009b.
