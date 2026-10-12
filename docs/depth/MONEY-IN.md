# MONEY-IN: interest earned and "did Maya pay me back?" (megadoc M04, C08)

`packages/domain/101-money-in.js` (`MoneyIn`) answers two questions about money coming in, from the person's own rows,
read-only. Interest: credits whose bank text says interest (an interest charge, a purchase-interest adjustment or a card's
interest is never earnings) this year so far by account, the last 12 months and last month; rows that start this year are
said, and the rate is never made up (it isn't in bank rows). A payment from a person: credits in the last 60 days whose
text names them as a whole word, to the cent when an amount is asked, with the app (Zelle, Venmo, Cash App, PayPal, Apple
Cash) and the bank's own display-safe words so the person can see it's the right Maya; transfers between their own
accounts, pending and other-currency rows never count; none found says that Venmo, Cash App and PayPal money stays in
the app until it's moved to the bank. A row dated tomorrow in UTC is tonight's.

Where it runs: kind "moneyin" in `supabase/functions/agent-chat/_shared/money_answers.ts` (before "did it go through");
"did i pay maya" and "pay maya back" are outgoing and go on. `tests/edge/megadoc-money-asks.test.ts`.
Check: `node --test tests/depth-MONEY-IN.test.cjs && node evals/depth/run.cjs MONEY-IN`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | This year by account | $29.75: Ally $29.72, checking $0.03 | `S01` in tests/depth-MONEY-IN.test.cjs | the per-account split is dropped | proven |
| S02 | Last month apart | September is $13.13 | `S02` in tests/depth-MONEY-IN.test.cjs | last month is read as this month | proven |
| S03 | A charge is not interest earned | an interest charge reversal is not earnings | `S03` in tests/depth-MONEY-IN.test.cjs | the interest-charge exclusion is dropped | proven |
| S04 | No made-up rate | the rate line says it isn't in the rows | `S04` in tests/depth-MONEY-IN.test.cjs | the rate line is dropped | proven |
| S05 | None is said with its days | no interest since Sep 1, 2026 | `S05` in tests/depth-MONEY-IN.test.cjs | the empty case is not handled | proven |
| S06 | Late start said | rows from Aug 31 are said | `S06` in tests/depth-MONEY-IN.test.cjs | the late-start caveat is dropped | proven |
| S07 | The bank's own words | the matched payment quotes its text | `S07` in tests/depth-MONEY-IN.test.cjs | the descriptor is dropped from the line | proven |
| S08 | To the cent | $40.00 is not the $20.00 asked about | `S08` in tests/depth-MONEY-IN.test.cjs | any payment from the person is taken as the amount asked | proven |
| S09 | Where else it may be | the app note when none is found | `S09` in tests/depth-MONEY-IN.test.cjs | the app note is dropped | proven |
| S10 | Whole word names | Mayan Grill is not Maya | `S10` in tests/depth-MONEY-IN.test.cjs | the name is matched inside other words | proven |
| S11 | Own transfers are not payments | a transfer from a joint savings is not Maya paying | `S11` in tests/depth-MONEY-IN.test.cjs | transfers are counted | proven |
| S12 | Posted dollars only | pending and EUR are not paid | `S12` in tests/depth-MONEY-IN.test.cjs | the currency check is dropped | proven |
| S13 | Companies are not people | 'did amazon pay me' is not this | `S13` in tests/depth-MONEY-IN.test.cjs | the not-a-person list is dropped | proven |
| S14 | Tonight's UTC row | Oct 13 counts at 11:30 p.m. Oct 12 | `S14` in tests/depth-MONEY-IN.test.cjs | the window ends today | proven |
| S15 | Source and as-of | every answer ends with its source | `S15` in tests/depth-MONEY-IN.test.cjs | the source line is dropped from the payment answer | proven (also fails S09) |
<!-- results:end -->
