# PRICE-DROP: a store's own lower price inside its window (overnight C5, packet added for G4)

The store, the old and new price (and the purchase day if known) come from the person's message; the purchase comes from
their own card rows; the window and exclusions come from the dated offer book (`store.*` terms), never from code. Upmore
drafts the request the person sends and contacts no one (packages/domain/88-price-drop.js).
Check: `node --test tests/depth-PRICE-DROP.test.cjs && node evals/depth/run.cjs PRICE-DROP`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Store and price-drop words both required | 'target run tomorrow $40' is not a claim | `S01` in tests/depth-PRICE-DROP.test.cjs | a store name alone fires | proven |
| S02 | From and to | $1,049.99 to $899.99 parses with the thousands comma | `S02` in tests/depth-PRICE-DROP.test.cjs | the comma is not removed from the old price | proven |
| S03 | Two amounts without from/to | the higher is paid, the lower is now | `S03` in tests/depth-PRICE-DROP.test.cjs | the amounts are taken in the order written | proven |
| S04 | Not lower is no claim | an equal price is not lower | `S04` in tests/depth-PRICE-DROP.test.cjs | only a higher price is refused | proven |
| S05 | Missing prices are asked | no prices -> the question | `S05` in tests/depth-PRICE-DROP.test.cjs | a missing price counts as zero | proven |
| S06 | Only that store's charges | a Walmart charge is not the Target purchase | `S06` in tests/depth-PRICE-DROP.test.cjs | any store's charge can be the purchase | proven |
| S07 | Pending and foreign rows out | a pending and a euro charge are not the purchase | `S07` in tests/depth-PRICE-DROP.test.cjs | pending rows and other currencies count | proven |
| S08 | Up to 12% tax | 13% over the old price is not a match | `S08` in tests/depth-PRICE-DROP.test.cjs | any amount over the old price matches | proven |
| S09 | The named day picks the row | bought oct 5 picks Oct 5 | `S09` in tests/depth-PRICE-DROP.test.cjs | the named day is ignored and the latest fitting charge is taken | proven |
| S10 | Several on one day are asked | two Oct 5 charges ask which | `S10` in tests/depth-PRICE-DROP.test.cjs | the first of several is taken silently | proven |
| S11 | Inside the window | 9 days old inside 14 | `S11` in tests/depth-PRICE-DROP.test.cjs | the age is counted from the first of the month | proven (also fails S12) |
| S12 | Past the window | 15 days old is past 14 | `S12` in tests/depth-PRICE-DROP.test.cjs | the window allows one extra day | proven |
| S13 | Best Buy's return period | never a number of days | `S13` in tests/depth-PRICE-DROP.test.cjs | a non-number window is shown as an N-day window | proven |
| S14 | Exclusions from the term note | Best Buy's exclusions are said | `S14` in tests/depth-PRICE-DROP.test.cjs | the term note is never said | proven |
| S15 | A stale term is said | an old Costco term may have changed | `S15` in tests/depth-PRICE-DROP.test.cjs | terms never go stale | proven |
<!-- results:end -->
