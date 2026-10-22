# SESSION REUSE — prepare → approve in ONE drive (night plan chunk 50%, 2026-10-22)

## The measured problem

Every application is driven TWICE end-to-end: once at prepare, once after
approval. A solo drive costs ~157–171s of board time (measured 2026-10-21:
163.3 / 157.4 / 170.7s), and drives serialize on the board service (probe
p99 27.9s during a drive vs 23–39ms idle), so the second drive is the
single largest throughput cost in the apply path.

## Lifecycle root cause (file:line, host tree @ 2026-10-22 00:5x CDT)

The filled browser page itself does NOT die at prepare end — the client
handle to it does, at three seams:

1. **The board service keeps the session; nobody records its id.**
   `workers/career-browser/board-service.cjs` holds each module-150 board
   (and its Chromium page, filled, sitting at the final review) in its own
   long-lived process, keyed by a 128-bit session id, with a 10-minute
   idle TTL (`DEFAULT_TTL_MS`, refreshed per call; operator config sets
   no override). Nothing closes the session at prepare end.
2. **Module 155 keeps sessions only in process memory.**
   `packages/domain/155-career-batch-apply.js`: `RUNTIME` (line ~141) is
   an in-process `Map`; the header states the design: "Sessions are
   runtime only; on the execution turn they are rebuilt and re-prepared."
   The run object — the only thing that crosses invocations (pure JSON,
   stored via `career_batch_run/v1`) — carries per-app only
   `payloadSha256`; the doorstep payload itself is dropped by
   `absorbPrepareResult`. `executeRun`'s rebuild branch (line ~510)
   therefore has no choice: fresh board, full `runApply` re-drive,
   MI-116 hash-compare as the only continuity check.
3. **The bridge provider can only CREATE sessions.**
   `supabase/functions/_shared/career_task_bridge.js`
   `createWorkerBoardProvider.boardFor(posting)` always POSTs
   `/board-sessions` (a new session) and returns a client board carrying
   `workerSessionId`. There is no way to construct a client board bound
   to an existing session id.

And the two production invocations are always separate processes:
`workers/career-browser/batch-executor.cjs` is a oneshot drain
(timer 20s) — the prepare intent and the approve intent never share a
process, so seam 2 fires on every real approval. Seam 2 fires a second
time inside the approve drain for attestation-pending applications:
`completeAttestations` also builds a fresh board and re-runs `runApply`
(their prepare session — filled, waiting only on the certification —
is likewise orphaned).

Why the page can't simply be re-opened: module 150's `open()`
(portal-browser `open`, helper `cmdOpen`) navigates to the posting URL —
on a filled form that reloads the page and destroys the fills. Reuse
must address the live session WITHOUT calling `open()` again.

## The mechanism (smallest general shape)

Persist the session binding on the run record at prepare, resume it by
id at approve, and verify — never trust — before any further step:

- **155 (prepare):** for every app whose drive created a board session,
  record `app.boardSession = { sessionId, atsFamily, host, preparedAt,
  expiresAt }` (sessionId = the client board's `workerSessionId`), and
  for doorstep apps also `app.doorstep = { payload, payloadSha256 }`
  (the exact payload the card shows — the same data `service.cjs`
  already stores in its review record). Bindings are recorded for
  doorstep AND awaiting_attestation apps (both hold live filled pages).
  The session id is session material: it appears ONLY in the
  user-scoped run record — never in events, logs, or summaries (155
  events record `{ resumed: true, via: "session_reuse" }`, never the
  id). Usefulness boundary: the id is worthless without the board
  secret (host env only) AND the owning userId (the service refuses
  cross-user addressing 403) AND the session's own idle TTL.
- **Bridge:** `boardFor(posting, opts)` — `opts.resumeSessionId`
  constructs the same client board WITHOUT a create call, bound to the
  existing id (declared family/host come from the binding; the service
  still enforces ownership on every call). No opts → today's behavior,
  byte-for-byte.
- **149 `resumeApply(session, input)`** — the verification-only resume
  for doorstep apps. Same binding checks as `runApply` (session user,
  target rules, board attestation, family match, duplicate, caps), then
  WITHOUT `open()`:
  1. the stored doorstep must be internally consistent
     (`sha256(JSON.stringify(payload)) === payloadSha256`, else
     `SESSION_BINDING_INVALID`);
  2. `form()` must expose every field the payload carries (else
     `SESSION_STATE_MISMATCH`);
  3. the live payload is rebuilt by the SAME `buildPayload` MI-116
     uses (session preparation state seeded from the stored payload)
     and its hash must equal the stored hash (else
     `SESSION_STATE_MISMATCH` with changed/added/removed fields);
  4. `atReview()` must still report the final review (captcha →
     `CAPTCHA_HANDOFF`; a code → that code; not-at-review →
     `SESSION_STATE_MISMATCH`).
  Board throws carrying session-death codes (SESSION_EXPIRED /
  WORKER_SESSION_GONE / WORKER_SESSION_FORBIDDEN / BOARD_CLOSED)
  become blocked `SESSION_NOT_LIVE`. On success the session's doorstep
  is set exactly as prepare sets it and the result is
  `{ resultStatus: "prepared", resumed: true, doorstep }` —
  `submitDoorstep` downstream is untouched and re-verifies the live
  payload hash itself at click time (MI-116), so resume adds no trust
  the submit gate does not re-check.
- **149 `continueApply(session, input)`** — for awaiting_attestation
  apps: `prepareRound(session, input, continued=true, …)` — the
  existing multi-round continuation entry (it skips `open()`), so the
  certification fill lands on the SAME live page. No new session, no
  re-navigation.
- **155 (approve):** in `executeRun`'s rebuild branch and in
  `completeAttestations`, when a binding exists and is inside its
  window (`now < expiresAt`, where the window mirrors the service's
  idle TTL — the service's 410 remains the hard gate), try the resume
  first. Fallback discipline: `SESSION_NOT_LIVE`,
  `SESSION_STATE_MISMATCH`, and `SESSION_BINDING_INVALID` — and only
  those — discard the resumed board (closed best-effort) and fall back
  to today's fresh drive, with a `session_resume_fallback` event naming
  the code. A captcha, a cap, or any other named stop is the run's
  result, exactly as a fresh drive would produce it — never a fallback
  trigger. A stale or mismatched session is never filled on and never
  forced.

Multi-tenant by construction: the binding lives on the user's own run
record, the service enforces per-user session addressing, and 149's
session-user check runs before any board call. There is no cross-user
or cross-run path to a session id.

## Window

Reuse covers approvals that land within the board service's idle TTL
(10 minutes from the prepare drive's last board call). Later approvals
take the fresh-drive fallback — named, measured, and unchanged from
today. Extending the window is an operator decision (service TTL +
Chromium memory), not taken here.

## Measurement plan (TEST world, FDSE, solo drives)

- BEFORE pair (current host code): prepare drive (production executor
  harness) + approve-leg drive in a FRESH process performing exactly
  `executeRun`'s rebuild (fresh board + `runApply`), timed per leg,
  fills counted from the board-call log.
- AFTER pair (new code host-applied): prepare drive + approve leg in a
  fresh process performing exactly the new `executeRun` resume
  (`boardFor(posting, { resumeSessionId })` + `resumeApply`), timed,
  fills counted (expected: 0).
- The submit click itself is identical in both worlds and is never
  driven in the TEST world (zero submits); `executeRun`'s integration
  (resume → `submitDoorstep` on the resumed session, fallback on
  mismatch/expiry) is proven in unit tests on board doubles.
