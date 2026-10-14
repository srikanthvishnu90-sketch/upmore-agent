# IB-POOL — Served-pool data gaps (IB-AP-5 / IB-AP-9): mechanics, proof, and the precise fix brief

**Lane:** pool-data-gap · **Date:** 2026-10-13 (overnight) · **Status:** BRIEF ONLY — no data files changed, nothing committed. Reason below: the gap cannot be closed from existing fixture data, and the remaining routes are code/exam-authoring decisions the integrator owns.

## 1. How the served pool is built (exact chain)

1. Every gauntlet runner (grand, pilot, deep-dive, rerun) builds its base ctx through `scripts/career/gauntlet/pilot-lib.cjs:86-89`: if the scenario supplies no postings of its own, `base.postings = loadJson(packages/career-data/fixtures/gauntlet/jobs/scored-corpus.json).postings`.
2. `packages/domain/142-career-router.js` `postingsFromCtx(ctx)` reads `ctx.postings` (or `ctx.corpus` / `ctx.discovery.postings`), adapts each via `adaptPosting`, and `rankedShortlist()` dedupes (module 121 `Jobs.dedupe`), pre-checks, and scores. Role family is **derived, never stored**: `121.roleFamily(title, jd)` — title regexes first (`PM` = /product manager|program manager|product management|technical program/), then the first 600 chars of JD text.
3. So the pool *content* is one data file — but that file is a **ground-truth-labeled exam fixture**, not a general job pool (see §3 before touching it).

## 2. Measured family counts — served pool, before (and unchanged after; see §4)

Derived by running `121.roleFamily` over the corpus exactly as the router does (reproduce: load `scored-corpus.json`, classify each posting by `roleFamily(title, requirements.join("; "))`):

| Family | Count |
|---|---|
| SWE | 12 |
| Operations | 10 |
| Data/ML | **1** (GJ-S03 Associate Data Engineer, Prairie Analytics) |
| Finance | 1 (GJ-H02 — excluded downstream for the test profile, which is why SC-113 hears "no finance roles") |
| PM | **0** |
| **Total** | **24 → 23 after dedupe** (GJ-X02/GJ-X03 are the same req, OPS-4471, by design) |

This matches the Apply wave's findings exactly: SC-110's data shortlist can only ever contain the one Prairie Analytics role; SC-065's PM ask can only ever honest-empty.

## 3. Why the corpus must not be edited in place (blast radius)

- **Its own labeling contract:** the file header declares `"synthetic": true` and `"companies": "All companies are fictional… Postings are synthetic fixtures, not live listings."` Injecting the real-company snapshot postings (Stripe/Jane Street/Datadog/Ramp) would falsify that declaration.
- **Ground truth is authored, not derived:** every posting carries `ground_truth {category, reason}` assigned at authoring time against reference profile P1, and the header `counts` metadata is pinned (suitable 6 / tradeoff 6 / exclusion 6 / trap 6 / total 24). Added postings have no ground truth; editing counts by hand is re-authoring the exam.
- **Scenario expectations quote this pool verbatim:** SC-063/068/069/106/108/114/117/118/119/120 all expect the same five-role SWE shortlist in their replies; SC-110's expected outcome *is* "exactly one data role"; SC-065's honest-empty copy computes the deduped count live ("The current list holds N scored roles"). Any posting that scores into a top-5 shortlist, or any new dedupe total, shifts outcomes across families that currently pass.

## 4. The decisive fact: no PM posting exists anywhere in the repo's fixture data

Exhaustive scan of every posting-bearing fixture (each classified with `121.roleFamily`):

