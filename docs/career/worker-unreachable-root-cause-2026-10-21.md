# WORKER_UNREACHABLE — root-cause note (2026-10-21)

Lane: `muse/2026-10-21-worker-recovery` (owner ruling 2026-10-21 14:26 CDT;
this note precedes the fix, per the loop). Second workstream on this branch:
FR-395 rendered-values carriage (sequenced after this note).

## Symptom (measured, form-inventory lane, 2026-10-21)

Two live scan runs against the production board service (127.0.0.1:8471),
pattern create → open → form → answers → close, serial, via the production
executor composition (`boardForFor` → `createWorkerBoardProvider` → sync
pump transport):

- run 19:07 UTC (gauntlet user): 3 of 9 attempts failed `WORKER_UNREACHABLE`
  ("the career worker board service could not be reached (fetch failed)"),
  at 17.9s / 23.1s / 25.5s; successes at 9.7–16.6s.
- run 19:11 UTC (TEST user): 4 of 10 failed, at 10.6s / 24.4s / 19.2s /
  24.9s; successes at 9.8–18.9s.
- Total 7/19 = 37%. Earlier the same code killed one drive mid-fill under
  concurrency (throughput lane; board NRestarts=0; root cause never run).

## What the code is

`WORKER_UNREACHABLE` is a **client-side verdict**, thrown in exactly one
place: `workers/career-browser/board-transport.cjs:61` — when the fetch
pump's `fetch` rejects. `supabase/functions/_shared/career_task_bridge.js`
(the provider) then makes it **terminal for the session** (`call()` at
~:263: a transport throw is cached and every later call rethrows it — a
session is never silently recreated), and nothing at any seam retries a
session create.

## Ruled out (measured)

- **Service death.** The board service process (PID 16223) ran continuously
  through both scan windows; `NRestarts=0`; the journal shows no stop/start
  after its 17:46:46 UTC start. "Unreachable" was never a dead server.
- **Deterministic refusal.** Refusals (401 / DRIVER_HOST_REFUSED /
  FAMILY_NOT_DRIVEABLE / SESSION_LIMIT) return as HTTP responses, not fetch
  rejections; the same postings succeeded on neighbouring attempts.
- **Raw network / service health.** A raw-fetch replica of the scan pattern
  (create/open/form/answers/close, same postings, same service): **10/10
  OK**. The full production client stack, serial, on today's quieter host:
  **20/20 OK** (opens 4.8–6.8s). Two concurrent production-stack drivers:
  **20/20 OK**, with contention inflation visible (opens to 12.6s, one
  scan total 21.0s).

## The chain (each link measured)

1. **One shared helper, shut down by every last close.** All sessions in
   the board service share one module-150 factory and one browser-helper
   process. `packages/domain/150-career-portal-browser.js` — `close()`
   (~:706): when the last live board closes, the module sends the helper
   `{type:"shutdown"}` and drops it. A serial pattern therefore pays,
   inside the *next* session's `open()` call: helper spawn + ready wait
   (cap 20s, `ensureHelper` ~:342) + Chromium cold launch (median 6.25s
   measured by the board-session lane on a quieter host) + navigation
   through the egress relay. Evidence from the scan window itself: at
   19:10 UTC the service logged `MaxListenersExceededWarning: 11 exit
   listeners added` — `ensureHelper` registers one `process.on("exit")`
   listener per spawn and never removes it, i.e. the helper had already
   respawned ≥11 times inside the one service process.
2. **The service serializes everything behind that latency.** The board
   service core is one synchronous `handle()`; a board call blocks the
   service's event loop in 150's `Atomics.wait` bridge for the call's full
   duration. The throughput lane measured an authenticated no-op probe at
   p99/max **27.9s** during a drive (idle: 23–39ms). During the scans,
   several clients shared the service (executor composition runs, the
   resume lane's board acceptance, the scans themselves), so individual
   calls stretching to tens of seconds was the operating condition, not
   an anomaly.
3. **The pump transport loses long calls under load — fatally.** Controlled
   delay test, responder in a separate process: main-thread `fetch`
   carried 20s and 30s responses cleanly. The production pump
   (`board-transport.cjs` + `board-transport-worker.cjs`) killed every
   response delayed 26s / 30s / 45s at **25.0s ± 20ms** with
   `WORKER_UNREACHABLE` ("other side closed"), while carrying a 20s
   response. A plain worker-thread fetch (no MessageChannel /
   `receiveMessageOnPort` composition) carried 30s cleanly; and the same
   pump carried 30s calls in every shape (fresh / reused / first / third
   request) once the host was quiet. So the ~25s ceiling is a
   **load-sensitive property of the pump composition on this runtime**
   (Node v24), not a configured timeout — the transport's own configured
   timeout is 120s and never fires. The failing production scans cluster
   at that ceiling (24.4s / 24.9s / 25.5s ≈ one ~25s call plus a fast
   create). Residual gap, labeled honestly: the scan records lump all
   sub-calls into one outcome, so the shorter failures (10.6–23.1s)
   cannot be attributed to a specific sub-call after the fact; they are
   consistent with the same load-sensitive transport failing earlier
   under heavier contention, but that is not separately proven.
4. **No recovery exists anywhere.** A lost create fails `boardFor`
   outright; a lost call poisons the session terminally. One flake = one
   dead application attempt — and in the executor's serial drain, a
   stalled queue.

## Root cause (one line)

A serial session pattern pays a full browser-helper cold start inside a
single board-service call because the last board's close kills the shared
helper; under ordinary multi-client load those calls stretch past the
point where the synchronous pump transport intermittently loses them, and
with no retry at any seam the loss surfaces as `WORKER_UNREACHABLE` and
kills the session.

## The fix (this branch; detailed in the lane report)

- **150 lifecycle:** last-close starts a 90s idle grace (cancelled by the
  next create) instead of an immediate helper shutdown; the helper's own
  15-minute idle self-exit stays as backstop; the `exit` listener is
  registered once per factory, not once per spawn; a dead helper handle
  is detected and respawned instead of stalling the next call to its
  timeout.
- **Provider create retry (the session-create seam only):** `boardFor`
  retries **only** `WORKER_UNREACHABLE`, bounded — 4 attempts, backoff
  0.75s → 1.5s → 3s with jitter, 30s total deadline, injectable sleep
  for tests. Answered refusals (`DRIVER_HOST_REFUSED`,
  `FAMILY_NOT_DRIVEABLE`, `WORKER_AUTH_REFUSED`, `SESSION_LIMIT`) and
  `WORKER_TRANSPORT_TIMEOUT` are never retried. Board calls are never
  retried — the terminal doctrine stands, because a lost call response
  is ambiguous by definition. (Ladder amended same-day from 1s → 3s →
  9s: the batch-delegation down-service proof showed a long ladder is
  paid once per application by a whole batch before it can name the
  worker down — 15 applications × ~13s breached its 180s budget. The
  retry's job is seconds-scale contention on a live service; a dead
  worker belongs to the executor's next tick.)
- **Proof:** fault-injection tests over the real HTTP stack (flaked
  create recovers end-to-end; refusals attempted exactly once; a
  mid-sequence call flake still terminates the session — the boundary),
  plus a live re-run of the scan pattern on the fixed stack.

## Live-application boundary

The retry is client-side (executor composition); the lifecycle fix is
service-side (module 150 in the service's tree). This lane does **not**
mutate the running 8471 service or the live worker config; both changes
are staged and itemized in the lane report for the 15:00 board-config
step to apply.
