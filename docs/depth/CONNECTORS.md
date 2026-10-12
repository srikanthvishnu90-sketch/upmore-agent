# CONNECTORS: one connector model, five verbs, behind the gates (packet added for G4)

`packages/domain/51-connectors.js` (`Connectors`, Instinct spec doc 04) is the pure half of every source Upmore reads
or writes: an adapter with five verbs (connect, sync, act, health, revoke), consent as a record in plain words, one
canonical schema with merchant keys at ingest and every datum stamped with its source, sign-in kind and as-of, a
source ranking that reports conflicts instead of merging them, health that says one calm thing and escalates once,
`act()` behind the autonomy gate (`43-agent-loop.js`) and the compliance gate (`53-compliance.js`), and revoke that
destroys the vault handle and states what is kept. No secret lives here: adapters get a vault handle.
Check: `node --test tests/depth-CONNECTORS.test.cjs && node evals/depth/run.cjs CONNECTORS`.

Where it runs today: **not reachable in production.** No edge function or app path loads it; it is in neither the
router bundle nor the financial core. The live chat's connectors are `liveConnectors()` in
`supabase/functions/_shared/flow_router.ts`, which throw NOT_WIRED for every read and write without a partner, and
"connect my X" is answered from the connector matrix (`77-brokerage-connectors.js`). This module's three reference
adapters (`fakeAggregator`, `manualCsv`, `stubOAuth` against `sandbox.example.test`) are fixtures and are never a live
source. It runs in `tests/connectors.test.cjs`, `tests/no-password-storage.test.cjs` and this packet; the catalog row
`manual-csv` cites it ("reference adapter in packages/domain/51-connectors.js"). No live reply has said any of the
words below and no money moved through it.

Bugs this packet pins, each written as a failing test first on the original module (logged in
`docs/playbook-drift-2026-10-12.md`):
- S05: a missing money field became $0.00. Plaid sends `available: null` for most cards, which read as "$0.00
  available"; a holding with `cost_basis: null` got a $0.00 basis (the whole sale would read as gain); a missing
  balance, price or bill amount was $0.00 too. Missing or non-numeric is now `null` (unknown); a real 0 stays 0. D05,
  D05b.
- S06: transactions dropped their currency, so a 45.00 EUR charge became `amount_cents: -4500` with no currency (read
  downstream as $45.00). The canonical transaction now carries `currency` (`currency` or Plaid's `iso_currency_code`,
  USD only when neither is given); accounts read `iso_currency_code` too. D06.
- S07: the manual CSV adapter, "always available as the floor", threw away the CSV given at connect: the sync read
  nothing and said HEALTHY with zero rows (the old test set `_csv` by hand). The upload is now what the sync reads. D07.
- S08: the CSV reader split on every comma, so `"STARBUCKS, SEATTLE WA",-5.40` made the description `"STARBUCKS` and
  the amount NaN, and `"-1,850.00"` or `$3250.00` were NaN. Cells now follow CSV quoting (`""` is a quote) and the
  amount drops `$`, commas and spaces; unquoted rows read exactly as before. D08.
- S14: with `53-compliance.js` not loaded (and no gate passed in), `act()` skipped the compliance check and a confirmed
  transfer reached the adapter: the gate failed open. It now fails closed (`no_compliance_gate`), like the autonomy
  gate. D14.
- S15: the person's yes depended on the gate the caller brought: a capability labeled T1, or a caller's own
  `autonomy` gate returning `confirm: false`, moved money with no yes, and a T5 passed with a lax gate reached the
  adapter. Every write now needs `confirmed: true` (the consent itself says "each time you confirm"), and a T5 is
  refused by its own tier. Nothing widened: a confirmed T3 with a live partner and verified KYC still reaches the
  adapter. D15, D15b.
- S17: the audit log redacted only keys naming a secret, password, token, credential, OTP or SSN; an action's
  `mfa_code`, `verification_code`, `card_pin`, `passcode`, `cvv`, `card_number` and `account_number` were written to
  it verbatim. They are now redacted; ordinary keys (`currency_code`, `amount_cents`, `recipient`) stay readable. D17.

Fixed after merge (each red first in this file, logged in `docs/playbook-drift-2026-10-12.md`):
- S21: a health ping that answered HEALTHY cleared NEEDS_REAUTH set by a failed sync, without a successful sync, and a
  confirmed transfer then reached the adapter on a connection still needing sign-in. Only a successful sync clears it
  now; the ping adds no message. D21.
- S10: `classify()` read any number from 500 to 599 in an error message as a provider outage ("account 512 not found"
  was STALE). It reads the HTTP status only: the error's own status field, or a number the message labels as one
  ("HTTP 502", "status code 500", "returned 503", "Error 500", "503 Service Unavailable"). D10b.
