# Recovery read and preparation workflow

October 10, 2026: the recovery domain module is now bundled and connected to the
authenticated workflow service, financial planner and existing app. Open
Transactions → Find possible refunds. No external request is sent.

## Data and permission contract

`agent_recovery_snapshot` (migration18) is executable only by authenticated
owners. A single SQL statement captures retained transactions, account metadata
and sync metadata at one MVCC snapshot. Exact account filters must belong to the
owner; unknown accounts do not become an all-account scan. Limits are 10,000
scoped transactions and 1,000 scoped accounts; exceeding either raises an
explicit error, rather than silently calculating from truncated data. Provider
tokens, raw balances/amounts and raw error strings are excluded.

`recoveryReport` verifies the snapshot owner, each account/transaction/sync owner,
transaction account membership, current fact hashes and revisions. It accepts
only optional account ID, candidate offset and source hash. User-submitted bank
facts, dates, approval flags and recovery declarations are rejected. There is no
admin fallback or financial write. Later pages require the original hash; changed
history requires a fresh scan. The hash binds evidence, not a provider attestation.

## Calculations and interface

The scanner indexes duplicate-charge groups and credit leads instead of scanning
every pair. Tests compare mixed histories against the original deterministic
matching algorithm and count work on adversarial histories. Its pure-module
limit remains 100,000 records; the authenticated service uses the smaller limit
above. Local timings do not establish production latency.

Unknown pending dates are explicitly excluded from hold-age calculations. They
do not erase valid dated fee findings. Known malformed or future dates fail
closed. An ingestion time never becomes the date a hold started.

The interface shows included account names, exact source IDs, account health,
bank observation/fetch times, history span, exclusions and incomplete coverage.
Its preparation timestamp is labeled separately from bank observation time.
Candidate details and draft requests are rendered as text; there are no Send,
Approve or Execute controls. Users review and copy drafts themselves. Provider
disconnection does not imply a hold was released or a charge refunded.

The controller and actual app invalidate delayed reads on owner changes,
same-owner Auth-generation changes and disconnect. Fresh reloads discard old
pagination cursors. Private findings and open drafts remain memory-only.

## Planner contract

`get_recovery_report` joins the explicit read/preparation allowlist. Personal fee,
duplicate-charge and hold research is routed through owned evidence rather than
an unsupported free-form claim. The server renders totals and scope. Heuristic
credits remain unverified; neither the planner nor document text can grant
authority or certify a refund. Each response page is bounded at twenty candidates.

## Verification and remaining work

`recovery-service.test.ts` exercises the service, actual workflow dispatch and
real typed planner using synthetic snapshots. `recovery.test.cjs` exercises
indexing and calculation equivalence. `recovery-review-render.test.cjs` is
synthetic controller/DOM proof. The private-finance test executes the actual
built application with synthetic Auth/network inputs. Its same-owner recovery
regression failed before the final invalidation fix and passed afterward.

SQL evidence: `docs/testing/runs/recovery-db-20261010/results.json` contains 502
observed assertions/races, including migration18 and migration replay. Final
application evidence belongs in `docs/testing/runs/recovery-final-v2-20261010/`.
No browser or accessibility screenshot, partner sandbox or live recovery is
proved. CUA reported no enabled browser.

Verified recovery remains unavailable: matching merchant text is not charge-specific
refund allocation. Existing user-reviewed refund linkage is an authenticated
assertion about a posted bank credit, not merchant/provider confirmation. A
trusted owner/account/fact-bound recovery case, protected allocation evidence,
cross-case deduplication, deadline tracking and reconciliation remain necessary
before reporting recovered funds. The UI's zero verified amount means this
scanner has verified none; it does not claim no refund actually occurred.

This implements read/preparation behavior, not full dispute, cancellation,
claim-submission or recovery parity. Migration18 and these functions are local;
production migration reconciliation, release review and owner deployment
approval remain outstanding. No live adapter was registered.
