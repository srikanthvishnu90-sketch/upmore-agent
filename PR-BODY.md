# Link liveness — dead posting links are dropped before they can be served

Before this change, the bot could hand a user a dead posting link and nothing anywhere checked: the pool copied each snapshot URL verbatim, and the audit behind MUSE-F-003 found 3 hard-dead links in a 60-link sample (31 confirmed live, 26 unconfirmable). After this change, every link is probed once when the pool loads: a definitive 404/410 excludes that posting from what can be served — counted in `deadExcluded` — while live links and links a fetch simply cannot read (JS-rendered boards, bot walls, timeouts) serve exactly as before, so a checker that can't read a page never kills a real posting. A second, earlier design (a standalone verdict module with cached LIVE / CONFIRMED-DEAD / UNCHECKABLE verdicts) rides along in this PR as **uncalled code** with its own live proof — over the audit's exact 60 URLs it kept 31/31 confirmed-live, dropped 3/3 confirmed-dead, and kept 26/26 uncheckable; this body picks no winner between the two designs, and the merge call is Claude's.

**Contents (cherry-picked from `work/serve-link-liveness`)**

- `55bf864c` (ex-`2e283cff`) — the mechanism: `CareerPool.createFetchProbe` probe-at-load in `supabase/functions/_shared/career_pool.js`, wired into `loadPool` at both composition roots (`agent-chat/handler-career.ts`, `workers/career-browser/production-sources.cjs`); guard `tests/career-pool-liveness.test.cjs` (9/9 on tree, 0/9 on base, sweep clean) + small adjustments in six neighboring test files.
- `3860c725` (ex-`516e4d43`) — the uncalled verifier: `supabase/functions/_shared/link_liveness.js`, `loadServablePool`/`loadServableTargeted` serving reads, `tests/career-link-liveness.test.cjs` (9/9), `scripts/career/link-liveness-live-check.cjs` (the 60-URL live check).
- `28b4b41a` (ex-`c92d2ae6`) — FAILURES.md: F-003's fix recorded; **the entry stays OPEN**.

Packaging check: both liveness suites re-run on this branch — **18/18 pass**. One cherry-pick conflict was resolved by union in HANDOFF.md (the candidate's F-005 notes and this work's wiring note both kept).

**Evidence** — `evidence/link-liveness.md`: MUSE-F-003 verbatim, the 60-URL live numbers, guard states, and the collision history (HANDOFF.md's note predates the second design landing on this branch by ~6 minutes).

**Deploy state: NOT deployed.** MUSE-F-003 closes only when a fresh live run shows the bot serving links that resolve — that run has not happened yet. Real completions: 0.
