# Native observation recovery checkpoint

Branch `codex/native-recovery-20261017`, based exactly on published
`200a0f09fdee9c2c14ddc951c6d0e658dc47098c`. The workspace command succeeded
before editing. No repository or workspace `.agents/skills` files exist.
The original executor was stopped by the delegator; this branch owns the narrow
recovery repair. Muse retains integration, migrations and deployment.

The frozen baseline reproduces three defects: generation observation failure
and checker observation failure each return 503 despite recorded usage, and an
in-flight duplicate's saved unknown response stays unknown after settlement.
`before.log`, `before-summary.json` and `frozen-initial-tests.cjs.txt` retain the
original failures and exact test/DDL hashes. No failing expectation was waived.

The paired read RPC now exposes each recorded leg's authoritative raw receipt
and response ID. Native fallback metadata uses those records even if the
separate observation write failed. This recovers billing only: generation and
checker text are never reconstructed. Generated publication additionally checks
that both observed receipts equal the settled ledger receipts. SQL checks the
known/uncertain amounts and possible-call count as well as confirmed calls.

An exact raw POST retry of a saved unknown native turn uses the service-role-only,
security-invoker `career_native_replay_v1` readback. It verifies owner, request
hash, privacy epoch, pause and dialogue barriers. If accounting changed, it
returns the frozen fallback with the current pair's costs, IDs and raw receipts.
The accounting timestamp comes from the authoritative settlement records, so
repeated readbacks are deterministic. The original response remains an as-of
snapshot in storage. No dispatch, charge, message, receipt, account version or
conversation/context write occurs during this reconciliation. Generated and
already-final snapshots keep exact replay bytes while their gates remain valid.
An unknown outcome whose original conversation save failed can also recover
settled accounting on retry; the original claimed revision still governs commit.

Eight local PostgreSQL recovery controls pass (`expanded-repair.log`), including
both write failures, duplicate races during each leg, a second outcome-write
failure, owner/request/stale/pause/erase denials, and refusal to publish from
settlement proof alone. The initial narrower repair passed 3/3 and its source
patch is retained. Shared native Deno checking and handler checking with the
explicit original type-only SDK stub pass. The real remote SDK import and full
edge suite could not be fetched locally; those are not passing runtime checks.
Broader source and local PostgreSQL suites are tracked in the follow-up evidence.

Review of the first checkpoint found a no-dispatch replay edge case: native
`not_configured` responses have no execution record. Routing them into the new
RPC produced 503 on replay. Both missing-key and missing-policy regressions are
retained in `no-dispatch-before.log` (0/2), then pass unchanged in
`no-dispatch-after.log` (2/2). Reconciliation now requires a durable operation ID;
zero-call responses retain ordinary exact replay. `final-source-manifest.json`
pins this final guard and the two new tests. All other product bytes, including
both SQL proposals, match the first checkpoint.

The full local PostgreSQL selection on the first checkpoint completed **280/280
across 25 suites** (`postgres-full.log` and its summary). Local migrations, RLS,
ledger reapplication and concurrent-message contracts also pass, on unmodified
inputs copied read-only to an isolated PostgreSQL 16.15 container. All 103
Agent100 dry agents pass; all 12 context negative controls and 11 standard eval
mutations are caught; dataset validation passes. The eval harness's RELEASE OK
verdict does not satisfy the separate required original-archive gate.

Runtime checkpoint before independent commit-time replay review:
**`2935f057b7183e06fb463d43fd180488f25049c2`**.
Its affected native reruns pass **28/28**: 13 entry, five authority, eight
observation recovery, and two no-dispatch replay controls. The repeated full
source selection again has **4,612 pass, 13 fail, 24 skip**, with exactly the same
13 Chromium-unavailable failures (`source-failures-comparison.json`). No new
source failure appeared. The final local handler typecheck with the labelled
stub passes. Test runs began on a dirty predecessor HEAD; the final source hashes
prove their runtime bytes equal this published checkpoint. The 280-check full
SQL run used the predecessor's handler; both final SQL proposals are byte-for-byte
identical, and the affected native handler paths were rerun after the guard fix.

