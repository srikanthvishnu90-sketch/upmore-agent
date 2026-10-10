# PayPal: parity checklist (PP)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

31 outcomes, 100% accounted, 51.6% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| PP-001 Send money | PAY-001 | CLAIMED |  |
| PP-002 Request money | PAY-003 | CLAIMED |  |
| PP-003 Eligible international payments | PAY-016 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| PP-004 Link bank accounts | ACCT-006 | CLAIMED |  |
| PP-005 Link credit and debit cards | CARD-001 | TESTED | Linking cards to a wallet is card inventory. |
| PP-006 Eligible balance account | ACCT-001 | TESTED | Doc 03: PayPal balance is ACCT-001. |
| PP-007 View balances | ACCT-001 | TESTED |  |
| PP-008 Purchases and payments | TXN-001 | TESTED |  |
| PP-009 Subscription management | BILL-001 | TESTED | Doc 03: subscription management is BILL-001 with BILL-003 cancellation. |
| PP-010 Merchant offers | EARN-010 | CLAIMED |  |
| PP-011 Track rewards | EARN-011 | TESTED |  |
| PP-012 Pay eligible merchants | PAY-015 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| PP-013 Purchase Protection claims | PAY-024 | TESTED | Doc 03: purchase protection maps to dispute mitigation PAY-024. |
| PP-014 Eligible money pools | SOC-005 | CLAIMED |  |
| PP-015 Debit-card access | CARD-001 | TESTED | PayPal debit card is inventoried and recommended per purchase (CARD-002). |
| PP-016 Savings access | SAVE-002 | TESTED |  |
| PP-017 Crypto management | non-parity: investment-platform | n/a | Buying, selling, holding custody of or transferring crypto inside a P2P app is an investment-platform surface; investing is handled on Upmore's own terms in doc 09. |
| PP-018 Pay in 4 loans | CRDT-008 | TESTED | Doc 03: Pay in 4 is tracked as debt with stacking warnings; Upmore never initiates BNPL. |
| PP-019 Pay Monthly loans | CRDT-008 | TESTED | Pay Monthly loans are tracked as debt; Upmore never initiates BNPL. |
| PP-020 Loan and state eligibility | non-parity: regulated-origination | n/a | Loan and state eligibility checks exist to originate BNPL credit, which Upmore never initiates (doc 03, doc 14). |
| PP-021 Credit and repayment disclosures | CRDT-010 | TESTED | Credit and repayment disclosures are explained via the extra payment impact calculator on tracked debt. |
| PP-022 Total financing cost | ANL-018 | TESTED | Total financing cost is a debt payoff projection on the tracked plan. |
| PP-023 Package updates | TXN-015 | CLAIMED | Package updates have no registry capability; receipt ingestion from email is the closest data source. |
| PP-024 Transaction and cross-border fees | TXN-018 | TESTED |  |
| PP-025 Resolution Center | PAY-024 | TESTED |  |
| PP-X01 Apply for the PayPal Cashback Mastercard credit card and earn 3% on PayPal purchases, 1.5% elsewhere. | non-parity: regulated-origination | n/a | Submitting a credit card application is credit origination Upmore never performs; it only recommends the right card (CARD-002). |
| PP-X02 Get early fraud alerts, including when someone tries to add your card to another PayPal wallet. | SEC-001 | CLAIMED | Early fraud alerts on card misuse are fraud pattern detection. |
| PP-X03 Store merchant loyalty card numbers/barcodes in the app and present them at checkout. | EARN-011 | TESTED |  |
| PP-X04 Donate to charities through PayPal. | SOC-008 | CLAIMED | Doc 03: charity giving maps to gifting; receipts log to TAX-005. |
| PP-X05 Pay household bills from PayPal. | PAY-006 | GATED | A local payment engine exists (supabase/functions/_shared/payment_service.ts) but no registered payment provider or owner launch approval; see docs/implementation/workstreams.md. |
| PP-X06 Link a Honey account to combine rewards points with PayPal. | EARN-009 | CLAIMED | Honey rewards linkage is cash-back portal earnings tracking. |
