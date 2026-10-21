# CI base repair — record (2026-10-20)

Branch `muse/2026-10-20-ci-base-repair` off `integration/v2-candidate` @ `6b6551cf`.
Owner order: fix CI on the five `muse/2026-10-20-*` PR branches. Pusher round 2 proved the
branch-red was only the bundle-freshness pair (fixed on #144/#145); everything else red is
the candidate BASE itself. This branch repairs the base's test-side rot only. No product
behavior changes; no test weakened, skipped, or deleted.

## Baseline at this location (~/workspace/ci-base-repair, held constant for all comparisons)

- node sweep `node --test tests/*.cjs`: 4,539 tests / 4,484 pass / **14 fail** / 41 skipped.
- deno `deno test tests/edge/`: **26 type errors** (TS2322/2339/2345/2352/2532/18048),
  type-checking failed before any test ran.
- deno `deno run -A evals/agent/run.ts --check`: FAIL — committed report docs stale.
- deno `deno run -A evals/agent/mutations.ts`: **11/12** — M09 NOT PLANTED (anchor gone).
- node `node evals/runner.cjs --mutations`: **11/11 caught** (incl. its own M09) — green;
  the pusher's "mutations 11/12" was the deno testing-agent set, not this one.
- generated-file checks + evals validate/runner + agent100: green on base (pusher round 2).

## Classification (every base failure, verdict + one line of evidence)

| Item | Verdict | Evidence |
|---|---|---|
| gauntlet-r2 C37 spot-check | TEST-ROT | Probe of the exact turn: handled by `142-career-router.handleChat` with `global_pause_set=true`, `counts_verified=false`, status completed, honest bubble — the SC-300 contract holds; the test pins handler `141` and the superseded exact bubble text. |
| gauntlet-r2a C37 guard | TEST-ROT | Probe with queue state: 142 halts 3/3 items, `global_pause {set:true, scope:"all-queues"}` persisted, `halted_count=3`, "Nothing went out from this queue at all" — the test pins handler `141` and the old `/Nothing was sent/` wording. |
| portal-answer-map coverage | **PRODUCT-REAL** | The real fact bank carries kinds `application_answer` (~45 confirmed facts, F-033…F-083) and `application_text` (~11) with zero consumers and zero exemptions in base code (repo-wide grep: no references); module 149's derivation never touches them, so drives stop on questions these facts answer — the BUG-238 defect class. Filed in FAILURES format in the lane report; NOT fixed here (wiring a consumer / declaring an exemption is a product call for the brain lane; only manifests where the real bank file is present, per the suite's by-design real-bank preference). |
| portal-answer-map forcing function | **PRODUCT-REAL** | Same root as coverage: the planted `military_service` kind is correctly named uncovered, but the two real kinds above are uncovered alongside it. |
| v242-live-gaps ×3 | TEST-ROT | All three throw `Error: run with --experimental-vm-modules` from the test's own `stagedApp`; with the flag the file passes 4/4. Every sibling suite (extension-sync, named-role-capture, batch-delegation…) self-respawns with the flag; this file never adopted the idiom. NOT product-real: no product assertion is ever reached without the flag, and all pass with it. |
| spec-gates S3 claims register | TEST-ROT (portability) | The test reads `../../your_files/review/honest-yield-copy.md` — a path OUTSIDE the repo. It exists and is clean (0 banned-phrase matches) when the worktree sits under `~/workspace` (file passes standalone here: 28 tests, 0 fail); from a /tmp checkout (the pusher's CI reproduction) or a GitHub runner the path never exists and `readFileSync` throws. Fix follows the repo's own `loadBank()` idiom: scan the surface when present, skip when absent; in-repo surfaces always scanned. |
| career-extension-sync (sweep-only) | ENVIRONMENT / sweep-context | Standalone at this location the file passes (its respawned VM child is green). It failed only inside the pusher's /tmp full sweep. No code change; the final arbiter sweep at this location is the deciding run. |
| career-portal-submit-integrity D-tests ×9 | ENVIRONMENT (pre-proven) | Proven before this lane: the 9 D-test failures occur only in a root shell without the project's recorded opt-out; with `UPMORE_CHROMIUM_SANDBOX=off` the file passes 18/18. No code change. |
| deno edge type errors ×26 | TEST-ROT (type drift) | 24 of 26 are in test files: fixtures typed as `ProactiveOffer` carrying kind-specific fields the union type doesn't declare, possibly-undefined indexed access under `noUncheckedIndexedAccess`, a `TurnDocument` literal widened to `string`, a `Uint8Array`→`ArrayBuffer` conversion. The remaining 2 are the same `Uint8Array<ArrayBufferLike>` drift in `_shared/telegram.ts:326` (Blob part) and `_shared/whatsapp_twilio.ts:154` (Response body) — type-only casts, zero runtime change. |
| testing-agent `--check` stale docs | TEST-ROT | The tool's own verdict: `docs/testing/agent-report.md` / `docs/capability-list/flow-evidence.md` stale; regeneration (`deno run -A evals/agent/run.ts`) is the project's own remedy. |
| testing-agent mutations M09 | TEST-ROT | Runner output: "NOT PLANTED: the text to change is gone from `supabase/functions/_shared/proactive.ts`". The guard itself is intact — proactive.ts:312 still appends "Should I cancel it for you? Reply YES or NO." for `cancel_trial`, now inside a multi-kind ternary the code grew; only the defect's anchor string is stale. Re-anchored to the current text; the plant still removes exactly the ask-before-cancelling suffix. |

## Fix log

(Appended per commit as classes land; final arbiter numbers close this record.)
