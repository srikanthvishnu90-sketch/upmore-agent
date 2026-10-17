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

Independent review of source 2ac4bd3 found that its receipt hook depended on a
nonexistent adapter property; the pull budget stopped at review; prose was parsed
as an ID; the detached helper inherited backend environment; idle review was not
purged after erase; direct submit/CAPTCHA captures escaped evidence quotas; and
lost claim acknowledgement could strand work before a local lease checkpoint.
These are repaired on the separate source branch with fail-first regressions and
an isolated-PostgreSQL-owned-claim proposal. The employer adapter and hosted
runtime remain NOT_WIRED/NOT_RUN. See `docs/career/worker-review-repair-20261017.md`.

Follow-up review of c7da3699 found that the actual RPC helper lacked the browser
helper's lifecycle protection, SQL's global 50-row window preceded active-task
filtering, two research terminal states were uncounted, and post-stop JSON had
no bounded retention. Source now tests the actual RPC child, scopes authorized
SQL before limiting, separates evidence/handoff outcomes, and expires local
private JSON and frames on a fixed deadline without retaining RPC access.
Post-stop account revocations are not observed after RPC closes; the residual
window is explicitly bounded by that deadline. Host death still needs an
owner-approved volume retention/destruction policy. No live-readiness claim.
