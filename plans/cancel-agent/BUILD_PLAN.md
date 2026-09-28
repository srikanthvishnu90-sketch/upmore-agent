# Cancel Agent — Build Plan

**Scope:** subscription-cancel agent ONLY. Bill pay (Visa/Mastercard rails), user-directed trades (Alpaca), and discretionary investing (RIA) are later phases — explicitly out of scope here.
**Rule:** be critical, never rush. Each phase has an exit gate; no phase starts until the previous gate is signed off by the founder.

## Phase 0 — External gates (no code; founder actions)

| # | Gate | Owner | Why it blocks |
|---|---|---|---|
| 0.1 | Browserbase API key + project ID installed in the Upmore Supabase project (`mrwngntwmnaqrqhupvlt`) | Founder | Without it `agent-exec` returns `needs_setup` for every run — the executor is a guided-fallback UI |
| 0.2 | Founder commits to supervised live playbook-verification runs on his own accounts (starting with Devin — recon already done 2026-09-26) | Founder | 0 of 67 playbooks are `verified:true`; the executor refuses all unverified playbooks by design |
| 0.3 | Written sign-off on the auto-approve scoping (ARCHITECTURE.md §3: cancel action always needs one explicit approval) | Founder | Resolves the conflict between the standing rule and the trust-model memo |
| 0.4 | Securities/counsel engagement **scheduled** (not necessarily completed) | Founder | COMPLIANCE_DIFF.md §4 checklist must clear before any live user touches the agent |

Do not write Phase 1 code until 0.1–0.3 are done. 0.4 may run in parallel with Phase 1 but must complete before Phase 4.

## Phase 1 — Trust primitives (the non-negotiable core)

Build in this order; each is independently testable in dry mode:

1. **One-tap revoke** (ARCH §7). New `agent-exec` action `revoke_all`: delete all `exec_cred_*` vault secrets, clear `exec_credential_refs`, kill in-flight Browserbase sessions, cancel pending approvals. UI in You tab with per-merchant verification checklist. **Test:** vault-store a test credential, revoke, assert vault read fails and refs are gone.
2. **Audit-log UI** (ARCH §6). Per-user run list from `exec_runs` (merchant, when, approval ref, outcome, evidence summary, confirmation-watch state) + JSON export. The client currently promises an audit log that doesn't exist — this closes that lie.
3. **Approval screen completion** (ARCH §3): cost impact (12-mo projection, labeled), reversibility, retention arithmetic, ToS-violation disclosure, what-the-agent-won't-do, failure path. Record `approval_context` JSONB (new migration).
4. **Stop-guards** (ARCH §4): tripwire scan in `runDeclarative` for account-creation / ToS-acceptance / payment-entry / consent / plan-change screens → abort + guided fallback.
5. **OTP TTL sweeper** (ARCH §4): 30-minute expiry on `awaiting_otp`, session kill, run marked failed.
6. **Executor category re-check** (ARCH §1): insurance/utility/contract/keep/shared exclusions enforced server-side before the atomic claim, not just in card copy.
7. **Copy corrections**: rewrite `CHAT_READONLY_LINE`; reconcile "60 days" vs billing-date+2-days; keep a032's bank-read-only assertion green.

**Exit gate:** dry-run Agent100 103/103 with new assertions (revoke deletes, approval_context recorded, stop-guard aborts on a fixture ToS screen, OTP expiry). Founder reviews the approval screen on his phone.

## Phase 2 — Confirmation unification (the honesty property)

1. Agent `done` → subscription enters `cancel_claimed` (display "Cancelled — watching your [date] bill"), **not** `cancelled`. (Today it marks `cancelled` immediately with no watcher coverage — this is the single biggest honesty bug in the current agent path.)
2. New `cancel_claims` table (server-side claim records: user, merchant, expected billing date, amount, source run id).
3. Scheduled daily edge function: scans open claims past billing-date + 2-day grace against synced transactions → writes `Avoided` ledger entries on clean pass; writes reversals + re-queues the card on zombie charges.
4. Keep the client `runCancelWatcher()` as a second opinion for the manual path; the server job is the system of record for agent path.

**Exit gate:** end-to-end dry test of the full lifecycle — approve → done → claimed → (simulated) clean billing date → Avoided written; and the zombie path — charge reappears → reversal + re-queue. Ledger never shows a dollar before confirmation.

## Phase 3 — Playbook verification pipeline (the moat)

1. Schema: `version`, `changelog`, `last_verified_at`, `verified_by` on `MerchantPlaybook`; pin `playbook_version` in run evidence; new `playbook_reports` table (user mismatch reports); auto-demotion after 3 consecutive mismatches; 90-day staleness labeling.
2. Verification runs: founder-supervised, founder's own accounts, production merchant sites, through the real `agent-exec` path. Each graduation links its `exec_runs` id in `verification_note`. Priority order: Devin (recon done) → top merchants by detected frequency across the user base (the docspec's "first 50 cover the majority" — start with 10).
3. Widen `exec-vault-store` `MERCHANT_ALLOWLIST` **only** as playbooks graduate — one merchant at a time, never preemptively.
4. Playbook authoring rules enforced in review (ARCH §2): cancel-only steps, merchant-specific evidence texts, no email/SMS dependencies.

