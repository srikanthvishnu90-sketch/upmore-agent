# Google Wallet: parity checklist (GW)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

27 outcomes, 100% accounted, 3.7% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| GW-001 Add eligible payment cards | CARD-001 | CLAIMED | Adding a card to the agent is card inventory; wallet provisioning itself is hardware-bound. |
| GW-002 Provision contactless cards | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| GW-003 Phone tap-to-pay | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| GW-004 Watch tap-to-pay | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| GW-005 Online and in-app Google Pay checkout | CARD-002 | CLAIMED | Upmore is not a checkout button; it delivers the right-card recommendation at the moment of online purchase. |
| GW-006 Recent eligible payment activity | TXN-001 | CLAIMED |  |
| GW-007 Permissioned Gmail receipt import | TXN-015 | CLAIMED |  |
| GW-008 Purchase detail organization | TXN-002 | CLAIMED | Organized purchase detail is delivered as searchable, receipt-attached transactions; no dedicated purchase-organizer capability exists. |
| GW-009 Supported US package tracking | TXN-015 | CLAIMED | Package tracking has no registry capability; the closest is receipt ingestion from email, which carries shipment data. |
| GW-010 Loyalty cards | EARN-011 | TESTED |  |
| GW-011 Gift cards | ACCT-007 | CLAIMED | Gift card balances are tracked as manually entered stored-value accounts. |
| GW-012 Boarding passes | INS-010 | CLAIMED | Doc 03: stored passes and tickets live in the document vault extended beyond insurance. |
| GW-013 Flight and gate updates | ALRT-010 | CLAIMED | Flight and gate updates are a user-defined watch; compensation on delay is EARN-016. |
| GW-014 Supported transit passes | non-parity: hardware-bound | n/a | Transit passes are tapped at NFC fare gates from the phone's secure element; Upmore cannot present them. |
| GW-015 Event tickets | INS-010 | CLAIMED | Doc 03: tickets go in the extended document vault. |
| GW-016 Timely ticket surfacing | ALRT-010 | CLAIMED | Timely surfacing of a stored ticket is a scheduled watch on vault contents. |
| GW-017 Supported state IDs | non-parity: hardware-bound | n/a | State IDs are presented from the phone's secure element to NFC readers; Upmore cannot hold or present a mobile ID credential. |
| GW-018 Supported student IDs | non-parity: hardware-bound | n/a | Student IDs are NFC campus credentials bound to the device secure element. |
| GW-019 Supported digital car keys | non-parity: hardware-bound | n/a | Digital car keys use NFC/UWB from the device and cannot be delivered through conversation. |
| GW-020 Saved items online and across Google | CARD-001 | CLAIMED | Saved payment methods across Google surfaces map to the agent's card inventory; no cross-Google sync exists. |
| GW-021 Cross-product privacy controls | SEC-008 | CLAIMED | Cross-product privacy controls map to the agent's own session, device and data-access audit. |
| GW-022 Lost-device security | SEC-010 | CLAIMED | Lost-device response is the kill switch plus issuer card locks. |
| GW-X01 Parent-managed tap to pay for supervised children with parent email on successful payments. | non-parity: hardware-bound | n/a | Tokenizing a card into the phone's secure element and tapping at a terminal is NFC hardware the agent cannot hold or replace (doc 03 App 4, doc 14). |
| GW-X02 US child prepaid balance with KYC'd family manager, PIN, add money, daily spending limit, lock, restricted merchants. | SOC-007 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| GW-X03 Create a pass from any photo/barcode (library, gym, parking) or downloaded pass file. | INS-010 | CLAIMED | A pass created from a photo or barcode is a stored document; Upmore cannot present it at a scanner. |
| GW-X04 Store hotel keys, corporate badges and health insurance/vaccine cards. | INS-010 | CLAIMED | Insurance and vaccine cards go in the document vault; NFC hotel keys and badges are hardware-bound and not delivered. |
| GW-X05 Google Pay direct checkout pre-fills Wallet payment options on retailer checkout pages. | CARD-002 | CLAIMED | Checkout pre-fill is a merchant-page feature; Upmore delivers the card choice, not the fill. |
