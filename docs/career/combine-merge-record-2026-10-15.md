# COMBINE MERGE RECORD — release/career-v223

**Date:** 2026-10-15 (CDT). **Merge lead:** Muse (combine lane), per the owner's combine plan.
**Measured final commit:** `780377560eee92879250f3db2bfa7125d8eb05d1` (pushed to `release/career-v223`).
**Base:** `afc460e` (release line: Crew A + Crew B cycles 1–2 + MI-032 host step 2).
**Ruler (all stages):** `node --test tests/*.test.cjs` — reproduces the afc460e baseline exactly
(4,031 / 4,007 pass / 2 fail / 22 skipped; the 2 fails are R2 C37 + R2A, the dispositioned
SC-300 stale pins). Repo AGENTS.md names `tests/*.cjs`; the crews' recorded ruler is
`*.test.cjs` and is what every number here uses.

**NO deploy was performed. NO sends. v222 (build 0526a53) remains the live backend.**

---

## 1. Per-branch verdicts

All five `codex/*` branches are based directly on `afc460e` and share one base pair
(d60e541 + 005aae5). All were graded on OUR ruler; Codex's own numbers were never quoted.

| Branch | Tip | Verdict |
|---|---|---|
| codex/career-bundle-reachability-20261015 | 005aae5 | **MERGE** (fast-forward). Fail-first PROVEN: its 6 reachability tests go 0/6 against afc460e sources — the staged bundle generator omitted modules 144/151/152, a real defect on our release line. His "109 passing checks" re-graded: 6 + 48 + 55 = **109/109 PASS** at his tip, exactly as scoped (LOCAL/synthetic per his own evidence labels). |
| codex/career-host-durability-20261015 | bfd8577 | **MERGE** (fast-forward). Transactional persistence RPCs, turn_key dedupe, account controls, watch KV bridge, inbox outbox. Tip suites 27/28 (skip = Postgres-backed). Carried one defect (cluster ii below). |
| codex/career-owned-browser-worker-20261015 | 025f125 | **MERGE** (conflicts, §2). workers/career-browser/*, task bridge, portal-browser-helper rewrite. Tip suites 24/25 (skip = sandbox). |
| codex/career-worker-integration-fix-20261015 | 7f2b11d | **MERGE** (clean). Not in the original brief — Codex's own integration stack (durability + worker + authority gating; adds migration `20261015234000_career_task_intents_v1.sql`). Tip suites 42/44 (skips = Postgres-backed). |
| codex/capability2-grounded-20261015 | 3157b65 | **MERGE** (docs-only conflicts, §2). Module 154-career-recommendations, 144 guidance changes, frozen-manifest fixtures. Tip suites 147/147. Carried defects (clusters iii, iv below). |
| release/career-build-20261015-v1 | 192132d | **DO NOT MERGE.** Finance-era line (base 5e033cb, 545 commits behind afc460e, agent-chat v219-era). Its only unique content is a Roth IRA finance fact + go-live records. Finance is shelved by the owner's prune order; v223 holds the entire career program. Diffed both ways; nothing on it is missing from v223 except finance-era material the owner has shelved. |
| work/s2-integrity (Crew B) | 8a54fce | **MERGE** (conflicts, §2). MI-110 caps, MI-116 payload binding, MI-115 resolver; BUG-233/234/235. Composition with the Codex worker produced cluster (v) below. |
| work/writing-pattern (Crew B) | 52f80e6 | **MERGE** (conflicts, §2). Module 154-career-writing (MI-097; FR-394/BUG-236 under MI-119). See the privacy note in §6. |

**Migration note (owner action):** Codex's `20261015020000_career_watch_kv.sql` is an additive
SUPERSET of Crew A's file — same `career_watch_kv` table, plus grants/policy, the
`career_reminder_outbox` table and the persistence RPCs. **The migration file the owner runs
is this EXTENDED version** (plus `20261015234000_career_task_intents_v1.sql` from the
integration-fix branch).

**Verification limit (stated plainly):** there is no PostgreSQL on this VM. Codex's PG/RPC
claims are verified against his in-repo fakes + schema fixtures only. **Live-Postgres
execution is UNVERIFIED** and is a deploy-day check, not a merge blocker (the code paths are
honest-NOT_WIRED when the tables are absent).

**Unverified Codex claim, recorded as his:** his BUILD-STATUS entries state module 130
"remains Crew A-owned; its reported cross-owner/epoch correction cache defect is a separate
release blocker." Not verified by this lane.

## 2. Conflict resolutions and reasoning

- **handler-career.ts** (worker merge): resolved with the integration-fix branch's own
  composed handler, which contains BOTH `createCareerPersistence` (durability) and
  `routeCareerBrowserTask` (worker) — Codex's own composition of the same two features.
- **BUILD-STATUS.md / playbook-drift:** unioned (`git merge-file --union`); both crews'
  records kept.
- **evidence-ledger.json:** unioned to 1,154 checks.
- **Migration 20261015020000:** Codex's superset taken (see §1).
- **149-career-portal-apply.js** (S2 merge, ONE hunk): kept Codex's conditional-round gates
  (FORM_STEP_LIMIT after 8 rounds, FINAL_REVIEW_NOT_OBSERVED) AND S2's single buildPayload;
  buildPayload extended to `buildPayload(board, session)` — unions
  `session.preparationPayload`/`preparationFields` under `board.answers()` (live answers
  win), because a final-review live readback may expose only the current round's elements
  while Codex's multi-round accumulation lives in the preparation state. Both call sites
  (doorstep + submitDoorstep live re-build) pass session. Post-merge portal suites:
  64 tests / 50 pass / 0 fail / 14 skipped (sandbox/Chromium-dependent, as before).
- **build-router-core.py** (writing merge): lists unioned by hand — BOTH
  `154-career-recommendations.js` AND `154-career-writing.js` in names; `CareerRecommendations`
  AND `CareerWriting` in exports; Codex's dependency-order additions (144 before 142, 151,
  152) kept.
- **docs/bug-ledger.md** (writing merge): union — BUG-233/234/235 (S2) followed by BUG-236
  (writing-pattern, MI-119 renumber), numeric order.
- **docs/career/forbidden-rules.md:** per MI-119, NEITHER branch's copy was taken. The
  shared register (`~/workspace/your_files/upmore-forbidden-rules.md`, 385 blocks, the
  corrected merged truth) was carried over the repo register and **cmp-verified
  byte-identical** at merge time and again at the final commit.

## 3. Defect clusters found during the combine — FOR CREW A REGISTRY ALLOCATION

This record does NOT allocate numbers (single-writer rule, MI-093). Candidates, in Crew A
registry format:

- **(i) Staged bundle omitted modules 144/151/152** — defect on OUR release line (guidance
  fell to template; watch creation fell through in the staged artifact). Codex FIXED it;
  his reachability suite is the permanent guard.
- **(ii) Host blanket pause gate (BUG-170/171 class)** — Codex bfd8577: any
  `globalPause.set` short-circuited every turn as `career_paused`, breaking 142's contract
  (inspect = pause_status; natural-word lift = UNPAUSE_RE; hold only action-shaped turns).
  4 test failures. **Fixed in the combine (32ccb47):** gate scoped to
  `source === "account_control"` pauses; Codex's self-re-pin of the crew expectation in
  tests/career-http-host.test.cjs reverted to the afc460e expectation. Residual (recorded,
  not fixed): under an account_control pause, non-exact inspection asks still get the
  blanket reply.
- **(iii) 154-career-recommendations intentFor over-claim** — bare resume×role
  co-occurrence (no verb, no tailor/packet exclusion) intercepted the SC-111
  design-discovery ask and the named-target tailor ask before 142's contracts. **Fixed in
  the combine (f27c3c9, 154 only):** tailor|tailored|packet exclusions added; a
  recommendation signal (fit/recommend/suit/qualified/match) now required. Wedge 44/44,
  capability2 141/141 after the fix.
- **(iv) CAPABILITY2.mutations.cjs format break** — Codex shipped an executable runner
  where the other 75 packets export a declarative array; it crashed
  build-mutation-report.cjs and the patch-currency test and left 154-recommendations
  unaccounted. All 1,539 standard planted defects verified non-stale; the runner passes
  15/15 standalone. **Fixed in the combine (32ccb47):** renamed to
  `evals/depth/CAPABILITY2-mutation-runner.cjs`, reference in docs/depth/CAPABILITY2.md
  updated. Follow-up (NOT merge work): converting CAPABILITY2 to a standard packet
  (→ 87/128 modules, 1554/1554, 76 packets) is a deliberate Route-A project.
- **(v) Worker↔149 composition defect (MI-116 caller obligation)** — found after the S2
  merge (3 owned-worker failures). Root cause, instrumented: Codex's worker
  (`workers/career-browser/service.cjs`, prepareLocked) validated the approval's
  `payloadSha256` against the review in approve() but reconstructed the approval for
  submitDoorstep WITHOUT the hash; 149's MI-116 gate correctly refused the hashless
  approval (APPROVAL_PAYLOAD_MISMATCH) before the arming wire — no click ever happened —
  and the worker mislabeled the block `unknown_outcome`. Neither lane owned the worker
  caller when MI-116 added the obligation. The combine's union buildPayload was tested
  and EXONERATED (live rebuild bit-identical to the doorstep hash; reverting to S2's
  board-only builder fails the same 3 tests plus a 4th — the union is load-bearing).
  **Fixed in the combine (9491a9d):** one line forwards the already-validated
  `payloadSha256`. Owned-worker 17/17, payload-binding 7/7, caps 7/7 after the fix; both
  laws hold (a changed value still stops pre-arm; duplicate approval after restart
  returns the checked receipt, exactly one click ever).
- **(vi) Worker mislabel wart (non-blocking)** — prepareLocked ignores
  `outcome.resultStatus/code`: any genuine pre-arm block (real value change, CAP_REACHED)
  surfaces as `unknown_outcome` + a persisted attempt fence instead of `blocked` with its
  code. Conservative (never re-clicks) but mislabeled. Separate ledger entry recommended;
  deliberately NOT bundled into fix (v).
- **(vii) C2 staged-entry test written against the pre-durability handler** — blank rpc
  stub + no `crypto` global in its VM sandbox; the merged handler's careerRequestHash
  needs crypto.subtle. Test repaired in the combine (8991508) to back rpc with Codex's own
  persistence fake (real RPC contract, same seed) + webcrypto injection; all original
  assertions preserved. No product defect (Deno provides crypto in production).

## 4. Measurement — every stage on the same ruler

| Stage | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|
| afc460e (baseline) | 4,031 | 4,007 | 2 | 22 |
| Codex stage, as merged (pre-triage) | 4,195 | 4,145 | 11 | 39 |
| Codex stage, after combine fixes (§3 ii–iv, vii) | — | — | 4 of the 9 new failures healed in-stage; remainder healed by the report regen + (v) | — |
| S2 stage (8b94c43 + worker fix 9491a9d) | 4,216 | 4,173 | 4 | 39 |
| **FINAL — 7803775** | **4,235** | **4,194** | **2** | **39** |

Final fails = R2 C37 + R2A only — the same two dispositioned SC-300 stale pins as the
baseline. Net vs afc460e: **+204 tests, +187 pass, zero new failures, +17 skips** (the
Postgres-backed suites — career-persistence-postgres, career-task-authority-postgres —
and one sandbox-runtime test; no PostgreSQL on this VM).

**Bundles at 7803775:** full 115 modules / 6,247,455 B (file bytes); career 34 modules /
3,826,341 B (file bytes); both `--check` green (exit 0, correct flags:
`--check` and `--career-only --check`). Career staged size 3,826,341 B is under the
4,200,000 B ceiling.

**Genuine-Phrasing Gate suites at 7803775 (run explicitly):**
tests/career-complexity-battery.test.cjs **26/26** (its internal bars — ≥38/42
conversations, zero S0/S1, fallback ≤8/84 turns — are asserted inside the suite);
tests/career-state-write-adversarial.test.cjs **9/9**.

**Mutation report regenerated on the final tree:** 86 of 128 modules covered, 42 gaps
(both 154-career-recommendations.js and 154-career-writing.js listed as gaps),
**1539/1539 planted defects across 75 packets**.

**Process note (honesty):** during the merges, career-bundle rebuilds were at times
invoked with a wrong flag (`--variant career`; the script's flag is `--career-only`), so
intermediate stage career bundles were git text-merges rather than fresh builds. The
final tree's career bundle is a genuine `--career-only` build (fixup c074846; the delta
vs the text-merge was module ordering only) and the final `--career-only --check` passes
on the measured commit. Stage sweep numbers are source-level measurements and are
unaffected; the deploy packet certifies only the final commit.

## 5. What remains for deploy (owner steps)

1. **Owner runs the migrations** (extended `20261015020000_career_watch_kv.sql` +
   `20261015234000_career_task_intents_v1.sql`) on the Upmore Supabase project — MI-032
   step 3. Without the tables, the new persistence paths stay honestly NOT_WIRED.
2. **Live-Postgres verification** of the RPC/dedupe claims (§1 limit) against the real
   project once migrated — pre-deploy or immediately post-deploy, before any reliance.
3. **Owner's deploy tap** on the exact commit `7803775` (agent-chat → v223), with the
   live gauntlet on that commit per standing law.
4. Registry: Crew A allocates numbers for §3 clusters (i)–(vi).

## 6. Privacy scan (pre-push, performed on the final tree)

- Named classes **absent**: the owner's resume, fact bank (`fact-bank.json`), and
  submissions appear NOWHERE in the tree (0 tracked files). No combine-added file matches
  a personal-artifact pattern. No email address, phone number, DOB, or street address in
  any combine-added line.
- **Finding for the owner/Crew A (already-published content):** Crew B's writing-pattern
  lane committed two fixtures built from the owner's REAL 2026-10-13 networking drafts —
  `packages/career-data/fixtures/writing-pattern-corpus.json` (29 KB) and
  `scripts/career/writing-pattern-blinded-pairs.json` (12 KB) — containing his name,
  "sophomore at DePaul University," a Sporv mention, and draft bodies addressed to 12 real
  bankers by first name at named firms. No contact identifiers. These files were already
  published on the remote on Crew B's own branches before this combine; the release push
  adds no new exposure class. Whether to scrub them (and re-calibrate the writing tests
  on anonymized fixtures) is a Crew A/B + owner call — NOT merge work, and not silently
  rewritten here.
- Minor: 154-career-writing.js's header comment names a `~/workspace/your_files/...`
  design path — a workspace path reference in shipped code; tidiness item for Crew B.