- S18: the conflict statement in `resolve()` printed raw cents and no as-of ("Sources disagree: mock-plaid says 421208,
  ..."). It says dollars for balances and bills and each source's as-of ("mock-plaid says $4,212.08 as of 2023-11-14
  22:13 UTC"); `tests/connectors.test.cjs` pinned the old words and is corrected. D18b.

Noted, not changed (for the owner): revoking twice rewrites the retention date; a failed sync of another kind (a
timeout, a bad batch) still replaces NEEDS_REAUTH with STALE or BROKEN, as `tests/connectors.test.cjs` pins; the fake
aggregator and the sandbox OAuth stub (with a PLACE_ORDER scope) ship inside the module rather than under tests.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Five verbs, nothing less | an adapter without revoke is refused | `S01` in tests/depth-CONNECTORS.test.cjs | revoke is not required | proven |
| S02 | Moving money is its own grant | a write scope without its own consent throws | `S02` in tests/depth-CONNECTORS.test.cjs | the separate write consent is not required | proven |
| S03 | The vault holds the token | the record carries vh_conn_001, never the token | `S03` in tests/depth-CONNECTORS.test.cjs | the raw token is stored as the handle | proven (also fails S13) |
| S04 | Stamped with this sync's time | every datum is as of the sync | `S04` in tests/depth-CONNECTORS.test.cjs | the stamp is the previous success time | proven |
| S05 | Unknown is not $0.00 | available: null stays null | `S05` in tests/depth-CONNECTORS.test.cjs | a null available amount reads as $0.00 (the bug found building this packet) | proven |
| S05 | No basis is not a $0.00 basis | cost_basis: null stays null | `S05` in tests/depth-CONNECTORS.test.cjs | a null cost basis reads as $0.00 (the bug found building this packet) | proven |
| S06 | A charge keeps its currency | 45.00 EUR stays EUR | `S06` in tests/depth-CONNECTORS.test.cjs | transactions drop their currency (the bug found building this packet) | proven |
| S07 | The upload is what syncs | the CSV given at connect yields two rows | `S07` in tests/depth-CONNECTORS.test.cjs | the CSV given at connect is dropped (the bug found building this packet) | proven (also fails S08) |
| S08 | Quoted cells are one cell | "STARBUCKS, SEATTLE WA" stays one description | `S08` in tests/depth-CONNECTORS.test.cjs | rows are split on every comma (the bug found building this packet) | proven |
| S09 | Revoke destroys the token | the vault entry conn_001 is destroyed | `S09` in tests/depth-CONNECTORS.test.cjs | the vault entry is left in place | proven |
| S10 | A sign-in error is a sign-in error | ITEM_LOGIN_REQUIRED asks for a sign-in | `S10` in tests/depth-CONNECTORS.test.cjs | the aggregator's login code reads as broken | proven (also fails S11, S16, S21) |
| S10 | An outage is the HTTP status | "account 512 not found" is broken, not the provider down | `S10` in tests/depth-CONNECTORS.test.cjs | any number from 500 to 599 in the message reads as an outage (the bug fixed after merge) | proven |
| S11 | Said once, escalated once, then quiet | four failures make two messages | `S11` in tests/depth-CONNECTORS.test.cjs | a third message goes out | proven |
| S12 | Exactly twice the cadence is not stale | two days after a banking sync is still healthy | `S12` in tests/depth-CONNECTORS.test.cjs | the boundary counts as stale | proven |
| S13 | A yes before any move | an unconfirmed $5.00 transfer never reaches the adapter | `S13` in tests/depth-CONNECTORS.test.cjs | the person's yes is not checked | proven (also fails S15) |
| S14 | No compliance gate, no move | without 53-compliance.js the transfer is refused | `S14` in tests/depth-CONNECTORS.test.cjs | a missing compliance gate lets the move through (the bug found building this packet) | proven |
| S15 | The yes does not depend on the caller's gate | a T1 label or a lax gate still needs a yes | `S15` in tests/depth-CONNECTORS.test.cjs | the gate's confirm flag decides (the bug found building this packet) | proven |
| S15 | T5 by its own tier | a T5 passed with a lax gate is still refused | `S15` in tests/depth-CONNECTORS.test.cjs | only the gate's always flag marks a T5 | proven |
| S16 | Only a healthy connection acts | a connection needing sign-in is refused | `S16` in tests/depth-CONNECTORS.test.cjs | the health check before the adapter is dropped | proven (also fails S09, S21) |
| S17 | Codes and numbers stay out of the log | an MFA code, PIN and card number are redacted | `S17` in tests/depth-CONNECTORS.test.cjs | only passwords, tokens, OTPs and SSNs are redacted (the bug found building this packet) | proven |
| S18 | The ranking decides, not the latest reading | the aggregator's balance beats a newer manual one | `S18` in tests/depth-CONNECTORS.test.cjs | the newest reading wins | proven |
| S18 | Dollars and as-of, not raw cents | the conflict says $4,212.08 as of its sync time | `S18` in tests/depth-CONNECTORS.test.cjs | the conflict prints raw cents with no as-of (the bug fixed after merge) | proven |
| S19 | Due at exactly one cadence | 15 minutes after a balance sync it is due | `S19` in tests/depth-CONNECTORS.test.cjs | the boundary waits another tick | proven |
| S20 | A live session is the least reliable kind | describe() says low for a live session | `S20` in tests/depth-CONNECTORS.test.cjs | a live session is labeled high | proven |
| S21 | Only a good sync clears a sign-in | an OK ping leaves NEEDS_REAUTH in place | `S21` in tests/depth-CONNECTORS.test.cjs | a health ping that answers OK clears NEEDS_REAUTH with no sync (the bug fixed after merge) | proven |
<!-- results:end -->
