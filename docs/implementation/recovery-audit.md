# Recovery scanner review

Reviewed locally on October 10, 2026. Scope: `packages/domain/41-agent-recovery.js`, `tests/recovery.test.cjs`, and read-only inspection of `tests/execution/live-local/run-live-local.js`. These changes do not establish a connected provider, tenant-authenticated service, submitted claim, or recovered money.

## Corrected behavior

- Same-merchant credits and generic fee-refund labels are unverified leads. They cannot establish charge-specific refund linkage. Candidates remain open, `recovered_cents` is unknown, and `verified_recovered_cents` remains zero. Caller approval or verification labels cannot grant authority. A possibly related credit requires review before sending a draft request.
- Known malformed, nonexistent or future calendar dates fail closed. Unknown pending-hold dates are excluded explicitly without stopping dated fee findings. A valid leap-day boundary remains supported; no ingestion timestamp is substituted for a hold start date.
- Repeated provider identities with contradictory transfer flags or fact hashes fail in either input order instead of silently choosing the first record.
- Draft dollar strings use BigInt integer quotient/remainder arithmetic. Large safe-integer cent amounts retain every cent without binary floating-point rounding.

## Local regression evidence

Exact command: `node --test tests/recovery.test.cjs`.

The first three recovery-verification regressions failed against the inherited behavior: 13 passed, 3 failed. After that fix: 16 passed, 0 failed. Three subsequent regressions exposed null-date acceptance, ignored contradictory facts, and a large draft amount incorrectly rounded from `.90` to `.91`: 16 passed, 3 failed before the subsequent fix; 19 passed, 0 failed after it. These are real local unit-test runs, not provider contract or browser proof. The root evidence capture should bind its independently rerun results to the final source digest and commit.

## Remaining integration limits

The pure scanner accepts caller-provided facts; an account filter alone is not authenticated ownership. Runtime integration now uses the Auth-only atomic snapshot and independently validated ownership described in [recovery integration](recovery-integration.md). No client owner/verified boolean grants authority. No trusted owner/account/source-fact-bound refund-linkage interface exists here, so no amount is certified as recovered. This module does not submit, approve, or execute a claim.

Duplicate-pair and credit-lead searches now use indexed groups and bounded searches, with deterministic equivalence and adversarial work-counter tests. The authenticated service caps its atomic snapshot at 10,000 transactions and rejects overflow. No predictable production latency is inferred from local timing or that cap. Future-dated in-scope observed records are rejected. Dates accepted by this pure scanner remain evidence labels, not proof that observations occurred. The module now has 27 tests; full integration evidence is recorded separately.

## Inherited live-local harness

The harness was inspected and **not run**. It uses a synthetic local merchant on `127.0.0.1`, fake credentials, production playbook steps, and a Chromium wrapper. Its local subscription-state assertion can establish a fixture outcome if exercised; it cannot establish Spotify production behavior or a partner sandbox result. Playbook navigation is rewritten to the local server.

Its approval-gate assertions call `decideExecuteGate` separately; the browser attempt invokes `runDeclarative` without that approval. Consequently this harness does not establish an integrated owner approval, proposal hash, expiry, changed-term rejection, or queued revocation boundary. Confirmation text and screenshots are not independently authenticated provider readback. Checking that one plaintext password is absent from serialized evidence does not establish image redaction or comprehensive secret handling. None of these inspected checks is counted as newly run evidence.

No live provider commands, external financial effects, deployment, or modifications to the live-local harness were performed for this review.
