# Actual paired execution with controlled provider responses

Owner-review implementation only. No production migration/deploy, real
allowance initialization or paid provider request. Actual model quality remains
NOT_RUN. The approved model configuration and reconciled shared campaign must
both exist before any dispatch. Tests explicitly seed synthetic accounting only
inside positively identified, network-none owned PostgreSQL fixtures.

The actual handler now saves B's pending state and complete action first.
Explicit `process_assessment` claims that owned action once and reserves both
cash bounds and monthly slots atomically. It uses the existing gateway for
generation and an independent checker request. Exact generator and checker
wire bodies persist before their dispatch; the one-use grants pin their hashes,
configuration identities, sizes, output ceilings and shared attempt deadline.
Every dispatch rechecks the existing shared uncertainty stop. Status/replay
never grants another dispatch, and closed no-call executions fence late workers.

Gateway receipts retain uncoerced raw usage, configured/response identities and
the hashes of exact wire/response bytes, including usage from charged malformed
content. Invalid UTF-8 is refused. The cash validator accepts the new optional
configuration field only when it equals the reserved leg identity; the new host
requires it on observations. Historical closed checks and legacy receipts remain.

Each raw receipt is durably observed before settling the leg and before checking
or publishing content. Known usage must be recorded in both the original monthly
ledger and shared cash ledger. Candidate publication requires both known legs,
current context, structural B validation, and the independent checker's accepted
verdict bound to the exact request, candidate and final rendered reply. Client
JSON cannot provide a candidate, trusted outcome, receipt or permission.

Unknown dispatches keep their full obligation. Their started tickets become
immediately overdue for the existing global stop; no fictional zero bill or
refund is recorded. A distinct trusted recovery adapter can supply an owned raw
usage receipt for the first settlement. `reconcile_assessment` never redispatches.
The default host has no fabricated recovery data. Private action content is
erased with existing owned KV; separate non-content accounting holds survive.

Three frozen actual-entry journeys pass with controlled gateway responses:

- Generation/checker pair, two durable ledger records, restart and exact partial
  artifact delivery/readback/reopen.
- Unknown generation, pause, replacement resume, restart, trusted terminal
  settlement, explicit retry of exact original text against current source,
  checked feedback and fresh exact partial-artifact readback/reopen.
- Missing campaign: zero requests and a durable terminal no-call outcome.

Four additional actual-entry failures pass: checker rejection retains both bills
and an unassessed answer; a failed final turn commit recovers the saved checked
result after restart without redispatch; a no-call fence survives a later funding
change; erase removes private payloads while preserving uncertain accounting.
Controlled response transcripts, actual paired rows/receipts and exact artifact
bytes are included in the trace files. The artifacts remain **partial**.

Failed predecessors are retained: missing integration; receipt whitelist
mismatch; missing checker-wire persistence; delayed shared uncertainty; and
invalid UTF-8 acceptance. One added pack assertion incorrectly demanded raw
resume text. B's unchanged pack contract records current resume/source references;
that oracle failure is retained and corrected. Actual generator-wire checks still
require the complete replacement source and exclude the superseded source.

Targeted source checks: 212 passed. Gateway checks: 47 passed, including seven
new raw-receipt cases. Native paired-accounting checks: 29 passed. Native Deno
checking passes. These are controlled structural results, not a quality score.
The prior context/readback checkpoint 05e9d7ad has Node/Deno/database CI green;
its required archival job remains blocked by missing original assets. Full
combined regression on this new paired implementation follows publication.

Reproduce an actual owned local journey with:

```sh
node scripts/career/critical-repairs/ci-node.cjs --postgres-only --sql-file=career-critical-repairs/interview-assessed-entry-postgres.test.cjs
```

B source remains byte-identical to b414b042. The generator adds only a named
export alias for its existing pure candidate validator. Modules 127/130/155,
shared release, production settings, credentials and browser sandbox are unchanged.
All 15 genuine browser tasks remain NOT_RUN under the normal sandbox blocker.
