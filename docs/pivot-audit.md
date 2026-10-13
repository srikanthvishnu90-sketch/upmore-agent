# Pivot Audit — finance → career (Step 0, prompt 3)

Date: 2026-10-12. Branch: `pivot/career`. Nothing deployed, no production data touched, no finance code deleted — shelved means off the user path and out of the gauntlet, code retained.

## Branch situation (read first)
- Pre-pivot state tagged **`finance-final`** at commit **`099b2b0`** = tip of `claude/wave01-build` (local), the freshest finance state: Wave 0+1, the 5 Phase-A bug fixes (`2b2b8e8` is an ancestor), the K-cluster merges (K9/K10/K11), and the go-live gauntlet record (agent-chat v219). `pivot/career` branches from `099b2b0`. Worktree: `~/workspace/upmore-career`.
- `main` in this repo is stale (`192132d`) and is NOT the current product; the working build line was `claude/upmore-16-spec-instinct-0qyuqj` → `claude/wave01-build`. Prompt 3 said "tag the current main"; the tag was placed on the real current head instead (repo wins over the prompt's assumption — see Conflicts).
- Local `claude/wave01-build` was **3 commits ahead of `origin/claude/wave01-build`** (`4c5f486`) at pivot time; those commits exist locally and are the base of `pivot/career`.
- The old worktree `~/workspace/upmore-w01` holds an **uncommitted 4-line change** to `scripts/build-router-core.py` from the paused overnight run. Left exactly as found; it is not part of `finance-final` or `pivot/career`.
- ~25 stale overnight worktrees/branches (claude/k1..k13, claude/w1..w3, claude/fin-a1..a5) exist; their merged content is inside `099b2b0`. Cleanup is a later, separate decision — nothing deleted on this pass.

## Headline counts (all counted in the repo, none quoted)
- Registered capabilities in code (`packages/capabilities/registry.json` + overlay): **296** — TESTED 209, CLAIMED 68, GATED 19, VERIFIED 0. Plus **112** CLAIMED backlog items attached to registry capabilities. Spec lists that map onto the registry: real-world list **206**, owner pasted list **149** (57 reachable in `docs/capability-list/map.cjs`).
- Career capabilities from the starter pack: **51** (inventory Table 2). **Inventory grand total: 347.**
- Code surface: **93** domain modules, **26** edge functions (incl. `_shared`), **27** shared TS modules, **94** database tables across **69** migrations, **101** connector platform entries, **189** node test files + **119** edge test files + Agent100 harness + evals (depth/mutations/gauntlet/parity).
- Tag totals for the build surface below: KEEP / ADAPT / SHELVE / NEW are counted per section.

## Edge functions (supabase/functions) — 26

| Function | Tag | Note |
|---|---|---|
| _shared | KEEP — connector framework, model gateway, router core, vault helpers |
| agent-chat | KEEP — the chat core; finance answer modules inside shelve with their domains |
| agent-exec | ADAPT — execution engine; finance tool payloads shelve, card-gated execution pattern carries to apply/send |
| agent-message-inbound | KEEP — messaging rail |
| agent-message-turn | KEEP — messaging rail |
| agent-message-worker | KEEP — messaging rail |
| agent-payments | SHELVE — finance payments |
| agent-proactive | ADAPT — scheduler/push becomes shortlist, status alerts, digest |
| agent-workflows | KEEP — background job framework |
| broker-oauth-callback | SHELVE — brokerage |
| broker-oauth-start | SHELVE — brokerage |
| cancel-watcher | SHELVE — subscription/finance watcher |
| delete-account | KEEP — account lifecycle |
| exec-vault-store | KEEP — credential vault |
| gmail-oauth | KEEP — required by Track + Outreach |
| imessage-inbound | KEEP — iMessage rail (LoopMessage) |
| manual-connect | ADAPT — session-only login lane becomes ATS/company login lane |
| model-health | KEEP — provider probe |
| news-feed | SHELVE — stock news (company briefs are a NEW build) |
| plaid | SHELVE — bank aggregator |
| plaid-sync | SHELVE |
| simplefin-claim | SHELVE |
| simplefin-proxy | SHELVE |
| stripe-checkout | KEEP — product billing infra (not a finance capability) |
| stripe-credits | KEEP — product billing infra |
| stripe-webhook | KEEP — product billing infra |

## Domain modules (packages/domain) — 93

| Module | Tag | Career mapping (ADAPT only) |
|---|---|---|
| 100-subscription-list.js | SHELVE | — |
| 101-money-in.js | SHELVE | — |
| 102-charge-check.js | SHELVE | — |
| 103-reminders.js | ADAPT | network upkeep + follow-up reminders |
| 104-cancelled-charge.js | SHELVE | — |
| 105-iou-log.js | SHELVE | — |
| 106-rent-short.js | SHELVE | — |
| 107-save-goal.js | SHELVE | — |
| 108-spend-recheck.js | SHELVE | — |
| 109-scam-check.js | SHELVE | — |
| 110-savings-rate.js | SHELVE | — |
| 111-not-yet.js | SHELVE | — |
| 112-late-fee-watch.js | SHELVE | — |
| 113-scheduled-send.js | SHELVE | — |
| 114-savings-goals.js | SHELVE | — |
| 115-paycheck-send.js | SHELVE | — |
| 116-tip-fees.js | SHELVE | — |
| 117-agent-transfer.js | SHELVE | — |
| 118-agent-bureaus.js | SHELVE | — |
| 118-agent-government.js | SHELVE | — |
| 118-bank-actions.js | SHELVE | — |
| 118-crypto-tax.js | SHELVE | — |
| 118-market-intel.js | SHELVE | — |
| 118-payroll-benefits.js | SHELVE | — |
| 32-merchant-label.js | ADAPT | company/role normalization, dedupe, seniority tagging |
| 33-agent-monitors.js | ADAPT | deadline + follow-up monitors |
| 35-agent-intents.js | KEEP | — |
| 36-agent-workflows.js | KEEP | — |
| 37-agent-financial-model.js | SHELVE | — |
| 38-agent-biller-model.js | SHELVE | — |
| 39-agent-posted-flow.js | SHELVE | — |
| 40-agent-classified-ledger.js | SHELVE | — |
| 41-agent-recovery.js | SHELVE | — |
| 41-agent-subscription-case.js | SHELVE | — |
| 42-agent-recipients.js | ADAPT | contact/relationship memory for outreach |
| 43-agent-loop.js | KEEP | — |
| 44-agent-earn.js | SHELVE | — |
| 45-advice-guard.js | KEEP | — |
| 46-voice.js | KEEP | — |
| 47-data-guard.js | KEEP | — |
| 48-money-math.js | SHELVE | — |
| 49-agent-save.js | SHELVE | — |
| 50-agent-invest.js | SHELVE | — |
| 51-connectors.js | ADAPT | connector linking (Gmail, Calendar, LinkedIn export, resume upload) |
| 52-connector-catalog.js | ADAPT | career connector catalog (finance platform rows shelve) |
| 53-compliance.js | ADAPT | advice disclaimers, consent log, per-connector ToS stance |
| 54-agent-money.js | SHELVE | — |
| 55-agent-news.js | SHELVE | — |
| 56-agent-proactive.js | ADAPT | daily shortlist + digest delivery |
| 57-agent-ledger.js | KEEP | — |
| 58-agent-control.js | KEEP | — |
| 59-agent-alerts.js | ADAPT | application status + deadline alerts |
| 60-agent-money-plans.js | SHELVE | — |
| 61-agent-credit.js | SHELVE | — |
| 62-agent-documents.js | ADAPT | resume + offer-letter parsing |
| 63-agent-surfaces.js | KEEP | — |
| 64-agent-send.js | ADAPT | outreach send rail (own account, card first) |
| 65-agent-realworld.js | ADAPT | capability engine pattern; finance spec data shelves |
| 66-agent-trade.js | SHELVE | — |
| 67-agent-cards.js | KEEP | — |
| 68-agent-cancel.js | ADAPT | negotiation flow mechanism (intake → counter) |
| 69-agent-router.js | KEEP | — |
| 70-agent-split.js | SHELVE | — |
| 71-alpaca.js | SHELVE | — |
| 72-merchant-terms.js | SHELVE | — |
| 73-broker-accounts.js | SHELVE | — |
| 74-broker-connect.js | SHELVE | — |
| 75-style-corpus.js | KEEP | — |
| 76-connect-cards.js | SHELVE | — |
| 77-brokerage-connectors.js | SHELVE | — |
| 78-manual-connect.js | ADAPT | session logins for ATS/company portals |
| 79-dispute.js | SHELVE | — |
| 80-money-answers.js | SHELVE | — |
| 81-standing-rent.js | SHELVE | — |
| 82-offer-book.js | SHELVE | — |
| 83-airline-refunds.js | SHELVE | — |
| 84-money-owed.js | SHELVE | — |
| 85-subscription-savings.js | SHELVE | — |
| 86-the-numbers.js | SHELVE | — |
| 87-rewards-math.js | SHELVE | — |
| 88-price-drop.js | SHELVE | — |
| 89-free-substitutes.js | SHELVE | — |
| 89-win-back.js | SHELVE | — |
| 90-card-offers.js | SHELVE | — |
| 91-unclaimed.js | SHELVE | — |
| 92-whats-new.js | SHELVE | — |
| 93-budgets.js | SHELVE | — |
| 94-spending-views.js | SHELVE | — |
| 95-category-rules.js | ADAPT | role/company categorization rules |
| 96-year-in-money.js | SHELVE | — |
| 97-bnpl.js | SHELVE | — |
| 98-refund-check.js | SHELVE | — |
| 99-deadlines.js | ADAPT | recurring career deadlines (cycles, offer expiry) |

Domain module totals: KEEP 12, ADAPT 16, SHELVE 65 (finance-specific: money, save, invest, trade, credit, bills, subscriptions, brokerage, bureaus, government, payroll, P2P, IOU, rent, rewards, class actions, unclaimed, BNPL, disputes, refunds).

## Database tables (from 69 migrations) — 94

- KEEP (49) — agent core, messaging, vault, consent, approvals: agent_account_preferences, agent_biller_connections, agent_biller_records, agent_cancel_watches, agent_financial_accounts, agent_financial_ingestions, agent_financial_syncs, agent_financial_transactions, agent_flow_state, agent_ledger, agent_message_channels, agent_message_delivery_events, agent_message_inbox, agent_message_link_codes, agent_message_outbox, agent_message_transports, agent_message_turns, agent_model_calls, agent_obligation_edits, agent_obligations, agent_payment_adapters, agent_payment_attempts, agent_payment_coverage, agent_payment_events, agent_payment_funding_accounts, agent_proactive_log, agent_proactive_settings, agent_provider_events, agent_rate_limits, agent_recovery_cases, agent_recovery_events, agent_recovery_receipts, agent_transaction_review_pairs, agent_transaction_reviews, agent_transaction_revisions, agent_turn_costs, agent_usage, agent_workflow_events, agent_workflow_rate_limits, agent_workflow_tasks, consent_log, exec_approvals, exec_credential_refs, exec_runs, imessage_outbox, imessage_threads, reminders, tos_acceptance, user_oauth_connections
- ADAPT (6) — scheduler/settings/tasks machinery reused by career jobs: agent_findings, agent_lessons, agent_scheduled, agent_settings, agent_steps, agent_tasks
- SHELVE (39) — finance-domain data (bank feeds, trades, savings, recovery, billing): action_ledger, auto_invest_rules, broker_oauth_states, broker_pending_links, brokerage_accounts, cancel_claims, class_action_settlements, copy_follows, copy_leaders, finance_accounts, finance_alerts, finance_goals, finance_snapshots, finance_waitlist, founder_alerts, ipo_offerings, ipo_requests, live_opportunities, manual_connections, plaid_holdings_cache, plaid_items, plaid_spend_ledger, plaid_txn_cache, playbook_reports, portfolio_snapshots, referral_credits, referrals, save_claims, save_ledger, save_receipts, save_renewals, save_subscriptions, saved_recipients, simplefin_connections, simplefin_requests, standing_payments, trade_orders, user_subscriptions, web_agent_jobs
- NEW tables required (Phase A): `applications` (the single log every group writes to), `job_postings`, `contacts`/`relationships`, `profile_vault`, `resume_versions`, `outreach_log`. None created on this pass.

## Migrations — 69 files
All 69 migration files are KEEP as applied history (migrations are never edited or deleted; the ledger tops at `20261012060000_oauth_vault_cascade.sql`). Finance-domain migrations (manual_connections, standing_payments, ious, category_rules, broker_vault_cascade, oauth_vault_cascade and the plaid/simplefin/trade-era files) are SHELVE-domain but retained — the tables stay, the career product simply does not read them. Career tables arrive as NEW migrations in Phase A.

## Approval cards
- `packages/domain/67-agent-cards.js` (CORE-009) + `exec_approvals` table: **KEEP** — the card system itself: fixed anatomy, context-bound, read-back, supersede, "never mind" kill, cross-restart validity.
- Money/send/trade card payloads: **SHELVE** as defaults. Per prompt 3, card types generalize to: send, submit, share, account change.
- NEW card payloads to build: submit-application (APPL-003), send-outreach (OUTR-004/007), share-profile. Money cards remain only if the owner keeps a payments feature — [VISHNU FILLS].

## Connectors
- Framework (`supabase/functions/_shared`, OAuth/token refresh/webhooks, vault): **KEEP**.
- `packages/connectors/platforms.json`: **101** platform entries — the entries are finance (brokers, banks, billers): **SHELVE** the entries, **ADAPT** the catalog mechanism for career connectors (ATS boards, Gmail, Calendar, LinkedIn export, job sources).
- Gmail + Calendar connectors: **KEEP** (load-bearing for Track and Outreach). SimpleFIN/Plaid/Alpaca/Browserbase-finance playbooks: **SHELVE**. `connect/gmail.html`: KEEP; `connect/alpaca.html`: SHELVE.

## Tests and evals
- Harnesses: **KEEP** — tests/agent100 (103-case harness), evals/ (runner, depth, mutations, gauntlet incl. live runner + replays, parity), replay-test pattern, design-review sweep (`docs/design-review/` referenced by prompt 1), router-bundle tests.
- Finance test files: **SHELVE as a suite** — 189 node test files + 119 edge test files are overwhelmingly finance-domain (depth-*.test.cjs per finance capability, money/save/invest suites). Per prompt 3 they move to a separate finance suite excluded from the career gauntlet; core tests (router, control, harness, no-secrets, no-password-storage, capability registry) stay **KEEP** in the main suite. Exact split happens when the suite is separated in Phase A — not on this pass.
- Gauntlet corpora (spec16, sloppy-20, L3): **SHELVE** as finance corpora; career gauntlet corpora are NEW.

## Docs
- `docs/capability-list/`, `docs/capability-inventory.md` (this run), `docs/pivot-audit.md` (this file): **ADAPT/NEW** — the living truth files.
- `docs/realworld/` (the 206), `docs/instinct-spec-series/`, `docs/upmore-200-capabilities.md`, trading/bill-pay/brokerage specs, finance gauntlet records: **SHELVE** — finance record, retained.
- `docs/gauntlet/`, `docs/architecture/`, `docs/methods/`, `docs/testing/`, `docs/connector-matrix/`: **KEEP** — machinery and method.
- Root docs (`SPEC.md`, `PRODUCT.md`, `PROMPT.md`, `BUILD_PLAN.md`, `finance-management-design.md`): **SHELVE** content, replaced by career versions in pivot step 2 (system prompt, onboarding, copy) — not rewritten on this pass.
- App surface: `index.html` is generated from `src/upmore-app-template.html` (never edit index.html directly); finance screens/copy inside the template: **SHELVE** behind the pivot in step 2. `sw.js` cache stamp flow: KEEP.

## ADAPT mapping (prompt 3, finance mechanism → career capability)

| Finance mechanism | Career capability | Inventory IDs |
|---|---|---|
| Transaction feed ingestion | Job feed ingestion (ATS endpoints, company pages, new-grad lists) | DISC-003/004/008 |
| Merchant normalization / categorization | Company + role normalization, dedupe, seniority tagging | DISC-003 |
| Aggregator account linking (Plaid-style) | Connector linking: Gmail, Calendar, LinkedIn export upload, resume upload | DISC-002, TRAK-002 |
| Inbox receipt matching | Inbox application-status detection | TRAK-002 |
| Daily money briefing | Daily job shortlist with yes/no replies | DISC-006 |
| Budget / spend alerts | Application status + deadline alerts | TRAK-004 |
| Recurring charge / bill detection | Recurring deadlines + follow-up timers | TRAK-003/004 |
| Spending reports / insights | Funnel analytics + weekly digest | TRAK-005/006 |
| Safe-to-spend / forecast | Fit scoring + pipeline odds | DISC-005 |
| Savings / earn engines | Opportunity watch, referral openings, skill-gap | COS-002/003 |
| Net-worth / portfolio view | Career dashboard: market value over time, skills, network | COS-001 |
| Money-movement approval cards | Submit-application + send-outreach cards | APPL-003, OUTR-004 |
| Subscription cancel / negotiate-a-bill | Offer negotiation flow | NEGO-001..006 |
| Stock / daily reminders | Network upkeep + follow-up reminders | COS-004 |
| Document intake (statements) | Offer-letter + resume parsing | DISC-002, NEGO-001 |
| Compliance + disclosures | Advice disclaimers, consent log, ToS stance per connector | OUTR-008, cross-cutting |

## NEW builds (no finance equivalent)
Resume/profile builder + per-job tailoring + versioning + ATS-safe export; profile vault (contact, work auth, EEO, standard answers); ATS browser automation (Greenhouse, Lever, Ashby, Workday) with CAPTCHA/email-verification handling and confirmation capture; ghost-job detection; company briefs; warm-path mapping + ranked contacts + intro-request flow + relationship memory + send caps/deliverability guards; interview prep (briefs, question bank, STAR bank, text/voice mocks with scored feedback, debrief); comp benchmarking data rail; career OS (market value, skill gap, living resume/wins log, first-90-days). IDs: inventory Table 2.

## Conflicts — attached docs vs repo (repo wins)
1. **Counts.** Prompts/docs quote 206, 149, 139, 316. Repo truth: **296** registered capabilities + **112** backlog items. 206 is a spec list mapped onto the registry (`realworld.json`), 149 is the owner list of which only **57** items map REACHABLE in `map.cjs`, 139 is a data-requirements companion to that list. The inventory counts the registry, not the quotes.
2. **Tier scales.** Registry uses T0–T5 (inform/watch/draft/act-with-confirmation/standing-limits/never-autonomous); prompt 1 defines T0–T3 (read/draft/send/money). Repo scale kept for the 296; career rows use the prompt-1 scale; a unifying rename is owed before Phase B so the gauntlet speaks one scale.
3. **Status words.** Registry: CLAIMED/BUILT/TESTED/VERIFIED/GATED/NOT_WIRED. Prompt 1: built/proven live/blocked. Mapped in the inventory header. Consequence: **proven live = 0** by the registry standard (VERIFIED needs a live provider record) even though a finance subset ran against a live test account in gauntlets — the stricter repo standard wins.
4. **"Tag the current main."** `main` is stale (192132d); the live build line is `claude/wave01-build` at 099b2b0. Tag `finance-final` placed on 099b2b0.
5. **MVP vs full loop.** The starter pack suggests a thin MVP wedge; prompt 2 (later, marching orders) says build the full loop in phases. Prompt 2 governs; the pack's MVP list is treated as Phase A+B scope, not the ceiling.
6. **Done-when optimism in the 206.** `realworld.json` marks 149/206 items `writes: true` and 68 carry an internal `execution_gap`; the registry marks the corresponding rails GATED or CLAIMED. Where a C-item's done-when assumes a live rail, the registry status is the truth and the item is not "built".
7. **Google connection.** The starter pack assumes the product can use the user's connected Google account. Repo reality: `gmail-oauth` function + Google OAuth secrets exist, but the function is not in the deployed set and no user grant flow is wired into the product. Recorded as a Phase A/B build item, not an existing capability.

## Blocked / owner inputs owed
- Product name [VISHNU FILLS] — placeholder constant until filled; blocks rename step only.
- Browser-automation ToS stance → blocks APPL-003 (auto-apply).
- Daily outreach cap → blocks OUTR-008.
- Live-interview-assist yes/no → blocks PREP-008.
- Wedge confirmation (W1 suggested), messaging channel first, who pays first, launch community, job-data strategy + monthly data budget cap, any finance feature surviving as a "career money" add-on, launch deadline.

## What did NOT happen on this pass
No deploys. No production data changes. No merges to main. No finance code deleted. No capability code written. Step 0 = branch + tag + audit + inventory only.
