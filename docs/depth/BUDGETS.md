# BUDGETS: category budgets in chat (overnight H1)

Teardown 2's build order step 4 ("Budget, left-to-spend number and tracking-only goals"): the category budgets Origin
(Budgeting), Monarch (Budgeting), Rocket Money (Budgets and habits), Copilot Money (Categories and budgets) and YNAB
(Categories and category groups) have. The owner's capability list has no budget item, so no item rises with this.
Tracking only: a budget never moves money, never blocks a payment, never decides anything; numbers only, no advice.

What a person can say, all in chat:

- Set: "set a $400 grocery budget", "budget $250 a month for eating out", "my dining budget is 300". The reply restates
  the category, the amount per calendar month in their time zone, what counts (posted, transfers out, refunds taken
  off, pending and other currencies said and not added, uncategorized shown apart) and how to stop it. One budget per
  category; setting it again replaces it and says the old amount. Monthly only: a weekly, daily or yearly ask sets
  nothing; zero, negative or over $100,000.00 sets nothing; a category it doesn't track is named back with the list.
- Ask: "how am i doing on my grocery budget", "how are my budgets", "am i over budget", "what's left in my dining
  budget": spent this month so far, left (or over), the day of the month and the pace against an even spread, the top 3
  places, refunds, pending and other-currency charges said, uncategorized spending as its own total, and the source
  and as-of line.
- The agent speaks first: once at 80% and once at 100% of each budget per month (log key
  `budget:<id>:<YYYY-MM>:<80|100>`), as a watch the person set (outside the daily budget, once only, no 80% after the
  100%).
- Stop: "stop my grocery budget", "delete my budgets".

Where: `packages/domain/93-budgets.js` (categories and spending rules shared with `80-money-answers.js`), the status
answer `supabase/functions/agent-chat/_shared/budget_answer.ts` (direct-answer chain, first in the try block), set and
stop in `supabase/functions/_shared/proactive.ts` `parseCommand` (stored as a watch of kind `category_budget` in
`agent_proactive_settings.watches`, no migration), alerts in `plan()`.

Not built (for the owner): rollovers, an envelope or zero-based method (assigning every dollar, moving money between
categories), budgets by week or year, custom categories or groups, income-based "left to budget", household or shared
budgets, budgets for categories the merchant list doesn't know (utilities, rent, health, travel), and per-merchant
budgets. A row dated the 1st that the bank posted the evening before (UTC) counts in the new month too; the rows carry no
time of day to tell.

Check: `node --test tests/depth-BUDGETS.test.cjs && node evals/depth/run.cjs BUDGETS`; edge
`deno test tests/edge/budgets-answer.test.ts tests/edge/budgets-proactive.test.ts`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | The person's amount, to the cent | $1,200.50 is 120050 cents; $400 and 400 are the same | `S01` in tests/depth-BUDGETS.test.cjs | a comma in the amount cuts it short ($1,200.50 read as $1) | proven (also fails S05) |
| S02 | The set reply restates what counts | the exact four-line reply, pending and other currencies said | `S02` in tests/depth-BUDGETS.test.cjs | the reply no longer says pending and foreign charges aren't added | proven |
| S03 | One budget per category | setting groceries again replaces the $400 one | `S03` in tests/depth-BUDGETS.test.cjs | a second groceries budget is added beside the first | proven |
| S04 | Monthly only | a weekly budget sets nothing | `S04` in tests/depth-BUDGETS.test.cjs | a weekly amount is saved as a monthly budget | proven |
| S05 | An amount above zero | a $0 budget is refused | `S05` in tests/depth-BUDGETS.test.cjs | a zero budget is saved | proven |
| S06 | No invented category | "grocry" sets nothing and lists the categories | `S06` in tests/depth-BUDGETS.test.cjs | an unknown category is guessed as food | proven |
| S07 | Stop the one named | stop my gas budget changes nothing | `S07` in tests/depth-BUDGETS.test.cjs | stop removes whichever budget comes first | proven |
| S08 | Status, not advice | 'how much should my grocery budget be' is not a status ask | `S08` in tests/depth-BUDGETS.test.cjs | advice and how-to questions are answered as status | proven |
| S09 | Transfers never count | a Venmo-flagged Whole Foods transfer leaves $212.43 | `S09` in tests/depth-BUDGETS.test.cjs | a transfer back from a roommate is taken off as a refund | proven |
| S10 | Refunds taken off | a $25.00 Kroger refund makes $187.43 | `S10` in tests/depth-BUDGETS.test.cjs | refunds are ignored | proven |
| S11 | Other currencies never added | a 30.00 EUR charge is said, not added | `S11` in tests/depth-BUDGETS.test.cjs | a EUR charge is added as dollars | proven |
| S12 | The person's month | 11 p.m. Oct 31 in New York is October | `S12` in tests/depth-BUDGETS.test.cjs | the month is read in UTC | proven (also fails S13) |
| S13 | Tomorrow's UTC date is this evening | a row dated Nov 1 at 9 p.m. Oct 31 counts in October | `S13` in tests/depth-BUDGETS.test.cjs | a row dated tomorrow is left out | proven |
| S14 | Day of the month and the pace | Feb 29, 2028 is day 29 of 29: $290.00 even pace | `S14` in tests/depth-BUDGETS.test.cjs | every month is taken as 30 days | proven (also fails S21) |
| S15 | Top 3 places | Kroger, Trader Joe's, Whole Foods | `S15` in tests/depth-BUDGETS.test.cjs | only two places are shown | proven (also fails S21) |
| S16 | Uncategorized said apart | $212.00 matched no category | `S16` in tests/depth-BUDGETS.test.cjs | every charge is counted as uncategorized | proven |
| S17 | Source and as-of | the last line names linked accounts, through date and as-of time | `S17` in tests/depth-BUDGETS.test.cjs | the source line is dropped | proven |
| S18 | 80% exactly at the line | $80.00 of $100.00 fires the 80% alert | `S18` in tests/depth-BUDGETS.test.cjs | the 80% alert waits for more than 80% | proven |
| S19 | Once per month, no 80% after 100% | a refund under 100% brings no 80% alert | `S19` in tests/depth-BUDGETS.test.cjs | the 80% alert follows the 100% one | proven |
| S20 | Storable: no long digit runs | the stored budget has no 9-digit run | `S20` in tests/depth-BUDGETS.test.cjs | the id carries the raw millisecond time | proven (also fails S02) |
| S21 | Over means over | exactly at the budget is not over | `S21` in tests/depth-BUDGETS.test.cjs | a budget spent exactly is called over | proven |
<!-- results:end -->
