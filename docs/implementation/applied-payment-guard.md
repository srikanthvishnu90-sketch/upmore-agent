# Applied payment and remaining debt

An obligation refresh can arrive before the creditor incorporates a previously
submitted payment. The original attempt can later become `applied` while the
obligation retains a revised, verified amount. That amount must not be paid again
merely because the refresh is recent.

`packages/domain/36-agent-workflows.js` produces `needs_sync` with code
`applied_payment_reconciliation_required` when any applied attempt belongs to
the same unresolved obligation. It emits no payment proposal. A later timestamp,
new source version, or `payment_reconciled` evidence flag cannot clear the hold.
Final obligations remain resolved; an attempt against a distinct invoice does
not block an independently verified invoice.

`20261010160000_applied_payment_reconciliation.sql` enforces the same boundary in
both service plan storage and final payment preflight. The existing functions
retain their validation and owner/settings/obligation locks. Provider-event
recording uses the same lock order, so applying a receipt and preparing another
payment serialize. The internal renamed functions have no client or service
execute privilege. Attempts, original approved snapshots, provider IDs and
creditor allocation references are preserved.

A legacy, still-unsubmitted authorization may prevent the original plan-storage
function from storing a read-only hold. The wrapper revokes that authority and
cancels only reserved attempts whose submission has never started, then stores a
new `needs_sync` generation. It never cancels a submitted provider effect. A
legacy authorized task which already has a submitted effect remains blocked at
payment preflight and requires reconciliation, rather than being silently
rewritten as a new executable proposal.

## Verification

`tests/edge/payment-applied-planner.test.ts` covers the revised bill, later
timestamp/untrusted clearance, a different invoice, and final completion. Before
the domain guard, two assertions failed and two passed; after the fix the same
authoritative source passed all four. The final test imports the repository's
generated core; regenerate that core before the final suite.

`tests/db/payment_applied_reconciliation.test.sql` covers actual biller ingest
between submission and creditor allocation, exact original receipt retention,
blocked direct plan/preflight/reserve RPCs, ineffective later evidence flags,
legacy unsubmitted approval revocation and inaccessible internal bypasses.
Database execution evidence belongs in the repository testing ledger; this
contract does not claim an unrun database test passed.

## Remaining integration dependency

There is currently no supported clearance protocol for another payment against
an obligation with applied history. A genuine partial-payment remainder needs a
protected creditor reconciliation record binding the owner, exact invoice/source
revision, every applied attempt and provider allocation reference, and explicit
remaining debt. Neither a timestamp nor an LLM assertion supplies that proof.
Until this protocol exists the hold is intentionally conservative. Separate
recurring invoices must have distinct external invoice/source identities;
providers that reuse one obligation for every billing cycle need explicit cycle
identity support before automatic repeat payment. No live payment adapter or
production launch gate is enabled by this change.

Reapply migration 16 after migration 6 whenever the full migration chain is
replayed, so the public wrappers remain the final callable definitions.
