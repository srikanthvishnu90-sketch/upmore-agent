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

## Build + guard results (2026-10-22)

Built as designed above: 149 `resumeApply` + `continueApply`, 155
binding record + resume-first seams, bridge `boardFor` resume option
(shared `boardFromSession` constructor). Commit `9f12507f` on
`muse/2026-10-22-session-reuse`, pushed + ls-remote-verified.

- New guard `tests/career-session-reuse.test.cjs`: **13/13 pass**;
  fail-first on the pre-change sources: **0/13** (every test red).
  Coverage: resume happy path (zero opens, zero fills, submits
  through the resumed session); tampered stored payload refused
  BEFORE the board is addressed; drifted live value refused with the
  changed field named; dead session → SESSION_NOT_LIVE; cross-user →
  SESSION_USER_MISMATCH with the board unread; captcha at review →
  CAPTCHA_HANDOFF and explicitly NOT a fallback code; page not at
  final review → SESSION_STATE_MISMATCH; 155 binding record (TTL
  stamp, session id absent from all events); cross-invocation execute
  = one drive (one session creation, resumed handle opens 0 / fills 0
  / submits 1); drift, dead-session, expired-binding, and tampered
  fallbacks each named and each still submitting only the approved
  payload via the fresh drive; attestation completion on the same
  live page (no new session, no re-open); real board service +
  bridge: resume creates NO new service session, a foreign user's
  resume is refused at the first call (WORKER_SESSION_FORBIDDEN), a
  malformed resume id is refused by the bridge itself.
- Guard family on the branch: phone equivalence 5/5 · location 7/7 ·
  decline-vocab 12/12 · question-kind 6/6 · observation-stop-record
  5/5 · loop-acceptance 10/10 · board-provider 17/17 · portal-apply +
  submit-integrity — combined run **115 pass / 0 fail**. Router bundle
  rebuilt + `--check` verified.

## Measurement attempts log (TEST user, solo drives, live board service)

- FDSE Chicago prepare ×3 (labels before1/2/3; runs
  batch-abe8a4dc0209 / batch-0ced0573da0d / batch-42510afc5c4a):
  39,236ms / 87,060ms / 18,842ms — ALL stopped CAPTCHA_HANDOFF at the
  final step. Windows for this posting: 3/3 used.
- Palantir SWE NY prepare (sweny-before, batch-eca36fd9f293):
  23,060ms — stopped UNCOVERED_QUESTION (7 asks the TEST profile
  carries no confirmed fact for; nothing invented). Not a
  doorstep-reaching posting for the TEST profile.
- Stripe SWE Intern (gh-before1, batch-e6915f2196e3): 367ms —
  BOARD_NOT_WIRED (employer-site gh_jid URL; only direct ATS-host
  URLs resolve — correct behavior, no drive).
- FDSE New York prepare #1 (fdny-before, batch-fd7e34afdf5e):
  25,011ms — CAPTCHA_HANDOFF at the final step; the form itself was
  fully covered (fills completed; no uncovered stop). Window 1/3 for
  this posting.
- FDSE New York prepare #2 (fdny-before2, batch-abcc7216306e), after
  a 28-minute cool-down: 23,694ms — CAPTCHA_HANDOFF at the final step.
  Window 2/3.
- CertiK Security Research Internship prepare (certik-before,
  batch-2e03a06f305c): 179ms — removed by the family filter at
  discovery (not an SWE-family posting); no drive.
- FDSE New York prepare #3 (fdny-before3, batch-28e5f296375f):
  19,096ms — stopped EMPTY_FORM, but this window was consumed by OUR
  OWN HOST, not the posting: the VM was replaced at 07:47Z mid-drive
  (system boot 07:47Z; the drive's open() took 18,548ms into the dying
  board service and the form read came back empty). The F8 watchdog
  restored the worker host by ~07:53Z (units active; gate probes
  green: 401/401/example.com 403/Ashby 403/Lever 201+close 200).
- FDSE New York AFTER-world prepare (fdny-after, batch-d7b28b81d215),
  new code host-applied: 6,223ms — CAPTCHA_HANDOFF at OPEN.

## Measurement verdict

The paired live measurement did NOT complete: no Lever prepare
reached a doorstep in any window tonight (captcha at the final step
×5, captcha at open ×1, one window consumed by the VM replacement),
so neither approve leg could be driven live. Greenhouse alternates
were unavailable (Gusto stops on the owner's five unanswered
class-(c) asks; Stripe's employer-site URL is not a driveable ATS
URL). Chunk 50%'s success bar — a measured after-run at one drive
per application — is therefore NOT claimed.

What stands as proof instead, stated at its own tier: the guard
suite exercises the REAL board service + REAL bridge + production
149/155 composition (in-process transport) and proves the resumed
leg creates no session, performs zero opens and zero fills, submits
only the verified payload, and refuses cross-user / expired /
tampered / drifted state (13/13, fail-first 0/13). The mechanism is
host-applied on the TEST worker host (149 sha c97fef53…, 155
38ea7e0d…, bridge 3d7b2eef…; .bak-20261022T074858Z-session-reuse
taken first; probes green after the VM replacement + watchdog
restore), so the first captcha-free window completes the pair with
the harness as-is (`sr-prepare.cjs <label>` then
`sr-approve-after.cjs <label>`).

Before-world cost basis (recorded tonight): a full FDSE prepare
drive costs 18.8–87.1s of board time; the old approval leg was by
construction a second such drive. The reuse eliminates that second
drive inside the 10-minute window; the exact paired saving awaits
the first captcha-free window.
