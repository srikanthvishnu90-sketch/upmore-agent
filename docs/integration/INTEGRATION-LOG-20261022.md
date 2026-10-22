# Integration verification — 2026-10-22

Branch: `wo/integration-verified-20261022`. Base: `348c2d4a3564c54135d0c485bb0d09d763ee0901`.

Owner's order: merge the named fixes individually in the order below; after each merge run all available root Node suites, full Edge, and active architect suites. Stop at the first new failure. No main merge, deployment, live migration, paid call, flag change, or live drive is authorized. A source conflict in module 149 or the approval path requires a report before resolution.

## Check environment and limits

- VERIFIED local tools: Node `22.23.3`, Deno `2.9.6`, Python `3.12.14`, esbuild `0.25.12`, Chromium `154.0.8037.57`, sandbox enabled. The Deno version's match to the production Edge runtime is **NOT_VERIFIED**; that is a separate environment-pinning task.
- Provider credentials are not inherited. Fixtures use synthetic data. Deno network permission is loopback only. JSR downloads are blocked here, so the external import map uses unchanged upstream std/assert and deno-dom source checkouts; their exact commits and map hash are in [environment.json](evidence-20261022/environment.json).
- Node selects every root `tests/*.cjs` file, including archived external-evidence suites, with `--experimental-vm-modules --test --test-concurrency=2`. Deno runs all of `tests/edge` and `tests/architect`, excluding only the preexisting `tests/architect/pending` selection.
- **NOT_RUN:** baseline Node reports 105 skips. These include extension suites whose service worker could not start under the installed Chromium. A browser left open after Workday setup failed blocked fixture-server cleanup; only that test-owned browser was terminated after all Workday cases had skipped. [Cleanup record](evidence-20261022/00-base/extension-cleanup.json). No test or assertion was edited.
- A checkpoint with unchanged baseline failures is labeled **NO_NEW_FAILURES**, never a green gate. Each checkpoint compares failure names, failure diagnostics, and new skips against the immediately preceding verified checkpoint, as well as recording counts. No baseline failure is waived for release.

## Results

Counts below are passed / failed / skipped (Deno omitted skips where none were reported). The tested SHA is captured before any evidence-only follow-up commit.

| Step | Incoming fix | Tested SHA | Node | Edge | Architect | Result |
|---|---|---|---|---|---|---|
| 00 baseline | — | `348c2d4a3564c54135d0c485bb0d09d763ee0901` | 5,061 / 35 / 105 | 892 / 0 | 1,262 / 2 | FAIL baseline; Node 18m17s |
| 01 F-001 | `984478d2` | `8133ee4d52df3da25506c0b3c6f44fc8fe6cca73` | 5,064 / 35 / 105 | 892 / 0 | 1,262 / 2 | VERIFIED: NO_NEW_FAILURES; +3 passing Node tests |
| 02 F-002 | `15057d56` | `75600f5ebaac591505b89607e112e9eb75d350d8` | 5,069 / 35 / 105 | 892 / 0 | 1,262 / 2 | VERIFIED: NO_NEW_FAILURES; +5 passing Node tests |
| 03 F-004 | `94f91453` | `7f04c59968a6ea60bdc5db92a2de43298e594bbc` | 5,081 / 35 / 105 | 892 / 0 | 1,262 / 2 | VERIFIED: NO_NEW_FAILURES |
| 04 F-005 | `233d834d` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending |
| 05 F-006 | `5b18a3c3` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending |
| 06 F-009 | `6e6b0e34` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending |
| 07 F-012 | `73b2cbc9` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending |
| 08 F-013 | `87b795a3` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending; exact owner-named target |
| 09 F-015 | `2e559a66` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending |
| 10 F-016 | `beb83468` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending |
| 11 F-024 | `2aa00c4d` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending |
| 12 gate coverage | `674b76c5` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending |
| 13 F-003 | `7e1443cd` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending |
| 14 F-010 | `6be9c223` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending; contains F-003 |
| 15 F-023 | `b2908caa` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending; submit-adjacent, separate and last |
| 16 F-025 | `d510bc38` | — | NOT_RUN | NOT_RUN | NOT_RUN | Pending; submit-adjacent, separate and last |

## Baseline evidence

