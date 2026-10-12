# SUBSTITUTES: free substitutes depth packet (overnight D7, Methods 3 M3-SUBS-11 and M3-SHOP-06)

Owner: Claude. [Read] suggestions only. Kanopy through a library card is shown next to each paid streaming charge in
the person's own rows: its $0 price is the offer book's term (sourced from the owner's method card M3-SUBS-11, cited with
its checked date, stale past its window), and the dollar gap is the person's charge minus that price. Store-brand swaps
come from an itemized receipt the person pastes: each national-brand line is named with the store's own brand as the
swap and no gap is computed, because no store-brand price is on file (the shelf tag has it). Nothing is cancelled or
bought (packages/domain/89-free-substitutes.js, chat `agent-chat/_shared/substitutes_answer.ts`).

Check: `node --test tests/depth-SUBSTITUTES.test.cjs && node evals/depth/run.cjs SUBSTITUTES`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Kanopy's price from the offer book | the line cites the term's source and checked date | `S01` in tests/depth-SUBSTITUTES.test.cjs | the citation is dropped | proven (also fails S03) |
| S02 | The gap is charge minus the book's price | a $2.99 term makes a $15.99 charge a $13.00 gap | `S02` in tests/depth-SUBSTITUTES.test.cjs | the book's price is ignored | proven |
| S03 | A stale term is said | a term past its window says it may have changed | `S03` in tests/depth-SUBSTITUTES.test.cjs | terms never go stale | proven |
| S04 | Paid streaming now | a June Peacock charge is not listed | `S04` in tests/depth-SUBSTITUTES.test.cjs | any past charge counts as paid now | proven |
| S05 | A refund is not a charge | a refund-only Netflix row is not paid streaming | `S05` in tests/depth-SUBSTITUTES.test.cjs | credits count as charges | proven |
| S06 | Dollars only | a euro charge is not a dollar charge | `S06` in tests/depth-SUBSTITUTES.test.cjs | any currency counts | proven |
| S07 | A plan's perk is not a library ask | T-Mobile and Walmart+ perk asks go to the savings answer | `S07` in tests/depth-SUBSTITUTES.test.cjs | the perk words are not excluded | proven |
| S08 | Billed every month | charges two months apart are not 'a month' | `S08` in tests/depth-SUBSTITUTES.test.cjs | any two charges read as monthly | proven |
| S09 | Hoopla is not on file | a Hoopla ask says it isn't on file | `S09` in tests/depth-SUBSTITUTES.test.cjs | the not-on-file line is dropped | proven |
| S10 | No rows, no number | no linked rows says no card yet | `S10` in tests/depth-SUBSTITUTES.test.cjs | an empty feed goes on to the charge search | proven |
| S11 | Coupons and totals are not items | a Tide coupon line is not a Tide price | `S11` in tests/depth-SUBSTITUTES.test.cjs | coupon, total and tax lines are read as items | proven |
| S12 | Medicine: the active ingredient | Advil says to match the active ingredient | `S12` in tests/depth-SUBSTITUTES.test.cjs | the label check is dropped | proven |
| S13 | No invented store-brand price | the shelf tag line, and no percent | `S13` in tests/depth-SUBSTITUTES.test.cjs | a remembered 30% replaces the shelf tag | proven |
| S14 | Every receipt price for a brand | two Tide lines show both prices | `S14` in tests/depth-SUBSTITUTES.test.cjs | only the first price is shown | proven |
| S15 | Prescriptions are not grocery swaps | a prescription's generic is not a store-brand ask | `S15` in tests/depth-SUBSTITUTES.test.cjs | the prescription words are not excluded | proven |
<!-- results:end -->
