# SAVINGS-RATE: "find me a better savings rate" (megadoc M05)

`packages/domain/110-savings-rate.js` (`SavingsRate`). Upmore has no verified, dated source for today's savings rates,
so it never names a bank or a rate (the chat model would). It says what the person's own savings earned, from their
rows: for each linked savings account, the interest paid in the last full calendar month (posted, positive rows on that
account whose description reads as interest: interest, INT PD, interest earned, dividend), and that amount times 12
over today's balance as a rough yearly rate, said as rough. No interest row is said as none, never 0%; rows that don't
cover the month are said, with no rate. Then what switching means: the person opens a new account themselves; Upmore
opens no accounts and moves nothing. Read-only.

Where it runs: money kind "savingsrate" in `supabase/functions/agent-chat/_shared/money_answers.ts`.
Owner item: a verified, dated rate source (an offer-book term per bank, with its page and checked date) would let the
answer compare; until then it compares nothing.
Check: `node --test tests/depth-SAVINGS-RATE.test.cjs && node evals/depth/run.cjs SAVINGS-RATE`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | No bank or rate named | said first | `S01` in tests/depth-SAVINGS-RATE.test.cjs | the 'better' line is dropped | proven (also fails S11) |
| S02 | Last month's interest | $12.40 in September | `S02` in tests/depth-SAVINGS-RATE.test.cjs | this month is read instead of the last full one | proven (also fails S03, S04, S07, S08, S10) |
| S03 | The rough yearly rate | 5.0% on $3,000 | `S03` in tests/depth-SAVINGS-RATE.test.cjs | the rate is not annualized | proven |
| S04 | Said as rough | the balance may have moved | `S04` in tests/depth-SAVINGS-RATE.test.cjs | the rough caveat is dropped | proven |
| S05 | Only the last full month | no other month added | `S05` in tests/depth-SAVINGS-RATE.test.cjs | every month's interest is added | proven (also fails S02, S03, S06, S07, S08) |
| S06 | Pending not counted | a pending interest row | `S06` in tests/depth-SAVINGS-RATE.test.cjs | pending rows count | proven |
| S07 | Only that account | checking interest is not savings | `S07` in tests/depth-SAVINGS-RATE.test.cjs | the account filter is dropped | proven (also fails S12) |
| S08 | Interest as banks write it | INT PD, dividend | `S08` in tests/depth-SAVINGS-RATE.test.cjs | only the word interest is read | proven |
| S09 | None is never 0% | no interest row | `S09` in tests/depth-SAVINGS-RATE.test.cjs | no interest is said as a rate | proven (also fails S06, S12) |
| S10 | Rows that don't cover the month | said, no rate | `S10` in tests/depth-SAVINGS-RATE.test.cjs | partial months are rated | proven |
| S11 | No savings account | said | `S11` in tests/depth-SAVINGS-RATE.test.cjs | no account says nothing | proven |
| S12 | Every savings account | each on its own line | `S12` in tests/depth-SAVINGS-RATE.test.cjs | only the first savings account is shown | proven |
| S13 | The ways people ask | mortgage, card, loan and vague are not this | `S13` in tests/depth-SAVINGS-RATE.test.cjs | a vague 'better rate' is taken as savings | proven |
| S14 | What switching means | the person opens the account | `S14` in tests/depth-SAVINGS-RATE.test.cjs | the switching line is dropped | proven |
| S15 | The source line | every answer | `S15` in tests/depth-SAVINGS-RATE.test.cjs | the source line is dropped | proven (also fails S14) |
<!-- results:end -->
