# SPEND-VIEWS: this month against last month and the average, and spending by card

The owner's Full Agent Capability List, section 1 "Spending", items 12 ("Compare this month to last month and to the
user's own average. [Read]", registry TXN-021, ANL-009) and 13 ("Show spending by card, so the user knows which card
carries what. [Read]", CARD-001, ANL-001). Both were "module only": `57-agent-ledger.js` has `monthOverMonth` and
`categoryTrends` (TXN-021, ANL-009) and `cards` (CARD-001), but over the ledger's own row shape and category rules (a
different merchant list than the chat's spending answer, whole calendar months with no "same days" cut, no time zone, no
pending, currency or uncategorized lines, and `cards` is a card inventory with no spending per card). So the chat answers
are built on the money answers' rules instead (`80-money-answers.js`: the same categories, merchant list, `isSpend` and
source line), so "food" means the same thing in "how much did I spend on food", a food budget and this comparison.
Read-only, numbers only: no advice, nothing moved.

What a person can say, all in chat (through `agent-chat/_shared/money_answers.ts`, `moneyKind` and `moneyReply`):

- "how does this month compare to last month", "am I spending more than usual", "this month vs last month", "how's my
  spending compared to normal", "did I spend more on food this month than last", "am I spending more this month": this
  month so far in their own time zone against the same days of last month (said as "day 12 vs day 12"; on the 29th-31st
  against a shorter month, "day 31 vs day 28, February's last day"), and against the average of the last 3 full months on
  file, both a whole month and by the same day (how many months were on file is said; with under one full month on file
  there is no average, and with no rows from last month there is no comparison, never an invented $0.00). Then the 3
  categories that moved most in dollars against the same days last month (by place inside a single category or a
  merchant). A category in the ask ("on food", "on eating out") narrows all of it, the category's own average included.
- "spending by card", "which card do I use most", "how much did I put on my amex this month", "what's on my chase card",
  "spending by card last month", "spending by account this year": each linked account or card for the period asked (this
  month by default), named as stored (a run of 5 or more digits in a name is never shown; the last 4 only when the row
  carries a mask), its total, its share of the whole and its top 3 places; a card named the person's way ("amex" for
  American Express) narrows to it, and one not linked is named back with the list. Cards with nothing posted are named.
- The rules, both answers: posted rows in US dollars; transfers and card payments left out (so a card paid from checking
  is never counted twice); a refund (a credit from a known merchant, or one that says refund or return) taken off and
  said; pending charges and other currencies said, never added; spending no category matches said apart, never guessed
  into one. A bank row dated the day after the person's today is this evening's (bank dates are UTC) and counts today.
  Every reply ends with "From your linked accounts, transactions through <date>, as of <time>". Nothing linked: the
  handler's one-line NO_ACCOUNTS answer.

Where: `packages/domain/94-spending-views.js` (in the router bundle), routed in
`supabase/functions/agent-chat/_shared/money_answers.ts` ahead of the plain spending answer.

