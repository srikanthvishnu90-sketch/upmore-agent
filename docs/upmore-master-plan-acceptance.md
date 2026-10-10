# Upmore master plan acceptance

Upmore retains the original 50 scenarios and their 300 requirements. The October 10 Umpire blueprint adds 130 capability IDs, eight complete workflows, and twelve engineering acceptance packets. Its proposed capabilities are targets, rather than shipped product claims. The product remains named Upmore in this repository.

The current implementation has locally tested foundations for obligations, bank evidence, payment preparation, approval enforcement, durable Messages processing, and restricted financial tools. Supported live biller and payment adapters remain unregistered. No general rent, installment-loan, transfer, or trading execution coverage follows from a connected bank account.

## Engineering packets and remaining evidence

| Packet | Existing local foundation | Acceptance work still required |
| --- | --- | --- |
| B01 isolation | Owner filters, RLS and privileged thread checks; bank secrets use the authenticated owner namespace; Messages lessons retain an explicit owner | Inspect every existing endpoint, object/document reference, household role and cache. Test cross-owner reads and writes through each deployed route. |
| B02 ingestion | Exact USD amounts, provider IDs, pending references, stale-batch rejection; immutable normalized ingestion and economic fact revisions; local authenticated correction screen for all eight classification kinds; explicit linked refund selection; atomic reciprocal transfer/card-payment interpretations; current versus stale review display | Original raw provider evidence where permitted; explicit provider removals, cursor recovery and provenance for each connector; splits/principal/interest; provider-assisted categorization; full review-history UI and browser verification. User reviews remain distinct from verified provider classifications. |
| B03 baseline | Server-calculated cash context, retained posted bank-flow reports and reviewed spending/income reports; unknown/stale reviews preserve incomplete totals; bounded evidence references | Holdings, liabilities, ownership, missing institutions, income regularity and a 30-day forecast. Persist consistent report snapshots/versions and confirm phone usability. Bank credits/debits alone do not establish income/expenses. |
| B04 subscriptions | Existing cancellation paths and watcher are preserved; recurring bank patterns create candidates | Verify purchase channel, owner, plan, trial/renewal dates, terms, fees and access/data loss. Corrections and changed terms must invalidate review. Verify the following billing period. |
| B05 approvals | Immutable workflow proposals, exact snapshot approval, expiry/revocation, replay tests and payment reservations | Extend the complete material-terms contract to every external effect; trusted destination verification; bounded recurring mandates with concurrent aggregate caps. Old T0–T3 settings do not grant the new A0–A5 authority model. |
| B06 cases | Durable inbox/turn/outbox, payment leases, pre-network markers, idempotent events, uncertain outcomes and provider readback contracts | General durable cases, deadlines, scheduling, escalation, compensation and terminal-outcome receipts across cancellations, claims, disputes and investments. Unknown submissions cannot disappear or be retried blindly. |
| B07 claims | Existing settlement research/preparation paths | Official source freshness; claimant ownership; declaration review; approved document audience; claim IDs; additional evidence requests; approved versus actually received funds. |
| B08 transfers | Payment preflight/reservation and recovery foundations | Separate transfer sandbox adapter, verified owned endpoints, rail/fee limits, two-sided reconciliation and later returns. Provider and production gates remain closed. |
| B09 brokerage | Current upstream investment tables and existing deterministic investment calculations | Paper account/order adapter; exact security and economics; buying power; quote age; partial fills; cancel/replace races; order receipts and settlement states. Tables and chat demonstrations are not execution proof. |
| B10 private markets | Existing IPO directory and research context | Verified active offerings, access path, document versions, eligibility unknowns, issuer-attributed diligence, instrument mechanics, liquidity and concentration. Authorized intermediary handoff and closing/issuance tracking are separate from research. |
| B11 adversarial tests | Tool argument/ownership guards, model-output rejection, approval replay checks, worker races and protected private lesson writes | Full synthetic invoice/document injection, altered destinations, attachments, session attacks, secret/log checks, fake receipts and cross-account confusion throughout existing routes. |
| B12 operations | Production source identified and backend integration tests passing locally | Preview/auth/browser checks; real migration-history reconciliation; scheduler/secret configuration; backups and restore; incident/support drills; revocation/export; controlled provider verification and reviewed deployment. |

## Capability coverage and connector requirements

