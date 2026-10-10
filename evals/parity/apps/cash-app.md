# Cash App: parity checklist (CA)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

38 outcomes, 100% accounted, 28.9% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| CA-001 Send money to a verified person | PAY-001 | CLAIMED |  |
| CA-002 Receive person-to-person payments | ALRT-007 | CLAIMED | Receiving a P2P payment surfaces as a deposit-received alert plus receipt (PAY-022). |
| CA-003 Resolve a recipient by verified handle | PAY-021 | TESTED |  |
| CA-004 Link bank and debit funding | ACCT-006 | CLAIMED |  |
| CA-005 Display eligible stored balance | ACCT-001 | TESTED |  |
| CA-006 Standard bank cashout | PAY-010 | GATED | no money-movement partner (Dwolla, Modern Treasury, Unit, Column class) with KYC; the send lifecycle is proven against a fake rail in tests/money.test.cjs |
| CA-007 Instant bank cashout with fee preview | PAY-010 | GATED | no money-movement partner (Dwolla, Modern Treasury, Unit, Column class) with KYC; the send lifecycle is proven against a fake rail in tests/money.test.cjs |
| CA-008 Credit-card funding with fee preview | PAY-010 | GATED | no money-movement partner (Dwolla, Modern Treasury, Unit, Column class) with KYC; the send lifecycle is proven against a fake rail in tests/money.test.cjs |
| CA-009 Order and manage customizable debit card | CARD-001 | TESTED | Physical card ordering is the issuer's; Upmore inventories and manages the card once it exists. |
| CA-010 Debit merchant purchases | TXN-001 | TESTED | Card spending itself happens at the terminal; Upmore delivers the outcome as transaction visibility and CARD-002 card choice. |
| CA-011 ATM access and fee eligibility | non-parity: hardware-bound | n/a | ATM withdrawal is a physical cash and card interaction; Upmore can only flag ATM fees afterwards (TXN-018). |
| CA-012 Participating-store cash deposit | non-parity: hardware-bound | n/a | Depositing paper cash at a participating store requires a physical barcode scan and cash handoff the agent cannot perform. |
| CA-013 Direct deposit and eligible early pay | ALRT-007 | CLAIMED |  |
| CA-014 Savings balances and goals | ACCT-018 | TESTED | Doc 03 anchors savings balance to ACCT-018; goal tracking is ANL-016. |
| CA-015 Automatic saving rules | SAVE-001 | CLAIMED |  |
| CA-016 Savings interest eligibility | SAVE-002 | TESTED |  |
| CA-017 Green-status qualification | EARN-002 | TESTED | Green status is a direct-deposit qualification; the closest capability is the bonus requirement tracker (direct deposit count). |
| CA-018 Eligible overdraft | SAVE-006 | CLAIMED | Cash App's free overdraft coverage is replaced by Upmore's overdraft-prevention move rather than replicated as credit. |
| CA-019 Fractional stocks | non-parity: investment-platform | n/a | Stock trading inside a non-investment app is an investment-platform feature excluded from the parity set; doc 09 covers user-directed orders separately. |
| CA-020 Stock holdings and performance | INV-001 | CLAIMED | Reading existing holdings is portfolio read (doc 09); buying is excluded. |
| CA-021 Bitcoin positions | INV-001 | CLAIMED | Reading an existing bitcoin position is portfolio read; buying/selling is excluded. |
| CA-022 Borrow eligibility and total fee | CRDT-009 | TESTED | Doc 03: Upmore surfaces cheaper alternatives to Borrow via payoff planning and never originates loans itself. |
| CA-023 Afterpay financing | CRDT-008 | TESTED | Doc 03: BNPL plans are tracked as debt with stacking warnings; Upmore never initiates BNPL. |
| CA-024 Sponsored child and teen accounts | SOC-007 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CA-025 Guardian visibility and controls | SOC-006 | CLAIMED |  |
| CA-026 Automatic allowance | PAY-025 | CLAIMED |  |
| CA-027 Card lock and unlock | CARD-011 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CA-028 Account security lock | SEC-010 | CLAIMED | Account-level lock maps to the agent kill switch plus issuer card lock (CARD-011). |
| CA-029 Identity verification | SEC-012 | TESTED | KYC identity verification is the partner app's own onboarding; Upmore's nearest capability is verification of sensitive chat commands. |
| CA-030 Fraud alerts | SEC-001 | CLAIMED |  |
| CA-031 Erroneous payment refund request | PAY-024 | TESTED |  |
| CA-032 Support escalation without reversal promise | PAY-023 | CLAIMED | Support escalation for a failed or wrong payment is failed-payment triage with honest no-reversal-promise framing. |
| CA-033 Deposit eligible checks through a supported service | non-parity: hardware-bound | n/a | Mobile check capture needs the phone camera inside a bank partner flow; v1 tells the user to deposit in the bank app and confirms when it posts (doc 03 App 5). |
| CA-X01 Mobile check deposit by photo | non-parity: hardware-bound | n/a | Mobile check capture needs the phone camera inside a bank partner flow; v1 tells the user to deposit in the bank app and confirms when it posts (doc 03 App 5). |
| CA-X02 Split paychecks automatically across savings, stocks and bitcoin | SAVE-001 | CLAIMED | Paycheck split to savings is a payday-sweep autosave rule; the stock and bitcoin legs are investment-platform and excluded. |
| CA-X03 Pay bills using account/routing number or card details from balance | PAY-006 | GATED | A local payment engine exists (supabase/functions/_shared/payment_service.ts) but no registered payment provider or owner launch approval; see docs/implementation/workstreams.md. |
| CA-X04 Cash App Tags — card-linked payment tags for ages 6+ | SOC-007 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CA-X05 Cash App Taxes free filing with bitcoin import | non-parity: regulated-origination | n/a | Upmore does not file taxes itself; it tracks refunds (TAX-012) and exports crypto activity for tax tools (TAX-007) per doc 03 and doc 14. |