**Exit gate:** ≥10 verified playbooks covering the top detected merchants; demotion path tested (3 synthetic mismatch reports → auto-demote → guided fallback served).

## Phase 4 — Live accuracy testing + support runbook

1. **Supervised live runs** on the founder's real subscriptions (his explicit per-run approval; live Agent100 mode stays hard-gated per standing rules — `--mode live --founder-confirm "APPROVE LIVE"` only with his go-ahead).
2. Accuracy criteria per run: correct merchant (no ambiguous-match execution), cancel-only (no plan/payment/consent touched — verify via evidence screenshots), confirmation text captured, no credential/OTP in evidence, run row complete.
3. **Failure taxonomy** from live runs: login wall (expired cred → re-vault prompt), layout change (tripwire or selector miss → guided fallback + mismatch report), retention dark pattern (abort → hand to user with notes), CAPTCHA/bot wall (abort → guided fallback; never attempt to defeat it — see risks).
4. **Support runbook:** in-app "Report a problem" on every run row attaching the run id; founder triages from `exec_runs` evidence; response SLA stated in-app (honest: "founder-supported beta").
5. Counsel clears COMPLIANCE_DIFF.md §4; ToS version with the agent clauses ships; `tos_acceptance` records it.

**Exit gate:** 10 consecutive supervised live runs with zero wrong-merchant and zero out-of-scope actions; counsel sign-off; founder declares beta.

## Honest risks

1. **Merchant bot-detection and countermeasures.** This is the existential risk, not a footnote. Merchants actively fight automation: CAPTCHAs, device fingerprinting, behavioral analysis, Auth0-style passwordless flows (Devin's recon already showed no HTTP path exists). Browserbase is a datacenter browser — some merchants will flag it. The architecture's answer is *graceful*: abort → guided fallback, never attempt to defeat a challenge (defeating CAPTCHAs/bot walls escalates both the ToS and legal position). Consequence: the agent will simply fail on hardened merchants, and the honest product response is the guided path — which means **the cancel agent's coverage ceiling is set by merchants, not by us.** Do not promise "cancel anything."
2. **Credential-vault security bar.** Vaulted merchant passwords are the most sensitive data Upmore will ever hold — reusable user passwords, possibly reused across sites. The Supabase Vault mechanics are sound (service_role-only, namespaced `exec_cred_*`, never in evidence/logs), but the *operational* bar rises: service_role key hygiene, no credential in any log line ever (one stray `console.log(cred)` in an edge function is a breach), rotation procedure, breach-notification plan. Recommend a dedicated pre-launch secrets audit of both edge functions.
3. **Support burden when the agent fails.** Every failure is a user whose subscription is still billing them, and they will blame Upmore, not the merchant. The guided fallback + deep link softens it, but the founder is the entire support team. Mitigation: the audit-log UI + report-a-problem flow, the failure taxonomy in Phase 4, and — critically — never over-promise coverage. A failed agent that hands you the exact deep link and steps is a good product; a failed agent that said "cancel anything" is a betrayal.
4. **Accuracy testing is load-bearing, not nice-to-have.** The founder's brief says it plainly: errors now cost users real money. The specific catastrophic cases: (a) wrong-merchant cancellation (two similar charges, ambiguous match — mitigated by refusing ambiguous matches, but the refusal logic itself needs testing); (b) canceling something the user marked keep/shared (exclusion enforcement needs negative tests); (c) the agent clicking through a retention "offer" that is actually a plan change (stop-guards need adversarial fixtures). Each needs a dedicated Agent100 agent before live.
5. **Playbook decay is permanent maintenance.** Merchants change flows deliberately (the docspec: "a library that is current is worth more than a catalog that is large"). The 90-day staleness + 3-mismatch demotion pipeline is designed, but someone must do the re-verification runs forever. Budget it as ongoing ops, not a build phase.
6. **OTP friction.** Passwordless/OTP logins (Devin-style) are increasingly common, which means the keepAlive-session + user-fetches-code dance is the *normal* path, not the edge case. Every OTP run is a session the user must babysit. If OTP-heavy merchants dominate the top-10, the "agent" feels like a co-pilot with extra steps — still valuable, but market it honestly.
7. **Cost.** Browserbase sessions bill per minute; keepAlive OTP pauses and long retention-dialog flows add up. The unit economics need a per-run cost ceiling and a monthly agent-spend guardrail before open beta — otherwise a popular feature becomes a cost center with no pricing attached yet.

## Explicit non-goals (this plan does not include)

- Bill pay / purchases (Visa Intelligent Commerce / Mastercard Agent Pay) — separate compliance diff + build plan.
- User-directed trades (Alpaca) and discretionary investing (RIA) — separate everything, securities lawyer first.
- Phone-call cancellations — standing rule, never.
- Card-level blocking as a "cancellation" — the docspec's warning stands (deferred debt, never an Avoided entry).
- Auto-approving the cancel action itself — pending the founder's written decision (Phase 0.3).

## Suggested sequencing note

Phase 1 and Phase 2 are the trust foundation — ship nothing to any user until both gates pass. Phase 3 is the long tail of coverage. Phase 4 is the only phase that touches real money-adjacent outcomes, and it stays founder-supervised until the accuracy criteria hold for 10 straight runs.
