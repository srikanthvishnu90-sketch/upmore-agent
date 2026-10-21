# BENCH-50 — the 50-in-30 stopwatch harness (runbook)

Owner benchmark (2026-10-21): **beat Tsenta's 50 applications in 30
minutes.** The ruling that defines a pass: *50 postings prepared +
approved in ONE batch, submitted within 30 minutes*, measured on the
TEST world first, then live. Per-batch hash approval stays — the batch
is approved once, as one card set, exactly as the product does it today.

Harness: `evals/bench50/bench-50.cjs` (this package only — no product
code is edited, no live worker unit is touched, no real submission is
possible from this harness: every board it can drive is the product's
own sandbox board or a doorstep stop).

## The four legs

The harness drives the product's real composition — the same modules
the worker runs in production (`workers/career-browser/batch-executor.cjs`
+ `production-sources.cjs` + domain 155/149/132/123/121) — and times
four legs separately and end to end:

| Leg | What is timed | How |
|---|---|---|
| 1 DISCOVERY | cold ask → the candidate pool the worker's own `postingsFor` serves (the shared KB pool loader, 600-row recency window) | wrapped `postingsFor` inside the real executor's prepare drain |
| 2 PREPARE | pool → batch payload: dedupe, screen, tailor, per-posting doorstep drive, card + `cardSha256` minted; the run reaches `awaiting_approval` with 50 doorstep-ready applications | prepare drain total − leg 1 − wrapped store/profile time (residual; see Attribution) |
| 3 APPROVAL | ONE batch approval recorded: the approve intent carrying the card set hash (the real batch RPC shape via `createBatchRpcStore` over a faithful stand-in store), the executor's hash re-verification, and 155's `approveRun` minting the per-application hash-bound approvals + the batch approvalRef | pending/claim/readRun seams in the approve drain + `approveRun` timed directly on a restored clone of the stored run |
| 4 DRAIN | the approved batch executes: per posting, session rebuild → doorstep re-drive → submit gate (payload hash, caps, arming) → board submit | wrapped board factory: every board call is timed per posting |

## Labels — every number carries one

- **TEST** — the real product code and the real executor composition,
  bound to a faithful local stand-in for the batch RPC store (the
  in-memory state machine whose semantics mirror the live migration
  `20261016010000_career_batch_intents_v1.sql`, the same stand-in the
  repo's own worker-wiring tests use). The production sources
  (`postingsFor`/`profileFor`) run unmodified over a fake PostgREST
  transport backed by seeded tables.
- **SYNTHETIC** — the board is module 149's `createSandboxBoard`, the
  product's own test sink. Confirmations are `SBX-…` ids. A synthetic
  submission proves the drive path end to end; it is **never** an
  employer submission and is never reported as one.
- **DOORSTEP** — the drive stops at the final review screen (Spec 2
  §6.1): prepared, payload-hashed, unsubmitted. Prepare always ends
  here; nothing submits in prepare, ever.
- **NOT_RUN** — a leg that cannot run in this harness today, with the
  missing piece named. NOT_RUN is a result, not a gap in the report.

Legs that are NOT_RUN in this harness by design:

- **Live-RPC approval** — the real `career_batch_*` RPCs against the
  live project. Missing piece: an operator env + a chat-committed
  intent for a real user. The harness never writes live intents; the
  approval leg is measured against the stand-in at the same wire shape
  and labeled TEST.
- **Live-board drain** — drives against the worker host's board
  service. Missing piece: the board-service binding on the worker
  host (owned by the throughput lane's live drives). This harness's
  drain leg is SYNTHETIC (sandbox board) or DOORSTEP.

## The caps ruling (owner, 2026-10-21 12:06 CDT) — how the harness obeys it

The product's caps are law in module 149 (`SPEC_CAPS`: **15/day per
user, 5/day per vendor, 1 per company per 30 days**), enforced at
doorstep time and re-checked at click time against the user's
submission ledger. The ruling:

- **TEST world proves 50-in-30 UNCAPPED by design.** The design fact,
  stated plainly: 149 enforces the caps against the run's injected
  ledger with **no test-world exemption in code** — a single user's
  single-day batch stops at the caps in any world. The harness
  therefore proves the 50-in-30 claim as two separate, never-merged
  measurements (below), and builds **nothing** that weakens, bypasses,
  or parameterizes-away the caps. 149 is imported unmodified; every
  drive runs its real cap check.
- **LIVE caps STAY ON.** The live leg measures *50 prepared + approved
  in one batch* and submits **only up to cap**. The report always
  carries the two numbers separately:
  `prepared+approved: 50` and `submitted: N (cap-bound)`, with the
  binding cap named from 149's own `CAP_REACHED` stops (cap, count,
  limit) and the deferred remainder counted, never hidden.