| Blueprint scope | Connections and evidence needed | Implementation boundary |
| --- | --- | --- |
| C001–C012 visibility | Bank/card/loan aggregation, brokerage read data, verified manual imports, ownership and historical coverage | Normalize and classify before reports. Unknown accounts, liabilities and basis remain unknown. |
| C013–C030 savings | Vendor billing/subscription access, current plan/contract terms, rate/product research, debt statements and rewards terms | Detection, comparison, cancellation and moving saved funds are separate capabilities with separate proof. |
| C031–C042 recovery | Official property/settlement sources, merchant/issuer evidence, employer reimbursements and benefits/insurance workflows | A matching name, receipt or class description creates a candidate; it does not establish entitlement. |
| C043–C054 earning | Verified opportunities, payroll/gig records, invoices, platform payout terms and user-supplied skills/time | Compare net earnings and payout delay. Applications, outreach and payouts have distinct approvals and outcomes. |
| C055–C068 owed money | Creditor invoices/statements, account-linked payment access, separately verified funding, credit/loan provider data | A universal obligation model routes only to supported provider/action combinations. Unsupported debts remain trackable and preparable. |
| C069–C084 public investing | Brokerage read and order access, licensed prices, filings, corporate actions, holdings/lots and account restrictions | Research, recommendations, paper orders and live orders are different capabilities. Partner/legal/product gates apply separately. |
| C085–C100 private investing | Current issuer/intermediary offering documents, verified access path, eligibility and subscription/issuance evidence | No universal private-market execution adapter is assumed. A SAFE is not displayed as issued shares without a conversion event. |
| C101–C112 planning | Goals, tax-year rules/documents, policies/benefits, employment equity, business records and shared-account consent | Deterministic scenarios preserve assumptions. Professional and household scope must be explicit. |
| C113–C120 protection and administration | Verified institution channels, protected evidence/documents, owned case records, permissions and retention rules | Locks, messages, sharing, export and deletion each need their own authority and completion definition. |
| C121–C130 expansion | Specialist mortgage/property/retirement/estate/business/digital-asset/cross-border providers and professional collaboration | Retained in the full target scope; enabled per jurisdiction and supported workflow after the required gates. |

Every individual capability needs a typed contract with sources, freshness, jurisdiction/provider coverage, parameters, allowed autonomy, legal gate, review terms, risks, retry/idempotency rules, states, success evidence, monitoring/deadlines, recovery, escalation, tests and user-facing messages. This range mapping does not mark the 130 individual contracts implemented.

## General owed money workflow

Rent at a particular building, an Affirm installment, a utility bill and a card statement share obligation identity, owner, creditor, invoice/account reference, amount/currency, due date, unpaid/scheduled/autopay status, source age and revision. Their payment adapters differ. Each supported route must establish exact recipient, funding, fees, delivery timing, current unpaid status and the creditor's final application of funds.

Use the sequence: identify and verify obligation → forecast cash and consequences → prepare exact terms → get appropriate approval → preflight → submit once → reconcile provider status → verify creditor application → retain receipt and monitor returns. A bank debit, provider acceptance, screenshot toast or model sentence cannot close the obligation by itself. Recurring payment requires a separate bounded mandate; one-time connection does not supply it.

## Production integration

The integration branch `codex/upmore-production-integration-20261010` starts at the Vercel source commit `b63731c4fa239fb195d015984bd2fa4e9b8f116d`. Its worktree is `/Users/vishnusrikanth/upmore-production-integration`. The current monolithic frontend, existing provider endpoints and executor remain in place. Pure financial modules live in `packages/domain`; `scripts/build-financial-core.py` builds only their backend exports.

New migrations have unique fourteen-digit version prefixes. Historical migrations already use repeated date prefixes; reconcile their actual applied history before any CLI-driven release. Historical files and production migration history have not been renamed or repaired. The integration harness applies explicit prerequisites to a disposable database, so its passing result does not establish migration-history readiness for production.

The old and newer cancellation schemas both used `cancel_claims` with incompatible columns/states. New foundation watches use `agent_cancel_watches`; the existing cancellation watcher keeps its original schema. Unifying them requires a separately tested migration and outcome contract.

The current IPO/trading dossier contains dated issuer, venue, access and fee assertions. Revalidate material claims against current primary sources before publishing or using them in decisions; directory seeds and old labels do not establish current access. The launch-readiness prompt's sample scenarios supplement the complete acceptance scope rather than replacing it.

## Completion rule

Each capability records implementation status, supported coverage and separately recorded test evidence. Preparation cannot be relabeled execution; submission cannot be relabeled completion; projected savings cannot be relabeled received cash. All original issues 1–6 remain open until their respective end-to-end acceptance gates pass.
