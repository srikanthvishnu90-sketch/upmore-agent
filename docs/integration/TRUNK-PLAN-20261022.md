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

## 7. Update 2026-10-22 evening: trunk moved, and priorities after the competitor comparison

**Trunk is now the `trunk` branch.** `consolidate` landed there as #156 (`371d5415`). Step 0 is done on trunk:
- `6e6cf808` restores extension-sync;
- `eb57e812` restores the site capture and re-versions channel delivery to `20261019020001`;
- `72031f0d` fixes the two gate failures those caused.

Steps 1–11 now merge into `trunk`, not `consolidate`.

**The competitor comparison (Tsenta, Pinloop), checked against what can be read today.**

| Claim in the comparison | What the repo and live read say | Taken? |
|---|---|---|
| "Never completed one live application" | Live `extension_submission_reports` has 1 row: source extension, class employer_confirmation, with a confirmation id, observed 2026-10-20, not a localhost or demo URL. I did not read its content. `career_apply_jobs` = 0. So one extension-path confirmation may exist; **the owner confirms whether it was a real submission.** | Partly |
| "No frontend, no working message channel" | Wrong as stated. Live: web chat agent-chat v248 (5,158 messages in 7 days); site-signup and site-careers; Telegram, WhatsApp and iMessage inbound. True: no dashboard, and the approval card does not reach channels (F-037). | The dashboard and F-037 parts |
| "Approval loop is broken" | True on channels (F-037) and for a texted yes (Option A, by design: only a tap approves). | Yes |
| "No job index" | A 21,688-posting shelf exists live but was last fetched 2026-10-14; career-ingest is not deployed. Not always-on. | Yes |
| "No receipts" | Receipt code exists (extension confirmation capture; the receipts migration); one live row above. Not proven at volume. | Yes |
| "18/60 benchmark" | Not re-checked by me. | Unverified |
| Competitor prices and ATS counts | Their claims, not checked by me. | Context only |

**What changes in the plan.** The comparison's own judgment is right on one point, and the plan follows it: **one proven loop with a receipt comes before any breadth.**

The fastest honest loop is the extension path:
- the person's own Chrome fills the form;
- **the person clicks Submit**: the extension has no submit code, so the submit flags stay off;
- the extension captures the employer's confirmation, which is the receipt.

That loop is mostly built, and its backend (extension-sync) is the thing Step 0 just restored.

New order after step 1, replacing steps 2–9:

| Priority | What | Why |
|---|---|---|
| A | Option A `9568596d`, then Lane B's web approval card `5ffab100` | Per-application review on the web, Pinloop's core UX, without a text yes |
| B | F-037 card to channels (Codex) | Our edge over both is messaging-first; it does not exist until the card arrives |
| C | Receipts surfaced: one message per confirmed application with the employer's confirmation id; a tracker view in the web app | Tsenta's proof-per-application pattern |
| D | Measured: time per application and cost per application (model plus browser) on the loop | Our speed and cost claims are targets until measured |
| E | The remaining audit fixes (step 6), grad-year, mail row | Correctness |
| F | #20 networking, docs, held SQL | Breadth and records: they wait for the loop |

**Owner actions on the critical path** (each is his word, none is taken here):
- deploy agent-chat and the receipt path from trunk;
- deploy career-ingest and its cron, so the shelf is fresh;
- one supervised session: one real person, the extension, 10 applications, every receipt and the time and cost of each recorded.

**Not taken now:**
- **An MCP/CLI surface.** Cheap distribution, but a new external surface before the loop closes is breadth; reconsider after the first measured session.
- **Workday and more ATSes.** Coverage of Greenhouse, Lever and Ashby to a receipt comes first.
- **"Watch it fill" live view.** After C.

## 8. Assignments after the full competitor doc (Vishnu 4:58: speed matters)

**Corrections to the doc** (checked today):
- "18/60 with 12 wrong answers" is WO-042 **run 0**, the baseline as built. Later offline runs on the extension path measure precision 100% (195/195) and coverage about 96% (WO-042, runs 13–17). The doc's speed paragraph is stale. What *is* still unmeasured is applications per 30 minutes, live, end to end.
- "Zero applications ever submitted live": see section 7. One extension employer-confirmation row exists live (2026-10-20); the owner confirms whether it was real.

**One decision for the owner (it changes everything below):**
- The 10-21 cloud-worker-only decision drops the path the measurements above come from.
- The doc itself lists a bot-check at Submit on every portal, and captcha solving is forbidden. So a cloud worker cannot finish a submission on those portals without the person.
- The extension path ends with the person clicking Submit in their own Chrome. That clears the bot-check honestly, needs no submit switch, and its receipt backend is live.
- **Recommendation:** reopen the extension as the first proven loop. Keep the cloud worker for the portals it can finish.

**Codex (backend and integration), in order:**
1. Merge `wo/integration-verified-20261022` into `trunk`, then Option A `9568596d`. Report SHAs and CI.
2. F-037: the approval card reaches Telegram and WhatsApp, read side and push side, with the five guards in nine-gap-specs Part B.
3. Receipts: one message per confirmed application, carrying the employer, the role and the employer's confirmation id from `extension_submission_reports` or the apply receipts. Never sent without a confirmation id.
4. A per-application meter: wall time from approve to confirmation, and model cost. Stored on the application record, with a report script. No new spend to test it.

**Muse (frontend and end-to-end), in order:**
1. Cause 5: H1–H6 green locally against the mock employer, running on every merge (in progress; `c4136bd9` 3/8).
2. Lane B web approval card `5ffab100` rebased onto `trunk`: per-application review, approve by tap. "Submit when complete" is a submit-path switch: build it disabled, and it stays off without the owner's words.
3. A tracker page in the web app: each application with its status, its receipt (confirmation id, time) and its time and cost. Read-only. Build the screens from the app's real components, not mockups.

**The architect:** reviews every merge (SHAs, no test deleted or loosened, CI green on trunk), keeps trunk green, and writes the one-page MCP/CLI design (read-only first: roles, status, receipts) to start after the loop closes once.
