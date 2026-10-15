# Task intent authority contribution

This source-only branch deliberately composes memory/alerts checkpoint
`bfd857720ae1bd09d16dfb0f6357df2c4ac34122` with owned-worker checkpoint
`025f1252dcd759a3e25cdc389378c12918f5db2b`. Shared release base remains
`afc460ec872f61eb2dcdbbca4d34140fb8b345c0`. Muse owns final integration and
deployment. No shared branch was merged or overwritten.

The browser owner acknowledges `career_task_intent/v1`: the existing account
row, account version, privacy epoch, pause and per-user advisory lock are the
sole durable authority. The forward task migration calls the existing host
commit; it does not replace memory/alerts functions or expand their writable
key allowlists. Intent, turn pair, snapshot and structured replay receipt commit
atomically. No chat handler network call can start worker execution.

Claim and every one-use effect token check current authority and immutable
bindings. STOP/erase revoke queued and subsequent running work. Already admitted
effects can remain uncertain; their tombstones never authorize a retry. A new
turn key does not make an old event fresh. Erasure removes central active task
copies and purges worker active copies on the next epoch check, before work.
Historical messages, uploads, all files and backups are not claimed erased.

The independent four-test staged probe is retained byte-for-byte, SHA-256
`bb64691e4539c696554c043be6648c53c4983c3abc98fa0a11778d3c48949b90`.
Its original baseline failed all four assertions; the repaired staged entry
passes all four. Its two original trailing-whitespace lines are intentionally
preserved for the frozen-file hash.

The unchanged standalone account probe, SHA-256
`eb10e8bbf23c60994de07d7c102f0ad532acba02b7626481752f5b152d2cf143`,
only constructs a host control patch. It never commits that patch. Its recorded
one MOCK open after each uncommitted control therefore still describes a
disconnected path, not durable account revocation. New real PostgreSQL tests
commit controls and cover zero subsequent opens, running-command boundaries,
concurrent lock ordering, rollback, uncertainty and lost acknowledgements.

The schema was applied only to isolated synthetic local `career_test_*`
databases in a no-network ephemeral test container. It is an unapplied
production migration proposal. No production worker transport, artifact
resolver, readback adapter or secret was configured. Chromium remains blocked
by the previously recorded executor sandbox configuration; no retry or bypass
was attempted. Native Deno is unavailable; the actual staged ESM graph is
executed under Node's VM with only remote-service transport replaced.

Crew A owns the independently reported module-130 correction-cache privacy,
rollback and epoch defect. Module 130 is untouched here. This contribution
requires independent composition retesting and does not establish release,
merge or deployment readiness.

Verification at source commit `7f2b11d9fa7227e7267ea96c24ca30bafa801ffa`:
188 tests pass, comprising 18 staged/frozen/durability, 119 domain/worker/bundle,
30 memory/alerts PostgreSQL and 21 task-authority PostgreSQL tests. Bundle
freshness, browser-fixture syntax and whitespace checks pass. The isolated
test container and local wire listener were removed afterward. Exact commands,
source digests, test names and log hashes are recorded in
`docs/testing/runs/career-worker-integration-20261015/results.json`.
