# FAILURES ADDENDUM — parallel drives (chunk 70%, 2026-10-22)

## F-033 — a board call queued ≥5s behind another session's call dies with WORKER_UNREACHABLE (ECONNRESET)

- **Symptom (live, measured):** two concurrent prepare drives
  (TEST user, live board service) lost one leg in 2 of 2 attempts —
  batch-72d97b58db58 (13.1 s in) and batch-f8882beab43e (12.9 s in) —
  the leg's in-flight `fill` threw WORKER_UNREACHABLE ("the career
  worker board service could not be reached (fetch failed)") while
  the board service process never restarted (same MainPID
  throughout, journal silent) and 22,186 concurrent probes saw zero
  errors. An instrumented transport reproduced it a third time with
  the cause exposed: `fetch failed / causeCode=ECONNRESET /
  read ECONNRESET`, ~6.6 s into the queued call, within
  milliseconds of the other leg's in-flight call completing.
- **Root cause:** Node's HTTP server arms a 5 s keep-alive timer on
  a socket when a response completes. The board service's event
  loop blocks for seconds inside synchronous board calls; a second
  client's next request can sit UNPARSED in its socket's kernel
  buffer across that timer's expiry, and when the loop frees,
  expired timers run before the parser — the socket is destroyed
  with the request unread, and the client's outstanding request
  resets. Solo drives never hold an outstanding request across an
  expiry, which is why four solo drives the same night were clean.
- **Fix (this branch, board-service.cjs):**
  `server.keepAliveTimeout = 0` in `createBoardHttpServer` — the
  service is loopback-only and every client is our own transport,
  so idle keep-alive sockets are bounded by our own clients; the
  idle timeout bought nothing and cost drives. Covers both the
  single-core and sharded modes (shared adapter).
- **Enforcement (bug law):** `tests/career-parallel-drives.test.cjs`
  "F-033: a request queued behind a >=5s board call is served, not
  reset" — fail-first verified: with the fix disabled it reproduces
  `Error: read ECONNRESET` in 6.06 s; with the fix, the queued
  request is served after the 6 s block.
- **Status:** FIXED on branch muse/2026-10-22-parallel-drives;
  host-applied with the chunk-70% build (see the chunk note for
  shas) and re-proven by the concurrency ladder (no leg lost).

## F-034 — submissions-ledger whole-replace loses a concurrent drain's record (cap counts go blind)

- **Characterization (guard-proven, synthetic boards, real
  executor + 155 + 149):** caps are counted from the submissions
  ledger; the executor's discipline is snapshot → execute (mutating
  the snapshot) → whole-ledger replace
  (`career_batch_save_ledger_v1(p_records)` — no version token).
  Two drains of one user's ledger that snapshot concurrently and
  race the last per-day slot BOTH submit (reality 16 > cap 15);
  the second save then overwrites the first leg's record, so the
  ledger reads a compliant 15 while reality exceeded the cap —
  every later cap decision is computed from the blind ledger.
- **Why it is latent, not live, today:** the executor is a single
  systemd oneshot — the timer cannot start a second instance — so
  two drains of one user's ledger cannot overlap on this host. The
  race opens with multi-process drains (S-1 within-run sharding,
  multi-host executors): exactly the scale direction.
- **Specified fix (NOT in this branch — the ledger RPC is the S-1
  lane's draft-migration territory):** a version token on the
  ledger read/write pair; save refuses a stale snapshot with the
  named `LEDGER_VERSION_CONFLICT`, the drain is refused before any
  overwrite, and a re-drive against the fresh ledger meets 149's
  own refusal (stage `deferred_cap`, recorded `CAP_REACHED`).
- **Enforcement (bug law):** `tests/career-parallel-drives.test.cjs`
  "cap race: two approve drains racing the last per-day slot" —
  (a) characterizes the naive-discipline loss, (b) proves the
  versioned discipline holds the cap at 15 with the refusal named,
  (c) proves the fresh-read leg stops CAP_REACHED. The test is the
  fail-first specification the RPC change must pass.
- **Status:** OPEN — characterized + specified; fix owner = the
  store/S-1 lane (draft migration), gated on the owner's word like
  every migration. No cap value or check changed by this chunk.
