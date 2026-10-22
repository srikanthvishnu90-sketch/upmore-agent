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
