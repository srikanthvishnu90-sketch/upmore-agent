# Capital One Mobile: parity checklist (CO)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

31 outcomes, 100% accounted, 25.8% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| CO-001 Current balances | ACCT-001 | CLAIMED |  |
| CO-002 Detailed activity | TXN-001 | CLAIMED |  |
| CO-003 Duplicate and surprise-charge alerts | TXN-009 | TESTED |  |
| CO-004 Purchase notifications | ALRT-002 | CLAIMED | Purchase notifications are delivered as transaction alerts with fatigue guard (ALRT-012). |
| CO-005 Card lock and unlock | CARD-011 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CO-006 CreditWise enrollment and scores | CRDT-001 | CLAIMED |  |
| CO-007 Rewards balances | EARN-011 | TESTED |  |
| CO-008 Cashback and miles redemption | EARN-012 | TESTED | Redemption is delivered as valuation and best-use suggestion; the issuer executes. |
| CO-009 Auto-loan progress | CRDT-008 | CLAIMED |  |
| CO-010 Auto-loan payments | PAY-006 | GATED | A local payment engine exists (supabase/functions/_shared/payment_service.ts) but no registered payment provider or owner launch approval; see docs/implementation/workstreams.md. |
| CO-011 Subscription discovery | BILL-001 | TESTED |  |
| CO-012 Subscription charge details | TXN-020 | CLAIMED | Doc 03: Eno charge explanations are TXN-020. |
| CO-013 Block unwanted recurring charges | BILL-003 | TESTED | Blocking a recurring charge is delivered as cancellation at the merchant plus reactivation watch (BILL-018). |
| CO-014 Cancel supported subscriptions | BILL-003 | TESTED |  |
| CO-015 Blocking versus contract cancellation | BILL-017 | TESTED | Explaining block vs contract cancellation maps to cancellation confirmation verification. |
| CO-016 Optional iOS balance widget | ACCT-001 | CLAIMED | A home-screen widget is a surface; the outcome (balance at a glance) is read balance on ask. |
| CO-017 Biometric sign-in | non-parity: hardware-bound | n/a | Biometric unlock is the host app's own device-authenticator feature; Upmore verifies sensitive chat commands (SEC-012) but does not own the phone's biometric sensor. |
| CO-018 Two-step authentication | SEC-012 | CLAIMED | Two-step authentication maps to verification challenges on sensitive commands. |
| CO-019 Check deposit | non-parity: hardware-bound | n/a | Mobile check capture needs the phone camera inside a bank partner flow; v1 tells the user to deposit in the bank app and confirms when it posts (doc 03 App 5). |
| CO-020 Store cash deposit barcode | non-parity: hardware-bound | n/a | Cash deposit at a store via barcode is a physical cash handoff the agent cannot perform. |
| CO-021 Digital-wallet provisioning | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| CO-022 Zelle sending and receiving | PAY-012 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CO-023 Credit-card activation | CARD-014 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CO-024 Replacement card linking | CARD-014 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CO-025 Eligible virtual cards | CARD-012 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| CO-026 Eno balance and activation assistance | CORE-002 | TESTED | Doc 03: Eno-style assistant answers are CORE-002, benchmarked in doc 13. |
| CO-027 Missing new-account help | ACCT-005 | CLAIMED | Missing new account help maps to per-connector account health status. |
| CO-X01 Sign in with a passkey | SEC-012 | CLAIMED | Passkey sign-in is the bank's authenticator; Upmore's equivalent is verification of sensitive commands. |
| CO-X02 Manage migrated Discover credit cards in the Capital One app | CARD-001 | CLAIMED | Migrated Discover cards are managed through card inventory once linked. |
| CO-X03 Choose an overdraft handling option on checking | SAVE-006 | CLAIMED | Choosing overdraft handling is replaced by proactive overdraft prevention moves. |
| CO-X04 Verify identity by tapping an AirKey-enabled card to the phone | non-parity: hardware-bound | n/a | AirKey identity verification taps an NFC card to the phone; hardware-bound. |
