# Gauntlet record — tree 219541c, packaging-revised staging retry (2026-10-15) — DEPLOY REJECTED AGAIN (413, size); STEP-B DCE PROVEN IMPOSSIBLE AT FILE LEVEL; STOPPED PER HARD LIMIT

**Deployed SHA: NONE. Live remains agent-chat v221 (build e107f58), verified ACTIVE after both
attempts (verify_jwt=true); gmail-oauth v14 and imessage-inbound v25 untouched; no secrets
changed; Sporv/Ring untouched; branch NOT pushed.**

- Authorization: owner, 2026-10-15 10:02 CDT — "deploy and submit everything." This lane was
  chartered to fix the PACKAGING ONLY and redeploy the same product code: the product source
  tree remains byte-identical (all work done on staging copies under /tmp; the repo working
  tree's only change is this record).

## Step 1 — where the staged bytes sit (import graph from agent-chat/index.ts, 57 files, 0 unresolved)

Raw graph total **5,991,925 B**. Largest files: `_shared/router_core.js` 4,919,296 ·
`agent-chat/_shared/capabilities.ts` 162,138 · `_shared/agent_core.js` 119,653 ·
`agent-chat/agent_core.js` 119,653 (byte-identical duplicate of the _shared copy) ·
`agent-chat/handler.ts` 114,968 · `_shared/proactive.ts` 99,195 ·
`agent-exec/merchant-catalog.ts` 81,131. By extension: .js 5,166,317 B · .ts 825,608 B.

## Step A — whitespace-minify EVERY staged .js file (deploy time only, esbuild 0.28.2 `--minify-whitespace`, identifiers preserved)

| file | before | after |
|---|---|---|
| _shared/router_core.js | 4,919,296 | 3,826,035 |
| _shared/agent_core.js | 119,653 | 83,874 |
| agent-chat/agent_core.js | 119,653 | 83,874 |
| _shared/career_host.js | 7,715 | 3,394 |

All 53 .ts files copied byte-identical. **Staged total: 4,822,785 B** (57 files) — 75,879 B
smaller than the first attempt's 4,898,664 B; nominal margin under 5,000,000 B = 177,215 B.

Pre-deploy verification on this exact artifact — ALL PASSED: `node --check` on all 4 minified
.js files; agent_core.js export probe (original vs minified: same 8 exports, same types,
byte-identical probe output); export parity **113/113** (repo bundle vs staged bundle); A/B
chain through the production `career_host.js` dispatch with snapshot round-trips — **9/9 turns
byte-identical**, final snapshot identical.

**DEPLOY RESULT: HTTP 413 again** — "Function source code exceeds the maximum deployment size
(5 MB)." No new version created.

## Step B — reachability proof: ZERO droppable files

The full static/dynamic edge map of the 57-file graph was computed. **Every file is reached by
STATIC imports only** (no dynamic-only file exists). `agent-chat/handler.ts` statically imports
the entire finance pipeline at top level (lines 7–85: capabilities, finance_facts, agent_core,
financial_tools, financial_planner, flow_router, proactive, direct_answers + ~30 answer
modules, agent.ts via capabilities, merchant-catalog via flow_router + win_back_answer, …).
The `PRODUCT_MODE = "career"` branch sits at handler.ts line ~250, INSIDE the request handler —
it executes only after Deno/eszip has resolved and evaluated the whole static module graph at
load. The career path never CALLS the finance pipeline, but the module graph REACHES all of it
at load: dropping any one of the 57 files breaks module resolution for the entire function.
**Files the career path can never reach, in the only sense a bundled edge function has: NONE.**

Removing finance EXPORTS from inside the staged files (or stubbing modules, or tree-shaking
`router_core.js` behind its 113 exports) would change the artifact's code, not its packaging —
and the mandated verification (export parity + career-host A/B) exercises only
`router_core.js` + `career_host.js`; it cannot see handler-side modules, so behavioral
equivalence of such surgery is unprovable before deploy. Per this lane's hard limit — *if the
staged artifact's behavior differs from the verified one, STOP and report* — **the lane
STOPPED here. No changed product was deployed.**

## Size-accounting evidence (why Step A's 177 KB nominal margin was not real)

v221 (e107f58) deployed successfully at staged 3,950,107 B with the IDENTICAL .ts byte total
(825,608 B — the .ts tree did not change between e107f58 and 219541c; all growth is the bundle:
raw 3,879,393 → 4,919,296, driven by the complexity wave's embedded firm-sets + 38 company
files, +949 KB). Both 219541c attempts were rejected (staged 4,898,664 and 4,822,785). The
platform therefore counts materially more than staged bytes (eszip/transpilation accounting,
the v220 lesson); empirically the ceiling sits between 3,950,107 and 4,822,785 staged bytes.
Informational measurement only (NOT staged for deploy): transpiling + whitespace-minifying the
53 .ts files yields 533,243 B (from 825,608) — a further ~292 KB — but shipping them requires
renaming modules and rewriting import specifiers across the staged graph, a structural
artifact change outside this lane's verification cover (see options).

## Live verification (a)–(e): NOT RUN

Probes (a)–(d) and the E2E live subset (`overnight-e2e/lane-c/live-subset.json`, 25
conversations / 47 turns) verify the NEW build live. The new build never went live; they were
not run against v221 either (old-build results are not new-build proof).

## Rollback

`/tmp/rollback-v221` re-verified intact: 57 files, 3,950,107 B, parity + A/B verified in the
first lane — NOT needed; nothing was deployed.

## Next step — owner's fresh tap (options, none executed)

1. **Prune the shelved finance half from the repo bundle** via the bundle build script
   (router_core.js is 3,826,035 of the 4,822,785 staged bytes — the only lever big enough on
   its own), then the full parity + A/B + measurement cycle re-runs on the new bundle. A repo
   build change; finance code stays in the repo, shelved, exactly as the pivot rules require.
2. **Serve the embedded company data from the knowledge database / runtime fetch** instead of
   the bundle (build change + host wiring; removes most of the +949 KB growth).
3. **Deploy-time TS transpile + module rename packaging** (measured above at ~4,530,420 B
   staged): rewrites import specifiers in the staged graph — needs its own verification cycle
   that actually loads handler.ts (e.g. a Deno-side boot test of the staged graph) before any
   deploy attempt.
4. Reduce the embedded dataset itself (data change — outside any packaging charter).
