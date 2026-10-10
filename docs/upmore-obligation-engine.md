# Upmore: a general engine for money owed

October 8, 2026. User requirement: Upmore must understand and resolve owed money across situations. NEMA rent and Affirm repayment are illustrative test cases. The architecture must accommodate new creditors, obligation types and payment workflows without adding a bespoke product feature for every biller.

This is the implementation contract for a proposed shared engine. It is not a statement that the current repository implements it or that arbitrary third-party payment execution is available today.

## 1. The universal unit is an obligation

Represent a financial obligation as a structured, evidenced relationship: **who owes whom, for what, how much, under which terms, when, and what would constitute resolution**.

Include obligations payable by the user and receivables owed to the user. Support personal, business and shared ownership without assuming that every connected household debt belongs to everyone. A demand for money is initially an asserted obligation; it can be valid, disputed, mistaken, fraudulent, contingent, or already settled.

The common model must express:

| Field group | Required meaning |
|---|---|
| Parties | Debtor, creditor, beneficiary/payee, servicer/collector, ownership/share, verified identities and payment destination |
| Identity | Stable internal ID, provider account, invoice/loan/case references, source aliases and links to related obligations |
| Basis | Lease, invoice, purchase, statement, loan agreement, assessment, reimbursement agreement, judgment, or user-confirmed informal arrangement |
| Amount | Currency; original principal/charge; outstanding balance; currently due; minimum due; payoff amount; interest/fees; credits; disputed amount; user share |
| Timing | Issue/service period, due date/timezone, installment schedule, recurrence, grace/cutoff rules, expiry and source validity |
| Terms | Accepted methods, allocation instructions, partial-payment rules, fees, early-payoff effects, autopay, dispute rules, and required attestations |
| Evidence | Source document/page/event, authority, extraction confidence, observation/effective dates, data freshness and coverage |
| State | Asserted, verified, disputed, scheduled, processing, partially resolved, settled, overdue, returned, waived, invalid or unknown |
| Resolution | Required action and proof: applied payment, accepted waiver, corrected bill, canceled obligation, fulfilled noncash remedy, or agreed settlement |

Examples map into this model:

- Rent: a lease-backed recurring obligation plus current ledger adjustments.
- BNPL: a loan obligation with individual installment occurrences and a separate payoff balance.
- Card statement: a statement minimum/full balance linked to the underlying card liability; paying it must not double-count purchases as new expenses.
- Tax: an estimated or assessed obligation with jurisdiction, tax period and evidence; uncertainty in an estimate remains visible.
- Friend/roommate: a confirmed allocation/IOU with agreed recipient and partial repayments.
- Medical invoice: an asserted bill whose patient responsibility can change after insurance/adjudication.
- Collections notice: an asserted debt requiring verification/dispute analysis before payment.
- Money owed to the user: the same relationship in the other direction, with authorized invoicing, follow-up and incoming-payment reconciliation.

Separate the **contract**, **occurrence**, and **payment attempt**. One lease creates many rent occurrences. One loan creates installments. A failed attempt does not create a second bill. A recurring bank charge is evidence of a pattern, not necessarily a contract or current unpaid balance.

## 2. Open-ended discovery

All sources produce evidence events in a shared pipeline:

`source event → extracted assertion → identity/relationship matching → corroboration → obligation update → next-action evaluation`

Sources include supported account APIs/webhooks, statements, authorized mailbox ingestion, uploads/photos, connected provider portals, conversation, manual user entry, and subsequent payment evidence. Adding a source means implementing evidence ingestion; it should not require a new obligation type if the common model already fits.

Extraction can use models for unstructured material, but numerical validation, ownership checks and authorized transitions are deterministic. Attach the exact text/page/event supporting important fields. Low-confidence amount/account/due date requires corroboration or user correction. External content cannot instruct Upmore to disregard consent, reveal secrets or change a payment destination.

Deduplicate using source IDs and relationship evidence. An email reminder, a bill PDF and a bank debit can describe one obligation. Two equal merchant charges can describe two different obligations. Maintain link confidence and review unresolved matches.

Coverage is explicit: connected account A covers these loans; mailbox covers these notices; unsupported portal B has not been refreshed. “No bill found” does not establish “nothing owed.” Ask for the missing connection/document when it materially changes the answer. Absolute discovery of unknown, unrecorded or inaccessible debts cannot be guaranteed.

## 3. Shared reasoning and policy

For every obligation, evaluate the same questions:

1. Is this actually the user's obligation, and is the source/destination trustworthy?
2. Is the amount/date current, and has it been disputed, credited or paid already?
3. Is an existing payment/autopay arrangement covering it?
4. What actions could resolve or improve it: pay, schedule, split, request correction, dispute, negotiate, seek assistance, obtain evidence, collect payment, or hand off?
5. What would each action cost and do to cash, deadlines, user goals and other obligations?
6. Which actions are permitted by explicit user authorization and supported external methods?
7. What evidence will establish the action's final result?

Domain rules supply particular semantics: installment allocation, tax period, loan principal instructions, card minimums, lease grace periods, medical responsibility and jurisdiction deadlines. Keep these as versioned rule packs and validated typed constraints. Do not let a model invent rules merely to make a generic plan executable.

Prioritization must consider deadlines, consequences, confidence, essential services, user intent, dispute status and liquidity. It cannot blindly pay every detected demand or simply sort all debt by interest rate. Communicate tradeoffs when available money cannot cover everything.

## 4. Capability-driven execution planner

The planner operates on intentions such as `read_obligation`, `preview_payment`, `pay_amount`, `enable_autopay`, `request_adjustment`, `submit_dispute`, `verify_application` and `collect_receivable`.

