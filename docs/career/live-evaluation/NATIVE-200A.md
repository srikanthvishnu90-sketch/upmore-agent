# Native 200a interoperability and the concrete invocation blocker

Candidate A source: **`200a0f09fdee9c2c14ddc951c6d0e658dc47098c`** on
`codex/career-critical-repairs-20261016`. The earlier docs-only native-bridge
blocker is resolved **at source level**, subject to the parent's independent
audit. This evaluator did not modify A source or execute a paid request.

**New verified model spend $0; provider requests 0; new liabilities $0.**
All old $5 remains held spent/unresolved; the evaluator's sole new allocation
is $1, and the final $1 stays unused. No funding/allowance was initialized,
reset, reconciled, renamed or topped up.

## Interoperability checked

Source inspection confirms the real career handler preserves the ordinary
`{thread_id,turn_key,message}` entry, calls the native generator/checker path
under server settings and does not require the evaluator to classify intent or
construct typed interview commands. The published native reasoner and paired
SQL admit both full bounds before dispatch; each leg must be at most 25,000
microUSD. No paid classifier or automatic retry is added. The custom invocation
must still attest that it introduces no other paying path.

The conservative evaluator bound is therefore:

```json
{"generation":25000,"checker":25000,"other":0}
```

This means **at most 20 whole-turn admissions under $1** with the evaluator's
non-refilling gate. The full private packet has 96 planned turns and cannot all
be admitted at this bound. First run one complete conversation and inspect it;
at most two eight-turn scripts fit before extra clarifications/readbacks. Do
not silently infer a cheaper bound from observed token usage or start further
episodes that cannot fit their required turns.

[`native_receipt.py`](../../../scripts/career/live-evaluation/native_receipt.py)
now maps the published `meta.career_model` accounting to the evaluator's
admission-bound receipt. It checks the original raw-body digest, settled state,
generation/checker/other bounds, explicit paid-checker provenance, raw receipt
model/configuration/provider identities, token usage, integer cost recomputation
and aggregate request counts. Unknown legs with zero known cost retain the full
50,000-microUSD hold; they cannot become final-zero receipts. A rejected advisory
response can still have real settled charges, independent of task success.

Seven new controls replay A's retained **controlled** metadata and exercise
tampered receipts, wrong body hashes, unknown holds, hidden liability and the
20-admission ceiling. **42 Python evaluator tests pass.** A further guard rejects a synthetic
usage wrapper presented as a live response; live mode requires actual native
response identity and passes its raw accounting through the strict mapper. The retained public
fixture is not a sealed case and does not establish model quality.

The exact published log's outer trace line is not valid complete JSON
(`Expecting ',' delimiter`, character 4058). Its `request` and `career_model`
JSON nodes individually parse, and only those exact nodes are retained in the
[metadata fixture](evidence/native-200a/published-controlled-metadata.json), with
source hash and parse limitation. No full response/transcript was reconstructed,
and this evaluator did not rerun A's staged handler or claim its tests as an
independent handler run.

Deterministic control/no-model replies can omit native-pair metadata. The
existing trusted invocation must prove zero dispatch independently for those
turns; this mapper does not fabricate a paid-pair receipt for an absent record.
Artifact/task completion and unnecessary-question metrics remain unmeasured
until actual conversations run.

## What available read-only tools actually established

The connected Supabase app successfully listed the **upmore** project
`mrwngntwmnaqrqhupvlt`. Its `agent-chat` function is active **version 224**, with
`verify_jwt:true`. This is a real control-plane observation, not an authenticated
chat invocation or model-readiness proof.

A read-only `pg_proc`/`pg_namespace` catalog query found **all nine required
public native/pair RPCs absent**:

`career_native_read_v1`, `career_native_claim_v1`,
`career_native_leg_consume_v1`, `career_native_checker_prepare_v1`,
`career_native_observe_v1`, `career_native_outcome_v1`,
`career_native_fence_v1`, `career_model_pair_read_v2`,
`career_model_leg_settle_v2`.

Consequently, the connected production endpoint **cannot serve the published
native-200a path with its required backend**. Listing migrations returned an
empty history; that alone is not schema evidence. Fetching deployed function
source returned `UNAVAILABLE` / MCP internal error, so its runtime source was
not verified. [Exact metadata and catalog query/results](evidence/native-200a/readonly-control-plane.json)
are retained. No chat POST, `/health`, provider-health call, key retrieval, auth
session lookup, credential read or database write occurred. The old audit server's
`/health` remains unsuitable as a harmless probe because it can initialize its
missing budget ledger.

The original campaign thread remains
**`01a13811-a731-7437-976e-2de54f3d80fb`**, completed turn
**`01a138d1-3140-7287-be3a-75873f788c22`**. Its reported $0.497420
charged OR reserved and parent stop/status `NOT_FOUND` do not establish worker
exit or a fence. These Supabase tools cannot inspect that other executor's
processes or `/workspace/.upmore-tools/audit-budget/budget.json`. No outbound
cloud-thread or cross-executor OS inspection tool is available here. Thus no
new old-worker fence evidence was verified; neither alive nor dead is inferred.

## Concrete next unblocker

The parent must recover **the original executor's existing non-secret launch/PID
exit records or durable same-ledger fence** covering workers, graders,
continuations and server. Separately, identify an **already approved isolated
runner** containing exact native runtime 200a plus its native/paired SQL and an
existing secure opaque invocation. Supply that runner's non-secret readiness,
source/host/model/price/configuration identities and binding to the fixed $1
gate. No such runner is verified using the tools exposed here.

The connected production endpoint is ineligible; this task does not deploy or
fund it to manufacture readiness. A source SHA and a disconnected source-builder
environment are not substitutes for an invocable, funded and fenced runner.
Do not ask for another budget authorization or configure new credentials.

Evidence classes: **controlled evaluator tests PASS; actual read-only production
metadata VERIFIED; live-model conversation results NOT_RUN; production model
results NOT_RUN**. Sealed prompts and actual-transcript placeholders are unchanged.

[Source hashes and current findings](evidence/native-200a/interoperability-findings.json)
record the exact candidate and bounds. This is an interoperability/source review,
not completion of the parent's separate native-runtime audit.
