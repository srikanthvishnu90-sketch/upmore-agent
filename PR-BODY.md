# MUSE-F-011 — tailor render throws ReferenceError: Buffer is not defined on the edge runtime

**FAILURES ID:** MUSE-F-011 (root-cause note filed in FAILURES.md on PR #143's branch).

On the live bot, every tailor turn that reached render threw `ReferenceError: Buffer is not defined` — module 148 read the bare Node `Buffer` global in ~30 places and the Supabase Edge Runtime (Deno 2.1.4) has no such global — so the router contained the turn and the user got "Something went wrong on my end". This branch fixes only module 148's byte layer: one module-local byte helper over `Uint8Array`/`DataView` routes every bare-`Buffer` site (the platform `Buffer` is used where it exists, so Node-side bytes and the render tests' golden hashes are unchanged), no other module's behavior changes, and the router bundles are regenerated. Measured delta: the three new fail-first guards fail on the base tree with the live signature and pass on this branch, the full edge suite goes 769 passed / 3 failed → 772 passed / 0 failed, and the node sweep's failing set is unchanged from the known base set (below).

Pre-fix stack (verbatim):

```
ReferenceError: Buffer is not defined
  at router_core.career.js:337:4661
  via handleTailor → tailorResume → render → renderPdf
  source: packages/domain/148-career-render.js:542
```

## What changed

- `packages/domain/148-career-render.js` — the byte layer only: a module-local `ByteBuf` (`Uint8Array` subclass with `DataView`-backed reads/writes and manual latin1/base64/hex/utf8 codecs) behind `const Bytes = typeof Buffer !== "undefined" ? Buffer : ByteBuf;`; every bare-`Buffer.` site routed through it. The module's law stands: no require, bundle-legal primitives only. No change to 123/142/155 (or 124).
- `supabase/functions/_shared/router_core.js`, `router_core.career.js` — regenerated with `python3 scripts/build-router-core.py` (both modes).
- Guards (fail-first, permanent):
  - `evals/gauntlet/replays/live-failures.json` — fixtures F-011-T1 (named posting: "tailor my resume for the Junior Software Engineer role at PolicyMe", Alex Testcase profile, 15 confirmed facts) and F-011-T2 (tonight's pasted-posting entry shape).
  - `tests/edge/live-replays.test.ts` — new `career_tailor` kind: spawns `tests/edge/lib/career-replay-child.ts`, a fresh Deno process that removes `globalThis.Buffer` **before** importing the staged bundle, then asserts intent `career_tailor`, not contained, artifact pdf present.
  - `tests/edge/edge-pdf-renderer.test.ts` — render-level guard: `tests/edge/lib/render-shadow-child.ts` evaluates module 148's source in a Buffer-shadowed realm and renders the fixture resume (module 123's frozen output, `tests/edge/lib/fixtures/tailor-resume-policyme.json`), asserting `%PDF-` bytes and `parseCheck` ok.
- `docs/instinct-spec-series/BUILD-STATUS.md` — claim line (house rule).

## Measured verification (base `6b6551cf` + the same guard files, vs this branch; same invocations)

| Check | Base + guards | This branch |
|---|---|---|
| Guard files: `deno test -A --no-check tests/edge/live-replays.test.ts tests/edge/edge-pdf-renderer.test.ts` | 22 passed / **3 failed** | **25 passed / 0 failed** |
| Full edge suite: `deno test -A --no-check tests/edge/` | 769 passed / 3 failed | **772 passed / 0 failed** |
| Router-bundle tests: `node --test tests/router-bundle.test.cjs` | 3 passed / 0 failed | 3 passed / 0 failed |
| Bundle freshness: `build-router-core.py --check` (both modes) | verified | verified |
| Node sweep: `UPMORE_CHROMIUM_SANDBOX=off node --test tests/*.cjs` | 4,530 tests · 4,481 passed · 8 failed | 4,530 tests · 4,481 passed · 8 failed — failing set identical, name for name |
| Career-render node tests (golden PDF/DOCX hashes) | 38/38 | 38/38 |

The 3 base failures are exactly the new guards, with the live signature: both replay turns contained with reply "Something went wrong on my end…", and the render child dying `ReferenceError: Buffer is not defined`. The unshadowed staged-bundle render test passes on base — Node and local Deno 2.9.7 expose a `Buffer` global and mask the defect; only the shadowed realm reproduces production.

The node sweep's 8 base failures are the known, pre-classified set (PR #147 base-repair) and are unchanged by this branch: the answer-map pair (MUSE-F-007, product-real: `application_answer`/`application_text` fact kinds have no consumer on this branch), the C37 pair (test-rot), the v242-live-gaps trio (their harness requires `--experimental-vm-modules`; the file never adopted the sibling self-respawn idiom), and `tests/career-extension-sync.test.cjs` failing only in sweep context (passes standalone). This branch does not touch any of them.

## Notes

- The PolicyMe Junior Software Engineer JD text is not in this repo (workspace-wide search found no JD row for it); fixture F-011-T1 carries a synthetic stand-in JD labeled as such in its own `jd_text`. The defect is in the render byte layer and is JD-independent. F-011-T2 uses tonight's pasted-posting shape as the product actually accepts it: a quoted posting paste (module 142 stages pasted postings from quoted blocks, BUG-173 behavior) followed by "tailor my resume for this posting" — the fixture's `reasons` field documents this.
- Not deployed. PR opened by the parent lane.