That runtime-head CI is [run 39003972040](https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39003972040).
The retained observation shows Deno (including real SDK checks) and database
passing, Node pending, and the required original archival gate failing. The
predecessor and original-head CI observations are separate and never substituted
for the final head. See `checkpoint-ci-observation.json` for observed states.

`evidence-ledger-proposal.json` proposes scoped append-only records for Muse;
the shared common ledger was not overwritten. `verification-manifest.json`
indexes the retained evidence hashes. No original archive, evaluator transcript
or live-readiness receipt was generated.

The full local Node source selection at the first checkpoint ran 4,649 outcomes:
4,612 pass, 13 fail, 24 skip. Every failure is in the unchanged local portal
browser suite: the preinstalled Playwright has no Chromium executable. Download
is blocked with HTTP 403 `Domain forbidden`; errors are retained. No browser
assertion, sandbox setting or skip rule was changed. Final-guard source and
affected native reruns are recorded separately, with exact source hashes.

The original archive gate still returns NOT_RUN and blocks release: all seven
listed original assets are unavailable. Nothing is fabricated or waived.
Controlled providers prove plumbing and accounting only, not model quality.
Executor-initiated paid calls, live database mutations, credential changes,
external submissions, merges and deployment commands: **zero**. The conservative whole-turn
ceiling remains 50,000 microUSD; this lane has no paid-call allocation.

No executor deployment command was run. The repository's automatic Vercel
integration reported a success status after the authorized git push; this lane
performed only the subsequently authorized read-only metadata inspection. GitHub
calls it a completed deployment and supplies a `Vercel Preview Comments` check
with the branch preview URL, rather than merely a build check. Direct Vercel
target inspection was denied with HTTP 403 for missing owning-team access; no
CLI is installed. Preview metadata is visible in GitHub, but the authoritative
production target/promotion state is unverified. Exact commit/dashboard/preview
URLs and the denial are in `vercel-read-only-observation.json`.
Muse must integrate the matching
pair-read and native SQL proposals with the handler source before enabling this
repair. A code-only rollout against the old RPC definitions is not supported.

Independent review of evidence head `486fccfb` found a separate delayed-duplicate
commit race. Both requests loaded before the first save; the duplicate obtained
the finished generated result, then waited while the first request and an owner
pause/correction committed. `career_native_turn_commit_v1` returned the old saved
reply before the protected replay checks. The frozen baseline in
`delayed-duplicate-before.log` is **1/3**: pause and correction fail, unchanged free
replay passes. The same controls now pass **3/3** in `delayed-duplicate-after.log`.
Commit-time saved replay now calls `career_native_replay_v1` under the same owner
transaction lock. All three controls keep exactly two provider fixture calls,
two usage/monthly rows, and 22 synthetic microUSD; the blocked duplicates save
no new messages. Observation recovery code and paired accounting are preserved.
`delayed-duplicate-source-manifest.json` pins the corrected SQL and frozen test.

Muse's concise source-only migration/default-off/readiness handoff is
`muse-integration-handoff.json`. An existing native installation needs the pair
read, outcome and **turn commit** function replacements plus the new protected
replay function/grants; do not rerun clean-install table DDL over live objects.
No schema installation, flags, credentials, cash rows, holds or production state
were changed by this lane. The fresh environment remains usable after the parent
disconnect notice: command success at 04:56:49 UTC and nonsecret rendezvous
lifecycle evidence are in `executor-lifecycle-observation.json`. No root cause
for repeated transport disconnects is asserted.

See `source-manifest.json` for exact source/evidence hashes, and the unchanged
[invocation contract](../native-text-v1/INVOCATION-READINESS.md) for live readiness
requirements. Secure pinned invocation and the old-worker/campaign fence remain
operational prerequisites; this source checkpoint does not attest either.
