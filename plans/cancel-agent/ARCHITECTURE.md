# Cancel Agent — Architecture

**Status:** planning only. No production code from this document without founder review.
**Date:** 2026-09-28. **Author:** architecture subagent (parent: main agent).
**Scope:** the subscription-cancel agent ONLY. Bill pay and investing are later phases and out of scope here.

## 0. Where we stand

The pivot ("read-only is dead") does not start from zero. The repo already contains a nearly-complete execution stack built 2026-09-26/27:

| Component | Location | State |
|---|---|---|
| Recurrence detector (deterministic) | `src/upmore-app-template.html` `detectRecurrence()` (~L8303), `normalizeMerchant()` (~L8303) | **Reusable as-is** |
| Cancel state machine + confirmation watcher | `CancelState`, `runCancelWatcher()` (~L7650) | **Reusable, but client-side only** — see §5 |
| Execution edge function | `supabase/functions/agent-exec/index.ts` (1058 lines) | **Reusable** — Browserbase CDP driver, OTP handoff, atomic approval claims, verified-playbook gate |
| Merchant catalog | `supabase/functions/agent-exec/merchant-catalog.ts` (1279 lines, 67 playbooks) | **Schema reusable; content blocked** — 0 of 67 `verified:true` |
| Vault credential store | `supabase/functions/exec-vault-store/index.ts` | **Reusable, allowlist too narrow** — only `devin` |
| DB: `exec_approvals`, `exec_runs`, `exec_credential_refs` | `supabase/migrations/20260926_000001_agent_exec.sql`, `..._otp.sql` | **Reusable; needs small additions** (§5, §6) |
| Approval sheet UI (cred → approve → run) | template `openAgentSheet()`, `agentApprove()` (~L4900–5060) | **Modify** — approval content incomplete (§3) |
| Guided fallback (deep link + steps) | `renderAgentRunResult()` (~L4998) | **Reusable** |
| Agent100 cancel agents | `tests/agent100/agents/a023.js`, `a055.js`, `a056.js` | **Reusable** — they encode the standing rules |

**What does not exist yet:** one-tap revoke UI, audit-log UI, auto-approve-limit setting, server-side confirmation watcher, OTP-session TTL, playbook stop-guards, playbook verification pipeline. Each is specified below.

## 1. Detection — cancel candidates

**Reuse** `detectRecurrence()` unchanged. It is deterministic (no LLM), which is a safety property, not just a style choice: an LLM-invented subscription is the failure that gets screenshotted.

Pipeline: `detectRecurrence(transactions)` → subscription objects `{merchant_id, merchant_raw, amount, interval, confidence, occurrences, next_date}` → cancel queue ranking → per-candidate card.

Reused verbatim from `docspecs/02-cancel.md`:
- Amount clustering within 5% or $1; interval bands (weekly 6–8d, monthly 28–31d, etc.); confidence 0.6/0.8/0.95 by occurrence count.
- `NON_RECURRING_MERCHANT_RE` excludes coffee/restaurant false positives.
- Known gaps stay disclosed: annual subs need 13+ months of history; variable-amount billing gets 25% tolerance at 0.5 confidence; family plans and split billing need user input.

**Hard exclusions (never enter the cancel queue):** insurance, utilities, anything with a contract/early-termination fee (route to user decision with the arithmetic shown), subscriptions the user marked shared or keep. These are already in the docspec; the agent path must enforce them at the approval-insert layer, not just in card copy — i.e., `openAgentSheet()` refuses to open for excluded categories, and `agent-exec` re-checks the merchant category before claiming the approval (defense in depth; the client can be bypassed).

**New for the agent:** each candidate carries `agent_eligible` = has a `verified:true` playbook AND user has a vaulted credential for the merchant. Ineligible candidates show the existing guided path only. The queue must never imply the agent can cancel something it cannot.

## 2. Per-merchant procedure library

The catalog schema in `merchant-catalog.ts` (`MerchantPlaybook`, `DirectoryEntry`, `DriverAction`) is the right shape. Changes needed:

