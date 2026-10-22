# FAILURES ADDENDUM — BENCH-60 (chunk 80%, 2026-10-22)

Filed by the bench lane. Both defects were MEASURED on the live TEST
worker host during chunk 80%; neither is fixed by this lane (the bench
chunk changes no product code; owners named per entry). Evidence:
`docs/apply/BENCH-60-2026-10-22.md` +
`~/workspace/bench60-harness/bench/bench60-record.json`.

## F-035 — createCareerBoardFor erases the worker's refusal reason

`supabase/functions/_shared/career_task_bridge.js`
`createCareerBoardFor` (line ~84): `try { board =
provider.boardFor(...) } catch (_) { return null; }` — EVERY coded
refusal the provider throws (WORKER_SESSION_REFUSED family:
shard_unavailable 502, SESSION_LIMIT 409, DRIVER_HOST_REFUSED 403,
WORKER_UNREACHABLE…) collapses to a null board. Downstream, 155 can
only name the stop BOARD_NOT_WIRED ("no board adapter is wired for
this posting's family") — a saturation refusal is indistinguishable
from a genuinely unwired family.

Measured: pre-flight's raw create probe (same user, same URL, same
second) answered **409 SESSION_LIMIT ×8** while the bridged path
reported only null; in the bench, 4 late legs stopped BOARD_NOT_WIRED
with 0 board calls as crashed sessions filled the cap with zombies.
The wrapper's null exists for the Deno/no-transport case (documented
in the bridge header) — but that case is distinguishable at
construction (provider factory returns null), not at call time.

Fix shape (bridge owner): let boardFor's coded error propagate, or
attach it where 155 can name it (`stop.detail.workerRefusal = code`).
Guard shape: a provider that throws SESSION_LIMIT yields a stop
naming SESSION_LIMIT, never BOARD_NOT_WIRED; the
constructed-without-transport path still yields BOARD_NOT_WIRED.
Status: OPEN.

## F-036 — a mid-drive board throw erases the whole run record

When a board call throws mid-drive (measured signature:
`elementHandle.evaluate: Target crashed` → DRIVER_ERROR), the throw
escapes module 155's per-application stop handling: the batch
executor blocks the whole intent `status: "blocked", code:
"DRIVER_ERROR"` and **no run record is saved** — no per-application
outcome, no summary, nothing for the card layer or the user to read.
One crashed page silently erases the intent's entire record.

Measured: 48 of 84 bench legs ended this way (executor result
`{status:"blocked", code:"DRIVER_ERROR"}`, `stored: null`), including
legs that had already completed 13 fills. Contrast: every
application-level failure 149 anticipates (UNCOVERED_QUESTION,
CAPTCHA_HANDOFF, caps, collisions) lands as a named stop INSIDE a
saved run record.

Fix shape (155/executor owners): catch board throws at the
application boundary in prepareRun → stopApp(DRIVER_ERROR, …) with
the fills-so-far preserved → saveRun as today. Guard shape: a board
whose fill throws mid-drive yields a completed run record whose app
is stopped DRIVER_ERROR, and the sibling applications in the same
batch still prepare. Status: OPEN.

---

## FIX ROUND (2026-10-22, branch muse/2026-10-22-bench-60-fix @ 29612cff)

Root-cause note: docs/apply/ROOT-CAUSE-BENCH60-FIX-2026-10-22.md.
Re-bench note: docs/apply/BENCH-60-RUN2-2026-10-22.md.

**F-035 — FIXED.** The bridge wrapper records
`careerBoardFor.lastRefusal`; 155's `boardOrStop` names an ANSWERED
refusal by its code with `stop.workerRefusal` carried; TRANSPORT-
family failures keep the standing BOARD_NOT_WIRED name
(loop-acceptance's permanent guard) with the code as workerRefusal
evidence. Guards: tests/career-bench60-fixes.test.cjs — "F-035: a
provider's coded refusal is recorded on the wrapper, not erased",
"F-035: 155 names the stop SESSION_LIMIT (workerRefusal carried),
never BOARD_NOT_WIRED", "F-035 boundary: a transport-family failure
(worker down) keeps BOARD_NOT_WIRED, code carried as workerRefusal",
"F-035 control: a plain null board (no provider refusal) still stops
BOARD_NOT_WIRED". Production proof (bench run 2): BOARD_NOT_WIRED
stops 0, SESSION_LIMIT stops 0 — no refusal arose because reaping
removed the saturation that produced them; the SESSION_LIMIT guard
drives the refusal synthetically against the real service.

**F-036 — FIXED.** prepareRun's per-application drive (and
completeAttestations' fresh-drive site) catch board throws at the
application boundary: stopApp named by the throw's code (or
DRIVER_ERROR) with the verbatim error and the board's
already-rendered fills preserved on the stop; the run record saves;
the intent completes. Guards: "F-036: a mid-drive crash stops the
leg DRIVER_ERROR inside a saved run; its sibling still prepares",
"F-036 (executor): the prepare intent COMPLETES and the run record
is stored". Production proof (bench run 2): run records stored
84/84, intents blocked 0, crash-class legs recorded 65/65 with
verbatim signatures (run 1: 48 records missing, 48 intents blocked).

**Reap-on-crash (the third item of the same family) — FIXED.** The
board service destroys a session at the failing call when the throw
carries a death signature (codes BOARD_CLOSED / DRIVER_TIMEOUT or
the measured crash messages); `sessionReaped` on the response makes
the sharded router drop ownership in step; non-death refusals never
reap. Guards: "reap: a Target-crashed call destroys the session at
once and frees the cap slot", "reap: DRIVER_TIMEOUT … also reaps",
"reap: an ordinary live-board refusal never reaps", "reap
(sharded): the router drops ownership on sessionReaped and the
freed slot serves a new create". Production proof (bench run 2):
the per-user cap never bound across 84 legs of sustained churn —
zero SESSION_LIMIT, zero 409-driven stops — where run 1 squatted
crashed sessions into proven 409 SESSION_LIMIT refusals.

Guard suite: 10/10, fail-first 8 fail / 2 pass on the base tree.
Neighbor family 115/115, delta +0. The bench bar itself (60 in
≤30:00 WITH cards rendered) remains unmet — doorsteps 0 in run 2 —
for the reason the run-2 note names: Chromium death under memory
pressure on the 8 GB host is now the binding constraint, and it is
a host-size decision, not a drive-path defect.
