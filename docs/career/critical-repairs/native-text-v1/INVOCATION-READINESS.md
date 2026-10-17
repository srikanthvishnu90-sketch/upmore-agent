# Non-secret invocation and whole-call bound contract

The native implementation receives only the ordinary
`{thread_id,turn_key,message}` POST under the existing owner authentication and
rate/thread gates. `createCareerChatHandler({nativePair:{request,timeoutMs}})`
permits a **server-selected** transport; request JSON cannot supply that hook.
Without a hook the existing model gateway uses its configured server fetch.
No new provider, credential source, account, secret-bearing command argument or
deployment is introduced. Only an already configured, parent-verified secure
invocation may attest actual transport readiness. Credential presence alone is
not proof. This environment has not configured or invoked such a live command.

For the evaluator's existing opaque adapter, readiness must be an explicitly
invoked, read-only operation with `provider_calls:0`,
`native_text_implemented:true`, `native_pair_contract:"native_pair_v1"`, and
exact parent-verified `invocation_id`, `host_id`, published `source_sha` and
`bounds_micros`. This document is a contract, **not that operational attestation**.
Do not substitute a controlled fixture/subprocess for actual Upmore readiness.
The evaluator branch's generic admission and opaque-invocation source contracts
were read for interoperability; its sealed scenarios and private manifest were
not read. No evaluator gate, allocation or old-worker fence was changed.

Safe fixed whole-invocation ceiling, in integer microUSD:

```json
{"generation":25000,"checker":25000,"other":0}
```

The total is **50,000 microUSD ($0.05) per admitted native turn**. This is an
upper bound, not a quoted actual charge. It follows from the existing paired
SQL admission's independent `1..25000` bounds for both legs. Each exact bound is
`(input_bytes * input_nanos + output_tokens * output_nanos + 999) / 1000`, using
integer division. Both amounts and monthly slots are held atomically before
the first dispatch. The generator uses exact serialized wire bytes and 2,048
visible-output tokens plus the configured 512-token reasoning headroom. The
checker reserves 180,000 input bytes and the same 2,560-token total output cap.
Its complete exact wire body must persist within that envelope before dispatch.
Oversized inputs or unapproved policy/configuration/price identities fail before
that leg dispatches. No automatic provider retry, paid intent-classifier call,
browser action, external tool or local-verifier-paid-call exists in this path;
therefore `other` is zero. A custom opaque transport must independently attest
that it introduces no retries or other paying path. A tighter ceiling requires
its own exact active-policy/source/full-bound proof; do not infer one from a
cheap controlled response.

`meta.career_model` returns `contract:"native_pair_v1"`, operation/pair IDs,
native raw-body hash, canonical request/intent/context/user-text hashes,
`parent_bound_micros`, per-leg `bounds_micros`, confirmed/possible call counts,
accounting state, integer known/uncertain amounts, accounting source and as-of
time. `legs` names `generation`, `checker`, `other`; each has its state, `final`,
known cost and provider request IDs. Recorded legs also carry the unchanged raw
gateway usage receipt. Started/unknown legs have `final:false`: a zero known
cost is never a final-zero receipt. Only the pinned trusted invocation may map
these backend records to the evaluator's admission-bound `usage_receipt`.
Its `request_sha256` must equal the evaluator's original body digest, not the
enriched generation-request digest. `native_request_sha256` uses compact sorted
JSON of those same three HTTP fields. No result is a fabricated typed command.

Operational blockers reported by the evaluator remain: the old-campaign/worker
fence and a parent-verified secure invocation. New budget approval is not in
doubt. The native implementation intentionally retains the existing reconciled
cash-row/model/price/expiry/monthly/global-uncertainty gates, including its legacy
`owner-shared-5usd` storage identifier. That identifier is not a fresh $5 seed
or permission to rename/reset an allowance. No live gate/ledger is initialized,
reset, topped up or bypassed in this lane. New spend and provider liabilities
here are zero; the evaluator's separate allocation is untouched.
