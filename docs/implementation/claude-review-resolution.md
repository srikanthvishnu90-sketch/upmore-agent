# Claude handoff: local payment resolution

The owner reported two HIGH defects in the latest handoff. Both now have local
domain/service and PostgreSQL regression evidence at source digest
`03d9003ac4b254b1858e46d754488ef94aae7391425a7a62bfec91835a5af1d5`.

| Reported defect | Result and tests | Remaining dependency |
| --- | --- | --- |
| Applied payment can be proposed again against refreshed bill | Domain36 returns needs_sync; migration16 rejects direct payable plan storage and preflight, and revokes only never-submitted legacy authority. payment-applied-planner.test.ts and payment_applied_reconciliation.test.sql pass. | Trusted creditor remaining-debt/cycle identity protocol; conservative hold remains. |
| Settled or duplicate processing attempts monopolize worker slots | Separate quotas, due-only queues, durable check time/backoff and released leases. payment-recovery-fairness.test.ts and payment_queue_fairness.test.sql pass. | Real registered provider and measured live load remain unavailable. |
| Stale bill edits | Migration15 and versioned UI reject stale revisions and label superseded retry receipts. Actual SQL/concurrency and interface regression tests pass. | Browser QA and production migration approval. |
| Lost begin-submission response falsely reports no effect | Service returns unknown unless cancellation is confirmed before submission; never resubmits blindly. Edge regression passes. | Real-provider ambiguous-status integration proof. |

The persisted `docs/testing/claude-review.txt` is a separate six-item, file-only
review that explicitly lacked SQL access. It is preserved unchanged. Its numbered
findings must not be relabeled as the owner's two-HIGH report or declared all
resolved from this table. Current database tests verify approval expiry,
single-use submission, ownership, revision and event-state boundaries; a full
line-by-line reconciliation of that historical review remains review work.

Fresh commands: `python3 scripts/capture-checks.py payment-hotfix-final-20261010`
(26 PASS) and `python3 scripts/capture-db-check.py payment-hotfix-db-20261010`
(476 observed assertions/races PASS). Logs and exact IDs are indexed in the
evidence ledger. No browser, partner sandbox, live execution or deployment claim.
