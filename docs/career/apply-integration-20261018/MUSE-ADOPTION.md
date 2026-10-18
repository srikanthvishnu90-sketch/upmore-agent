# Narrow source adoption handoff

Ownership is an ambiguous historical scope handoff, not a verified active collision or a tool denial. Completed/LANDED notes coexist with stale NOT-pushed text and no explicit release. The coordinator has asked the owner for a narrow transfer or for Muse to apply the repairs. Preserve that boundary; do not infer a release from elapsed time.

## Existing BUG-240 repair

Published commit: [56a0285fa71212b98e955781fa92ec49c4323d53](https://github.com/srikanthvishnu90-sketch/upmore-agent/commit/56a0285fa71212b98e955781fa92ec49c4323d53).

- Handwritten patch: `packages/domain/142-career-router.js`. Use that file's diff in the published commit; preserve the integration branch's newer unrelated router changes.
- Exact source/guard tree: [router source](https://github.com/srikanthvishnu90-sketch/upmore-agent/blob/56a0285fa71212b98e955781fa92ec49c4323d53/packages/domain/142-career-router.js), [published guard](https://github.com/srikanthvishnu90-sketch/upmore-agent/blob/56a0285fa71212b98e955781fa92ec49c4323d53/tests/career-batch-live-shape.test.cjs).
- Required behavior: remove the pre-delegation `if (!c.profile) return null`; retain the existing run/delegate path before profile checking. For profileless in-turn preparation, return `intent:career_batch_apply`, `resultStatus:awaiting_user`, `code:PROFILE_REQUIRED`, `sends:0`, a concrete resume/profile next step and no written hollow batchApplyState. The existing worker resolves owner sources; do not add a second batch ledger or executor.
- Adopt after narrow142/bundle scope transfer or by Muse as owner. Do not bulk-cherry-pick old generated bundles, registry entries, claims or the live gauntlet runner. This checkpoint already retains the published guard bytes and a permanent wrapper; keep one authoritative guard implementation.
- Regenerate from reconciled handwritten source: `python3 scripts/build-router-core.py`; `python3 scripts/build-router-core.py --career-only`. Verify both with `--check` and `--career-only --check`.
- Re-run `node --experimental-vm-modules scripts/career/apply-integration/replay-published-guard.cjs`: require4/4 passing, including both empty-store critical cases and both controls. Run the permanent wrapper and applicable loop/delegation/reachability/board-provider/host regressions on the final source; preserve pause/erase/foreign-owner/context and unknown/no-redispatch behavior. Current retained base result is2fail/2pass. A synthetic pass is source plumbing proof; product completion still requires the owner's deployment tap and actual chat journey.

## Independent quota increment

The new unclaimed file `tests/career-chat-quota-boundary.test.cjs` runs the actual staged entry/handler in an isolated VM. Only Auth/Supabase services are faked; all external fetches and downstream business-state access are forbidden. It adds no runtime, bundle, dependency, migration or telemetry architecture.

Actual result: **6 controls pass / 2 fail-first cases fail**, no skips. Controls prove401 without quota for missing/unverified Auth, profile/RPC faults as500 rather than429, and normal/bridge denial scoped to the verified owner. Defects: empty input consumes work allowance; an invalid turn key under exhausted quota returns429 instead of its named400. The desired validation-before-work-allowance change must retain a separate abuse guard; no live limit is removed. Raw log and exact handler/test hashes are retained in `evidence/quota-boundary-before.*`.

Authoritative reset telemetry cannot be implemented solely in an unclaimed new script: the existing RPC returns a boolean and the claimed handler hardcodes3600. A safe correction requires the existing handler/RPC boundary and atomic window semantics. A standalone estimator would not prove authoritative reset or capacity, so none was introduced. No hosted traffic or load was run.

No independent executable upgrade increment is justified: the known PG16 package stays unchanged; PG17 compatibility still requires the chosen source/authority composition and isolated contract proof. A new migration authority would evade the handoff and risk competing accounting.

## Per-stage status

| Stage | Current proof | Exact remaining dependency |
| --- | --- | --- |
| 1 Source integration |98 pure checks pass; inherited52 Node failures/21 Deno errors retained; provenance8red; BUG-240 critical2red; quota2red/6controls green; host-extension body source matched | Narrow ownership transfer/Muse application of142/149/150/helper/fixture/bundles/contract, then reconciled source checks. Missing original archives remain a required release blocker |
| 2 Owner deploy tap | No deploy or live migration | Stage1 tested candidate and owner tap; source checkpoint is not deploy-ready |
| 3 Product-only owner application | No application executed; Gusto8257115 remains an audit candidate | Stage2 plus actual queue/packet/factual assertions/approval/caps/history and approved runtime. Local Playwright executable absent; no relay/trust/sandbox bypass |
| 4 Fresh second account/isolation | No account created | Stage3; owner credential/security/legal handoff; entire deployed journey and bidirectional database isolation proof |
| 5 Measured429/concurrency | Source diagnosis and local protocol tests only; no capacity measured | After merge/account gates, narrow quota fixes plus separately bounded traffic/budget/latency-stop authorization. Shared$7 cap is not new allocation |
| 6 Genuine watch/delivery | No actual match/delivery claimed | Stage4/applicable5 proof, genuine posting and authorized in-product delivery. Email stays disabled; drafts only |

All live work is Upmore `mrwngntwmnaqrqhupvlt` only. No paid calls, production writes, employer activity, credential changes or deployment were performed for this increment.