All 420 root Node files ran. There were 5,201 counted tests: 5,061 passed, 35 failed, 105 skipped, zero cancelled. Failures include missing archived external evidence and the known C37 routing mismatch; the complete names are retained in [failure-names.json](evidence-20261022/00-base/failure-names.json), rather than summarized away. Architect's two failures occur in `brain-eval-meter-wiring.test.ts`: its child clears PATH while requesting `--allow-run=git`, and Deno exits with “no path to search” before the intended meter assertions. Edge is green.

Raw logs: [Node](evidence-20261022/00-base/node.log.gz), [Edge](evidence-20261022/00-base/edge.log.gz), [architect](evidence-20261022/00-base/architect.log.gz). Commands, durations, exit statuses and uncompressed log hashes are in each matching JSON file. [File hashes](evidence-20261022/files.json). [Local runner](evidence-20261022/run-local.py); [failure comparison](evidence-20261022/compare-local.py).

Ledger: **$0 new** for this work; prior **$8.573843 recorded, UNRECONCILED**. No paid evaluation was launched.

## Step 01 — F-001

Merged `984478d2822890072f30408bd8b5d14489452c4c` cleanly with `--no-ff`; no conflict or source edit. Tested merge SHA `8133ee4d52df3da25506c0b3c6f44fc8fe6cca73`. All 421 root Node files ran in 17m44s; +3 passed, no new failures, no resolved baseline failures, identical failure diagnostics. Full Edge 892/0; active architect 1,262/2, same baseline failures. Both career-only and full generated bundles pass their source checks. **NO_NEW_FAILURES, not a green release gate.**

[Comparison](evidence-20261022/01-f001/comparison.json); raw [Node](evidence-20261022/01-f001/node.log.gz), [Edge](evidence-20261022/01-f001/edge.log.gz), [architect](evidence-20261022/01-f001/architect.log.gz); [bundle checks](evidence-20261022/01-f001/bundle-checks.json). Workday setup again failed before its assertions; the documented cleanup unblocked shutdown, preserving the skips.

## Step 02 — F-002

Merged `15057d5669755218b304687963cfb63d5ebc82b1` cleanly; Git auto-merged source and generated bundles. No manual conflict resolution. Tested merge SHA `75600f5ebaac591505b89607e112e9eb75d350d8`. All 422 root Node files ran in 17m42s; +5 passed over F-001, with unchanged failure names, diagnostics, and skips. Edge 892/0; architect 1,262/2, the same baseline failures. Both bundle source checks pass. **NO_NEW_FAILURES, not a green release gate.**

[Comparison to F-001](evidence-20261022/02-f002/comparison.json); raw [Node](evidence-20261022/02-f002/node.log.gz), [Edge](evidence-20261022/02-f002/edge.log.gz), [architect](evidence-20261022/02-f002/architect.log.gz); [bundle checks](evidence-20261022/02-f002/bundle-checks.json). All five F-002 guards pass. Workday setup remains NOT_RUN under the same documented environment limitation.

## Step 03 — F-004

Merged `94f91453` at `3017e3d793f909d4e259e8f033e5e82269fc6b02`. Tested `7f04c59968a6ea60bdc5db92a2de43298e594bbc`. All 423 root Node files ran in 16m38s. No new failure names, changed failure diagnostics, or new skips against the previous verified checkpoint. **NO_NEW_FAILURES, not a green release gate.**

[Comparison](evidence-20261022/03-f004/comparison.json); raw [Node](evidence-20261022/03-f004/node.log.gz), [Edge](evidence-20261022/03-f004/edge.log.gz), [architect](evidence-20261022/03-f004/architect.log.gz).

F-004 was source-only. The normal career-only and full build regenerated the bundles at `7f04c599`; the generated diff contains only module 142's intended goal handoff. No guarded conflict was resolved by hand. Both bundle source checks pass.

Additional checks: all 12 legacy F-004 guards pass within the Node sweep; the modern root TypeScript handoff suite passes 11/11 ([result](evidence-20261022/03-f004/modern-hook.json)). Four evidence-only compiled before/after discovery controls preserve their intent, shortlist and reply with zero measured fetch calls ([result](evidence-20261022/03-f004/request-handoff-repro.json), [reproduction](evidence-20261022/03-f004/request-handoff-repro.cjs)). These controls are separate from the Node count. The same 105 baseline skips remain NOT_RUN.