Not built (for the owner): a mask or last 4 on live replies (the `agent_financial_accounts` table has no mask column,
so live replies show names only; adding one is a migration and a SimpleFIN mapping, the owner's step); comparing two
named past months ("September vs August" goes on to the planner); a 6- or 12-month average or year to date against last
year; income in the comparison (spending only); spending per authorized user or physical card on one account. A row
dated the 1st that the bank posted the evening before (UTC) counts in the new month; the rows carry no time of day.

Check: `node --test tests/depth-SPEND-VIEWS.test.cjs && node evals/depth/run.cjs SPEND-VIEWS`; exact strings
`node --test tests/spending-views.test.cjs`; chat `deno test tests/edge/spending-views.test.ts`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Comparison asks are recognized | "am I spending more than usual" and six more are a comparison | `S01` in tests/depth-SPEND-VIEWS.test.cjs | comparison asks are never recognized | proven |
| S02 | Near misses go on | "more than the average american" and "how did last month compare" are not answered | `S02` in tests/depth-SPEND-VIEWS.test.cjs | other people's averages and last month as the subject are answered as this month | proven |
| S03 | The person's month | 11:30 p.m. Oct 12 in New York is day 12 | `S03` in tests/depth-SPEND-VIEWS.test.cjs | today is read in UTC | proven (also fails S04, S05, S06, S07, S08, S10, S11, S12, S13, S14, S15) |
| S04 | Tomorrow's UTC date is this evening | a Starbucks row dated Oct 13 counts on Oct 12 in New York | `S04` in tests/depth-SPEND-VIEWS.test.cjs | a row dated tomorrow is left out | proven (also fails S03, S06, S07, S08, S10, S11, S12, S13, S14, S15, S16) |
| S05 | Last month's own last day | Mar 31 against Feb 1-28, said as day 31 vs day 28 | `S05` in tests/depth-SPEND-VIEWS.test.cjs | last month is cut at the same day number even past its end | proven |
| S06 | The first day of a month | Oct 1 against Sep 1, said as single days | `S06` in tests/depth-SPEND-VIEWS.test.cjs | a one-day range is said as "Oct 1-1" | proven |
| S07 | The average by the same day | $200.33 by day 12 over Jul-Sep | `S07` in tests/depth-SPEND-VIEWS.test.cjs | the by-day average uses whole months | proven (also fails S08, S15) |
| S08 | Only full months on file | history from Aug 2 averages September alone; from Sep 5, no average | `S08` in tests/depth-SPEND-VIEWS.test.cjs | months the history does not cover are averaged as $0.00 | proven |
| S09 | No invented last month | history from Oct 5 says there is nothing to compare with | `S09` in tests/depth-SPEND-VIEWS.test.cjs | a month before the history is compared as $0.00 | proven |
| S10 | Refunds taken off | a $20.00 Kroger refund makes $432.99, not $452.99 | `S10` in tests/depth-SPEND-VIEWS.test.cjs | refunds are ignored | proven (also fails S03, S04, S07, S08, S11, S12, S13, S14, S15, S17, S18, S19, S21) |
| S11 | Transfers and card payments never count | the $500.00 transfer and the $300.00 card payment stay out | `S11` in tests/depth-SPEND-VIEWS.test.cjs | every debit counts as spending | proven (also fails S03, S04, S07, S08, S10, S12, S13, S14, S17, S18, S19, S21) |
| S12 | Pending said, not added | a dated $28.50 pending DoorDash stays out of $432.99 | `S12` in tests/depth-SPEND-VIEWS.test.cjs | pending charges are added | proven (also fails S03, S04, S07, S08, S10, S11, S13, S14, S15, S17, S18, S19, S21) |
| S13 | Other currencies never added | a 30.00 EUR charge stays out of $432.99 | `S13` in tests/depth-SPEND-VIEWS.test.cjs | a EUR charge is added as dollars | proven (also fails S03, S04, S07, S08, S10, S11, S12, S14, S15, S16, S17, S18, S19, S21) |
| S14 | Uncategorized said apart | $230.00 of hardware is said apart, never a change | `S14` in tests/depth-SPEND-VIEWS.test.cjs | uncategorized spending is listed as a category change | proven |
| S15 | A named category narrows it | food: $347.00 and its own $203.33 average | `S15` in tests/depth-SPEND-VIEWS.test.cjs | the category in the ask is ignored | proven |
| S16 | The three biggest changes | groceries, restaurants, gas; a $5.00 transport change is fourth | `S16` in tests/depth-SPEND-VIEWS.test.cjs | only two changes are shown | proven (also fails S14) |
| S17 | Top 3 places per card | Chipotle, Netflix, Starbucks on the Freedom Flex | `S17` in tests/depth-SPEND-VIEWS.test.cjs | only two places are shown per card | proven |
| S18 | Never a full number | a 16-digit number stored in the name is never shown (Visa Signature) | `S18` in tests/depth-SPEND-VIEWS.test.cjs | a card number stored in the name is shown | proven |
| S19 | A card named the person's way | "my amex" finds American Express Gold Card | `S19` in tests/depth-SPEND-VIEWS.test.cjs | issuer nicknames are not matched | proven |
| S20 | The period asked | "spending by card last month" is Sep 1-30 | `S20` in tests/depth-SPEND-VIEWS.test.cjs | every ask is answered for this month | proven |
| S21 | Which card carries the most | the Gold Card, $290.00 of $432.99, 67% | `S21` in tests/depth-SPEND-VIEWS.test.cjs | the most-used card is not named | proven |
| S22 | Card asks only | "what's on my credit report" is not a card ask | `S22` in tests/depth-SPEND-VIEWS.test.cjs | a credit report, a statement or a payment is answered as card spending | proven |
| S23 | Source and as-of | the last line names linked accounts, the through date and the as-of time | `S23` in tests/depth-SPEND-VIEWS.test.cjs | the source line is dropped from the comparison | proven |
| S24 | Every card shown | Citi Double Cash: nothing posted, said | `S24` in tests/depth-SPEND-VIEWS.test.cjs | a card with no spending disappears | proven |
<!-- results:end -->