| Source | n | Families present | PM |
|---|---|---|---|
| `jobs/scored-corpus.json` (the served pool) | 24 | SWE 12, Ops 10, Data/ML 1, Finance 1 | **0** |
| `jobs/public-listings.json` | 14 | Ops 7, SWE 3, Design 1, Other 3 (Applied Science Intern classifies Data/ML only with its snapshot JD; listing alone = Other) | **0** |
| `jobs/public-snapshots/*.json` (14 usable; 3 BLOCKED stubs) | 14 | Ops 6, SWE 3, Data/ML 1 (Datadog Applied Science Intern), Design 1, Other 2 | **0** |
| `deepdive/ap/ap-postings.json` | 4 | SWE 4 (all TEST boards) | **0** |
| `variants/variants.json` | 80 | — zero occurrences of "product manager/management" in the file | **0** |

The Ramp "Product Operations Specialist" is the closest-looking item and it classifies **Operations** (title contains "operations"; the PM title regex does not match "product operations"). The DOL LCA dataset (`datasets/dol-lca-fy2025q4-cir-companies.json`) contains "Product Manager" job *titles*, but those are immigration-filing comp rows for CIR company files — no JD, no posting shape, not servable.

**Consequence:** the lane brief's step 2 ("extend the data using only postings already present in the fixture data") has no PM material to work with, and promoting snapshot postings would still leave PM at 0 while breaking §3's contracts. Inventing postings is forbidden by the brief and by the program's no-fabrication law. Hence: brief, not a data edit.

## 5. The precise fix (integrator decision — three honest routes)

**Option A — supplementary synthetic corpus (RECOMMENDED).** Author a NEW file `packages/career-data/fixtures/gauntlet/jobs/scored-corpus-ext.json` in the base corpus's own idiom: fictional companies labeled `(fictional)`, `synthetic: true`, requirements arrays, deadlines in-window, and authoring-time `ground_truth` vs P1 for every added posting. Contents needed: ~4–6 PM postings (at least 2 suitable-for-P1 so SC-065 can tailor instead of honest-emptying; SC-065 asks for 20 and the truthful answer will be "found N" — its completion condition should be re-checked against that), ~3–4 more Data/ML postings (one more suitable, so SC-110's shortlist is a real ranking), optionally 1–2 more Finance. Then ONE harness change the integrator owns: `pilot-lib.cjs` merges `scored-corpus-ext.json` into `base.postings` **only for scenarios whose case definition opts in** (or for the discovery-family scenarios), so the ≥10 scenarios that quote the base pool's shortlists verbatim keep their pinned pool. Base corpus untouched; counts metadata of the base file stays true.

**Option B — extend the base corpus in place + re-author every affected expectation.** Rejected for tonight: it re-opens settled verdicts across Apply/Track/Intel and the counts/ground-truth metadata in the same commit — exam re-authoring under time pressure is how false passes happen.

**Option C — scenario-scoped postings for SC-065/SC-110 only.** The runner seam already supports it (`pilot-lib` only defaults when `base.postings` is unset; deep-dive runners override per family). Smallest blast radius, but leaves the *product-level* pool family-poor: any real user asking "find PM roles" against the default pool still honest-empties. Acceptable as a tonight-only unblock if paired with an Option A follow-up.

**Named companies (IB-AP-3)** are a separate, already-landed seam (HEAD `ce2529b`: 142's named-company tailor resolution reads the retrieved board fixtures in `public-listings.json`/`public-snapshots/`). No pool change is needed or wanted for them — do not merge the real-company snapshots into the synthetic corpus (§3).

## 6. Bug-law compliance (owner law, 2026-10-13 ~20:47 CDT)

- **Ledger:** this gap is a defect (pool data gap, Apply-wave IB-AP-5/IB-AP-9) and needs its entry in `docs/bug-ledger.md` — the integrator lands it with the fix (the ledger file currently carries other lanes' uncommitted edits; this lane did not touch it).
- **Guard (fail-first, permanent):** a test asserting served-pool family coverage — load the pool exactly as `pilot-lib` does, classify with `121.roleFamily`, and fail if any scenario family's pool has zero suitable-eligible postings for its reference profile (today: PM 0, Data/ML suitable 1). Written against Option A's merged pool it passes; against today's pool it fails — that red is the replay proof of this bug. Suggested home: `tests/career-jobs-domain.test.cjs` (it already loads the corpus at line 122).
