# Venmo: parity checklist (VE)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

41 outcomes, 100% accounted, 24.4% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| VE-001 Send money to friends | PAY-001 | CLAIMED |  |
| VE-002 Pay supported businesses | PAY-013 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| VE-003 Eligible Venmo checkout | PAY-013 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| VE-004 Balance-purchase identity verification | SEC-012 | TESTED | Balance-purchase identity verification is Venmo's KYC; the closest capability is verification of sensitive commands. |
| VE-005 Debit payments | CARD-001 | CLAIMED | Venmo debit card is inventoried and recommended per purchase (CARD-002). |
| VE-006 Stash offers | EARN-010 | CLAIMED |  |
| VE-007 Reward tiers and caps | EARN-011 | TESTED | Reward tiers and caps are tracked in cross-program points valuation. |
| VE-008 Credit application and hard inquiry | CRDT-007 | CLAIMED | Upmore alerts on and explains the hard inquiry; the credit application itself is the issuer's. |
| VE-009 Credit spending management | CARD-004 | CLAIMED |  |
| VE-010 Credit payments and rewards | CARD-006 | CLAIMED | Credit card payments are tracked by due date; rewards are EARN-011. |
| VE-011 Cashback accrual and settlement | EARN-011 | TESTED | Cashback accrual is tracked as rewards across programs. |
| VE-012 Cashback redemption | EARN-012 | TESTED | Cashback redemption is delivered as redemption optimization; Venmo executes. |
| VE-013 Wallet provisioning | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| VE-014 Buy supported crypto | non-parity: investment-platform | n/a | Buying, selling, holding custody of or transferring crypto inside a P2P app is an investment-platform surface; investing is handled on Upmore's own terms in doc 09. |
| VE-015 Sell supported crypto | non-parity: investment-platform | n/a | Buying, selling, holding custody of or transferring crypto inside a P2P app is an investment-platform surface; investing is handled on Upmore's own terms in doc 09. |
| VE-016 Crypto holdings and valuation | INV-001 | CLAIMED | Reading an existing crypto position is portfolio read (doc 09); trading is excluded. |
| VE-017 Eligible crypto transfers | non-parity: investment-platform | n/a | Buying, selling, holding custody of or transferring crypto inside a P2P app is an investment-platform surface; investing is handled on Upmore's own terms in doc 09. |
| VE-018 Receive supported crypto | non-parity: investment-platform | n/a | Buying, selling, holding custody of or transferring crypto inside a P2P app is an investment-platform surface; investing is handled on Upmore's own terms in doc 09. |
| VE-019 Exchange rate and spread | non-parity: investment-platform | n/a | Buying, selling, holding custody of or transferring crypto inside a P2P app is an investment-platform surface; investing is handled on Upmore's own terms in doc 09. |
| VE-020 Crypto fee preview | non-parity: investment-platform | n/a | Buying, selling, holding custody of or transferring crypto inside a P2P app is an investment-platform surface; investing is handled on Upmore's own terms in doc 09. |
| VE-021 Crypto price alerts | INV-009 | CLAIMED |  |
| VE-022 Separate-consent cashback conversion | non-parity: investment-platform | n/a | Auto-converting cashback into crypto is a recurring crypto purchase inside a P2P app; investment-platform surface (doc 09). |
| VE-023 Crypto risks and taxes | TAX-007 | CLAIMED |  |
| VE-024 Complaint and support routes | PAY-024 | TESTED | Complaint and support routes map to the payment reversal or mitigation path. |
| VE-025 Schedule a payment with explicit timing and cancellation boundaries | PAY-007 | CLAIMED |  |
| VE-026 Split group expenses with recipient and privacy controls | PAY-004 | TESTED |  |
| VE-027 Access an issuer-provided virtual card without fabricating credentials | CARD-012 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| VE-X01 Request money from another user. | PAY-003 | CLAIMED |  |
| VE-X02 Split a past purchase by sending charge requests. | PAY-004 | TESTED |  |
| VE-X03 Track shared group expenses and settle up. | SOC-002 | CLAIMED |  |
| VE-X04 Set default and per-payment privacy (Public/Friends/Private). | SOC-010 | CLAIMED |  |
| VE-X05 Standard free bank cashout via ACH. | PAY-010 | GATED | no money-movement partner (Dwolla, Modern Treasury, Unit, Column class) with KYC; the send lifecycle is proven against a fake rail in tests/money.test.cjs |
| VE-X06 Instant cashout to eligible bank or debit card with fee preview. | PAY-010 | GATED | no money-movement partner (Dwolla, Modern Treasury, Unit, Column class) with KYC; the send lifecycle is proven against a fake rail in tests/money.test.cjs |
| VE-X07 Enforce bank transfer and add-money limits by verification state. | PAY-020 | TESTED |  |
| VE-X08 Create a business profile to accept payments. | PAY-003 | CLAIMED | Doc 03 marks business profiles out of scope for v1; the closest capability is requesting money. |
| VE-X09 Accept in-person contactless payments with Tap to Pay on iPhone/Android. | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| VE-X10 Mark personal payments as goods & services with a 2.99% seller fee. | PAY-024 | TESTED | Goods-and-services marking buys purchase protection; Upmore delivers the dispute/mitigation path, not the seller-fee toggle. |
| VE-X11 Cash a check into Venmo with fee. | non-parity: hardware-bound | n/a | Mobile check capture needs the phone camera inside a bank partner flow; v1 tells the user to deposit in the bank app and confirms when it posts (doc 03 App 5). |
| VE-X12 Teen accounts with parent-managed debit card lock and limits. | SOC-007 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| VE-X13 Charity profiles accept donations at 1.9% + $0.10. | SOC-008 | CLAIMED | Doc 03: charity profiles map to gifting. |
| VE-X14 Show payment status including Pending with estimated completion. | PAY-022 | TESTED |  |
