# Chase Mobile: parity checklist (CH)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

34 outcomes, 100% accounted, 38.2% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| CH-001 Account balances | ACCT-001 | TESTED |  |
| CH-002 Transaction history | TXN-001 | TESTED |  |
| CH-003 Electronic statements | TAX-002 | CLAIMED | Doc 03: statements land in the document vault. |
| CH-004 QuickDeposit mobile check deposit | non-parity: hardware-bound | n/a | Mobile check capture needs the phone camera inside a bank partner flow; v1 tells the user to deposit in the bank app and confirms when it posts (doc 03 App 5). |
| CH-005 Eligible account transfers | PAY-009 | CLAIMED |  |
| CH-006 Bill payments | BILL-008 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CH-007 Zelle sending | PAY-012 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CH-008 Zelle receiving | ALRT-007 | CLAIMED | Receiving Zelle is a deposit-received alert; sending is PAY-012. |
| CH-009 Digital-wallet card provisioning | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| CH-010 Eligible Pay Over Time plans | CRDT-008 | TESTED | Pay Over Time plans are tracked as debt; Upmore never initiates BNPL (doc 03). |
| CH-011 Plan fees and schedule | ANL-018 | TESTED | Plan fees and schedule are delivered as a debt payoff projection on the tracked plan. |
| CH-012 Offers discovery and activation | EARN-010 | CLAIMED |  |
| CH-013 Rewards balances | EARN-011 | TESTED |  |
| CH-014 Rewards redemption | EARN-012 | TESTED | Redemption is delivered as the points valuation and best-redemption suggestion; the issuer executes. |
| CH-015 Credit Journey enrollment and scores | CRDT-001 | CLAIMED |  |
| CH-016 Spending categories | ANL-001 | TESTED |  |
| CH-017 Budget creation and tracking | ANL-003 | TESTED |  |
| CH-018 Self-directed investing | non-parity: investment-platform | n/a | Stock trading inside a non-investment app is an investment-platform feature excluded from the parity set; doc 09 covers user-directed orders separately. |
| CH-019 Investment funding | non-parity: investment-platform | n/a | Funding a brokerage account is an investment-platform flow excluded from the parity set (doc 09). |
| CH-020 Eligible retirement rollovers | INV-019 | CLAIMED |  |
| CH-021 Card management | CARD-001 | TESTED |  |
| CH-022 Card lock and unlock | CARD-011 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CH-023 Fraud and account alerts | SEC-001 | CLAIMED | Fraud-led account alerts map to fraud pattern detection; generic account alerts are ALRT-010. |
| CH-024 Biometric sign-in | non-parity: hardware-bound | n/a | Biometric unlock is the host app's own device-authenticator feature; Upmore verifies sensitive chat commands (SEC-012) but does not own the phone's biometric sensor. |
| CH-025 Multifactor authentication | SEC-012 | TESTED | Bank MFA is the bank's; Upmore's equivalent is verification challenges on sensitive chat commands. |
| CH-026 Support messages | CORE-002 | TESTED | Secure support messaging maps to honest status answers from the agent. |
| CH-027 Unauthorized transaction reporting | CARD-010 | CLAIMED |  |
| CH-X01 Autosave: automatic checking-to-savings transfers on schedule or per deposit | SAVE-001 | CLAIMED |  |
| CH-X02 Link external bank accounts and transfer by ACH | PAY-010 | GATED | no money-movement partner (Dwolla, Modern Treasury, Unit, Column class) with KYC; the send lifecycle is proven against a fake rail in tests/money.test.cjs |
| CH-X03 Send domestic and international wires from app | PAY-011 | GATED | wires need the same partner rail and stay T5 always |
| CH-X04 Shop through Chase for bonus points | SAVE-012 | CLAIMED |  |
| CH-X05 Points Boost elevated redemption value on select travel | EARN-012 | TESTED |  |
| CH-X06 Export transactions (PDF, CSV, QFX/QIF, QBO) for tax/accounting | TXN-012 | TESTED |  |
| CH-X07 Investing sign-up bonus up to $1,000 for new funded accounts | EARN-001 | CLAIMED | A funded-account signup bonus is surfaced by the signup bonus finder; the investing account itself is doc 09. |
