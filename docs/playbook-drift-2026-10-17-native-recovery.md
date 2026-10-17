# Native fallback accounting and replay drift

The native invocation contract promised recorded-leg raw receipts and response
IDs in response metadata. At `200a0f09`, a transient observation write failure
could still settle a valid receipt in the pair ledger, but metadata read only
the failed observation store. SQL rejected the mismatch and exact retries stayed
503. `native-recovery-v1/before.log` reproduces both generation and checker cases.

The prior native README covered concurrent requests without claiming a later
accounting readback. The same baseline demonstrates that a duplicate's unknown
snapshot stayed unknown after the original request settled. Exact raw POST
retries now reconcile accounting from owner-bound pair records without resending
or altering conversation state. Initial snapshots remain as-of records.

The source repair and eight local PostgreSQL controls are documented in
[the recovery checkpoint](career/critical-repairs/native-recovery-v1/README.md).
Missing observation text still prohibits generated publication. Live model
quality, operational readiness and original archival release evidence remain
unestablished; the original archive gate remains release-blocking.

Independent review at `486fccfb` additionally found that commit-time saved replay
could bypass the protected replay RPC after an intervening owner pause or
correction. Frozen delayed-duplicate tests reproduce both failures, and the
native turn-commit wrapper now calls the same owner-locked protected readback.
Unchanged replay remains free and byte-identical; observation recovery is kept.

The earlier broad statement of zero hosting/deployments was too broad for the
repository's automatic Git integration. GitHub reports completed Vercel
deployments and a `Vercel Preview Comments` check for the pushed commits. No
executor deployment command ran. Direct owner metadata inspection was denied
403, so the authoritative target/production promotion state is unverified;
exact URLs and commit IDs are recorded without credentials.
