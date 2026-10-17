# Context-only compatibility adapter

`packages/career-contracts/interview-context-compat-v1.ts` explicitly converts
canonical A context to the unchanged B consumer shape. It does not authenticate
a snapshot. Its input must come from A's trusted effective-context projection;
the current production entry does not import or call it.

Frozen synthetic fixture/test source `61f93c94` precedes implementation.
Its initial result is 1/15 (14 missing-feature failures), not a reproduction of
the legacy A-03/A-04 SQL bugs. The first prototype passed 12/15; three failures
were the Node test realms' incompatible plain-object prototypes. The test-only
serialization adjustment at `09ee1419` retains every assertion and fixture byte,
matching B's existing JSON portability boundary. Its original log is retained.
Additional scoped goal/source and resume-lineage failures were frozen before
their prototype repairs, with the uncommitted prototype hashes in their logs.
These are local prototype iterations, not fabricated prior runtime commits.

The adapter verifies the canonical context digest and actual UTF-8 source
digests, filters stale/disputed/withdrawn facts, and preserves explicit lineage.
It never infers role family or level from a job title. Classifications must
come from the same explicit source record/revision as the selected target;
ambiguous classifications stay unknown. Classification versions remain B
dependencies. Multiple targets require an owned current selection.

The selected resume must have provenance adopting the exact source revision.
A newer source cannot give an older selection current status. B's input field
`artifact_id` is the existing selected source identifier, never a claim of a
newly saved/downloadable output. A changed source without new adoption causes
the unchanged B reducer to return stale context. No module-130 cache or domain
logic was edited.

Typed invalidations distinguish an unrelated goal from a selected target and
an unrelated source correction from resume replacement. Withdrawals stay
value-free. Proof-dependent capabilities remain `not_wired`; semantic, source,
tool, assessment and artifact result adapters are explicitly unavailable.
Missing fields or metadata are never converted into authenticated receipts.

The unchanged B validator and reducer consume the converted fixture, including
explicit software classification and stale lineage. The combined synthetic run
passes 115/115: 19 context adapter, 15 shared boundary, 8 gateway and 73 B
contracts. Native Deno typecheck passes. Raw failures and final output remain
here; this is MOCK_CONTRACT evidence, not actual model quality.

Actions/events/transitions, trusted result receipts, production registration,
paired accounting/verifier, context-v3 SQL, persisted journey and downloadable
artifact readback still require implementation. No production or paid call,
browser, external account action, or change to a B-owned file occurred.
