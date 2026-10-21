# Throughput infra — per-fill profile, F8 auto-restore, K=2 install prep (2026-10-21, TP-INFRA)

Branch `muse/2026-10-21-throughput-infra` (off cea914fe, live v248 tree).
Feeds O3's 50-in-30 and O5's M3. Sources: the throughput lane's measured
record (`throughput/REPORT.md` + `docs/career/throughput-handoff-2026-10-21.md`,
branch muse/2026-10-21-throughput @ 8e87059b), the worker flip record
(`docs/gauntlet/worker-flip-2026-10-20.md`), live host state read today.
Nothing live was changed by this lane: no unit restarts, no installs, no
submits; drives were doorstep-only probes on the gauntlet test identity.

## 1. Per-fill profile — where a fill's 11–28 s actually goes

**Method.** Two doorstep drives through the exact production assembly
(executor-config.cjs -> module 149 runApply -> live board service :8471),
harness `tools/throughput-infra/profile-drive.cjs` (the throughput lane's
measure-drive pattern + per-call epoch windows + form metadata). A separate
sampler process (`sample-host.cjs`, 100 ms) recorded /proc CPU by process
class (Chromium tree split renderer/main/gpu/other, portal helper, board
node, egress relay, driver) + loopback bytes + loadavg; `analyze-profile.cjs`
joins CPU deltas to each board call's wall window. Raw records:
`tools/throughput-infra/results/run-2026-10-21-{a,b}/` (calls.json,
samples.jsonl, analysis.json).

- Run B (the standing probe target): Gusto "Finance Intern (Summer 2027)",
  greenhouse.io/gusto/jobs/8257115 — total 94.7 s, stopped
  ANSWER_OBSERVATION_MISMATCH after 6 fills, as every solo before it.
- Run A (targeting miss, kept as a second sample): Greenhouse Inc's own
  board, "Growth Account Executive" — total 108.1 s, 5 fills, same stop.
- Every timed fill in both runs is a **react-select widget fill** (the EEO
  questions: run B fields 605–610; run A fields 29665–29669) — the same 6
  fills the throughput lane's solos timed at 16–28 s. Host load during the
  runs: mean ≈ 8 on 2 vCPU (other lanes active) — absolutes are
  contention-inflated; the split is the finding, and the two runs agree.

**The split, per widget fill (run B, n=6; run A in parentheses):**

| Component | Per fill | Share of fill wall |
|---|---|---|
| Fill wall | 11.6–13.7 s, one 21.3 s (A: 12.3–24.0 s) | — |
| Page CPU — whole Chromium tree | 2.3–2.8 s (A: 2.3–5.0 s) | **17.8%** (A: 16.4%) |
| …of which the renderer alone | 0.7–1.0 s | ≈ 6% |
| Host CPU — helper + board + relay + driver node | 0.3–0.5 s | **2.7%** |
| Network/proxy data after page load | 5–17 KB per fill | negligible transfer |
| **Residual — fixed waits inside the widget drive** | **9.0–18.2 s** | **79.5%** (A: 80.9%) |

**What the residual is (source-accounted, portal-browser-helper.cjs).**
A widget fill is ONE `driveWidget`: click + clear + `page.type` at
25 ms/char, then an option-poll ladder of up to **34 iterations, each
sleeping `waitForTimeout(500)`** (= up to 17.0 s of sleep alone) with 1–2
`page.evaluate` round-trips per iteration, retype branches at iterations
5/10, a clear-search branch at 16, then a pick click (5 s timeout), settle
polls, a 450 ms settle, and the readback evaluate. The measured residuals
cluster exactly on that structure: ≈ 9.0–9.2 s (four of run B's fills —
a ladder that exits mid-way), ≈ 10.5 s, and ≈ 18.2 s (the full 34-rung
ladder + tail). The EEO values are decline-class picks; the ladder burns
its rungs whether the option service answered early or never.

**Verdict on the 7–10× question.** Fills are **NOT page-CPU-bound**:
≈ 80% of fill wall is wall-clock waiting built into the widget drive's
fixed poll/settle ladder, ≈ 18% is all Chromium CPU (only ≈ 6% renderer),
≈ 3% is host node CPU, and network transfer during fills is ~kilobytes.
Consequences, stated plainly:

- A bigger/faster host shrinks the ~18% CPU slice and the evaluate
  round-trips inside each rung — it **cannot** remove the 500 ms × N
  sleeps. K parallelism multiplies whatever per-fill cost remains; it
  does not reduce it.
- The 7–10× per-fill improvement, if it exists, lives in the widget
  drive itself (worker-code owner; this extends handoff F3's profiling
  spec with the split now measured): an event-driven option wait
  (Playwright `waitForFunction`/locator wait on the option list or the
  loading indicator clearing) instead of a fixed 500 ms ladder; an early
  exit once the board's option service has demonstrably answered; a
  shorter ladder + fast path for decline-class picks, whose target
  option text is known-shaped. Estimated ceiling from the split: a fill
  whose pick lands promptly costs ≈ CPU (2–3 s) + one settle/readback
  (≈ 1 s) ≈ **3–4 s** — the 2–3 s/fill the benchmark needs is at the
  edge of that, not beyond it.
- Plain (non-widget) fills were not sampled: both drives stopped at the
  EEO widgets before later fields, and the gauntlet's earlier standard
  fields are driven inside the same calls the throughput lane timed
  (open/form/answers legs: 0.7–12 s). The plain path's own structure
  (≤ 3 attempts × [locator fill + settle 450/650/1000 ms + full
  readback, plus a whole-form re-discovery on stale]) is cheaper per
  attempt but pays a full re-drive per mismatch — its split is a
  follow-up probe on a form whose early fields are plain text.

## 2. F8 auto-restore — tools/worker-restore/

Contents: `restore-worker.sh` (detection + restore + verify; `--dry-run`
is the default and the only mode run by this lane), `units/` (templates
captured byte-faithful from live `systemctl cat`: board, executor,
executor.timer at its live 20 s cadence, egress relay, the
throughput-chromium drop-in; the smoke unit — absent from /etc at
capture — is reconstructed from the flip doc and marked), `README.md`
(detection set, restore steps, watchdog design, safety properties).

Design in one paragraph: a watchdog unit cannot fix a wipe that takes
/etc with it, so the trigger lives outside /etc — a Muse scheduler job
(the one scheduler that demonstrably kept firing across both of
2026-10-21's VM replacements) runs the script's dry-run every ~5 min;
two consecutive DEGRADED verdicts trigger one `--execute` (install
templates -> daemon-reload -> enable/start relay, board, timer ->
re-verify by probes) and deliver the log record. The restore never
touches Supabase state, never starts the smoke instance, and its gate
probes create no sessions (both are refused by the board's own gates
before the factory runs). If the worker-config material itself is
gone, the verdict is UNRESTORABLE_LOCAL — the shared secret lives only
there and in the function env — and the operator is paged.

**Dry-run verdict (live host, 2026-10-21 18:20 UTC): HEALTHY, action
none, exit 0.** All four gate probes green (no-secret 401 ·
wrong-secret 401 · example.com 403 DRIVER_HOST_REFUSED · Lever 403
FAMILY_NOT_DRIVEABLE); every required unit/config/port present. One
posture gap, named in the log record (`tools/worker-restore/dry-run-log.jsonl`):
the smoke unit file is absent — stopped-by-design when present, so
operations are unaffected; a full restore would rewrite it and still
never start it. No real restore was executed in this lane.

## 3. K=2 install prep — see docs/career/k2-install-checklist-2026-10-21.md

(section added with deliverable 3)
