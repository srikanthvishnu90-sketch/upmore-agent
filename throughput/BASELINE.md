# Throughput lane — measured baseline (2026-10-21, branch muse/2026-10-21-throughput)

Owner benchmark: beat Tsenta's 50 applications in 30 minutes — 50 postings prepared +
approved in ONE batch, submitted within 30 min. Measured on TEST world first; per-batch
hash approval stays. **Caps (owner ruling 2026-10-21 12:06 CDT): TEST world is uncapped
by design; LIVE caps (15/day, 1/company/30d) stay ON permanently — a ruled boundary,
not a bottleneck. On the live leg the day cap binds at submission 16.**

Every number below was measured in this run by the named method. Harnesses:
`throughput/measure-pool.cjs`, `throughput/measure-window-bands.cjs` (this branch).

## A. Discovery -> queue feed

Production path measured = the worker transport + `production-sources.postingsFor`
from the RUNNING worker tree (~/workspace/upmore-v2-candidate), gauntlet identity,
family text "software engineering internships", live career_kb_postings (21,688 rows;
greenhouse 12,072 rows / 65 boards — sb.py census, read-only SQL).

| Measure | Value | Method |
|---|---|---|
| postingsFor cold | 2,463 ms for 600 rows (244 rows/s) | measure-pool A1, hrtime |
| postingsFor warm | 651 ms for 600 rows | measure-pool A2, second call |
| Loader ceiling | limit 1200 and 2500 both return exactly **1,000 rows** | measure-pool A3 — PostgREST max-rows caps every read; the loader can never see more than 1,000 rows per call through this transport |
| Window-600 band mix | mid 226, senior 150, manager 113, staff 74, director 29, junior 5, intern 2, new_grad 1 | measure-window-bands via the production loader + 121 classifiers |
| **SWE ∩ intern-band in the 600 window** | **0** (greenhouse subset also 0) | same — F-005 confirmed by direct measurement |
| SWE family in window (no band) | 250 (229 greenhouse) | measure-pool A1 yield |
| Shelf total SWE ∩ intern ∩ greenhouse | **91 postings** (of 10,364 greenhouse rows scanned; SpaceX board truncated at the 1,000-row cap of its 2,708) | measure-window-bands per-board scan |
| Recency rank of the 50th SWE∩intern∩greenhouse posting | ~8,032 (greenhouse-only ordering; approximation — non-greenhouse rows interleave in the true global order and push ranks later) | same scan, sorted by posted_at desc |
| Targeted per-board reads to 50+ eligible | **3,750 ms, 5 boards, 3,818 rows scanned → 55 eligible, only 3 distinct companies** | measure-pool A4 prototype (transport eq filter per board, classify in-process) |
| Classifier nuance | family text "software engineering intern **roles**" → band binds (intern); "…intern**ships**" → band = mid, **band filter silently does not bind** | direct 121 calls, both phrasings |

**What serializes / binds in the feed:**
1. The 600-row recency window is the ONLY shelf view the production feed has, and it
   contains zero postings for the benchmark's own shape (SWE intern). Queue feeding
   at 50 therefore requires ~8,000 rows of shelf geography the window never reaches.
2. One read = at most 1,000 rows (PostgREST cap) and the worker transport exposes
   **no offset/cursor** — paging is only possible per-board via the eq filter.
3. Cold pool read 2.5 s (TLS/connect setup through the egress proxy), 0.65 s warm —
   paid once per prepare intent; not the binding constraint.
4. Company concentration: the shelf's SWE-intern-greenhouse supply concentrates in
   a few boards (SpaceX/Databricks/Stripe yielded 55 in 5 boards, 3 companies).

## B. Worker throughput

| Measure | Value | Method |
|---|---|---|
| Executor cadence | timer fires every 60 s (OnUnitActiveSec=60s); drains are Type=oneshot — a running drain is never overlapped by the next tick | systemctl show + journalctl 2026-10-21 |
| Idle drain duration | ~2 s start→finished, result `{"batchExecutor":"drained","results":[]}` | journalctl timestamps (17:00–17:03 UTC ticks) |
| Board service | one node process (PID 7178, since 16:13 UTC); its `handle()` is **synchronous** and module 150's bridge waits on the browser helper with Atomics.wait — every board call blocks the process's event loop for its full duration | code read: board-service.cjs handle/callBoard; 150 sync bridge |
| Browser helper | ONE Chromium per board-service process; per-board context+page; its command pump `await`s each command file to completion before the next — **all boards' commands execute strictly serially**, 25 ms poll | code read: scripts/career/portal-browser-helper.cjs pump() |
| Executor drain loop | intents processed in one sequential `for` loop; inside an approve intent, module 155 executeRun drives selected postings **one at a time**; inside prepare, the same serial loop drives every selected posting to its doorstep | code read: batch-executor.cjs runBatchPending; 155 prepareRun/executeRun |
| Double drive | prepare and approve run in SEPARATE oneshot processes; 155's session runtime is a per-process Map — **no session survives from prepare to approve**, so every posting is driven twice end-to-end (full runApply at prepare, full re-drive + submit at approve) | code read: 155 RUNTIME map + executor process model |

Per-drive wall time, Chromium cost, and the event-loop serialization proof are
measured in M3 (real doorstep drives, no submit) — section pending.

## Ruled boundary (not a bottleneck)

- LIVE: 15/day application cap + module 149's click-time cap check (CAP_REACHED →
  deferred_cap with resumeOn next day) and 1/company/30d. On a live 50-batch the
  day cap binds at submission **16**; the company cap binds per company at its 2nd
  posting within 30 days (the A4-shaped queue holds ≤3 companies → on live, only
  3 of a 50-queue could submit on day one even before the day cap). TEST world is
  uncapped by the owner's design, so the 50-in-30 proof is a test-world proof.
- Chat rate limit (60 req / 60 min / user on agent-chat) does NOT bind the batch
  path: a batch costs 2 chat turns (prepare ask + approve tap); all 50 drives are
  worker-side. It binds only per-posting babysitting, which the batch path replaces.
