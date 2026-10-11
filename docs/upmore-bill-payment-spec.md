# Upmore: know and pay what I owe

User clarification, October 8, 2026: build general bill-payment capability. Use the user's NEMA Chicago rent as an initial rent example and Affirm as an installment-debt example. Neither provider is currently verified as connected to the user. No amount, account, due date, payment status or autopay setting is known yet. This specification does not authorize a real payment.

The architectural parent is [the general obligation engine](upmore-obligation-engine.md), which covers all shapes of owed money, unfamiliar billers, receivables, disputes and capability-driven execution. This document supplies bill-payment examples for that engine.

## Product contract

After supported accounts are connected and payment permissions configured, Upmore should know verified obligations, monitor whether they are covered, propose payment when needed, execute within user authorization, and confirm the creditor received and applied the payment. It should also notice when a connection, payment method, autopay or payment attempt fails.

Illustrative message, not a statement about the user's account:

> Your $84.50 Affirm installment is due tomorrow. Autopay is off. Paying from checking •1234 would leave $420 after your other known bills. Want me to pay this installment?

With an appropriate standing mandate, the message can instead report an authorized scheduled payment and its eventual result. If autopay is already active, the default job is to monitor the payment and funding, not send another payment. If financial coverage is incomplete, disclose that before using the projected buffer to justify an action.

## One system, different biller adapters

| Layer | Shared responsibility | Provider-specific responsibility |
|---|---|---|
| Discovery | Associate authenticated user, source, account and obligation; preserve evidence/confidence | Read rent ledger, utility bill, card statement, loan schedule, or BNPL plan |
| Obligation | Amount/currency, due date, remaining amount, status, payee and funding preference | Rent unit/lease, utility account, card statement minimum, loan/plan ID and allocation rules |
| Coverage | Freshness, pending payments, autopay and known funds | Provider autopay schedule, payment-method eligibility and data access constraints |
| Authorization | One-time proposal or bounded mandate; immutable consent snapshot | Additional provider authentication/attestations or supported authorization mechanism |
| Payment | Idempotency, attempt state, limits, retries and unknown-outcome handling | Native authorized payment workflow, approved creditor rail or supported partner integration |
| Reconciliation | Provider events, bank match, evidence and user-visible outcome | Biller receipt, creditor application, allocation, remaining balance and returns |

The obligation engine must be extensible across supported billers. A single universal “pay” API cannot be assumed. Each adapter advertises exactly what it can read, submit, cancel and verify. Unsupported providers get an accurate handoff, not an executing status.

## Initial provider targets

### NEMA Chicago

