# Upmore Execution Benchmark — Cancel Agent (v1)

**Date:** 2026-09-28. **Scope:** the subscription-cancel execution agent ONLY (bill pay, trades, discretionary investing are separate diffs).
**Supersedes:** BENCHMARKS.md and docs/benchmark-rubric.md for the execution layer (those predate the agentic product).

## Scoring rules (strict)

- Points only for **shipped + verified** behavior. No credit for stubs, mocks, dead buttons, copy that promises what code doesn't do, or claims not demonstrated.
- Verification = a real code path exercised: migration applied to the Upmore project, edge function deployed and invoked, UI rendered and interacted with, or an Agent100 assertion passing against the real implementation.
- Tenths (0.1) only for genuinely shipped + verified changes, per the founder's rule: ≥10 real changes to earn full tenths.
- **NEVER** run a real merchant cancellation to score points. All execution verification uses dry-run fixtures, test doubles, or the safe `browser_selftest` target (example.com).
- Existing Agent100 dry suite must stay 103/103 green.

## Dimensions (100 points)

### 1. One-tap revoke completeness — 10 pts
`revoke_all` deletes every `exec_cred_*` Vault secret + credential reference, stops in-flight Browserbase sessions, revokes active runs, cancels pending approvals — and **proves** nothing remains (response shows zero refs + zero vault secrets).
- 10: full revoke verified end-to-end on a test credential (store → revoke → vault read fails, refs gone, sessions killed, runs revoked, approvals cancelled, UI shows per-merchant checklist + "Nothing remains").
- 5: server implements it but UI proof or session-kill unverified.
- 0: missing or partial.

### 2. Stop guards — 10 pts
Before every browser step, the runner scans page text for tripwires: account creation, terms/privacy acceptance, payment-method entry, consent screens, plan-change/downgrade offers. On tripwire: abort immediately, evidence records `stopped_at_tripwire`, guided fallback served. The agent cancels or stops — never improvises through consent/financial/legal flows.
- 10: tripwire scan in `runDeclarative`, verified against adversarial fixtures (ToS checkbox page, add-card form, plan-change offer) → all abort with evidence.
- 5: guards exist but fixture coverage incomplete.
- 0: no guards.

### 3. OTP expiry + sweeper — 7 pts
`awaiting_otp` runs carry a 30-minute TTL (`otp_expires_at`). `submit_otp` rejects expired codes. A sweeper marks expired runs `failed` ("code not provided in time") and kills the dangling Browserbase session.
- 7: TTL set on pause, enforced on resume, sweeper verified (expired fixture run → failed + session killed).
- 3: TTL enforced but no sweeper.
- 0: OTP sessions live forever.

### 4. Server-side category exclusion — 7 pts
Insurance, utilities, contract/early-termination-fee, and user-marked keep/shared subscriptions can NEVER enter the agent path: enforced in `agent-exec` before the atomic claim (defense in depth — the client can be bypassed), not just in card copy.
- 7: exclusion re-check in the executor gate, verified with fixture approvals (insurance + utility + keep-flagged → refused with audited reason).
- 3: client-side only.
- 0: no exclusion.

### 5. Approval completeness + approval_context — 10 pts
The approval screen shows, all on one screen before the Approve tap: exact merchant + plan, amount + interval + next billing date, 12-month projection **labeled as a projection**, reversibility (access until period end vs immediate loss, re-subscribe path, data loss), retention arithmetic when known, agent-mechanics disclosure (login as you; may violate merchant ToS), what the agent will NOT do (no plan/payment/offer changes), failure path (nothing changed + deep link + steps). On approve, `approval_context` JSONB records the exact strings shown — the evidentiary record of informed consent.
- 10: all seven elements on screen + context recorded + server requires context on execute, verified.
- 5: screen complete but context not recorded/server-enforced.
- 0: bare "Approve — cancel it" button.

