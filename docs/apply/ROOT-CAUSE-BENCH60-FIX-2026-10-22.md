# ROOT CAUSE — BENCH-60 fix round: F-035 + F-036 + reap-on-crash (2026-10-22)

One defect family: **crash handling in the drive path.** The bench
(docs/apply/BENCH-60-2026-10-22.md) measured calibration at 2.51
prepares/min, then a cliff at minute ~5 — Chromium targets crashed
under memory pressure (host 8 GB / 2 vCPU / no swap, ~160 MB free),
and every layer above the crash mishandled it:

## 1. Reap-on-crash — the board service never learned a page died

WHY: `workers/career-browser/board-service.cjs` `callBoard` caught a
board throw, refreshed `session.lastActivityAt`, and kept the session
in the map. A session whose page crashed therefore stayed "live"
until the 10-minute idle TTL, holding its per-user cap slot the whole
time. Under a crash storm the cap (64 total, ceil(64/shards) per
shard) filled with zombies → new creates refused **409 SESSION_LIMIT**
(×8 proven by raw probe in pre-flight) → 4 in-bench legs stopped
BOARD_NOT_WIRED with 0 board calls.

WHY NOTHING DETECTED IT EARLIER: module 150's board exposes no cheap
synchronous liveness probe — a page's death is only observable at the
call that fails on it (helper response `DRIVER_ERROR` /
"Target crashed", "Target page, context or browser has been closed",
or `DRIVER_TIMEOUT`, where 150 has already killed the helper and the
page with it). The service saw every one of those throws and filed
them as ordinary board refusals.

FIX (board-service.cjs): a named death classification —
`BOARD_DEATH_CODES` {BOARD_CLOSED, DRIVER_TIMEOUT} +
`BOARD_DEATH_MESSAGE` (the measured crash signatures). In
`callBoard`'s catch, a death-classified throw destroys the session
immediately (slot freed at the crash call, not at TTL) and the
response carries `sessionReaped: true`; the caller still receives the
board's own error unchanged. The sharded router drops its ownership
entry + load count on that flag, so its counts cannot drift from the
cores. Non-death refusals (a live board declining a field) never
reap. A reaped session's next call answers the ordinary 404 — the
client board surfaces WORKER_SESSION_GONE, which module 155 already
treats as session death (resume falls back to a fresh drive).

## 2. F-036 — a mid-drive throw erased the run record

WHY: `packages/domain/155-career-batch-apply.js` `prepareRun` drove
each selected posting with **no try/catch** around
`Portal.runApply` (contrast `executeRun`, which catches per
application). A board throw (150's coded `DRIVER_ERROR`,
"elementHandle.evaluate: Target crashed") escaped prepareRun →
`batch-executor.executePrepare` never reached `store.saveRun` → the
executor blocked the intent `{status:"blocked", code:"DRIVER_ERROR"}`
with `stored: null`. 48 of 84 bench legs ended this way: no
per-application outcome, no summary, nothing for module 175 or the
user to read — one crashed page erased the intent's entire record.

FIX (155): the per-application drive in prepareRun is wrapped at the
application boundary — a throw becomes
`stopApp(DRIVER_ERROR-or-the-throw's-code, …)` carrying the verbatim
error in the stop detail (`error`) plus the fills the board had
already rendered (`fills`, from the board's own renderedValues when
it exposes them — preserved, never reconstructed), and prepareRun
continues with the next application and saves as today. The identical
catch wraps the fresh-drive `runApply` in `completeAttestations`
(same escape, same erasure, on the approve path).

## 3. F-035 — the bridge erased the worker's refusal reason

WHY: `supabase/functions/_shared/career_task_bridge.js`
`createCareerBoardFor`: `try { board = provider.boardFor(...) }
catch (_) { return null; }` — every coded refusal the provider
throws (SESSION_LIMIT 409, DRIVER_HOST_REFUSED 403,
shard_unavailable 502, WORKER_UNREACHABLE…) collapsed to a null
board, and 155 could only name the stop BOARD_NOT_WIRED. A
saturation refusal was indistinguishable from a genuinely unwired
family — measured in pre-flight: the raw create probe answered
409 SESSION_LIMIT ×8 while the bridged path reported only null.

FIX (bridge + 155): the wrapper still fails closed to null (the
contract every composition root relies on), but records the refusal
on itself — `careerBoardFor.lastRefusal = { code, message }`,
cleared at every call, set only when that call threw. In 155, a
single `boardOrStop` helper serves all three fresh-board sites
(prepareRun, completeAttestations, executeRun), and `stopForRefusal`
applies the naming rule: an **answered** refusal — the service heard
the ask and decided (SESSION_LIMIT, DRIVER_HOST_REFUSED,
FAMILY_NOT_DRIVEABLE, WORKER_AUTH_REFUSED…) — stops the application
**named by the refusal code**, with `stop.workerRefusal = code`; a
boardFor that throws a coded error directly is treated the same. A
**transport-family** failure — no answer ever arrived
(WORKER_UNREACHABLE, WORKER_TRANSPORT_TIMEOUT,
WORKER_TRANSPORT_CLOSED, WORKER_PROTOCOL) — keeps the standing
not-wired name BOARD_NOT_WIRED (loop-acceptance's permanent guard:
a down worker stops every drive BOARD_NOT_WIRED), with the
transport's code carried as `stop.workerRefusal` evidence.
BOARD_NOT_WIRED with no workerRefusal means exactly one thing — no
board adapter exists for this posting's family (no provider, no
transport, or a returned object missing 149's methods) — and the
constructed-without-transport path still yields it.

## Guards

`tests/career-bench60-fixes.test.cjs` (fail-first verified against
the base tree): crash-reap frees the cap slot immediately (core +
sharded router), non-death refusals never reap, a reaped id answers
404, DRIVER_TIMEOUT reaps; SESSION_LIMIT surfaces by name through
the wrapper into the 155 stop (workerRefusal carried), plain-null
still BOARD_NOT_WIRED; a mid-drive crash in prepareRun lands a saved
run record with the leg stopped DRIVER_ERROR (verbatim signature,
fills preserved) while its sibling prepares — at 155 level and
through the real batch executor (intent completes, record stored).
