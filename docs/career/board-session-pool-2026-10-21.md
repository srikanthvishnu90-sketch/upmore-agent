# Board session pool — per-drive launch cost, measured + prototype (Package C, 2026-10-21)

Owner benchmark context: 50 applications in 30 minutes. This package owns ONE
slice of that: the browser launch / session layer under every drive.
Branch: `muse/2026-10-21-board-session` (base `cea914fe`). New files only —
no deployed worker/board code was edited, no live unit was restarted:

- `workers/career-browser/session-pool-prototype.cjs` — the pool prototype
- `scripts/career/bench-session-pool.cjs` — the benchmark harness
- this doc — results + integration spec

Package C claim (BUILD-STATUS discipline): the three files above are new and
claimed by this package for this round; nothing else was touched.

## 1. The current per-drive cost structure, pinned from source

Production drive path (live units read 2026-10-21, not modified):
`upmore-career-board.service` runs `workers/career-browser/board-service.cjs`
from the v2-candidate tree; the batch executor drives module 155 against it.

- **One session per posting.** `board-service.cjs` creates one board session
  per posting (`createSession`, board-service.cjs:146–177) via module 150's
  `createBrowserBoard` (board-service.cjs:92–94). Sessions are bound to the
  creating user (user-mismatch refused, :182–199), capped at 32 live per
  user (:67–68), idle-expire after 10 min (:67), swept every 30 s (:274).
- **One helper process + one Chromium per host process — amortized ONLY
  while a board stays live.** Module 150 spawns ONE helper child process
  lazily (`ensureHelper`, packages/domain/150-career-portal-browser.js:
  344–369; spawn at :351) and bridges commands through files + Atomics.wait
  polling (:371–388, 15 ms poll). The helper holds ONE Chromium
  (scripts/career/portal-browser-helper.cjs:54–64, lazy at first board) and
  ONE fresh BrowserContext + Page per board (:81–86: `newContext` at :84,
  `newPage` at :85).
- **THE per-drive launch: the last board's close kills the browser.**
  `board.close()` (150:701–706) sends the helper a per-board close — and
  when the live-board set empties it sends `shutdown` and drops the helper
  handle. So a serial drive loop (create → drive → close, one posting at a
  time) pays, on EVERY drive: Node helper spawn + helper ready-wait
  (150:353–361, 20 s timeout) + Chromium launch + context + page. Chromium
  reuse only happens when drives overlap in time.
- **Per-board teardown is context-only when the browser survives:** the
  helper's `close` command closes just that board's context
  (portal-browser-helper.cjs:980); board-service `destroy()` calls
  `board.close()` (board-service.cjs:120–123).
- **Per-command bridge cost:** every board method (open / form / fill /
  answers / atReview / submit …) is one file write + poll + read round trip
  through the helper. A drive issues dozens; the 15 ms poll granularity
  floors each at ~0–15 ms of bridge latency on top of the DOM work itself.
  (Counted here for completeness — the throughput lane owns drain shape;
  this package owns launch/session cost.)
- **Proxy / egress:** the helper's Chromium launch options carry NO proxy
  (portal-browser-helper.cjs:58–62: headless + sandbox posture only). The
  board *service* process runs under the egress proxy env
  (`http_proxy=http://hatch-egress-proxy:3128`, `NODE_USE_ENV_PROXY=1` in
  the systemd unit), which covers its HTTP transports; the CONNECT-relay
  pattern (`src/ci-browse.mjs`) is agent-probe tooling, not part of the
  worker drive path. Chromium navigation egress therefore does not pass
  through a per-drive proxy setup step in the worker — there is no
  per-drive proxy cost to remove.

## 2. Micro-benchmarks (this host, local test page)

Method: Playwright 1.63 / Chromium 1243 (the helper's own resolution
chain), headless, `UPMORE_CHROMIUM_SANDBOX=off` (this VM's required
posture, same as the live units). Page = the bench harness's local
form page on 127.0.0.1 (12-field application form). "Usable" = navigation
committed + `#application` selector present. Host: 2 CPUs, 8 GB RAM —
shared with the other mission lanes; load average is recorded per phase
and inflates absolute numbers; the launch-vs-pool DELTA is the finding.

Measured 2026-10-21 ~12:09 CDT, load average 8.0 → 12.7 during the run
(2-CPU host shared with the other lanes — absolutes are contention-
inflated; every rep includes the same local page navigation, so the
DELTAS between rows are the comparable quantities):

