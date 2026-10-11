# Native subscription preparation and evidence tracking

Implemented in `packages/domain/41-agent-subscription-case.js`; run `node --test tests/subscription-case.test.cjs`. This is a deterministic local domain module, not a deployed cancellation service. It supplies preparation, exact review binding, case tracking and outcome calculations for CO-011–015 atomic requirements and the original manage-subscriptions scenario. Discovery, provider access, persistence, delivery and browser journeys remain integration work.

## Trust boundary

The runtime must instantiate `scope` from verified Auth, with `owner_id`, `readEvidence(reference)` and `readApproval(reference)` functions reading tenant-protected immutable records. Do not accept this scope, callbacks, case state or approval records from a client, model, merchant document or webhook. The module cannot authenticate a callback implementation: protected-store enforcement belongs to the integrating server and database. There is no network executor and every review/authorization/summary returns `execution: disabled_no_adapter`.

An evidence record contains `id`, `owner_id`, `authority: protected-provider`, `provider_key`, `external_reference`, timezone-qualified `observed_at`, `kind`, `facts` and SHA-256 `payload_hash` of canonical facts. `authority` is a server-store classification, not a trusted client boolean. The adapter must map actual source records into the typed kinds only after account binding and source/status verification. A scraped receipt, user assertion or uploaded document does not qualify by attaching this label. Evidence missing any required identity/hash/time is rejected.

Material terms must be read from the protected subscription snapshot, not supplied alongside its evidence reference. Public competitor pages do not establish operational access. Unknown vendor, marketplace, App Store, Play Store or bundled-purchase terms prevent a complete proposal; no source credentials or provider is invented.

## Interfaces

`prepare(scope, sourceRef, action, now)` returns `needs_evidence` with explicit missing fields, or `ready_for_review` with a canonical SHA-256 proposal. Actions are `cancel_contract` and `block_charges`, distinct even if related to the same merchant. Source freshness is 48 hours; review expires after at most 15 minutes and before the verified review deadline. These are local conservative defaults, not vendor guarantees.

The `subscription_snapshot` facts require `subscription_id`, `provider_account_id`, `merchant`, `plan`, known `purchase_channel`, `renewal_on`, `renewal_amount_cents`, `interval_months`, `currency: USD`, `effective_on`, `review_deadline_on`, `fee_cents`, `remaining_contract_cents`, `access_loss` and `refund_policy`. Zero fees/remaining debt are explicit values, not missing values normalized to zero. Supported intervals divide 12 exactly. An issuer-block proposal additionally requires `issuer_provider_key`, `block_scope` and `block_limitations`. `billing_account_id` may be unavailable during preparation; its absence prevents later verified savings.

`create(proposal)` initializes a protected case. `authorize(scope, state, approvalRef, now)` reads a protected authenticated-owner approval and checks owner, actor, status, exact canonical terms, proposal hash, expiry and fresh source terms. A changed fee, account, channel, plan or source invalidates review. Authorization here only records the review; it does not consume an execution nonce or grant provider execution. Production submission still needs a separate restricted executor with database replay protection and launch gates.

`applyEvidence(scope, state, evidenceRef, now)` returns a new case; it never edits its input. Event identity binds kind, provider, external reference and payload hash. Same-event replay is idempotent; changed provenance/facts fail. Typed evidence carries the exact owned subscription/account and currency:

| Kind | Required facts and resulting behavior |
| --- | --- |
| `cancellation_request` | Correct purchase provider and `response_deadline_on`. Records requested status, not cancellation or savings. Late request events do not downgrade accepted/effective status. |
| `cancellation_accepted` | Exact reviewed `effective_on`, `fee_cents`, `access_loss`, plus evidenced `fee_incurred_cents`. Records pending termination and actual fees once. Changed vendor terms require renewed review. |
| `cancellation_effective` | Previously accepted cancellation, matching terms, effective date reached. Records terminated contract; next billing still needs verification. |
| `issuer_block` | Matching verified `issuer_provider_key` and boolean `active`. Only the independent issuer block changes; contract/debt do not disappear. |
| `billing_window` | Terminated/continued-charge case; exact owned `billing_account_id`, `coverage_complete: true`, `pending_unresolved: false`, `cycle_index`, matching `billing_on`, inclusive `covered_through`, `charged_cents` and exact identified `charges`. Coverage must span the expected renewal and end before the next renewal. Unresolved/missing coverage cannot become zero spending. |
| `refund_received` | Posted credit, exact bank account/currency, identified refund transaction and original case charge, integer amount. Partial refunds sum only up to the original charge; repeat credits cannot count twice. Pending/promised refunds do not qualify. |
| `monitoring_gap` | Revoked, disconnected, stale or missing coverage. Keeps past evidence and makes unavailable monitoring explicit. |

Continued billing reopens the case; it does not automatically allege fraud. Subsequent clear windows do not erase an unresolved continued-charge state. A second distinct evidence record for an already counted billing window is rejected. Provider corrections must go through a reviewed revision/reconciliation workflow before replacing that window; silent revisions are deliberately unsupported. Root integration must persist immutable source revisions and offer a real correction/escalation path.

`summary(scope, state, now)` returns independent contract/block/request/monitoring states and overdue deadlines. Monetary calculations use `BigInt` internally and fail if an output exceeds safe integer cents. Month-end and leap-year recurrence remain anchored to the original date.

- Verified avoided charges count only completed, fully covered billing windows following verified termination and containing zero charged cents.
- Verified net savings subtract evidenced cancellation fees and remaining contractual obligations once. Before any verified billing window, the value is unknown, not realized savings.
- Refund cash received stays separate; it never increases recurring savings or becomes wages.
- Projected annual net savings use explicit renewal frequency and subtract disclosed fees/obligations. They are a projection, and no savings projection is produced for blocking alone.

## Integration requirements and limits

Persist the proposal, approval reference, immutable evidence, event fingerprints and state version transactionally under tenant isolation. Concurrent jobs need optimistic version checks/action locks. Make refund transaction identity globally unique per owner/bank account across cases, and deduplicate case outcomes when aggregating household/user savings. The local module deduplicates within a case; it cannot enforce database-global constraints.

Add durable provider/handoff jobs, expiry/revocation checks at actual effects, provider status readback, browser review and accessible case status. Read-only bank transactions can suggest a recurring candidate but do not prove service inactivity, cancellation access or the correct purchase channel. User-provided evidence should remain labeled preparation/needs verification until a permitted protected-source workflow verifies it. No production adapter, external communications, provider receipt, live cancellation or browser parity has been established by these local tests.

## Tests

The synthetic tests exercise missing/incorrect purchase terms, unknown fees, wrong owner, client proof, altered hashes, stale and future evidence, model approval, revoked/expired approvals, source corrections, request/acceptance/effective distinctions, changed vendor terms, issuer blocks, incomplete/pending billing coverage, continued charges, partial/refund replay/overpayment, late events, disconnect/deadline visibility, leap dates and integer overflow. They prove local behavior only.