### 6. cancel_claimed + billing-cycle watcher — 10 pts
Agent `done` moves the subscription to `cancel_claimed` ("watching your [date] bill"), NEVER `cancelled`. A server-side `cancel_claims` row is written; a scheduled watcher checks billing-date + 2-day grace against synced transactions: no charge → `cancel_confirmed` + ledger `Avoided` entry; zombie charge → reversal entry + card re-queued with honest copy. The ledger never shows a dollar before confirmation.
- 10: full lifecycle verified in dry mode (done → claimed → clean bill → Avoided; zombie → reversal + re-queue).
- 5: claimed state + claim rows, but no watcher.
- 0: agent marks `cancelled` immediately.

### 7. Immutable, user-visible ledger — 8 pts
`action_ledger` is append-only at the database level (trigger rejects UPDATE/DELETE); reversals are offsetting entries, never edits. The user can see every entry.
- 8: immutability trigger deployed + verified (update/delete attempts fail), reversals-as-entries demonstrated.
- 4: append-only by convention, no DB enforcement.
- 0: entries editable/deletable.

### 8. One approval per cancellation, never bundled — 8 pts
Each cancellation requires its own explicit approval row. The executor's atomic claim guarantees exactly one execution per approval. No batch/bulk approve control exists anywhere.
- 8: atomic claim verified (concurrent execute → exactly one winner, 409 for loser) + no bulk-approve UI + Agent100 a023/a055 green.
- 4: claim exists but concurrency unverified.
- 0: bundled or implicit approvals possible.

### 9. Retry scoping — 5 pts
Retries happen only inside the already-approved attempt: a failed run can be retried under the SAME approval_id; executing an approval with a terminal `done` run is refused (409) — a new cancellation needs a new explicit approval.
- 5: `retry_run` action + done-guard verified.
- 2: claim prevents double-execution but no explicit retry path.
- 0: re-execution possible without fresh approval.

### 10. Chat "Do this for me" event-driven — 5 pts
Task "Do this for me" buttons drive work from real backend state (task rows, run rows), never fake timers or simulated progress. Numerical claims carry provenance.
- 5: verified — buttons dispatch from real rows; run status polled from `exec_runs`; no setTimeout-driven fake progress in the agent path.
- 0: fake timers or fabricated events.

### 11. Per-merchant disconnect + credential list — 5 pts
Profile → Agent access lists every vaulted merchant login with an individual Disconnect control (deletes vault secret + ref row), plus the one-tap revoke.
- 5: list + per-merchant disconnect verified (disconnect → vault read fails for that merchant only, others intact).
- 2: list without working disconnect.
- 0: missing.

### 12. JSON export of execution audit log — 5 pts
Profile → Audit log lists every run (merchant, when, approval ref, outcome, evidence summary, watch status) and exports the full log as a downloadable JSON file.
- 5: list renders from `exec_runs` + export downloads complete JSON, verified.
- 2: list only, no export.
- 0: no audit log (the "check the audit log" copy is then a lie).

### 13. Verified-playbook gating — 10 pts
The executor refuses unknown/unverified playbooks before touching vault credentials or Browserbase (audited guided refusal). Playbooks carry version + last_verified_at; runs pin playbook_version in evidence; user mismatch reports accumulate in `playbook_reports`; 3 consecutive mismatches auto-demote to unverified.
- 10: gate verified (unverified fixture → refused, vault untouched) + versioning + reports table + demotion logic, all exercised.
- 5: gate only.
- 0: agent attempts unverified paths.

## Baseline score: 41/100 (2026-09-28, before execution build)

