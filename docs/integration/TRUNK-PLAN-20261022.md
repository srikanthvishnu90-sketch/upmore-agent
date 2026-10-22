# Trunk plan (2026-10-22)

**Owner:** the architect (lead and reviewer, from Vishnu's direction at 3:42 PM). Codex and Muse do the editing.

**Limits:**
- No merge to `main`; the owner merges the final PR.
- No branch deletion, no router deletion.
- No deploy, no migration applied.
- Nothing on the submit path without asking.

**Status:** this plan was written at 2026-10-22 ~15:00 CDT from origin refs fetched then.

## 1. Which line becomes trunk

**Decision: `consolidate/2026-10-22` is trunk** (tip at writing: `a93af5a2`). Codex's `wo/integration-verified-20261022` (`7f04c599`) is merged into it, not the other way round.

Why:
- **It holds both lineages.** `consolidate` contains `348c2d4a`, the landing candidate, and `cea914fe`, the deployed muse line behind agent-chat v248. `wo/integration-verified` contains only `348c2d4a`. A trunk without `cea914fe` would drop whatever is live today.
- **It holds more of the fixes.** `consolidate` is 113 commits ahead of `wo/integration-verified`. It carries F-005, F-006 (`87bd108c`), F-007, F-011, F-024, F-025 and F-029, none of which W has. W's 7 commits are:
  - merges of F-001 (`984478d2`), F-002 (`15057d56`) and F-004 (`94f91453`), all already in `consolidate`;
  - integration records;
  - one bundle rebuild (`7f04c599`).
  So reconciling is one merge of W into `consolidate`, with the generated bundles regenerated.
- **Neither line is on `main`.** `main` is `77ff1ce5`. `consolidate` is 1,833 commits ahead of it and 14 behind; those 14 are main's own site, CI and CodeRabbit commits, merged in at the last step.

## 2. Step 0, a blocker that must be fixed before anything else is merged

Commit `d65d86b8` on `consolidate` ("Drop the fix line's unreleased duplicate extension…") removes:
- the duplicate `packages/extension/` package, which is fine;
- **`supabase/functions/extension-sync/index.ts`**: the function is deployed live (extension-sync v4, ACTIVE, read 2026-10-22);
- **`supabase/migrations/20261020010000_extension_submission_reports.sql`**: the table `extension_submission_reports` exists live (read 2026-10-22), applied without a ledger row;
- `scripts/build-extension-sync.py` and `tests/career-extension-sync.test.cjs` (478 lines).

A trunk without the source of a live function and the file of a live migration cannot be deployed or reconciled safely.

**Decision:** restore those four files on `consolidate` from `d65d86b8^`. Keep the removal of `packages/extension/` if extension-sync does not build from it; if it does, restore the inputs it builds from as well. Run `tests/career-extension-sync.test.cjs` green.

Retiring extension-sync is a separate decision for the owner (a deploy and an undeploy), never a side effect of a cleanup.

**Relay to Codex:** "On consolidate/2026-10-22, restore supabase/functions/extension-sync/index.ts, supabase/migrations/20261020010000_extension_submission_reports.sql, scripts/build-extension-sync.py and tests/career-extension-sync.test.cjs from d65d86b8^. If the function's build reads packages/extension, restore what it reads. Run the extension-sync test and the gate. One commit, no other change. Report the SHA and the counts."

## 3. Merge order

Each step merges into `consolidate/2026-10-22` as its own merge commit, regenerates both router bundles (`python3 scripts/build-router-core.py` and `--career-only`, then `--check`), runs the done-criteria (section 4), and records its row in the ledger (section 6).

| Step | What | Branch @ SHA | Note |
|---|---|---|---|
| 0 | Restore extension-sync (above) | — | blocker |
| 1 | Codex's integration line | `wo/integration-verified-20261022` @`7f04c599` | its F-001/F-002/F-004 merges are already in; expect conflicts only in the generated bundles |
| 2 | Option A (a text yes never sends) | `arch/chat-approval-card-binding` @`9568596d` | relaying agent reported 17654c18 green |
| 3 | #20 real people, no invented people | `arch/networking-real-people` @`4332c9c1` | `CAREER_SOURCE_PAGES` stays off |
| 4 | Mail Trainee-row identity | `arch/mail-trainee-row` @`1ea403f9` | relaying agent verified 2/4 red → 6/6 green |
| 5 | Grad-year ask, never fill | `arch/grad-year-ask` @`3a45191a` | rebuilds the extension bundle; regenerate |
| 6 | Codex's remaining audit fixes, one at a time, in this order: F-003 `7e1443cd`, F-008 `aa4a54e2`, F-009 `6e6b0e34` (with `wo/regression-ledger-20261022` `48fa277e`), F-010 `6be9c223`, F-012 `73b2cbc9`, F-013 `c7721061`, F-015 `2e559a66`, F-016 `beb83468`, F-023 `b2908caa` | `wo/f0NN-*-20261022` | F-015: `consolidate` already has an F-015 commit (`63eaf697`); merge only what is not already there |
| 7 | Lane B web approval card | `muse/2026-10-21-fe-approval-ui` @`5ffab100` | review against the card bridge migration first |
| 8 | Held SQL packages: waiver counts sends, card bridge | `arch/waiver-counts-sends` @`27beff0f`, `ops/held-live-apply-card-bridge` @`d9780e62` | files only; nothing applied; PG16 db suite required |
| 9 | Docs | `arch/cap-inventory` @`9d02e27c`, `arch/nine-gap-specs` @`35c21a38`, `arch/audit-fix-branch-map` @`4030f5c1`, this branch | docs only |
| 10 | F-037 card delivery, when Codex builds it | — | design in nine-gap-specs Part B |
| 11 | `main`'s 14 commits merged into trunk, then a PR trunk → main | — | **the owner merges** |

**Not merged:**
- `wo/f006-seniority-morphology-20261022` @`5b18a3c3`. `consolidate` already has the F-006 fix `87bd108c` (30/30 matrix); two band matchers must not both land. Any extra cells Codex covered are ported as tests only, after review.
- `wo/f007-saved-answer-consumption-20261022` @`1a05690e`: already in `consolidate`.

## 4. Done-criteria (per step, and for the whole trunk)

**Baseline first.** Record the failing tests BY NAME on `consolidate` after step 0. Run them as the non-root user, so the Chromium suites run instead of failing at the sandbox:
- the gate's node selection (`career-*.test.cjs` plus the gate's shared list);
- the architect suite;
- the edge suite.
For reference, at `348c2d4a` today the architect suite was 1264/0, edge 892/0, and the node gate selection 2,276 pass / 202 fail with an environment-only failing set.

