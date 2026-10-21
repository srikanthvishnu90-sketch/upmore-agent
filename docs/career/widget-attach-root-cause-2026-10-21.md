# Widget / attach / readback — root-cause note (2026-10-21)

Lane: `muse/2026-10-21-widget-attach` (owner order 2026-10-21 16:00 CDT —
the 16:30 card and tonight's drives sit behind this). This note precedes
the fix, per the loop. Scope = the helper/widget layer only
(`scripts/career/portal-browser-helper.cjs`, and module 150's use of it).
NOT this lane (already fixed elsewhere, not redone): decline vocabulary
(gate-side, `muse/2026-10-21-decline-vocab`), FR-395 rendered-values
carriage (live on host 15:53), worker-recovery transport retry (live).

## Symptoms (measured, live, 2026-10-21)

1. **Attach (Greenhouse/Gusto, jobs/8257115):** in the production
   composition the resume fill returns null and the post-drive
   file-truth readback shows NO resume attached; EEO field 608 and one
   location question also read back null (board-config lane,
   `~/workspace/board-config-2026-10-21/proof-drive.jsonl`: fills
   resume / question_69649390 / 608 = ok:false; drive terminal
   ANSWER_OBSERVATION_MISMATCH).
2. **Readback death (Lever/Palantir SWE NY, TWICE):** the answers
   readback dies at exactly 30,044 ms — "browser helper did not answer
   'readback' in 30000ms; helper terminated" (runs batch-e574fa54e1f8,
   batch-d3751f856a8c). Run 2's field set had NO EEO section, so it is
   not EEO-specific. Palantir FDSE Chicago's readback completed on the
   same stack minutes earlier.
3. **Widget fills:** react-select fills burn a 500 ms × ≤34 poll ladder
   (~80% of fill time is fixed waits — dropdown-measure +
   throughput-infra lanes); decline picks land at derived poll depth
   ~17–20.

## Experiments run for this note (live pages, TEST user, flag OFF, 0 submits)

- **Raw page-truth probe (Gusto):** attach the TEST DOCX to the live
  page's `#resume` input exactly as the helper does (handle
  `setInputFiles`, buffer form), then poll 25 s. The file PERSISTS —
  same node, `files.length` 1, correct filename, including after a
  later text fill. The page does not drop a plain attach.
- **Isolated stack repro (module 150, resume-only fill):** fill
  verified on attempt 1 (~0.6 s quiet, ~1.2 s under 6× CPU load);
  `answers()` shows the resume with the correct sha256.
- **Full-drive-shape repro (module 150, the proof drive's 18 fills in
  order):** the production shape REPRODUCES — **resume FAILED**,
  **608 FAILED after 76.5 s**, **610 FAILED after 17.2 s**, the other
  EEO widget fills took 11–17 s each; `answers()` = resume null,
  608 null (250 s total). The trigger is the drive context, not the
  attach itself.
- **Readback decomposition (module 150, NO fills, instrumented
  helper):** FDSE `answers()` = **23,449 ms** (29 bindings) with **103
  full field-discovery page scans summing 21,367 ms**; SWE NY
  `answers()` **THREW DRIVER_TIMEOUT at 30,009 ms** after 13 of 20
  bindings, **121 full scans summing 27,623 ms**. One checkbox group
  (`language_skill_s…`, ~60 options) cost **14.9 s / 16.1 s** of
  readback on the two pages. The production failure reproduces
  deterministically on a quiet host.

## Root cause 1 — readback death: a full page scan per ref check

`connected()` (portal-browser-helper.cjs) validates every element ref
before every use: node-connected check PLUS a field-meaning check that
runs a **complete `fnDiscoverFields` DOM scan of the whole page**
(`board.page.evaluate(fnDiscoverFields, true)`) and compares the field
found by selector against the observation-time metadata. Every
readback binding pays it once per element ref — and a radio/checkbox
GROUP pays it **once per option** (`readbackBinding` loops
`connected()` over every option). A single `answers()` therefore runs
**100–225 full scans** (measured); at ~200 ms per scan on a heavy
Lever page the readback needs 25–50 s against module 150's 30 s
readback cap (`answers()` in 150-career-portal-browser.js calls
`call(boardId, {type:"readback", …}, 30000)`), and on timeout 150
**kills the helper process** — the session and its state die with it
("submit outcome must be reconciled"). FDSE vs SWE NY is arithmetic,
not a different bug: FDSE's scan bill came to 23.4 s (under the cap by
luck), SWE NY's crossed it. Host load multiplies the per-scan cost
(the day measured an authenticated no-op probe at p99 27.9 s during a
drive), which is why the same shape passes and dies across windows.
The same per-ref scan tax is paid inside every fill's verify loop
(fill → settle → verify per attempt), inflating all fills toward
their caps.

