# SCALE-S1 — REPO-SIDE BATTERY ACROSS BRANCHES — 2026-10-22

Owner direction 2026-10-22 09:56 CDT: Muse implements and tests at mass scale; Codex
takes the bugs. This lane ran the largest repo-side batteries available on 8 branches
and classified every failure cluster (single bug vs design-level). Repo work only:
no deploys, applies, migrations, merges, live drives, external texts, or spend.
Submit path and flags untouched. Synthetic fixtures only. Production Supabase: no
reads needed, none made.

Raw evidence (this host, survives in the lane log dir): `~/workspace/scale-s1-logs/<slug>/`
per branch — `summary.txt`, per-guard logs, `sweep.log` (+ `sweep.log.failures.json`,
the per-file attribution produced by `~/workspace/scale-s1-logs/analyze_sweep.py`),
`agent100.log`, `db.log`. Harness scripts: `battery.sh` / `battery-full40.sh` /
`battery-core.sh` in the same dir.

## Method (reproduced from the lanes' own records, not invented)

- Full node sweep = `node --test --test-reporter=tap --test-concurrency=2 tests/*.test.cjs`
  (the connector/assembly lane's sweep form; TAP forced because this host's Node
  24.20.0 defaults to the spec reporter). Sequential per branch — parallel suites on
  this 2-vCPU host produced load-collision artifacts earlier tonight.
- `tests/db/run.sh` on embedded PG16, run as user `pgtest` from a pgtest-owned copy
  of the tree (`/home/pgtest/s1tree`), `PGBIN` = zonky 16.14.0 server binaries +
  Ubuntu `postgresql-client-16` psql 16.15 (zonky ships no `psql`; the client was
  provisioned separately). PATH prepended — `apply-rails-and-seed.sh` calls bare
  `psql`. First attempts failed on exactly this plumbing (recorded in branch 1's
  summary); no test content was altered.
- agent100 = `node tests/agent100/harness/runner.js --mode dry --all`.
- Career guard family run per file, per tree; ABSENT recorded where a suite does
  not exist on that tree.
- Battery depth per branch: FULL (guards + agent100 + full sweep + db) on the four
  lineage points (1, 6, 7, 8); CORE (guards + agent100 + db) on the two 1–2-commit
  fix children of branch 1 (2, 3) and the two intermediate host-lineage branches
  (4, 5), whose tip (6) carries the full sweep for that lineage.
- Environment honesty: runs executed under heavy multi-lane contention (load
  average peaked ~32) and two VM replacements (one killed branch 7's first sweep
  attempt at 749 results; it was re-run to completion). Every count below is from
  a completed run. Wall times are contention-inflated and are not performance data.

## Headline table

| # | Branch | Head SHA | Sweep (tests/pass/fail/skip) | agent100 | db run.sh |
|---|--------|----------|------------------------------|----------|-----------|
| 1 | muse/2026-10-22-audit-table | cbcd0141ae38563bd2b27596360e57fffc93d237 | 5,252 / 4,886 / **206** / 160 | 103/103 | EXIT 0 · 1,972 ok |
| 2 | muse/2026-10-22-fix-f025 | d510bc3892b02c0516e6da05096f802d28a87d98 | core battery (child of 1) | 103/103 | EXIT 0 · 1,972 ok |
| 3 | muse/2026-10-22-fix-f029-guard | 0aa231f2857777144499c0707467f9bbe5f25c17 | core battery (child of 1) | 103/103 | EXIT 0 · 1,972 ok |
| 4 | muse/2026-10-22-session-reuse | 983c59194b3395dd7d0c2350006f04c22fa79b77 | core battery | 103/103 | EXIT 0 · 775 ok |
| 5 | muse/2026-10-22-event-driven-fills | b8aa4106581f2978daa1ceb8e1dea8d6b4c6a899 | core battery | 103/103 | EXIT 0 · 775 ok |
| 6 | muse/2026-10-22-parallel-drives | 5acd178ddf0d30187e98591d24e63bc37cd8d8d5 | 4,618 / 4,559 / **18** / 41 | 103/103 | EXIT 0 · 775 ok |
| 7 | muse/2026-10-22-submit-armed | e34b16c026552f471494433a89dcc724a0193931 | 5,291 / 4,925 / **206** / 160 | 103/103 | EXIT 0 · 2,028 ok |
| 8 | muse/2026-10-22-chat-begin-caller | cb56921a1943c4672a0c87fcb2b33ccfe7381670 | 5,291 / 4,925 / **206** / 160 | 103/103 | EXIT 0 · 2,000 ok |

All 8 branch heads were verified by `git ls-remote` before testing (all matched the
assigned SHAs exactly) and each worktree checkout was verified at the target SHA.