| Operation | n | median | p90 | min | max |
|---|---|---|---|---|---|
| Cold: launch + context + page + usable | 10 | **6,252 ms** | 7,858 ms | 3,058 ms | 7,858 ms |
| Warm browser: new context + page + usable | 20 | **2,409 ms** | 4,377 ms | 931 ms | 4,447 ms |
| Warm context: new page + usable | 20 | **1,490 ms** | 2,614 ms | 761 ms | 2,749 ms |

Derived per-piece medians (same navigation in all three rows):
Chromium launch ≈ 6,252 − 2,409 ≈ **3.8 s**; fresh context ≈ 2,409 −
1,490 ≈ **0.9 s**; page + navigation ≈ 1.5 s under this load. Even at
the minima (an unloaded moment), cold launch-to-usable is 3.1 s vs
0.93 s warm-context — the launch term never disappears. (Run of
`scripts/career/bench-session-pool.cjs micro`, 2026-10-21T17:09Z;
numbers transcribed from the run output — the raw file was lost to a
/tmp reap, see §4's provenance note. Reproduce with the same command.)

## 3. Concurrency: RAM/CPU per session (one warm browser)

Measured 2026-10-21 ~12:16 CDT, load average ~10 on 2 CPUs (heavy lane
contention). Method: one warm browser; k contexts each holding the local
form page after a full fill workload; memory = PSS summed over the bench
process's own descendant tree only (smaps_rollup — the live worker's
Chromium is a different tree and is never counted; empty-tree baseline
was 0 MB). PSS samples were tight (±3 MB across 3 samples per level).

| Concurrent sessions | Tree PSS | Marginal PSS / added session |
|---|---|---|
| 1 | 349 MB | — (browser base ≈ 285 MB + first session) |
| 2 | 421 MB | ≈ 72 MB |
| 4 | 546 MB | ≈ 62 MB |
| 8 | 779 MB | ≈ 58 MB |

So a warm browser costs ≈ **285 MB PSS base + ~60–70 MB per live
session**. On this 8 GB host (shared with every other lane) 8 concurrent
sessions fit comfortably in RAM; the binding constraint here is CPU,
not memory.