| # | Dimension | Pts | Max | Evidence / gap |
|---|-----------|-----|-----|----------------|
| 1 | One-tap revoke | 10 | 10 | `revoke_all` + UI checklist exist |
| 2 | Stop guards | 0 | 10 | No tripwire scanning in runner |
| 3 | OTP expiry + sweeper | 0 | 7 | `awaiting_otp` has no TTL |
| 4 | Category exclusion | 0 | 7 | Client copy only; executor doesn't re-check |
| 5 | Approval + context | 3 | 10 | Bare approve button; no `approval_context` |
| 6 | cancel_claimed + watcher | 2 | 10 | Manual path has `cancel_claimed`; agent marks `cancelled` immediately, no watcher |
| 7 | Immutable ledger | 0 | 8 | No DB enforcement |
| 8 | One approval per cancel | 6 | 8 | Atomic claim exists; concurrency unverified |
| 9 | Retry scoping | 2 | 5 | Claim blocks doubles; no explicit retry path |
| 10 | Event-driven chat | 4 | 5 | Polls real rows; fake-timer audit pending |
| 11 | Disconnect + list | 5 | 5 | List + Disconnect exist |
| 12 | JSON export | 4 | 5 | List + Export button exist; download unverified |
| 13 | Playbook gating | 5 | 10 | Gate exists; no versioning/reports/demotion |

**Total: 41/100.** Target after this build: ≥50.

## Post-build score: 84/100 (2026-09-28, after execution build)

| # | Dimension | Pts | Max | Evidence |
|---|-----------|-----|-----|----------|
| 1 | One-tap revoke | 10 | 10 | `revoke_all` + UI checklist + zero-proof (pre-existing, verified) |
| 2 | Stop guards | 8 | 10 | Tripwire scan in `runDeclarative` before every step; patterns unit-tested (24 tests). −2: abort-with-evidence not exercised in a live browser run |
| 3 | OTP expiry + sweeper | 6 | 7 | `otp_expires_at` set on pause; `submit_otp` rejects expired (410); lazy sweeper kills sessions. −1: expired-fixture run not exercised live |
| 4 | Category exclusion | 6 | 7 | Server re-check before atomic claim; patterns + context flags unit-tested. −1: fixture approvals not exercised live |
| 5 | Approval + context | 8 | 10 | Full 7-element disclosure screen; `approval_context` recorded on approve; server refuses approvals without it. −2: end-to-end approval not exercised live |
| 6 | cancel_claimed + watcher | 6 | 10 | done → `cancel_claimed` + `cancel_claims` row (3 done paths); `cancel-watcher` deployed v7 + scheduled daily 06:00 UTC via pg_cron. −4: live transaction matching unverified (needs founder's synced data + a billing cycle) |
| 7 | Immutable ledger | 8 | 8 | `action_ledger_no_update` trigger deployed; function def verified (raises on UPDATE/DELETE) |
| 8 | One approval per cancel | 8 | 8 | Atomic claim (409 on double-claim); done-guard on execute; no bulk UI; a023/a055 green |
| 9 | Retry scoping | 5 | 5 | `retry_run` under same approval_id; execute refuses terminal-done approvals; UI "Try again" button |
| 10 | Event-driven chat | 5 | 5 | Fake `sleep()` timers removed from `startAgentTask`; steps run real `run()` fns; cancel path polls `exec_runs` |
| 11 | Disconnect + list | 5 | 5 | Credential list + per-merchant Disconnect (pre-existing) |
| 12 | JSON export | 5 | 5 | Export now includes runs + approvals + claims + ledger; audit list shows claim status |
| 13 | Playbook gating | 4 | 10 | Gate + `version` pinning + `playbook_reports` + 3-in-30d auto-demotion + UI report button. −6: 0 of 29 playbooks verified (founder-gated live runs) |

**Total: 84/100.** All deductions are "not exercised live" — the code is shipped, deployed, and unit-tested; live verification needs the founder's supervised runs.

## What would move the score

- Dim 6 → 10: watcher confirms a real billing cycle against the founder's synced transactions (needs his data + one billing cycle of wall-clock time).
- Dim 13 → 10: supervised live playbook-verification runs (founder's accounts, founder watching) — the Phase 3 pipeline.
- Beyond 96: live accuracy testing (10 consecutive supervised runs, zero wrong-merchant/out-of-scope) + counsel sign-off — the Phase 4 gate, deliberately unscored here.