**The single most important measurement in this doc:** the arch lineage's failing
set is *name-for-name identical* on branches 1, 7, and 8 — same 206 failing test
names, same 28 files (verified by set comparison of the attributed failure JSON).
The host lineage's tip (branch 6) fails 18, of which 17 reproduce its recorded
baseline set from the assembly era plus one bundle-currency check. The two
lineages' red sets share exactly 11 names (the 9 D-names + the 2 C37 pins).

## Per-branch results

### 1 — audit-table @ cbcd0141 (arch lineage base; FULL)
Inventory: 420 top-level test files · 73 db SQL files.
Guards: loop-acceptance 22/22 · portal-apply 14/14 · board-provider 11/11 ·
submit-integrity 9/18 (fails = C1 below) · posting-location 0/2 (C7 below).
Absent: session-reuse, event-waits, decline, question-kind, observation, phone,
agent-begin, bench60-fixes, parallel-drives, f029, empty-form-rescan.
Sweep 5,252/4,886/206/160 — failing files (28; full name lists in the failures JSON):
cloud-current-sources-qa 28 · apply-engine 26 · apply-real-forms 17 ·
workday-native-fields 16 · greenhouse-savedform 15 · apply-script (009b-4) 14 ·
cloud-worker-card-bridge-process 12 · cloud-card-producer-qa 10 ·
cloud-worker-card-bridge 9 · portal-submit-integrity 9 (C1) · email-code-engine 8 ·
cloud-worker-card-bridge-lever 7 · approve-first 5 · cloud-worker-lever 5 ·
extension-package-agent 5 · cloud-card-producer-drift 3 · cloud-worker 3 ·
cloud-engine-input 2 · posting-location 2 (C7) · tailor-quarantine 2 ·
approval-card-browser 1 (file-level) · gauntlet-r2 1 (C2) · gauntlet-r2a 1 (C2) ·
datasets 1 · depth-patches-current 1 · finance-build 1 · proactive-wiring 1 ·
trainee-go-live 1.
db: EXIT 0, 1,972 ok lines, "db tests passed" (full chain incl. the deferred
20261024130000 bridge pending-view machinery).

### 2 — fix-f025 @ d510bc38 (child of 1; CORE)
Identical to base on every shared suite. Delta: `career-portal-empty-form-rescan`
exists only here — **5/5 pass** (on base: ABSENT). agent100 103/103 · db EXIT 0,
1,972 ok. (The fix's fail-first red on the old engine was the F-025 lane's own
recorded evidence; this lane verifies the guard is present and green here and
absent on the base.)

### 3 — fix-f029-guard @ 0aa231f2 (child of 1; CORE)
Identical to base on every shared suite. Delta: `career-f029-gusto-coverage`
exists only here — **7 tests / 6 pass / 0 fail / 1 todo**. The todo is the strict
leg (ask set shrinks to exactly the class-(c) five), self-documented in the test
as BLOCKED on the F-026 question-kind branch, which exists only on the host
lineage. agent100 103/103 · db EXIT 0, 1,972 ok.

### 4 — session-reuse @ 983c5919 (host lineage; CORE)
Inventory: 371 test files · 34 db SQL files.
Guards present and green: session-reuse **13/13** · decline-vocab 12/12 ·
question-kind 6/6 · observation-stop-record 5/5 · phone-render-equivalence 5/5 ·
location-render-equivalence 7/7 · loop-acceptance 22/22 · portal-apply 14/14 ·
board-provider 11/11. submit-integrity 9/18 (C1 names, identical).
Absent: event-waits, agent-begin, bench60-fixes, parallel-drives, f029,
empty-form-rescan, posting-location.
agent100 103/103 · db EXIT 0, 775 ok.

### 5 — event-driven-fills @ b8aa4106 (host lineage; CORE)
Inventory: 372 test files · 34 db SQL files. Everything from branch 4 identical,
plus its own delta: `career-event-waits` exists only here in this lineage's lower
branches — **12/12 pass**. agent100 103/103 · db EXIT 0, 775 ok.

### 6 — parallel-drives @ 5acd178d (host lineage tip; FULL)
Inventory: 373 test files · 34 db SQL files.
Guards: all of branch 5's set green, plus `career-parallel-drives` **8/8**.
Sweep 4,618/4,559/18/41 — failing files (7): portal-submit-integrity 9 (C1) ·
v242-live-gaps 3 (control-confirm · probe j chain · throwing tailor leg) ·
portal-answer-map 2 (coverage · coverage forcing-function) · career-bundle 1
(bundle currency vs packages/domain) · extension-sync 1 (file-level) ·
gauntlet-r2 1 (C2) · gauntlet-r2a 1 (C2).
agent100 103/103 · db EXIT 0, 775 ok.