Adapters expose machine-readable capabilities:

```
provider / connector identity
supported parties, account types and actions
required inputs, evidence and authentication
supported amounts, currencies, fees and timing
authorization requirements and limits
idempotency/retry/reconciliation support
receipt and finality semantics
verified coverage and last validation date
```

The planner selects an appropriate supported route from the capabilities available for this obligation: a native provider integration, approved creditor/payment partner, existing provider autopay, verified authenticated workflow, or user handoff. It checks the exact creditor/loan/account coverage, not just whether a payment provider exists.

For an unfamiliar biller, Upmore can discover the official site, inspect supported authenticated options with permission, extract terms, and propose a candidate workflow. Reusable workflow primitives handle login/MFA handoff, navigation, invoice selection, preview, review and receipt capture. An unfamiliar payment destination or irreversible step requires validation and the appropriate user approval; exploration does not itself establish a verified execution capability.

Promote a new route to reusable coverage only after supervised validation of identity, correct obligation selection, fees, submission behavior, idempotency/uncertainty handling and final evidence. Store coverage in the adapter registry rather than scattering merchant names through chat intent code. Site changes trigger revalidation/degraded status.

Generic planning plus validated tool contracts makes the system extensible. It does not eliminate real-world differences in provider access, permitted methods, authentication and payment finality.

## 5. Common action lifecycle

`detected → verified → assessed → proposed → authorized → reserved → submitted → processing → reconciled → resolved`

Support branches for `needs_information`, `needs_authentication`, `disputed`, `unsupported`, `unknown_outcome`, `failed`, `returned` and `revoked`. Describe outcomes in the user's terms: “Affirm applied $84.50 to plan X,” “the rent ledger is clear,” or “the hospital corrected the balance.”

A proposal binds creditor, obligation, action, amount/currency, funding account, fee and terms to an immutable consent record. A standing mandate constrains the same dimensions across occurrences. A new recipient or out-of-bound amount never inherits permission merely because the user said “handle my bills.”

Reserve the obligation atomically before submitting. Use stable request IDs, durable attempts, webhook inbox/outbox, worker leases and provider status polling where necessary. A timeout is uncertainty; reconcile the original attempt before considering another. Revalidate unpaid status and external autopay close to submission.

Resolution is domain-specific evidence attached to a common state transition. Bank settlement alone may not prove correct creditor allocation. A negotiation promise is not a waiver. A canceled subscription can still have a legitimate final invoice. A provisional credit is not final recovery. A returned payment reopens the obligation.

## 6. Personalization across every situation

Server-backed memory supplies buffer, preferred funding accounts, approved payees, notification rules, standing mandates, household visibility, goals and user-confirmed priorities. Financial facts retain source/confidence independently of preferences.

Use the same event evaluator for all obligations: new due item, changed amount, missing funds, approaching cutoff, autopay failure, requested evidence, unresolved attempt, stale source, verified settlement or recovery. Messages contain the relevant facts, uncertainty, proposed action and task ID. Replies resolve the specific task and authorization version.

The user can say “pay my bills automatically up to these limits,” “ask me about anything unusual,” “keep at least $500 in checking,” or “do not pay disputed bills.” Persist each constraint in a typed policy and show what it covers. Resolve conflicts explicitly; do not hide them inside prompts.

## 7. Repository implementation seams

The current catalog remains useful for product promises. Add the general engine below its features:

- A server-owned obligation/evidence store and connection-based identity model; use the existing migrations/ledger foundation but enforce immutable authorization and credential ownership first.
- Shared pure normalization, schedule, matching and policy logic alongside the shared core modules; eliminate the dropped account IDs and financial-key mismatches identified in the audit.
- A server proposal/task service replacing reliance on browser-local intent regexes for financial execution.
- A capability registry and provider adapter interface used by every executor; keep verified coverage separate from catalog status.
- A queue/worker layer for discovery, due events, proposals, authorized submission and reconciliation, shared by web and messaging.
- A server memory/preferences service, message outbox and task-bound reply handler.
- User-facing obligation/task views showing evidence, connections, coverage, pending attempts, mandates and resolution.

Feature-specific implementations become configurations, evidence extractors, rule packs and adapters on this shared system. Changes to payments, consent or reconciliation must improve every supported biller rather than being copied into each feature.

## 8. Proof that it generalizes

Test the engine across obligation shapes before celebrating a working merchant demo:

- Recurring fixed rent; variable utility; annual premium; one-time invoice; installment loan; BNPL; card minimum/full statement; estimated tax; informal IOU; disputed medical bill; collection demand; shared obligation; foreign-currency payable; incoming reimbursement.
- One source versus conflicting sources; newly detected obligation; missing amount/date; partial payment; overpayment/credit; changed schedule; duplicate notice; multiple loans at one creditor; one payment allocated across obligations.
- Active autopay, stale data, missing permission, insufficient funds, changed payee, MFA, unsupported method, provider outage, timeout, duplicate webhook, revoked mandate, returned payment and incorrect creditor application.

Use a fake provider adapter with a new name and unfamiliar invoice format. The obligation engine and planner must complete its declared supported contract without merchant-specific branches. Then test a provider that cannot execute payments: the same engine must deliver correct discovery, assessment and honest handoff. Finally validate real adapters separately with supervised provider tests.

The release promise is: **Upmore continuously discovers and resolves obligations within connected evidence, explicit authority and verified execution coverage; when any of those is missing, it identifies the gap and obtains the required information or handoff.** That is a scalable product contract for all types of owed money, with measurable real-world coverage.
