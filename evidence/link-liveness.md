# Evidence — link liveness (MUSE-F-003)

## The failure, verbatim from FAILURES.md

[ID: MUSE-F-003] [Status: OPEN]
Found: 2026-10-20 20:05 CDT, Muse (surface job-link audit, mission Hour 0-4)
Area: surface
Input: the job links Trainee serves from public.career_kb_postings (corpus snapshot, fetched_on 2026-10-14/15). Audit sample: 60 postings stratified across all 11 sources plus forced Gusto (5) and data-analyst (6) strata; every URL fetched and content-checked.
Expected: every link the product serves resolves to a real, live posting (mission slice step 3: "Real links, checked to resolve to real postings").
Actual: of 60 sampled links, 31 resolve to a live posting (HTTP 200 with posting content); 3 are dead (1x HTTP 410 Gone - arbeitnow/Legartis; 2x HTTP 404 - themuse); 26 cannot be confirmed either way from the served page (21x HTTP 200 JS-rendered pages with no verifiable posting content in the raw fetch; 5x network errors). No code path checks any link before it is served: career_pool.js copies the snapshot's url verbatim, and the serving path (career_pool.js + 142-career-router.js) contains zero liveness checks - no HEAD request, no fetch of a posting URL, anywhere. The snapshot was 6 days old at audit time.
Evidence: per-link audit results - ~/workspace/your_files/job-link-audit-2026-10-20.json and ~/workspace/your_files/job-link-audit-2026-10-20.md (60 links, status + final URL + verdict each).
Priority: P0
Fix:
Verified by:

## What this package carries (branch work/serve-link-liveness, 3 commits, cherry-picked)

1. `55bf864c` (source `2e283cff`) — **the shipped mechanism: the pool-loader probe discipline.** In `career_pool.js`, each posting's link is probed once at pool load (`CareerPool.createFetchProbe`); a definitive 404/410 excludes the posting from the served pool and is counted in `deadExcluded`; everything else — live, JS-shell, bot-walled, timed-out, network-errored — serves exactly as before. Wired into `loadPool` at both composition roots (`agent-chat/handler-career.ts`, `workers/career-browser/production-sources.cjs`). Guard: `tests/career-pool-liveness.test.cjs` **9/9 on tree, 0/9 on base**, sweep clean (finishing lane, 2026-10-20 21:06 CDT). On the packaged branch just now: both liveness suites re-run, **18/18 pass**.
2. `3860c725` (source `516e4d43`) — **an earlier design, riding along as UNCALLED code.** `supabase/functions/_shared/link_liveness.js` (LIVE / CONFIRMED-DEAD / UNCHECKABLE verdicts, per-URL 6h TTL cache, time-boxed fetches) plus `loadServablePool`/`loadServableTargeted` on the pool's serving surface. Nothing in the product calls it. It carries the live proof below. It stays in the branch so the reconciliation is a deliberate merge decision (Claude's), not a silent duplication.
3. `28b4b41a` (source `c92d2ae6`) — FAILURES.md: the F-003 fix is recorded against the entry; **the entry stays OPEN** — per mission rules it closes only on a fresh live run showing served links resolve.

## The verifier's live proof (uncalled code, real numbers)

`scripts/career/link-liveness-live-check.cjs` ran the verifier over the audit's exact 60 URLs:

- **31/31 confirmed-live links kept**
- **3/3 confirmed-dead links dropped**
- **26/26 uncheckable links kept** (15 of those 26 classify LIVE by content under a browser-UA fetch)

## Collision note

Package `muse/2026-10-20-failures-backlog` appends a LIVENESS COLLISION note to HANDOFF.md describing design (2) as an *uncommitted* working-tree design — that was accurate when written (~21:00 CDT); the finishing lane then landed it on this branch (~21:06 CDT) as commit `2e283cff`. The collision is therefore now *inside* this one branch: probe-at-load is wired and primary; the verifier module is present and uncalled. The note in HANDOFF.md stands as the record that the second landing must reconcile the two deliberately.

## Deploy state

NOT deployed. Nothing in this package has run against the live bot; MUSE-F-003 remains OPEN.