### 7 — submit-armed @ e34b16c0 (arch lineage WO tip; FULL)
Inventory: 423 test files · 75 db SQL files.
Guards: base set as branch 1, plus the begin trio present and green —
`career-agent-begin` **25/25** · `career-agent-begin-wiring` **3/3** ·
`career-agent-begin-cloud` **11/11**.
Sweep 5,291/4,925/**206**/160 — failing set identical to branch 1 (all 206 names,
same 28 files; set-compared).
db: EXIT 0, **2,028 ok** (base 1,972 + 56 armed/begin-chain assertions, incl.
"ARMED-3: the walk ends with both switches off"). The 20261024130000 bridge +
20261024140000 cloud-begin chain is fully green on disposable PG16.

### 8 — chat-begin-caller @ cb56921a (arch lineage; FULL)
Inventory: 423 test files · 74 db SQL files.
Guards identical to branch 7 (begin trio 25/25 · 3/3 · 11/11).
Sweep 5,291/4,925/**206**/160 — failing set identical to branches 1 and 7.
db: EXIT 0, **2,000 ok** (base + 28 begin-chain assertions, incl. "the contract
helper is internal: granted to no one").

## Cross-branch failure clusters

### C1 — On EVERY branch, both lineages: submit-integrity D-names (9)
D11 ×5 (BUG-207), D12 (BUG-208), D13 (BUG-209), D14 ×2 (BUG-237) — identical names
on all 8 trees, in the guard run and in both full sweeps.
**Classification: environment, with a design-level tail.** The error is
`browserType.launch` dying in this VM; lane records prove the same code green
through lane-local Playwright against the live site (AGENTS.md, 2026-09-24).
Not 9 bugs. The design-level tail: the product's most safety-critical suite —
the one that proves an application is never double-sent or falsely confirmed —
has *no runnable green tier in a clean checkout on a standard host*; its green
evidence exists only inside individual lanes' local setups. Until that suite
runs in the canonical harness, "submit integrity proven" is a claim about a
developer's machine, not about the repo.

### C2 — On both lineages: the C37 wording pins (2)
`R2 C37 spot-check (integrated)` (career-gauntlet-r2) and `R2A guard: C37's exact
wording still belongs to 141` (career-gauntlet-r2a) fail identically on the arch
base, both arch WO tips, and the host tip.
**Classification: single known disagreement, design-level persistence.** Two
modules encode different contracts for the same kill-switch turn (module 141's
reply vs the gauntlet's expected wording); both lineages inherited the conflict
and neither resolved it. It is one decision, not two bugs — and it has now
survived two independent lineages, which is how a wording pin becomes permanent.

### C3 — Host lineage only: the live-gap + coverage pins (5) and process reds (2)
v242-live-gaps ×3 (control-confirm fallthrough · probe j chain · throwing tailor
leg) and portal-answer-map coverage ×2 fail on branch 6's sweep. These files do
not exist on the arch lineage, so the arch sweeps are silent about them — silence
that must not be read as green.
**Classification: standing pins of known design gaps (F-007 family).** The
coverage pair is the fact-bank consumer gap encoded as tests: confirmed fact
kinds exist that no consumer reads, and the forcing-function test exists
precisely to keep that visible. The tailor trio is the F-011/live-gap family.
Plus two process reds on branch 6: career-bundle currency (the branch stacked
code without rebuilding the router bundles) and extension-sync (file-level) —
both also in this lineage's recorded baseline; they say the lineage's branches
routinely land without the bundle-rebuild step, i.e. repo state and shippable
state diverge by habit.

### C4 — Arch lineage only: the WO cloud/apply continent (188 of the 206)
cloud-current-sources-qa 28 · apply-engine 26 · apply-real-forms 17 ·
workday-native-fields 16 · greenhouse-savedform 15 · apply-script 14 ·
card-bridge-process 12 · card-producer-qa 10 · card-bridge 9 · email-code-engine
8 · card-bridge-lever 7 · approve-first 5 · cloud-worker-lever 5 ·
extension-package-agent 5 · card-producer-drift 3 · cloud-worker 3 ·
cloud-engine-input 2 · tailor-quarantine 2 · and singles (approval-card-browser,
datasets, depth-patches-current, finance-build, proactive-wiring,
trainee-go-live). Identical at the lineage base (branch 1) and at both WO tips
(7, 8) — so none of it is a regression from the WO-102/F-030/submit-arming work;
that work's own additions (begin trio, db chain) are green.
**Classification: design-level — a tests-first product surface whose passing
environment was never committed.** Evidence: the largest file's failure is a
`hookFailed` whose own error text reads *"fixture/runtime error; not a
behavioral regression"* — the suite's fixture runtime cannot be built from the
repo tree in a clean environment. The continent (cloud worker, card bridge,
apply-engine CLI, email-code engine, captured-real-form drives) specifies the
entire cloud-apply product, and on every clean checkout measured it is red as a
bloc. Whether some original lane environment ran it green is not in any record
available to this lane; what is verified is that the repo alone does not
reproduce it. A surface that can only be tested inside one lane's setup cannot
be regression-tested by anyone else — which is the fundamental issue, larger
than any single failing assertion inside it.

### C5 — Suite-existence divergence (absence as evidence)
Guard presence matrix (✓ = exists on that tree):

| Suite | 1 audit | 2 f025 | 3 f029 | 4 sess | 5 event | 6 paral | 7 armed | 8 begin |
|---|---|---|---|---|---|---|---|---|
| loop-acceptance / portal-apply / board-provider / submit-integrity | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| session-reuse | – | – | – | ✓ | ✓ | ✓ | – | – |
| decline-vocab / question-kind / observation / phone / location-render | – | – | – | ✓ | ✓ | ✓ | – | – |
| event-waits | – | – | – | – | ✓ | ✓ | – | – |
| parallel-drives | – | – | – | – | – | ✓ | – | – |
| agent-begin trio | – | – | – | – | – | – | ✓ | ✓ |
| posting-location (WO-053) | ✓ | ✓ | ✓ | – | – | – | ✓ | ✓ |
| f029-gusto-coverage | – | – | ✓ | – | – | – | – | – |
| empty-form-rescan | – | ✓ | – | – | – | – | – | – |
| bench60-fixes | – | – | – | – | – | – | – | – |

**Classification: design-level.** The two lineages carry *non-overlapping safety
nets for the same product*: the host lineage guards the drive-time render
equivalences (F-026/F-027/F-028 family) that the arch lineage cannot even
express (its F-029 guard's strict leg is a todo for exactly this reason), while
the arch lineage guards the begin/cloud contract the host lineage lacks. Any
merge of the two lines lands in a tree where each side's guards have never run
against the other side's code. bench60-fixes — the guard for the bench crash
fixes (F-035/F-036) — exists on *none* of the 8 branches tested; it lives only
on its own fix branch, so the crash-recovery behavior is unguarded everywhere
the code would actually ship from.

### C6 — The migration layer is green everywhere (a negative result that matters)
tests/db/run.sh exits 0 on all 8 trees: arch chain 1,972 ok at base, 2,000 with
the begin door, 2,028 fully armed; host chain 775 ok, stable across its three
branches. **Classification: no defect.** Including the two migrations whose live
application on 2026-10-21/22 is unattributed (20261024130000, and
20261024140000's sibling pair) — their content is fully proven in the disposable
chain. The DB contract layer is the healthiest surface this battery measured;
the failures concentrate in the browser/fixture tier (C1, C4) and in unresolved
cross-module contracts (C2, C3), not in the schema layer.

### C7 — posting-location WO-053 (2, arch lineage only)
Fails 0/2 on all four arch trees with `PLAYWRIGHT_UNRESOLVABLE: set
UPMORE_PLAYWRIGHT_PATH; nothing was downloaded`.
**Classification: environment** (same family as C1: a captured-page suite whose
browser runtime is not provisioned by the repo). The file does not exist on the
host lineage.

## Claims vs this lane's re-run evidence (kept separate)

Lane claims independently re-verified by these runs: session-reuse guard 13/13 ✓
· event-waits 12/12 ✓ · decline-vocab 12/12 ✓ · question-kind 6/6 ✓ · phone 5/5 ✓
· location 7/7 ✓ · observation 5/5 ✓ · parallel-drives 8/8 ✓ · begin 25/25,
wiring 3/3, cloud 11/11 ✓ (incl. after the owner-ordered rebase) · F-025 rescan
guard 5/5 on its branch, absent on base ✓ · F-029 guard 6 pass + 1 documented
todo ✓ · submit-armed db exercise chain green, +56 ok over base ✓ · host-lineage
sweep baseline (17 named fails @ cea914fe-era) reproduced as 17 of branch 6's 18
✓ (+1 bundle-currency). Assembly-era figures (4,636 tests / 17 fail) are the
integration lineage's; the arch lineage's sweep is a different, larger tree
(5,252–5,291 tests) and the two totals are not interchangeable.
Not verified by this lane (out of scope): any live behavior, any host-side
drive, the bench60 fix branch itself, PR #147/#150 trees.

## What I need from you

Nothing.

Real completions: 0 (unchanged; this lane is repo-side measurement only).