**Versioning.** Add to `MerchantPlaybook`: `version: number`, `changelog: string[]`, `last_verified_at: timestamp`, `verified_by: "supervised_run" | "user_outcome" | "manual"`. A playbook is a living document; the executor pins the exact `playbook_version` into `exec_runs.evidence` so every run is reproducible after the fact. When a playbook changes, in-flight `awaiting_otp` runs keep their pinned version.

**Verification pipeline (the thing that unblocks the 67 dead playbooks).**
1. `verified:false` ships by default (already the hard rule — keep it).
2. Graduation requires ONE supervised live run: founder's own account, founder watching, against the merchant's production site, driven through the real `agent-exec` path (not a local script). The run's `exec_runs` row is the graduation evidence; flip `verified:true` with `verification_note` linking the run id.
3. Decay: `last_verified_at` older than 90 days → playbook serves with its age stated on the approval screen ("steps last confirmed 4 months ago"). Three consecutive user mismatch reports → auto-demote to `verified:false` + guided fallback. This is straight from the docspec; it needs a `playbook_reports` table (new) and the demotion logic in the executor gate.

**Guided fallback stays universal.** `merchantDirectory` + `GENERIC_FALLBACK` already cover: unknown merchant, no playbook, unverified playbook, missing setup, human-only flows. The agent must never attempt what it cannot verify — the current gate (`verified !== true` → refused before vault/Browserbase access) is correct and must not be weakened for "just this once" cases.

**Playbook authoring rules (new, non-negotiable):**
- Steps may only navigate, fill login fields, click cancel/confirm controls, and read confirmation text. Any step that would create an account, accept terms, enter payment details, change a plan, or grant consent is FORBIDDEN in a playbook — the runner aborts (see §4 stop-guards).
- `evidence_texts` must be merchant-specific confirmation phrases, not generic "success".
- No playbook may depend on reading the user's email/SMS outside the OTP handoff.

## 3. Approval UX — one explicit approval per cancellation

The standing rule is absolute: **one explicit approval per cancellation, never bundled, never pre-approved, never implied.** The existing sheet (`openAgentSheet`) is the right skeleton but its approval screen is under-specified. It must show, all on one screen, before the Approve tap:

1. **What:** exact merchant display name + plan name (from the detected subscription, user-confirmed if ambiguous — never guess between two similar charges).
2. **Cost impact:** amount + interval, next billing date, and the 12-month projection **labeled as a projection** (Boundary 5: estimates never masquerade as calculations).
3. **Reversibility:** what happens on cancel — access until period end vs immediate loss; whether re-subscribing is one tap; any data loss (playlists, saved shows).
4. **Retention arithmetic** (when known from the catalog): "They'll offer X. That's $Y now, then full price again. Cancelling avoids $Z/yr." Accepting an offer is a legitimate outcome, not a failure.
5. **Agent mechanics disclosure:** "Upmore will log in to [merchant] as you using the login you saved, and click through the cancellation. This may violate [merchant]'s terms of service regarding automated access." (See COMPLIANCE_DIFF.md.)
6. **What the agent will NOT do:** no plan changes, no payment changes, no accepting offers on your behalf — cancel only, then stop.
7. **Failure path:** "If it can't complete, nothing is changed and you'll get the direct link + steps."

On approve, the client inserts `exec_approvals` with an `approval_context` JSONB (new column): the exact strings shown on screen (merchant, amount, projection, reversibility note, catalog version, ToS version accepted). This is the evidentiary record that the user approved *this specific thing* — it closes the "but I didn't know it would..." dispute class.

**Reconciling the auto-approve limit.** The trust model in the founder's brief includes a user-set auto-approve limit ("under $25 just happens"). This CONFLICTS with the standing rule "one explicit approval per cancellation" (also encoded in Agent100 a023/a055). Resolution, to be confirmed by the founder: **the cancel action itself always requires one explicit approval — no exceptions, no amount threshold.** The auto-approve limit may apply only to (a) surfacing/queueing candidates and (b) *retrying an already-approved attempt* after a transient failure (timeout, session drop), never to a new cancellation. If the founder wants true auto-approve for cancels, that is a separate written decision with its own ToS update — it must not slide in by default.

## 4. Execution

