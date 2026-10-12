# BILLER-MODEL: bills read from a connected biller (packet added for G4)

`packages/domain/38-agent-biller-model.js` (`AgentBillerModel.normalizeBatch`) checks a batch of server-fetched biller
records before anything is stored. The connection must be active with `read_obligations` permission; each record must
belong to that connection's account at the biller, carry a version of 1 or more, an id that is short and printable and
unique in the batch, an observation time no later than now (never filled in with now) and the currency the biller
states. "Settled" needs the creditor's application reference (a bank debit is not proof); "verified" and "partially paid"
need the biller's own confirmation that the amount is unpaid, or they are only `asserted`. The connection, not the
record, names the biller and stamps the evidence. One bad record rejects the whole batch, so a broken correction never
looks like a clean refresh.
Check: `node --test tests/depth-BILLER-MODEL.test.cjs && node evals/depth/run.cjs BILLER-MODEL`.

Where it runs (read from the repo on 2026-10-12): in the financial core bundle (`scripts/build-financial-core.py`), used
only by `supabase/functions/_shared/biller_service.ts` (`ingestBillerRecords`, called from `refreshBiller`, which
agent-workflows "refresh_biller" calls). `BILLER_ADAPTERS` is empty: no biller adapter is verified, so `refreshBiller`
answers "This biller's refresh adapter has not been verified." and **no real biller record reaches this module today**.
It is a contract for the first adapter, proven here against MOCK records only.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S14 (found here): a record without a currency was read as dollars (`AgentWorkflows.normalize` defaults a missing
  currency to "USD"), so a Canadian biller's C$1,500.00 sent without a currency field would have been a verified
  $1,500.00 bill in the cash summary's amount due. A biller record must now state its currency
  (`biller_currency_required`); "cad" is still read as CAD and "C$" is still refused as an invalid code. The existing
  `tests/edge/biller-service.test.ts` fixture states USD and is unchanged. D14 plants the old default.

Noted, not changed (for the owner): an observation time a millisecond after the server's now is refused (S10), so a
biller clock that runs ahead fails the batch; a record that is years old is accepted and only shown as stale later
(`financial_tools.ts` marks bills older than 48 hours "refresh required").

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Only an active connection | a revoked connection is not read | `S01` in tests/depth-BILLER-MODEL.test.cjs | the connection's status is not checked | proven |
| S02 | Read permission for bills | a connection without read_obligations is not read | `S02` in tests/depth-BILLER-MODEL.test.cjs | any capabilities object is enough | proven |
| S03 | Every fact from the biller | the bill's reference is the biller's own id | `S03` in tests/depth-BILLER-MODEL.test.cjs | the record's free reference field replaces the biller's id | proven |
| S04 | Verified needs unpaid confirmed | verified without confirmation is asserted | `S04` in tests/depth-BILLER-MODEL.test.cjs | only an explicit false confirmation downgrades the bill | proven (also fails S15) |
| S05 | Partially paid needs it too | partially paid without confirmation is asserted | `S05` in tests/depth-BILLER-MODEL.test.cjs | only "verified" is checked | proven |
| S06 | Paid needs the application reference | settled without applied_reference is refused | `S06` in tests/depth-BILLER-MODEL.test.cjs | the application-evidence check is dropped | proven |
| S07 | Another account is refused | a record for mock-acct-OTHER is refused | `S07` in tests/depth-BILLER-MODEL.test.cjs | the record's account is not compared with the connection's | proven |
| S08 | Version 1 or more | version 0 is refused | `S08` in tests/depth-BILLER-MODEL.test.cjs | the version floor is off by one | proven |
| S09 | One bill once per batch | the same external id twice is refused | `S09` in tests/depth-BILLER-MODEL.test.cjs | repeated ids are not checked | proven |
| S10 | Not later than now | an observation 1 ms after now is refused | `S10` in tests/depth-BILLER-MODEL.test.cjs | the future check is dropped | proven |
| S11 | Now is never the observation time | a record with no observed_at is refused | `S11` in tests/depth-BILLER-MODEL.test.cjs | a missing observation time is filled with now | proven |
| S12 | One bad record rejects the batch | a good bill next to a -$0.01 bill stores nothing | `S12` in tests/depth-BILLER-MODEL.test.cjs | the good records are kept while the batch reports errors | proven (also fails S09) |
| S13 | 500 records at most | 501 records are refused | `S13` in tests/depth-BILLER-MODEL.test.cjs | the batch limit is off by one | proven |
| S14 | A bill states its currency | a record with no currency is refused, not read as USD | `S14` in tests/depth-BILLER-MODEL.test.cjs | a missing currency becomes USD (the bug found building this packet) | proven |
| S15 | The connection stamps the evidence | a record cannot claim another connector or its own unpaid confirmation | `S15` in tests/depth-BILLER-MODEL.test.cjs | the record's evidence is spread last, over the connection's stamp | proven |
| S16 | Bad amounts and dates are refused | a -$1.00 bill is refused with invalid_amount | `S16` in tests/depth-BILLER-MODEL.test.cjs | a record that fails validation is skipped silently | proven (also fails S12, S14) |
| S17 | A real current time | now = "not a date" reads nothing | `S17` in tests/depth-BILLER-MODEL.test.cjs | the current-time check is dropped | proven |
| S18 | Ids stay short and printable | a 161-character id is refused | `S18` in tests/depth-BILLER-MODEL.test.cjs | the id length limit is ten times too long | proven |
<!-- results:end -->
