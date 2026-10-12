# SPEND-RECHECK: "I spent less than that" (megadoc L06)

`packages/domain/108-spend-recheck.js` (`SpendRecheck`) rechecks a spending total the person disputes, read-only. The
total is the spending answer just given in the thread (only the most recent reply counts) and the ask before it,
recomputed now by `MoneyAnswers.spendRows`, the same filters as the answer (`tests/money-answers.test.cjs` holds the two
to the same total for every kind of ask, with and without category rules). Said: the total now and how many charges (and
the total given before, if new rows changed it); the charges, largest first with their dates (the 8 largest and the rest
counted); the pending charges not counted; transfers and card payments not counted; for a category, that each charge
counts by the store's name, the rule that moves one, and the spending that matched no category; for "less", how to ask
about a charge that isn't theirs; for "more", where something missing may be. With no spending answer just given,
"I spent less than that" asks which number and a bare "that's wrong" goes on. "Show me the math" right after a
spending total gives this recheck too.

Where it runs: kind "recheck" in `supabase/functions/agent-chat/_shared/money_answers.ts` (the thread read through
`read.previous`); `tests/edge/megadoc-money-asks.test.ts`.
Check: `node --test tests/depth-SPEND-RECHECK.test.cjs && node evals/depth/run.cjs SPEND-RECHECK`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Rechecked by the same filters | $180.00 from 3 charges | `S01` in tests/depth-SPEND-RECHECK.test.cjs | the charge count is dropped | proven (also fails S07, S10, S11) |
| S02 | Largest first | Trader Joe's $90 first | `S02` in tests/depth-SPEND-RECHECK.test.cjs | the rows keep date order | proven (also fails S03) |
| S03 | The 8 largest and the rest | and 3 more for $33.00 | `S03` in tests/depth-SPEND-RECHECK.test.cjs | the rest is not counted | proven |
| S04 | Pending said | 1 pending charge ($20.00) | `S04` in tests/depth-SPEND-RECHECK.test.cjs | pending is not said | proven (also fails S05, S06) |
| S05 | Transfers said | transfers and card payments not counted | `S05` in tests/depth-SPEND-RECHECK.test.cjs | the transfers line is dropped | proven (also fails S06) |
| S06 | How a store counts | count <store> as shopping | `S06` in tests/depth-SPEND-RECHECK.test.cjs | the category line is dropped | proven |
| S07 | The person's rules count | $220 with the hardware rule | `S07` in tests/depth-SPEND-RECHECK.test.cjs | rules are not passed | proven |
| S08 | Less: where to look | what's this charge from | `S08` in tests/depth-SPEND-RECHECK.test.cjs | the not-yours line is dropped | proven |
| S09 | More: where it may be | pending, unlinked, another category | `S09` in tests/depth-SPEND-RECHECK.test.cjs | the missing line is dropped | proven |
| S10 | What was said before | I said $150.00 before | `S10` in tests/depth-SPEND-RECHECK.test.cjs | the earlier total is not compared | proven |
| S11 | A merchant total | $90 at Trader Joe's | `S11` in tests/depth-SPEND-RECHECK.test.cjs | the merchant is not named | proven |
| S12 | Only the answer just given | a safe-to-spend answer first is not a total | `S12` in tests/depth-SPEND-RECHECK.test.cjs | an older spending answer is used | proven |
| S13 | No total: ask | which number? | `S13` in tests/depth-SPEND-RECHECK.test.cjs | a missing total goes on silently | proven (also fails S12) |
| S14 | The ways people say it | no way i spent that much | `S14` in tests/depth-SPEND-RECHECK.test.cjs | the leading no is always dropped | proven |
| S15 | Source line | ends with its source | `S15` in tests/depth-SPEND-RECHECK.test.cjs | the source line is dropped | proven (also fails S08, S09) |
<!-- results:end -->