**Flow (mostly exists in `agent-exec/index.ts`):**
1. Client inserts `exec_approvals` (status `approved`, with `approval_context`) → invokes `agent-exec` with `approval_id`.
2. Server: authenticate → load approval → ownership + `action='cancel_subscription'` + status checks → resolve merchant → **gate**: unknown/no-playbook/unverified → audited guided refusal (approval reverts to `approved` for later retry) → **category exclusion re-check** (insurance/utility/contract — new) → atomic claim (`approved`→`executing`, exactly one winner) → load vaulted credential → Browserbase env check → run.
3. Run: per-task Browserbase session (`bbCreateSession`, killed at terminal states) → declarative `runDeclarative()` over pinned playbook version → **success requires BOTH merchant-specific confirmation text AND a final screenshot** (already implemented — keep) → write `exec_runs` evidence → approval `done`/`failed`.
4. OTP: pause as `awaiting_otp`, session kept alive; client collects code; `submit_otp` revalidates approval + playbook verification, reconnects to the SAME session, code travels only into the page. **New: 30-minute TTL on `awaiting_otp`** — a sweeper (scheduled edge function or pg_cron) marks expired runs `failed` ("code not provided in time") and kills the session. KeepAlive sessions cost per minute and are a dangling-access risk.

**Stop-guards (new, in `runDeclarative`).** Before every step, scan page text for tripwires: account-creation flows ("create your account", "sign up"), terms/privacy acceptance checkboxes, payment-method forms ("add a card", "billing details", "enter payment"), consent screens, and plan-change/downgrade offers presented as the cancel path. On tripwire: abort immediately, evidence `stopped_at_tripwire`, guided fallback. The agent cancels or it stops — it never improvises through a flow that needs the user's legal or financial consent. This is the executable form of the standing rule "stop for account creation/terms/payment/consent requiring Vishnu."

**Session scoping.** One Browserbase session per run, created with the minimum lifetime, destroyed at every terminal state AND on revoke (§7). The session id is stored on the run row; the OTP code is never stored (already correct — keep, and keep the Agent100/static assertions that prove it).

**What "done" means.** `done` = the browser observed merchant-specific confirmation text + captured a confirmation screenshot. It does NOT mean the money is saved — that is §5's job. The client may display "Cancelled ✓" only on `done` (standing rule), and must pair it with "watching your next bill to confirm" — never with a dollar-saved figure.

## 5. Confirmation — unifying the agent path with the state machine

**The gap:** today the agent path and the manual path use different confirmation machinery. Manual: `startCancelFlow` → `cancel_claimed` → localStorage claim record → `runCancelWatcher()` on app load → billing date + 2 days with no charge → `CONFIRMED` → Avoided ledger write (or reversal on zombie charge). Agent: `agentApprove` → on `done` marks `save_subscriptions.status='cancelled'` and writes **no claim record, no ledger entry, no watcher coverage**. An agent-cancelled subscription is never watched. The docspec's four-state rule (only `cancel_confirmed` counts) is violated for exactly the path we are building.

