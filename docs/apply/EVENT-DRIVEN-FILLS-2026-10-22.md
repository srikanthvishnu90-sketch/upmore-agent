# Event-driven fills — wait inventory & design (night plan chunk 60%, 2026-10-22)

Base: branch `muse/2026-10-22-event-driven-fills` off `muse/2026-10-22-session-reuse`
@ 983c5919 + helper sync b63e2fb0 (helper byte-identical to the live host file,
sha256 d59963e5…). All line numbers are that helper, `scripts/career/portal-browser-helper.cjs`,
unless named otherwise. The fill path is: 149 (decides) → 150 (board, sync
transport) → helper (Playwright, in-page). Modules 149/155 contain **no** sleeps
in the fill path (grep-verified); every timed wait lives in the helper, plus two
transport pumps in 150.

## Measured before (the cost shape)

From the F-029 Gusto drive (batch-2527bb67c68a, same helper bytes, 22 fills):
plain text fills 525–835 ms (the 450 ms settle is most of each), ordinary
widgets 1.6–2.8 s, EEO decline widgets **11,000 ms each, five of them** (the
option is token-filtered out of its own menu and only becomes matchable after
the ladder's clear-search stage at iteration 16 ≈ 8 s), two full ladder burns
at 19.0 s and 21.2 s (result null). A solo drive's ~120 s is mostly these waits.

## Wait inventory

| # | Where | Wait | Actually waits for | Class |
|---|-------|------|--------------------|-------|
| W1 | helper:1013 (cmdFill, plain) | `waitForTimeout(settleMs[attempt-1])` = 450/650/1000 ms, then ONE readback | the filled value persisting through the board's remount cycle — observable: readback equals expect | **EVENT-ABLE** → poll the readback itself until match or the same deadline |
| W2 | helper:923 (cmdFill, widget) | `waitForTimeout(450)` then one `fnWidgetValue` read | the widget's single-value rendering the pick — observable in-page | **EVENT-ABLE** → `waitForFunction` on the single-value |
| W3 | helper:570 (driveWidget) | 500 ms tick × ≤34 iterations, scan evaluate per tick | the option list rendering an option that matches (by the matcher's own classes) — observable in-page | **EVENT-ABLE** → `waitForFunction` (mutation polling) running the same scan; the staged retype/clear ladder stays, keyed to the same elapsed schedule (2.5 s / 5 s / 8 s), and a stage also advances on the menu's definitive "no options for this search" answer |
| W4 | helper:666+674 (driveWidget, post-pick) | 300 ms + up to 4×300 ms poll of the single-value | the pick landing as the widget's single-value — observable in-page | **EVENT-ABLE** → `waitForFunction` (same predicate as W2) |
| W5 | helper:973 (cmdFill, file) | `waitForTimeout(settleMs[attempt-1])` then one verification round | the attached file surviving the board's post-upload processing/remount — observable: digest readback / input state / uploaded chip | **EVENT-ABLE** → poll the same verification round until verified or the same deadline |
| W6 | helper:825,844,877 (attachFilePageLevel, recovery only) | 400 ms post-scroll; 600 ms × ≤10 ×2 rediscovery polls | a late-mounting file input appearing — `waitForSelector` (already event-driven) does the per-step waiting; the 600 ms sleeps pace re-discovery evaluates | **EVENT-ABLE (partial)** → pace re-discovery with a `waitForFunction` input-presence probe at the same total budget; the waitForSelector steps stay |
| W7 | helper:292 (cmdOpen) | `waitForTimeout(1200)` after domcontentloaded | the form's fields rendering — observable: field elements present (or a challenge) | **EVENT-ABLE** → `waitForFunction` fields-present, capped at the same 1200 ms |
| W8 | helper:310 (cmdOpen, apply-click) | `waitForTimeout(800)` after the click | the application form rendering after navigation — same observable as W7 | **EVENT-ABLE** → same, capped at 800 ms |
| W9 | helper:278 | `waitForTimeout(300)` after a failed goto | the request listener recording a redirect hop that raced the failure — a race with an in-process event listener, no page observable | **FLOOR** (300 ms, failure path only) |
| W10 | helper:284 | `waitForTimeout(3000)` before the one goto retry | retry backoff after a navigation timeout — pacing, not a condition | **FLOOR** (failure path only) |
| W11 | helper:607 | `waitForTimeout(400)` after clearing the widget search | the full option list re-rendering after the clear — subsumed by W3's scan wait (the next scan wait sees the re-rendered list) | **EVENT-ABLE** → removed into W3 |
| W12 | helper:1162/1188/1191 (cmdReview/cmdSubmitCapture) | load-state waits + 2500 ms landing settle | review/submit landing — NOT the fill path; the submit path is owner-gated and untouched by this chunk | **OUT OF SCOPE** |
| W13 | 150:448 + board-transport.cjs:67 | `Atomics.wait` 15 ms / 10 ms pumps | the sync (blocking) command transport noticing the helper's response file / worker message — no async observable exists inside a synchronous call | **FLOOR** (≤15 ms per command) |
| W14 | helper pump (bottom) | `setInterval` 25 ms command-file poll | the next command file appearing — `fs.watch` could event this, but the file protocol's rename dance + the 25 ms ceiling (≈25 ms × ~50 commands ≈ ≤1.25 s/drive worst case, ~0.6 s typical) makes it second-order; changing the transport is out of this chunk's risk budget | **FLOOR** (named; future transport work) |

Counts: 14 waits inventoried — **8 EVENT-ABLE** (W1–W8, incl. W11 folded into W3),
4 FLOOR (W9, W10, W13, W14), 1 OUT OF SCOPE (W12, a group of 3), 0 UNKNOWN.

## Design

New module `scripts/career/wait-primitives.cjs` (required by the helper;
unit-tested without Chromium):

- `pollUntil(check, { deadlineMs, intervalMs })` — run `check` now, then every
  interval until it returns a truthy verdict or the deadline passes. A check
  that throws propagates (the STALE_OBSERVATION law in the readback path is a
  verdict, not a retry signal). Returns `{ value, waitedMs, polls, timedOut }`.
- `waitForDom(page, fn, arg, { timeoutMs, polling })` — `page.waitForFunction`
  (mutation polling by default) when the page offers it; on any environment
  without it, degrades to an evaluate+`pollUntil` loop at 40 ms. Returns
  `{ fired, value, waitedMs, timedOut }`. A timeout is a RESULT, never a
  longer sleep.

Conversions (helper; WHAT is filled and every gate are untouched — only WHEN
the driver proceeds changes):

- W1/W5: the settle sleep becomes `pollUntil` over the exact readback /
  verification round that used to run once, deadline = the same settleMs
  budget for that attempt, interval 40/50 ms. Success is detected at the
  first poll that sees it (typically 0–120 ms) instead of at 450 ms.
- W2/W4: `waitForDom` on the widget single-value predicate, capped at the old
  settle/poll budget.
- W3: the scan function is extracted verbatim as `fnScanWidgetOptions`
  (same pools, same match classes, same marking) plus one addition: it
  reports `emptyMenu` when the board has rendered a "no options" answer for
  the current search and no option element exists. The drive waits on it via
  `waitForDom` per stage; stages (full → segment retype → word retype →
  clear search) keep today's elapsed schedule and today's action conditions
  (never retype while the option service is loading); a stage ALSO advances
  early on `emptyMenu` — the board has definitively answered that this
  search yields nothing, which is the only new signal, and it changes when
  a stage starts, never what a stage does or what may be picked.
- W6: the 600 ms pacing sleeps become a `waitForDom` input-presence probe
  (same ~6 s per-loop budget); the chip early-return checks stay per pass.
- W7/W8: `waitForDom` fields-present at the same caps.

Every converted wait records `{ name, outcome, ms }` into a `waits` array on
the fill/open result: outcome `event` (the observable fired), `timeout`
(budget exhausted → the ladder's previous behavior follows — re-fill, next
stage, or the not-mounted verdict, exactly as before), or `ladder` (kill
switch). Module 150 logs the array into its driverLog `fill` entry, so a
timeout is a named event in the run record.

Kill switch (named config data): env `UPMORE_EVENT_WAITS` — unset/`all`
= event-driven everywhere; `off` = every converted wait runs its old ladder
form; a comma list (`widget_option,persist_verify,…`) forces only those
waits back to the ladder. Read once at helper start; the helper's env comes
from the board service, so an operator flips it in the service config and
restarts — no code change.

Wait names: `persist_verify` (W1), `file_verify` (W5), `widget_option` (W3),
`widget_value` (W2+W4), `file_mount` (W6), `open_render` (W7+W8).

## Results (measured 2026-10-22, same posting, same TEST profile, service path)

Posting: Gusto — Finance Intern (Summer 2027), Greenhouse
(`greenhouse:https://job-boards.greenhouse.io/gusto/jobs/8257115`), TEST user
`b2625909-d67f-41b2-8270-983d212c6052`, prepare-only, flag OFF, zero submits.
Harness: production executor (155) → board service :8471 → real page
(`~/workspace/event-fills-harness/run-live-gusto.cjs`).

- BEFORE (ladder code): run `batch-b57cfae3fd75` — drain 119,294 ms; 22 fills;
  fill sum 113,915 ms; median 1,544 ms; p90 11,363 ms.
- AFTER (event-driven, host-applied): run `batch-b6a60c430b43` — drain
  96,325 ms (−22,969 ms, −19.3%); 22 fills; fill sum 91,200 ms (−19.9%);
  median 1,787 ms; p90 9,569 ms (−16%).
- Fill equivalence: `answers()` after the after-drive is BYTE-IDENTICAL to
  the before-drive's (20 keys) — the widget-attach acceptance pattern, on
  the real form, through the service. Final stop identical in both runs:
  UNCOVERED_QUESTION on the owner's class-(c) questions (no fact invented).
- The chunk bar (median ≤ 4 s with identical answers) is MET: 1,787 ms.
  The overall median ticked UP vs before (1,544 ms) — an order statistic
  on a bimodal 22-fill set; the per-class reads are the honest picture:

  | class | before median | after median | note |
  |---|---|---|---|
  | plain fills (8) | 547 ms | 122 ms | −78%: the 450 ms settle no longer floors every fill |
  | EEO widget fills (5) | 11,010 ms | 9,377 ms | −15%: verify waits fire on event; the rest is stage patience (below) |
  | other widget fills (5) | 1,544 ms | 1,787 ms | mixed: 1505→346, 1465→293 faster; country 2171→2670 and one question 1544→2155 slower — the board's option-service latency, which the waits now track, varies ±1 s run to run (isolated country re-drive: 1,441 ms total, waits fired at 15/9/5 ms) |
  | never-matching widgets (2, null both runs) | 20,925 / 19,369 ms | 13,772 / 18,736 ms | same null verdicts; 608 −34% via emptyMenu stage advances |

- Wait outcomes are recorded per fill: e.g. the isolated country drive's
  driverLog fill entry carries `waits: [{widget_option, event, 15},
  {widget_value, event, 9}, {widget_value, event, 5}]`, exposed on the
  board as `fillWaits` (getter + `fillWait(fieldId)` method, the
  renderedValues discipline).

### What remains FLOOR, and why

- Never-matching widgets burn the stage budgets [2.5 + 2.5 + 3 + 9 s]:
  that total IS the ladder's patience, preserved by design — the waits
  now time out NAMED in the record instead of ticking, but no event
  exists that could shorten a search the board never answers.
- EEO decline picks (~9.4 s): typing the wanted text token-filters the
  decline option out of its own menu, so the match can only render
  after the clear-search stage — board filter semantics, not a sleep.
  Stages 1–3 wait on the observable and time out named.
- W9/W10/W13/W14 from the inventory (request-listener race, goto retry
  backoff, sync transport pumps, command-file pump): inherently timed,
  unchanged.

### F-032 — the defect this chunk found and fixed in itself

The first host-applied after-drive failed EVERY widget fill with
`fill_error:DRIVER_ERROR — "Unknown polling option: mutation"`:
`waitForDom` passed `polling: "mutation"` to `page.waitForFunction`,
which the installed Playwright rejects (mutation observation is its
default; the option accepts only `"raf"` or a number). The unit fakes
had accepted any polling value, so the suite was green while the real
driver threw. Fix: no polling option is passed (a caller-supplied
value is forwarded only when it is `"raf"` or a number). Permanent
guard: two strict-fake tests in `tests/career-event-waits.test.cjs`
model the real validation — verified fail-first (old line: 10/12,
both new tests failing with the production error; fixed: 12/12).
Ledger: `docs/apply/FAILURES-ADDENDUM-EVENT-FILLS-2026-10-22.md`.
The failed drive also surfaced a symptom worth recording: with the
country fill dead, 149's observation gate stopped on
ANSWER_OBSERVATION_MISMATCH (observed "+1") — the FR-395 hatch had no
renderedValue to compare because the fill never landed. With the fix,
the same drive records renderedValue "+1" and proceeds, exactly as
the ladder drive did.
