# Campaign identity and initial native transport binding

Current update: [native 200a interoperability and the concrete invocation blocker](NATIVE-200A.md). That update supersedes the docs-only native source status below.

This follows the parent's original-campaign discovery. It supersedes the initial
report's missing campaign-thread ID, while retaining its no-paid-call status.

Original paid campaign thread: **`01a13811-a731-7437-976e-2de54f3d80fb`**.
Parent-reported completed turn: **`01a138d1-3140-7287-be3a-75873f788c22`**.
Its final message reports **1,137 scenarios and $0.497420 charged OR reserved**;
this evaluator has not verified receipts or reconstructed billed spend. The
parent's attempted stop/status message returned **NOT_FOUND**. This does not
establish whether background processes are alive, dead or fenced. Hold all old
$5; do not infer $4.50258 is spendable.

## What exact published code establishes

Audit head `357f9fba11e2b428925fa7a224b1ebc7d01e85c9` contains budget blob
`8195f872144333c72890e54533e78f25dc134da8`. Its exact bytes are preserved in
[the source snapshot](evidence/followup-source/original-budget-source.ts).
[Source identities and findings](evidence/followup-source-findings.json) bind the
budget, handler wrapper, grader, supervisor, campaign and server.

- Generation and grading share the default `AuditBudget()` instance and intercepted
  fetch route. The exact ledger is
  `/workspace/.upmore-tools/audit-budget/budget.json`.
- Supervisor output is `/workspace/upmore-audit/paid-full-3500`; four original
  worker partitions are `[0,875)`, `[875,1750)`, `[1750,2625)`, `[2625,3500)`.
  Optional continuation partitions cover another 6,500 cases. Supervisor
  commands use one trial; a campaign invocation itself permits at most 10,000
  cases and three trials. These finite ranges are not process exit evidence.
- Supervisor code has no worker kill/wall-time limit. The independent
  `127.0.0.1:8010` server has no request-count/idle shutdown. Its `/health` calls
  `auditBudget.status()`, so **do not probe it to check configuration** before
  establishing the original ledger exists and is valid.
- Valid, preserved shared state enforces $5. Individual model requests require
  output caps of at most 4,096 tokens; judge output is capped at 1,200. These
  per-request limits do not independently cap cumulative spend at $5.

## New zero-cost exact-source results

`node --experimental-transform-types --test tests/live-evaluation/historical-budget-controls.mjs`
executes the byte-pinned **original** TypeScript class using a filesystem-only
Deno shim and disposable paths. It supplies no environment or fetch API and
never imports `handler-world.ts` or touches the original ledger.

All **6 controls pass**:

1. Exact Git blob identity, $5 constant and default pathname match.
2. `status()` creates a missing disposable ledger at zero.
3. Removing a previously charged disposable ledger permits zero reinitialization.
4. Preserved valid state enforces a shared lower test cap across two clients.
5. Three unknown receipts stop new requests and retain charged bounds.
6. A disposable malformed ledger lacking `limit_micros` passes the old validation
   and bypasses the cap comparison. This is evidence that ledger validity must
   be verified; it is not a claim the original ledger was corrupted.

The reported repair `eb6d4807e224f5de6be7da459323bce58b3e0bf0` is unavailable:
Git fetch returned `not our ref`; authorized GitHub read returned **422, no
commit found for SHA**. No adoption by historical workers is established.
Do not substitute the evaluator's new gate for a fence on existing processes.

The concrete remaining old-campaign proof is an original-executor record covering
**all four workers, pilots/graders, continuation workers and any server**: either
their exit states, or their adopted source plus the same valid durable ledger
and a no-reset fence within $5. No historical runtime repair or worker-control
action was attempted here.

## Native text coordination and new transport work

A's observed head **`c6b750a5afaac0a70563aa4f609e28ec16afe9b9`** adds
`docs/career/critical-repairs/native-text-v1/ENTRY-CONTRACT.md` and ownership
documentation only. Its runtime still matches `0907f033` for the handler,
grounded model path and typed interview entry. The native text contract is
defined, with implementation pending; **actual raw-text readiness remains
unproved**. No sealed prompts were disclosed to A.

The evaluator now follows A's public wire contract exactly:
`{thread_id, turn_key, message}`. `turn_key` is a stable UUID derived from the
fixed allocation/admission identity; message case, punctuation, whitespace and
line breaks remain unchanged. No typed command, injected verifier, provider
selection or expected answer enters this JSON.

[`opaque_invocation.py`](../../../scripts/career/live-evaluation/opaque_invocation.py)
is an adapter for an **already configured, parent-verified opaque invocation**.
It does not create one. Construction performs no subprocess/provider call. It
pins the existing command's bytes and identity, requires explicitly invoked
zero-cost readiness with the exact host/source/full-bound identity and
implemented `native_pair_v1`, then permits a single raw Upmore invocation only
after the full gate reservation. Missing readiness or changed bytes block
before reservation. No shell, key argument, environment lookup or automatic
retry is introduced.

The readiness response is an assertion from the trusted existing invocation,
not independent proof that its implementation is safe. The parent must inspect
the pinned command and verify that the readiness operation cannot pay, and that
its invocation routes through actual Upmore with complete bounds. This adapter
remains **unbound to a real invocation**. Actual readiness was not probed.

Six new binding controls verify construction, missing readiness, a source-only
native contract, host mismatch, raw wire preservation, and command changes.
Together with the earlier gate/burden tests, **34 Python tests pass**. The
[retained opaque wire control](evidence/opaque-wire-control/summary.json) is a
synthetic subprocess, explicitly **not the actual Upmore handler**.

For parent-to-A coordination: the evaluator is ready to consume the public raw
wire contract and needs the final implemented source SHA, actual native
response/paired-usage metadata contract, and read-only secure invocation/full
generation+checker+other bounds. This environment has no outbound cloud-thread
tool; forwarding this contract does not require sharing scenario prompts.

**New spend $0; new provider liabilities $0. Old $5 held; task maximum $1;
$1 remains unused. Live model and production NOT_RUN.**

Exact tested evaluator source: `3c0020f6c5734d7d302cbb534fb8f3bec3bba900`.
[Recorded followup checks](../../testing/runs/independent-live-evaluation-followup-20261017/results.json)
include per-file hashes, raw logs and **34 + 6 passing controls**, with all three
check records appended to the evidence ledger. Subsequent publication changes
only documentation/evidence.