**Fix — one state machine for both paths:**
- Agent `done` → subscription enters `cancel_claimed` (display: "Cancelled — watching your [date] bill"), NOT `cancelled`. The client writes the same claim record the manual path writes (or better: a server-side `cancel_claims` row — new table — so watching doesn't depend on the user opening the app; see below).
- Ledger `Avoided` is written only when the confirmation check passes: next expected billing date + 2-day grace with no matching charge. Charge reappears → reversal entry + card returns to the queue with the honest message ("They charged you $14.99 anyway…").
- **Server-side watcher (new).** `runCancelWatcher()` is client-side and localStorage-backed — it only runs when the user opens the app. For agent cancellations, add a scheduled edge function (daily) that scans open `cancel_claims` rows past their grace date against synced transactions and writes the ledger outcomes. The client watcher stays as a second opinion, not the system of record.

This preserves the single most important trust property in the docspec: Upmore counts only confirmed cancellations, so its headline number is smaller than competitors' — permanently, by design.

## 6. Audit trail

`exec_runs` is already the right source of truth (approval_id, user_id, status, evidence JSONB with screenshots + confirmation text, error, timestamps). Additions:

- **Audit-log UI (new, required).** The client currently says "check the audit log" in error copy but there is no audit log screen. Build it: per-user list of runs (merchant, action, when, approval reference, outcome, evidence summary, confirmation-watch status). Exportable (JSON download). This is not a nice-to-have — it's the thing the user shows a merchant when disputing a charge, and it's the founder's only support tool.
- **Evidence hygiene (keep):** screenshots at login/billing/confirm stages; confirmation text excerpt (±120 chars); never OTPs, passwords, or full page HTML (PII minimization).
- **Retention:** run evidence kept while the user disputes or for 13 months (one full annual-billing cycle + 30 days), then evidence screenshots purged, row metadata kept. Add to the retention policy (COMPLIANCE_DIFF.md).

## 7. One-tap revoke

**Does not exist. Required before any live user touches the agent.** Spec:

- Single control in You tab → "Agent access": lists every merchant with a vaulted credential + active permissions.
- One tap "Revoke all agent access" → server-side (new edge function or `agent-exec` action `revoke_all`): deletes all `exec_cred_*` vault secrets for the user (via `exec_vault_delete`), deletes `exec_credential_refs` rows, kills any in-flight Browserbase sessions for the user's non-terminal runs (mark them `failed`/`revoked`), cancels pending approvals (status `cancelled`).
- Must be **instant and total**: after revoke returns, no stored credential and no live session may remain. The response returns a per-merchant checklist (deleted / no-op) so the user can verify.
- Individual merchant disconnect stays available (delete one credential), but the one-tap kill is the trust primitive the founder promised.

## 8. Trust model

- **Per-action approval** (§3) — the non-negotiable core.
- **Reversible-first ordering:** cancel (reversible: re-subscribe) before anything that moves money. The cancel agent never pays, never changes plans, never accepts retention offers — those need separate approvals in later phases.
- **Full audit** (§6) — every action attributable to an approval id.
- **One-tap revoke** (§7) — the escape hatch that makes the other three credible.
- **Auto-approve limit:** scoped as decided in §3 (queue surfacing + approved-attempt retries only) pending founder confirmation. Document the decision in the ToS version that ships with the agent.

## 9. Component map — what to build/modify/reuse

| # | Work | Files | Type |
|---|---|---|---|
| 1 | Approval screen: cost impact, reversibility, retention arithmetic, ToS disclosure, `approval_context` | `src/upmore-app-template.html` (`openAgentSheet`), migration: `exec_approvals.approval_context JSONB` | Modify |
| 2 | Stop-guards in declarative runner | `supabase/functions/agent-exec/index.ts` (`runDeclarative`) | Modify |
| 3 | OTP TTL sweeper | new scheduled function + `exec_runs` expiry check | New |
| 4 | Server-side confirmation watcher | new scheduled edge function + `cancel_claims` table | New |
| 5 | Unify agent-done → `cancel_claimed` | template `renderAgentRunResult` + claim record | Modify |
| 6 | Audit-log UI (list + export) | template You tab | New |
| 7 | One-tap revoke | new `agent-exec` action + template You tab | New |
| 8 | Category exclusion re-check in executor | `agent-exec/index.ts` gate | Modify |
| 9 | Playbook versioning + reports/demotion | `merchant-catalog.ts` schema, `playbook_reports` table, gate logic | Modify |
| 10 | Widen `MERCHANT_ALLOWLIST` per verified playbook | `exec-vault-store/index.ts` | Modify (gated by verification) |
| 11 | Update stale guide copy (`CHAT_READONLY_LINE`, "60 days") | template guide section | Modify |
| 12 | Compliance updates | `security-policies/09-*.md`, `docspecs/02-cancel.md` amendment, `terms.html`, retention policy | Modify — see COMPLIANCE_DIFF.md |

## 10. Open questions for the founder

1. Auto-approve limit: confirm the §3 scoping (cancel action always needs one explicit approval), or make a separate written decision.
2. Browserbase keys: still an open launch gate — the entire executor returns `needs_setup` until installed.
3. Playbook graduation: is the founder willing to do supervised live runs on his own accounts (starting with Devin, already recon'd)? Without this, the registry stays at 0 verified and the agent is a guided-fallback UI.
4. Support: who answers when the agent fails at 11pm? (Recommendation: in-app "report a problem" attaching the run id; founder triages from `exec_runs`.)
