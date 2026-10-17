# Hosted browser worker: source status correction

The existing worker was described as a loopback HTTP service with an injected
authority transport. No production transport, hosted build or operational
runner was supplied. Source now includes a bounded pull-only mode (no listener),
private HTTPS RPC transport, source-only deterministic package, redacted events
and optional persistent genuine-PNG hooks. The deployment image, existing key
binding, owned artifact resolver, provider resource and real browser outcome
remain unverified/unprovisioned; those source additions do not make the product
live or justify a capability-status increase.

The receipt predicate accepted a truthy confirmation ID even when a record
explicitly reported rejection/pending or different received hashes. New source
checks the ID's type and rejects inconsistent destination evidence. A later
trusted readback can reconcile without a second click. Tests use MOCK boards
and labeled synthetic local records, not fabricated employer receipts.

Mac/desktop access is not a product dependency. The Codex test-container failure
is separate from the headless Linux production worker proposal. The proposal
lists the exact resource, existing-credential binding and distinct budget/deploy
approvals still needed; the browser lane's allocation is $0, and nothing was
purchased or deployed. See `docs/career/hosted-worker-proposal-20261017.md` and
`docs/career/greenhouse-one-application-handoff-20261017.md`.
