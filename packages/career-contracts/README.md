# Career journey boundary v1

Canonical schema: `journey-contract-v1.schema.json`. Types and bounded runtime
validation: `journey-contract-v1.ts`. Frozen synthetic valid/invalid examples
and hashes: `fixtures/journey-contract-v1/`.

This is a data boundary, not a grant of authority or proof of grounding. Only
the server may construct authenticated snapshots/events, derive approval
requirements, load owned state, admit model calls and issue receipts after
authoritative readback. The pure reducer gets an immutable snapshot and no
database, provider, browser, mutable profile or action executor.

`validateJourneyContractV1` checks structure, scope/binding, revision progression,
value-free withdrawal metadata and required proof fields. It cannot establish
that a supplied receipt is authentic. The server adapter must load trusted rows
and check their exact IDs, hashes, current context and authority. A valid schema
or model-written success field is never execution proof.

`PlanInterviewTurnV1` describes the pure workflow callback. Domain state and
event payloads are bounded JSON; B additionally validates its own versioned
state and event semantics. `approval_requirement: host_derives_requirement`
is a marker requiring host derivation, not permission to execute anything.
Sending, applying and purchasing are absent from the closed action union.

B's source `53ae74b3` uses provisional consumer shapes and the marker
`host_derived`. Those bytes have not yet passed canonical A/B compatibility.
An explicit versioned adapter and consumer test must resolve field/marker/event
differences before registration. These fixtures are independent contract examples,
not an integrated journey or demonstration of capability availability.

Current status: 15 local synthetic contract checks pass; TypeScript check passes.
The production entry, paired verifier/accounting, context-v3 projection, B
registration, persisted journey and artifact readback remain separate work.
Actual model/coaching quality and live-browser outcomes remain NOT_RUN.
