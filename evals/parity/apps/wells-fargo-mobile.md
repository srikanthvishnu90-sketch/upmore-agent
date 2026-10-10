# Wells Fargo Mobile: parity checklist (WF)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

30 outcomes, 100% accounted, 6.7% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| WF-001 Balances | ACCT-001 | CLAIMED |  |
| WF-002 Transactions | TXN-001 | CLAIMED |  |
| WF-003 Account alerts | ALRT-010 | CLAIMED | Configurable account alerts map to user-defined watches across the ALRT family. |
| WF-004 Eligible account opening | non-parity: regulated-origination | n/a | Opening a new bank account is regulated KYC onboarding Upmore never performs; it only finds signup bonuses (EARN-001). |
| WF-005 Zelle sending and receiving | PAY-012 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| WF-006 Internal transfers | PAY-009 | CLAIMED |  |
| WF-007 Eligible external transfers | PAY-010 | CLAIMED |  |
| WF-008 Bill payments | BILL-008 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| WF-009 Check deposit | non-parity: hardware-bound | n/a | Mobile check capture needs the phone camera inside a bank partner flow; v1 tells the user to deposit in the bank app and confirms when it posts (doc 03 App 5). |
| WF-010 Fargo assistance | CORE-002 | TESTED | Doc 03: Fargo assistant Q&A is CORE-002. |
| WF-011 Eligible FICO score | CRDT-001 | CLAIMED |  |
| WF-012 Credit alerts | CRDT-007 | CLAIMED | Credit alerts are delivered as hard inquiry alerts plus score monitoring (CRDT-001). |
| WF-013 Experian report review | CRDT-002 | CLAIMED |  |
| WF-014 Debt-to-income comparison | CRDT-008 | CLAIMED | Debt-to-income comparison is computed from the debt inventory and income vs spend (ANL-002). |
| WF-015 Borrowing education | CRDT-006 | CLAIMED | Borrowing education is delivered as new-account impact explanation; no education-content capability exists. |
| WF-016 Life-event plans | HOUS-010 | CLAIMED | Doc 03: life events planning maps to HOUS-009/HOUS-010. |
| WF-017 WellsTrade access | non-parity: investment-platform | n/a | Stock trading inside a non-investment app is an investment-platform feature excluded from the parity set; doc 09 covers user-directed orders separately. |
| WF-018 Intuitive Investor access | non-parity: investment-platform | n/a | Robo-advisory investing is an investment-platform feature excluded from the parity set (doc 09). |
| WF-019 Adviser discovery | non-parity: investment-platform | n/a | Finding a human financial adviser is an investment-advisory feature excluded from the parity set (doc 09). |
| WF-020 Language preferences | CORE-003 | CLAIMED | Language preference is captured at onboarding; no localization capability exists in the registry. |
| WF-021 Account and device eligibility | CORE-002 | TESTED | Account and device eligibility is an honest capability-status answer. |
| WF-022 Zelle fraud and protection education | PAY-021 | CLAIMED | Zelle fraud education is delivered as recipient verification before first send. |
| WF-023 Activate or replace an eligible credit/debit card | CARD-014 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| WF-X01 Turn debit/credit cards off and on, and activate or replace cards. | CARD-011 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| WF-X02 Add eligible cards to digital wallets (Apple Pay, Google Pay, Samsung Pay, Paze, PayPal) and use cardless ATM access. | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| WF-X03 Send domestic or international digital wires. | PAY-011 | CLAIMED |  |
| WF-X04 Send international remittances via ExpressSend to 12 countries. | PAY-016 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| WF-X05 Grant view-only Guest User access to accounts via Account Access Manager. | SOC-006 | CLAIMED |  |
| WF-X06 Sync accounts with Quicken financial software. | TXN-012 | CLAIMED | Quicken sync is delivered as transaction export. |
| WF-X07 Find ATMs/branches and book an appointment with a banker. | non-parity: hardware-bound | n/a | ATM and branch lookup and banker appointments are physical-location services the agent does not replicate. |
