# EDGE PDF RENDERER — module 148 lit on the Deno edge runtime (LANE F record, 2026-10-20)

Branch `work/edge-pdf-renderer`, base `bf12dbaa` (channel-rollout candidate,
75ccf5f5 lineage = live agent-chat v238). **Not deployed.**
Feature Depth Program v2, Lane F — the renderer hand-off from Lane B's
record (`channel-doc-1-record-2026-10-20.md` §5). Bug law:
BUG-PENDING-ALLOCATION (edge-pdf-renderer) + FR-PENDING-ALLOCATION
(edge-pdf-renderer) — numbers requested from Crew A per MI-093.

## The defect (Lane B §5, reproduced before any fix)

Module 148 captured `require("zlib")` at eval time. The deployed
composition is an ESM bundle with no `require` anywhere in the graph —
a posture the staged-entry guards pin as deliberate law — so on the
edge the capture is null and `renderPdf` refuses: *"zlib is unavailable
in this runtime; PDF rendering needs Node."* Every live tailor turn
therefore rendered text-only while the reply text said "attached for
your review." Reproduced on the pristine base two ways:

- Node, Deno-shaped vm realm (Buffer present, no require/module):
  `renderPdf` → `{ ok:false, reason:"zlib is unavailable…" }`.
- Deno, the real built bundle (`router_core.career.js`) through the
  real `CareerHost`, CB-0495's world: intent `career_tailor`,
  `result.artifact.pdf === null`, reply "Saved as a rendered text
  artifact."

## Why not the obvious primitives

- **A `require` shim** — Lane B tried and reverted it: it breaks the
  staged-entry invariant's letter (the handler graph links and executes
  with no `require` at all), and its async variant made bundle
  evaluation racy. Not revisited.
- **`CompressionStream`** — it exists in Deno, but it is async and the
  render API is synchronous (123 calls `renderPdf` synchronously, the
  router composes the reply in the same tick). Making 148 async would
  ripple through 123/142 and every Node harness that consumes them.
- **Chosen: a vendored pure-JS codec inside module 148** — ordinary
  source, zero imports, evaluated as part of the module like everything
  else in the bundle. The DEFLATE writer emits stored (uncompressed)
  blocks: always-valid RFC 1951, fully deterministic, and the streams
  it serves are a few KB of PDF text operators / DOCX parts. The
  inflater is a full RFC 1951 decoder (stored + fixed + dynamic
  Huffman), so parse-check reads Node-produced files too. A pure-JS
  SHA-256 rides alongside, because `artifact()`'s hash came from the
  same dead `node:crypto` capture — without it the edge artifact would
  carry bytes but a null hash, and Lane B's seam is hash-bound.

## What changed (one file of code)

`packages/domain/148-career-render.js` only, plus regenerated bundles:

- A pure-JS block at the top of the module: Adler-32, stored-block
  DEFLATE writer + zlib wrapper, a full inflate (with the stream-end
  offset tracked, so a stream sliced out of a PDF — trailing
  `\nendstream` and all — verifies exactly the way Node's zlib
  tolerates it), SHA-256, and `pureZlib` / `pureCrypto` objects shaped
  like the Node modules they stand in for.
- The captures are renamed `zlibNode` / `cryptoNode`; the names the
  renderers read are `zlibNode || pureZlib` and
  `cryptoNode || pureCrypto`. **On Node nothing changes**: the same
  platform functions serve every call, and the golden test pins the
  Node PDF/DOCX bytes to the base tree's hashes (below). The
  `if (!zlib)` refusal branches stay as defense in depth — they can
  only fire again if the fallback is removed.
- The same fallback lights the DOCX path (its ZIP writer/reader use the
  same four zlib calls) and parse-check's extractors, which is what
  lets the edge tailor turn report a truthful parse verdict.
- Bundles regenerated both modes (`scripts/build-router-core.py`,
  `--check` verified for each).

No staged-entry guard was edited; no other module was touched
(123/142/handler/host read-only).

## Proof (fail-first; baselines measured on this machine, pristine bf12dbaa)

New guards, red on the base, green on this tree:

- `tests/career-render-edge-pdf.test.cjs` — 8/8 (base: 6 red with the
  §5 refusal verbatim, 2 controls green). Covers: real PDF bytes in a
  no-require realm; independent Node-zlib extraction recovering every
  layout line; edge-realm parse-check PASS on its own PDF; pure inflate
  reading Node zlib's fixed+dynamic streams; `artifact().sha256` equal
  to the SHA-256 of the exact bytes the channel seam delivers; DOCX
  round-trip; the truth-gate refusal intact; **Node byte-stability
  golden** — PDF sha256 `89317f470703d55f7e5f763ec2e8891e83567d75b7fb30fd01ea08b281acd20e`
  (1,706 bytes) and DOCX sha256 `28f5b1dd103708ffc818dce684aee7595fd214bb8266571347603022e51daadc`
  (2,436 bytes), computed on the pristine base and unchanged after.
- `tests/edge/edge-pdf-renderer.test.ts` — 1/1 (base: red,
  `result.artifact.pdf is null`). The deployed composition end to end:
  real bundle → real CareerHost → tailor turn → artifact with non-null
  bytes; header + `/Count` page count; oracle extraction containing
  the tailored text; artifact sha256 == sha256(bytes); the reply's
  "attached for your review — parse check PASS" now true.

The staged turn's artifact, measured: **3,381 bytes** (stored-block
streams — larger than Node's 1,706 compressed bytes for the same
resume; same content, well under every size rule), sha256
`345e29c6d03e96262732d69e8e3a36b69f81568f7c5cadb7cb55c0f980952cb2`,
1 page, 29 extracted lines, first line "Alex Testcase (TEST)", skills
line recovered verbatim. The PDF contains exactly the tailored text the
turn produced — the renderer adds no content (module invariant), and
the guard diffs extraction against `layoutLines(resume)` line for line.

Sweeps, zero flips:

- Node sweep: **4,452 tests / 4,398 pass / 13 fail / 41 skipped**
  (base: 4,444 / 4,390 / 13 / 41 — delta exactly the 8 new guard tests;
  the failing test-NAME set is byte-identical to the base run: D11×5,
  D12, D13, D14×2 Chromium-env, C37×2 stale pins, fact-bank coverage ×2).
- Edge suite: **754 passed / 0 failed** (base: 753 / 0 — delta exactly
  the 1 new staged-bundle guard). The pinned staged-entry guard
  (`tests/career-bundle-reachability.test.cjs`) is in the sweep and
  stays green untouched: the handler graph still links and executes
  with no `require` at all.

## What this unblocks, and what it does not claim

CHANNEL-DOC-1's contract (Lane B) was already honest in the renderer's
absence — byte-less artifacts are dropped, nothing is claimed. With
this lane, the deployed composition produces the bytes: the same
tailor turn that today answers text-only on live v238 will carry a
real, hash-bound PDF artifact the moment a candidate containing both
lanes is composed and deployed on the owner's word. This lane does not
compose with Lane B's branch, does not deploy, and does not apply any
migration. Cross-runtime byte identity is NOT claimed: edge-rendered
PDFs differ from Node-rendered ones (stored vs compressed streams) —
each is internally hash-bound, and content equality is what the guards
pin.

One recorded imperfection: edge-rendered files are larger (a 2-page
resume ≈ 2× Node's bytes). If a future size rule ever binds, the
stored-block writer is the single seam to upgrade to a Huffman-coded
writer; the inflater already reads every block type.