**The fix (helper):** the meaning check needs ONE consistent fresh
scan per command, not one per ref. `execute()` opens a per-command
snapshot; `connected()` compares against that single snapshot;
`reresolveBinding()` forces one fresh scan and replaces the snapshot.
Semantics preserved: every ref in a command is still judged for
connectedness (per-ref, live) and for meaning (against a scan taken
at command start — fresher than the observation-time baseline the
protocol already tolerates). A readback drops from ~100–225 scans to
1–2.

## Root cause 2 — attach: remount + identity-blind recovery + stale verify

From the instrumented full-drive run, the exact chain:

1. The handle attach SUCCEEDS (`file_handle_attach_ok`, attempt 1).
2. Within the 450 ms settle, Greenhouse's post-upload reconciliation
   (the resume-parse/autofill re-render that fires in the real drive
   shape, where identity fields are already filled) **replaces the
   file input node**; the live `#resume` input is empty
   (`file_presence_probe #resume → false`). A file input's File cannot
   survive node replacement — the attach is genuinely gone, and the
   fill's verify honestly sees STALE_OBSERVATION.
3. Recovery then goes wrong two ways:
   - `rediscoverFileSelector()` returns the **first**
     `input[type="file"]` in the document — identity-blind. In the
     remounted DOM that was **`#cover_letter`** (debug log, attempt
     2): the ladder aims the resume at the wrong field.
   - The fill's verify uses `readbackBinding` (the non-re-resolving
     form), so after any re-attach it still reads through the stale
     observation refs, throws STALE, and falls back to a presence
     probe keyed on whichever selector the ladder last touched —
     never a digest of the file on the resume input itself.
4. Three attempts burn in this loop → `{filled:false}` → module 150
   records the resume fill as failed (the production "fill returns
   null"), and the final readback (whose `reresolveBinding` matches
   **by exact selector only**) cannot reliably find the live resume
   input after an id-changing remount either.

**The fix (helper):** identity-true file handling end to end —
rediscovery matches the binding's OWN field (exact id → exact name →
label/group match; a cover-named candidate is hard-excluded for a
resume binding and vice versa); the fill verify re-resolves like
every other verify (`readbackBindingFresh`) and digests the live
resume input's actual bytes; `reresolveBinding` gains the same
identity fallback for file bindings so `answers()`/`verify_payload`
read the live input's truth (attached digest or absent — never a
neighbour field's file).

## Root cause 3 — widget drive latency: timeout stacking on one ladder

driveWidget's patience is its 34-rung poll ladder (~17 s), but its
per-action Playwright calls carry their own 20 s actionability
timeouts (initial click / fill / type, plus 8 s retype actions). On a
widget that never becomes actionable (collapsed/covered EEO section),
one drive stacks ~20+20+20 s of action waits on top of the ladder —
the measured 76.5 s for field 608 — and module 150's stale-retry can
then drive it a second time. Successful EEO fills still pay 11–17 s:
fixed 500 ms quanta mean a pick is only ever noticed on the next tick.

**The fix (helper):** one patience budget per drive — per-action
timeouts bounded to 8 s (the ladder supplies the waiting), and the
poll quantum drops to 200 ms with rung triggers converted to the
SAME wall-clock thresholds (retype ≥2.5 s, first-word ≥5 s,
clear-search ≥8 s, ceiling ≥17 s), so option picks land when they
render instead of on a 500 ms grid. The option matcher, its strength
order, and decline-class handling are byte-identical — vocabulary is
the decline lane's, not this fix's.

## What this fix does NOT change

- Module 150's caps (readback 30 s, fill 60 s) — with the scan tax
  gone, a Lever readback is ~1 scan + per-binding reads, comfortably
  inside the existing cap; raising caps would have hidden the defect.
- Decline/option matching semantics, FR-395 carriage, transport
  retry, the submit arming path — untouched.
- Readback value semantics (e.g. empty-group `[]`, name-pair `" "` —
  QA's BUG-QA-2026-10-21-02) — a separate filed bug, not this lane.

## Fail-first evidence (recorded before the fix)

- SWE NY no-fill readback: DRIVER_TIMEOUT at 30,009 ms (121 scans /
  27.6 s of scanning) — deterministic on a quiet host.
- FDSE no-fill readback: 23,449 ms (103 scans / 21.4 s of scanning).
- Gusto full-drive shape: resume FAILED, 608 FAILED (76.5 s),
  610 FAILED (17.2 s); answers resume/608 null.
- New fixture suite (tests/career-widget-attach.test.cjs) asserts the
  scan count per readback, the wrong-node attach trap, and the
  never-actionable widget budget — all red on the pre-fix helper.