NEMA's official resident page advertises a resident portal with online rent payment. The public page supports discovery of a possible payment route; it does not establish the user's private balance, accepted methods, fees, authentication requirements or integration permission. The direct page fetch was blocked, so its underlying portal vendor was not verified. [Official resident page](https://www.rentnemachicago.com/residents)

During actual connection, establish the resident portal URL, authenticated resident account/unit, unpaid ledger, lease due date, accepted methods, fees and current autopay. Do not infer the bill from one historical rent debit: parking, utilities, credits and adjustments can change the payable balance. Verify that a successful payment is applied to this resident ledger.

### Affirm

Affirm describes eligible debit-card/bank-account methods for one-time and recurring repayments; availability varies by plan. Its help page also warns that externally sent check/ACH payments require loan-identifying information and cannot be split across multiple loans. This makes exact loan allocation a first-class requirement. [Payment methods](https://helpcenter.affirm.com/us/s/article/payment-methods)

The connector must distinguish each loan/plan, remaining balance, next installment, due date, payment status, pending payment, autopay and eligible funding methods. Three Affirm plans are three schedules, not a single monthly merchant charge.

Affirm's public developer entry point describes merchant financing integrations. That is not evidence of an API authorizing a consumer agent to repay existing loans. Consumer repayment integration/permission must be validated separately; no public repayment API or Method coverage was established by this research. [Developer documentation](https://docs.affirm.com/developers/docs/understanding-affirm)

Start with the supported native repayment/autopay workflow or an explicitly approved partner covering the relevant loans. A verified authenticated adapter may be an option only after testing permission, MFA, correct loan selection, amount, submission and receipt. Never guess routing information from a bank transaction memo.

## Required records

- **Biller connection:** user, provider, connection ID, credential reference derived server-side, coverage, allowed scopes and last successful synchronization.
- **Obligation:** provider account and loan/invoice ID, amount due, remaining amount, currency, due date/timezone, status, evidence and freshness. Distinguish the installment due from the entire loan balance.
- **Autopay arrangement:** provider-specific scope, amount/date rule, funding method, verified status and pending charge information. Unknown is different from off.
- **Mandate:** biller/account/plan scope, permitted funding account, amount and fee caps, frequency, buffer, validity window, authorization evidence and revocation.
- **Payment attempt:** unique obligation linkage, consent version, idempotency key, provider request/transaction ID, amount, status, timestamps and error/uncertainty.
- **Payment evidence:** submission receipt, settlement event, allocation confirmation, bank transaction match and subsequent reversal/return history.

Provider credentials and consent cannot be supplied by arbitrary client-written reference rows. Pending payment attempts and existing autopay are checked before a new proposal and again before submission.

## Execution rules

1. Discover or ingest the actual bill/plan. Email, uploads and historical bank data can suggest obligations; mark inferred or incomplete ones and seek authoritative confirmation.
2. Establish whether it remains unpaid and whether a pending/manual/autopay attempt already covers it.
3. Assess fresh available funds, other obligations, buffer, eligible method, fees and expected posting. Explain insufficient or unknown coverage.
4. Build a task-specific proposal. A reply must reference the right active proposal; do not apply an ambiguous “yes” to whichever task is newest.
5. Revalidate scope and current bill. Changed amount, fee, recipient or funding beyond the mandate requires renewed authorization.
6. Submit once through the supported adapter. A timeout after submission creates an uncertain attempt; query/reconcile it before any new attempt.
7. Report processing separately from settled and applied. Retain the creditor receipt and check allocation to the specific bill/loan.
8. Continue monitoring until final success or a disclosed exception. Returned payments reopen the obligation; an existing debit is not proof that the bill remains paid.

For repeated bills, persist the arrangement and refresh the current obligation each cycle. Provider-managed autopay can be the supported execution mechanism; Upmore still owns monitoring, funding checks and exception handling. Agent-initiated recurring payments need a separate valid bounded mandate. Successful connection is not itself that mandate.

## Acceptance gates

| Case | Required outcome |
|---|---|
| Three Affirm plans, one due tomorrow | Identify and pay only the selected due installment, with correct plan allocation |
| Existing autopay on the same bill | Avoid duplicate payment; monitor the existing arrangement and pending attempt |
| New obligation with no prior debit | Discover from a supported biller/source; bank-history-only mode admits incomplete coverage |
| Refund or rescheduled BNPL installment | Refresh actual payable amount/date before execution |
| NEMA rent plus parking/utilities/credit | Explain ledger components and confirm which obligation the payment covers |
| Insufficient cash or stale bank feed | Do not execute beyond constraints; report the shortfall or missing information |
| Provider timeout after submit | Preserve uncertain attempt, recover status and avoid duplicate payment |
| User revokes permission before run | Prevent future submission and accurately disclose any already-submitted action |
| Bank debit but creditor misallocation | Do not claim the selected bill paid; open a reconciliation exception |
| Payment return after initial success | Notify, update the ledger and obligation, and propose a separately authorized recovery |
| Unsupported provider/method or MFA needed | Honest user handoff with task state retained; no invented success |
| New biller added | Use the shared model while passing that adapter's data, authorization and reconciliation contract |

## What is needed from the user

The product direction is now sufficient: general bill payment, with NEMA and Affirm as initial targets. Implementation and connection preparation can proceed without asking the user to design every integration.

For supervised private-account validation later, use the authenticated resident portal and Affirm connection, selected funding account and explicit test-payment limits. Do not ask for passwords in chat. Account access, standing mandates and actual payments must be configured through an authenticated supported flow. Production Vercel/Supabase project identification remains separate from choosing these billers.
