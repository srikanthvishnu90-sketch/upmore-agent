# Bank of America Mobile Banking: parity checklist (BA)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

25 outcomes, 100% accounted, 56% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| BA-001 Bank monitoring | ACCT-003 | TESTED | Bank monitoring is the cross-institution account list with alerts (ALRT family). |
| BA-002 Banking and Merrill views | ACCT-003 | TESTED | Combined banking and Merrill view is listing accounts across institutions; holdings detail is INV-001. |
| BA-003 Erica assistance | CORE-002 | TESTED | Doc 03: Erica-style Q&A is CORE-002, but truthful. |
| BA-004 Zelle payments | PAY-012 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| BA-005 Wire transfers | PAY-011 | GATED | wires need the same partner rail and stay T5 always |
| BA-006 Bill Pay | BILL-008 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| BA-007 Internal and external transfers | PAY-009 | CLAIMED |  |
| BA-008 Check deposit | non-parity: hardware-bound | n/a | Mobile check capture needs the phone camera inside a bank partner flow; v1 tells the user to deposit in the bank app and confirms when it posts (doc 03 App 5). |
| BA-009 Account alerts | ALRT-010 | TESTED | Configurable account alerts map to user-defined watches across the ALRT family. |
| BA-010 Digital-wallet provisioning | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| BA-011 Security education | SEC-011 | CLAIMED | Security education is delivered as phishing detection in finance emails rather than content. |
| BA-012 Security meter | SEC-007 | TESTED | A security meter maps to credential rotation reminders; no security-score capability exists. |
| BA-013 Fraud and identity-theft guidance | SEC-004 | TESTED |  |
| BA-014 Eligible credit and FICO view | CRDT-001 | CLAIMED |  |
| BA-015 Life Plan goals | ANL-016 | TESTED |  |
| BA-016 Spending analysis | ANL-001 | TESTED |  |
| BA-017 Budget tracking | ANL-003 | TESTED |  |
| BA-018 Financial wellness | ANL-020 | TESTED | Financial wellness content is delivered as the weekly money summary; no wellness-score capability exists. |
| BA-019 Banking and investing support | CORE-002 | TESTED | Banking and investing support questions are honest status answers. |
| BA-020 Account and child transfer restrictions | PAY-020 | TESTED | Account and child transfer restrictions are payment limits and velocity checks. |
| BA-021 Transfer fees and eligibility | TXN-018 | TESTED | Transfer fee eligibility is fee flagging with pre-send disclosure. |
| BA-022 Receive eligible electronic bills and due reminders | BILL-007 | CLAIMED | Doc 03: eBills ingestion is BILL-007. |
| BA-X01 Aggregate accounts from other institutions to see a combined view and estimated net worth. | ACCT-004 | TESTED | Aggregated combined view with net worth is net worth calculation over ACCT-003. |
| BA-X02 Activate merchant cash-back deals on BofA cards. | EARN-010 | CLAIMED |  |
| BA-X03 Review and revoke third-party apps' access to bank data. | SEC-008 | CLAIMED | Reviewing and revoking third-party data access maps to the agent's session, device and access audit. |