A step is done only when all of these hold:
1. The architect suite and the edge suite have 0 failures.
2. The node failing-test NAME set is a subset of the baseline set. Any new name is a regression, fixed or reverted before the next step.
3. Both router bundles pass `--check`, and the extension bundle is rebuilt where a step touches it.
4. When a step adds or changes a migration file, the PG16 db suite (`tests/db/run.sh`) passes, and no migration is applied anywhere.
5. **No test is deleted, skipped or loosened without a named reason**, reviewed by the architect (section 5). A test removed together with the code it tests is allowed only when that code really leaves the product (see step 0).
6. No flag, cap or submit-path change.

**The whole trunk is done when:**
- steps 0–9 are merged and green by the rules above;
- the baseline failing set is unchanged or smaller;
- the relaying agent has independently re-run the suites on the final tip.
Then the trunk → main PR is opened for the owner.

## 5. Review rule for everything Codex and Muse push (the architect's)

For every merge commit or pushed branch, the architect checks:
- `git diff <base> <tip> --diff-filter=D -- tests` must be empty, or every deleted test must be paired with its deleted code and justified in the commit message.
- Added `skip`, `todo` or `.skip(` lines must carry a reason string that names what is missing. A bare `skip: true` is refused.
- Net assertion loss in any test file must be explained, for example by a stronger replacement test.
- No change under the submit path or flags without the owner.

**Review results for what was on the two lines at writing:**

| Line / commit | Finding | Verdict |
|---|---|---|
| `wo/integration-verified-20261022` @`7f04c599` | 12 test files changed, +1,087 lines, 0 deletions, no new skips | OK |
| `consolidate` `d65d86b8` | deletes `tests/career-extension-sync.test.cjs` along with a LIVE function and a LIVE migration | **Blocker**: restore (step 0) |
| `consolidate` `1f4f0e8e` | deleted the session-reuse and widget-attach tests | Restored by `8d7882cc`, with 9 named skips |
| `consolidate` `a384c0d1` | removed one "alignment" test; added `tests/career-decline-one-class.test.cjs` (the helper must read 149's list; a regression guard against an inline copy) | OK (stronger) |
| `consolidate` | `tests/career-qa-bug04-resolver.test.cjs`: one skip, conditional on the sibling Playwright install being absent, with its reason | OK (environment-conditional) |
| `consolidate` `8d7882cc` | the 9 skips in session-reuse and widget-attach, each naming the uncarried 155/service/remount behavior | OK |

## 6. Rollback

- **In the repo:** every step is one merge commit on `consolidate`. To undo one, `git revert -m 1 <merge SHA>` on trunk. Never force-push, never rewrite history.
- **The ledger:** this table is filled in as steps land. The pre-step tip is always recorded, so the trunk can be reset to it by a new branch if a revert gets tangled.

| Step | Pre-step tip | Merge SHA | Suites (arch / edge / node new-fail names) | Reviewer |
|---|---|---|---|---|
| 0 | `a93af5a2` | | | |

- **Live:** nothing here deploys. When the owner later deploys trunk, the rollback is redeploying the previous function version. agent-chat v248 corresponds to `cea914fe`, which is inside trunk, so it can be rebuilt. Migrations are applied only by the owner, each with its own written rollback file, as the held packages already have.
