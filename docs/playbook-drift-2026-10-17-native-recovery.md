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