CPU: with all sessions running a 2 s JS busy loop concurrently, the
whole tree consumed 0.38 cores (1 session), 0.55 (2), 0.59 (4), 0.74 (8)
— far below the k cores the loops demanded, because the host itself was
oversubscribed ~5× (load ~10 on 2 CPUs): the loops were starved, so
these are NOT per-session CPU demands. What they prove is the ceiling:
on THIS host, today, extra browser concurrency buys little while the
other lanes saturate both cores; on a dedicated worker host the same
script gives the true demand curve. (Run of
`scripts/career/bench-session-pool.cjs conc`, 2026-10-21T17:16Z;
numbers transcribed from the run output — raw file lost to the same
/tmp reap as §4's first run. Reproduce with the same command.)

## 4. Simulated 50-drive run: launch-per-drive vs pool (the before/after pair)

Workload per drive: open the local form page, fill 11 fields + select +
radio + checkbox, read back a value, verify the page's fill counter —
doorstep only, nothing submits. Serial unless the mode says otherwise.

Measured 2026-10-21 12:32–12:36 CDT, one run of 50 drives per mode,
back-to-back on the same host (load average at each leg's start:
5.4 / 8.3 / 10.3 — rising contention across legs, which penalizes the
later pool legs, not the launch leg). Raw outputs committed:
`docs/career/bench-fifty-launch.json`, `bench-fifty-pool1.json`,
`bench-fifty-pool4.json`.

| Mode | 50 drives total | Per-drive median | Per-drive p90 | Browser launches |
|---|---|---|---|---|
| Launch-per-drive (today's serial semantics) | **125,743 ms** | 2,187 ms | 3,657 ms | 50 |
| Pool, serial (fresh context per drive) | **91,547 ms** | 1,734 ms | 2,823 ms | **1** |
| Pool, 4 concurrent leases | **88,419 ms** | — (concurrent) | — | **1** |

**The before/after pair:** pooling removes **34.2 s (−27%)** from a
50-drive serial run on identical workload — 453 ms/drive at the median,
834 ms/drive at p90 — and reduces browser launches from 50 to 1
(pool stats: 50 contexts created, 50 acquired, 50 released, 0
evictions). Two honest bounds on that number:

- It is a FLOOR for production. The bench's launch mode pays only the
  Chromium launch; the production serial path ALSO respawns module
  150's Node helper process and its ready-wait on every last-board
  close (150:344–369, 701–706), which the pool design eliminates too.
- The workload here is a local page. Real ATS drives add network time
  and dozens of file-bridge commands per drive; the launch term the
  pool removes is additive waste on top of every one of those drives,
  whatever else they cost. At the §2 micro-run cold cost (launch ≈
  3.8 s), 50 serial drives would burn ≈ 190 s — over a tenth of the
  30-minute benchmark budget — on launches alone.

**Concurrency on this host buys ~nothing today:** pool4 beat pool1 by
only 3.1 s (−3.4%) at load 10–13 on 2 CPUs — the §3 CPU ceiling, not a
pool defect. The pool's FIFO bound is what makes concurrency SAFE to
raise on a bigger worker host; it cannot manufacture cores on this one.

(Provenance note: a first combined run completed but its output files
were lost when /tmp was reaped before capture; the run was repeated
per-mode with result files written into this repo — the numbers above
are the second run's, and its raw JSONs are the committed ones.)

## 5. Safety: session isolation (Spec 2 §6.3) — what survives, what cannot

The pool keeps the existing isolation contract exactly; it changes WHEN
the browser process starts, never WHAT a drive can see.

- **Fresh context per drive, always.** Every pool lease creates a new
  BrowserContext with no storage state and closes it at release — the
  same construction the helper uses today (portal-browser-helper.cjs:84).
  Two drives never share a context, including two drives for the same
  user, and a later drive for a different user gets a context created
  after the previous one was destroyed.
- **What CANNOT survive across drives:** cookies, local/session storage,
  IndexedDB, HTTP cache, service workers (blocked at context creation,
  as today), page JS state, form values, auth sessions. Context close
  destroys all of it; there is no storageState save/restore anywhere in
  the pool.
- **What DOES survive (process-level only, no user data):** the Chromium
  process and its in-memory caches (code/DNS/TLS session caches inside
  the browser process), the pool's counters, and the OS page cache. None
  of it is readable by a later drive's page: a fresh context starts with
  empty site storage, and TLS/DNS reuse inside the process is not
  observable as identity by the sites a drive visits beyond what any
  shared egress IP already reveals.
- **Crash eviction:** a browser disconnect marks the browser dead and the
  next acquire relaunches; a context-creation failure evicts the browser
  and retries once. A crashed drive can therefore never hand a poisoned
  session to the next drive — the next drive gets a new browser AND a new
  context.
- **Executed check (2026-10-21, this prototype):** drive 1 wrote
  `localStorage["probe"]="drive1"` + a cookie on a local test page and
  released; drive 2 — a fresh context on the SAME warm browser — loaded
  the same page and read `null` from storage. Off-localhost navigation
  through the pool's default guard was refused (`POOL_HOST_REFUSED`).
  Pool stats for the check: 1 launch, 2 contexts, 0 evictions. (A first
  version of this check planted the value in the page's own script,
  which rewrites it on every load — the check was corrected to write
  from drive 1 only, and the null above is from the corrected run.)
- **Not changed by the pool:** host allowlist (§6.3 gate stays in module
  150 / the caller's gate — the prototype's default guard is localhost
  only), per-user session binding (board-service), captcha handoff,
  armed-only submit. The pool is a session-supply layer underneath the
  existing policy, not a policy change.

## 6. Integration spec for the worker (for the owning lane — not applied here)

1. **Module 150 seam:** make the last-close shutdown optional. Today
   `board.close()` (150:701–706) shuts the helper down when the live set
   empties; the pool behavior needs a "keep-warm" mode: the helper stays
   up across serial boards until an idle TTL (the helper already exits
   after 15 idle minutes, portal-browser-helper.cjs:13) or an explicit
   `shutdownAll()`. Smallest change: gate the :706 shutdown on an opt
   (`keepHelperWarm`) set by long-lived hosts (board service, executor).
2. **Board service:** no API change. Sessions already overlap-capable
   (32/user cap); with keep-warm on, serial sessions stop paying launch
   per session. The 10-min idle TTL + 30 s sweep stay as the reaper.
3. **Executor drains:** a drain that creates and closes boards serially
   gets the full win with (1) alone — the browser launches once per
   executor process (plus once per crash), not once per posting.
4. **Pool bound:** cap concurrent contexts at the measured host bound
   (§3) per worker process; queue beyond it (the prototype's FIFO
   waiters). On this 2-CPU / 8 GB host the measured bound is in §3; a
   bigger worker host re-measures with the same script.
5. **What NOT to pool:** browser contexts must never be reused across
   drives to "save" the new-context cost — §6.3 isolation is the
   contract, and §2 shows the context cost is the small term. The win
   is the launch, not the context.
