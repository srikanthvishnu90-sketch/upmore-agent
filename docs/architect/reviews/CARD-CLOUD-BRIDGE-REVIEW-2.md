# Review 2: Codex's card-tap -> cloud-job bridge, code (wo/card-cloud-bridge-20261021 @ 9850bcab)

Reviewer: architect, independent. Against pin `wo/first-real-submission` @ 8c36446f and the gate items. Review only:
nothing merged, applied or deployed. Runs: the branch alone (76697a81; 9850bcab adds docs only) and a trial merge onto
8c36446f (no conflicts; regenerated extension bundle identical; router bundles verified), each in a git clone, as pgtest
with the browser sandbox on.

## Verdict: CHANGES REQUIRED (two blocking findings, both in tests the branch did not update; the SQL passes the gate)

### Blocking
**B1. The worker now requires `queue.authorize` (fail-closed, correct), but 17 existing tests still use queues
without it and fail on the branch alone** (identical on the trial merge, so not a merge artifact):
`workers/career-cloud/worker.ts:154` (`CARD_CLOUD_AUTH_REQUIRED` when `d.queue.authorize` is absent) and `:179`, `:284`.
- architect (12): `tests/architect/wo-039-cloud-worker.test.ts:88,106,129,163,178,286,310`; `wo-102-paths.test.ts:275`;
  `ask-never-guess.test.ts:98,109`; `brain-cloud-approval-preflight.test.ts:18`; `cloud-preflight-question-recovery.test.ts:17`
  (suite 1227 pass / 12 fail on the branch; 1250/12 on the trial merge).
- node (5): `tests/career-cloud-worker.test.cjs` (2), `tests/career-cloud-worker-lever.test.cjs` (2),
  `tests/career-cloud-engine-input.test.cjs` (1: the submit leg of the ask->answer->prepare->submit loop).
Required: each test's fake queue gains an `authorize` that the test controls (allow for the positive cases), plus one
case per suite that a queue refusing `authorize` sends nothing. The behaviour stays; the tests must say it.
**B2. `tests/career-approval-card-browser.test.cjs:254` fails (12/13)**: the built app now calls
`career_apply_message_cloud_enabled_own` before `career_apply_message_card_read_own`; the test pins the exact RPC
sequence. Update the expected sequence (a read-only eligibility call) or gate the call to cloud cards only.

### Passes (gate items)
- **C9**: `career_apply_cloud_refusal` / `claim_at` are 20261024120000's bodies plus: a card-binding refusal first
  (`not_card_approved`: direct enqueue and the texted-yes route are refused, DB tests pass), a 15/day cap (`least(15, ...)`),
  the bridge maintenance lock, and a claim join on `cloud_bound_jobs`. Waiver logic intact; waiver migration unchanged.
- **C6**: the extension branch of `guard_queue` is byte-identical; cloud dispatch is prepended.
- **C10** (owner's spec): `cloud_card_enrollments`: at most one live enrollment across all accounts (unique partial
  index), `expires_at <= created_at + 24h`, empty by default, `revoked_at`, service_role writes only.
- **B4/B5**: tap takes only (card, hash); owner/thread/hash/version/expiry checked under locks; binding written in the same
  transaction and verified before return; idempotent receipt; per-item deadline min(payload expiry, tap+24h).
- **A1**: the engine input is reused byte-identical (pin blobs).
- **DB**: full `tests/db/run.sh` on the trial merge passes, bridge up twice + card-cloud, lifecycle and daily-cap tests.
- Bridge's own node tests pass: process 12/12, producer QA 11/11, drift 3/3, worker-card-bridge 9/9, lever 7/7,
  current-sources 28/28, render 10/10. Architect suite otherwise green; edge 892/0; deno check clean.

### Non-blocking, the owner's to know
- **N1. Both switches are required for a cloud send**: refusal line 600, claim_at 630/657 and authorize line 51 require
  `CAREER_CLOUD_APPLY` AND `CAREER_AGENT_SUBMIT` on. The owner approved the cloud switch "once the bridge lands" and said
  no submit flag without his tap; as built, the first send needs both on. Owner decides (keep both as defence in depth,
  or cloud switch only).
- N2. The ledger row is written by the launcher after the file commits (not inside its transaction); a failed ledger
  write leaves it applied and unrecorded (the launcher stops). A live apply should use one transaction including the row.
- N3. Migration 764 lines vs the gate's 250 cap, not split; most of it re-creates existing functions whole. Accepted for
  review; noted.
- N4. Live apply order: 20261021220430 (card, not live) then 20261024130000; the file checks its prerequisites and refuses.