The two drain measurements:

1. **Batch drain (policy outcome)** — the real executor's approve
   drain over the one approved batch, caps enforced by the real 149
   against the test user's ledger. Reports `submitted: N (cap-bound)`
   and the deferred count. This is the number a live run would
   produce, and the harness runs it in test world precisely so the
   cap shows up in the report instead of being discovered live.
2. **Capacity drain (throughput proof)** — the raw drive-path
   capacity: each of the 50 approved doorsteps is driven through the
   real 149 submit path (`runApply` → doorstep → `submitDoorstep`,
   payload-hash gate, cap check, arming wire all live) as an
   independent one-application drive with its own test ledger — the
   repo's own idiom for driving the submit path (see
   `tests/career-portal-caps.test.cjs`, which drives 149 directly).
   This measures the pipeline's marginal per-drive cost; ×50 it is
   the capacity number. It is labeled **CAPACITY**, never "batch
   submissions": it models 50 independent submissions' worth of drive
   work, which is what a 30-minute window must physically sustain.

Family note: caps are per vendor, so the board family is a benchmark
input. `--family greenhouse` (default; the only family the live board
service will drive today) is vendor-cap-bound at 5/day in the batch
drain. `--family mixed` spreads the synthetic market across
greenhouse/lever/ashby with distinct companies (the product's own
acceptance-fixture idiom), where the per-day cap (15) is the binding
one. Both are reported with the binding cap named.

## Attribution (how leg times are split honestly)

Legs 1–3 are fused inside the executor's two drains, so the harness
instruments the injected seams — wrapped `postingsFor`, `profileFor`,
store methods, and the board factory — with per-call timers, and
attributes:

- leg 1 = the wrapped `postingsFor` time inside the prepare drain;
- leg 2 = prepare drain wall time − leg 1 − store/profile time in
  that drain (this includes 155's screen/tailor work and the
  per-posting DOORSTEP drives, which are also broken out separately
  as `prepare doorstep drives` so the double-drive structure is
  visible in the numbers);
- leg 3 = the approval's own measured parts: the pending/claim/
  readRun seams inside the approve drain, plus `approveRun`'s
  card-hash re-verification and approval mint timed directly on a
  restored clone of the stored run (the approval the executor
  records in the drain is the same function over the same data);
- leg 4 = the approve drain's wall time, decomposed: summed
  per-posting board time (with the serial per-drive distribution),
  the store/profile seams, the approval mint, and the remainder
  reported as `execution_overhead` — `executeRun`'s in-process loop
  cost (session rebuild + `runApply` payload rebuild + cap check per
  posting, including postings the caps then defer). Nothing is
  folded into a leg it does not belong to; the overhead is named,
  not hidden.

## Reading the report

The report (`--out <file>.json`, plus a stdout summary) carries:

- per-leg seconds and counts (found / eligible / selected /
  doorstep / approved / submitted / deferred-cap / stopped);
- end-to-end wall time for the batch-of-50 as composed;
- `projected_in_30min`: from the capacity drain's measured marginal
  per-drive cost — `floor(1800 / (e2e_fixed_cost + per-drive))`
  computed and shown with its inputs, never a bare claim;
- `binding_constraint`: the leg or cap the numbers indict, named.
- every leg labeled TEST / DOORSTEP / SYNTHETIC / CAPACITY / NOT_RUN.

## Markets

- `--market default` — 92 synthetic KB rows inside the recency
  window: 90 eligible SWE-intern postings across distinct companies,
  plus noise: a duplicate opening and a CPA-knockout posting in
  screening, and two named-stop boards (captcha-at-open,
  uncovered-question) on companies below the clean 50 band — they
  enter the selection, and stop named, at `--count > 52`.
- `--market window-stress` — the F-005 probe: 900 rows where most
  eligible intern postings sit **outside** the loader's 600-row
  recency window. Leg 1 reports the eligible yield the window
  actually serves; if fewer than 50 survive, leg 1 is the binding
  constraint and the report says so in numbers.

## Commands

```
node evals/bench50/bench-50.cjs                 # full synthetic run, N=50, greenhouse
node evals/bench50/bench-50.cjs --family mixed  # market spread across 3 families
node evals/bench50/bench-50.cjs --market window-stress
node evals/bench50/bench-50.cjs --mode doorstep # legs 1-3 only; drain = DOORSTEP/NOT_RUN
node evals/bench50/bench-50.cjs --count 15 --out /tmp/bench50.json
```

Dry-run posture: the default invocation IS the dry run — in-process
stand-ins, synthetic boards, no network, no env, no live writes.
