# MONEY-ANSWERS: see-everything numbers in chat (capability list section 1; S16-01, S16-02, S16-14, S16-16; packet added for G4)

Balance, spending, "how am I doing" and "did it go through", answered from the person's own account and transaction
rows (packages/domain/80-money-answers.js), never from the model. Every answer ends with its source and as-of time;
cash is checking and savings, cards owed are said apart; the oldest balance time is named and a day-old balance is
said; a period before the linked data starts is said, never $0.00; transfers, card payments, pending charges and other
currencies are never added into dollars; the person's time zone picks the day.
Check: `node --test tests/depth-MONEY-ANSWERS.test.cjs && node evals/depth/run.cjs MONEY-ANSWERS`.

Found building this packet (S16, fixed red-first): with history starting Oct 10, "how am I doing" said "This month so
far (Oct 1-12): $0.00 in, $70.00 out." as if Oct 1-9 were known. It now adds "Your linked transactions start Oct 10,
2026, so this covers only from then.", the same rule spend already followed (regression test in
tests/money-answers.test.cjs).

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Cash apart from cards | $6,234.56 cash with a $512.30 card owed | `S01` in tests/depth-MONEY-ANSWERS.test.cjs | a credit card counts as cash | proven |
| S02 | The oldest as-of | 7:30 AM is named, never 9:00 AM | `S02` in tests/depth-MONEY-ANSWERS.test.cjs | the newest balance time is named | proven (also fails S01) |
| S03 | A stale balance is said | 3 days old gets the heads-up | `S03` in tests/depth-MONEY-ANSWERS.test.cjs | a balance is stale only after a week | proven |
| S04 | No type is not cash | an unknown-type account is listed apart | `S04` in tests/depth-MONEY-ANSWERS.test.cjs | an account with no type set is treated as checking | proven |
| S05 | The last N days | the last 30 days start Sep 13 | `S05` in tests/depth-MONEY-ANSWERS.test.cjs | the window is N+1 days | proven |
| S06 | The person's time zone | 11 PM in Los Angeles on Sep 30 is September | `S06` in tests/depth-MONEY-ANSWERS.test.cjs | today is always UTC's today | proven |
| S07 | A later named month is last year's | November asked in October is Nov 2025 | `S07` in tests/depth-MONEY-ANSWERS.test.cjs | a named month is always this year's | proven |
| S08 | No guessing into a category | an unknown market is not food | `S08` in tests/depth-MONEY-ANSWERS.test.cjs | an unknown merchant counts toward every category | proven |
| S09 | Transfers and card payments out | a card payment and an autopay are not spending | `S09` in tests/depth-MONEY-ANSWERS.test.cjs | only the transfer flag is checked, not the descriptor | proven |
| S10 | Pending out of totals | a pending Kroger charge is not added | `S10` in tests/depth-MONEY-ANSWERS.test.cjs | pending rows are added | proven |
| S11 | Other currencies out | a euro charge is not added into dollars | `S11` in tests/depth-MONEY-ANSWERS.test.cjs | every currency is added as dollars | proven |
| S12 | Before the data, never $0.00 | August before a September start is said | `S12` in tests/depth-MONEY-ANSWERS.test.cjs | a period before the data is added up as $0.00 | proven |
| S13 | No comparison without the prior period | data from Oct 3 is not compared with September | `S13` in tests/depth-MONEY-ANSWERS.test.cjs | a prior period with no rows is compared as $0.00 | proven |
| S14 | Income is not a transfer | $800 from savings is not money in | `S14` in tests/depth-MONEY-ANSWERS.test.cjs | incoming transfers count as income | proven |
| S15 | Did it go through, this month | a Sep 1 rent is not this month's on Oct 12 | `S15` in tests/depth-MONEY-ANSWERS.test.cjs | anything in the last two months counts as gone through | proven |
| S16 | A partial month is said in the checkup | data from Oct 10 says this covers only from then | `S16` in tests/depth-MONEY-ANSWERS.test.cjs | the checkup's start-date caveat is dropped (the bug found building this packet) | proven |
| S17 | A refund follow-up finds the credit | the $20.00 Target credit is found | `S17` in tests/depth-MONEY-ANSWERS.test.cjs | refund words are read as part of the merchant name again (the bug found overnight) | proven |
| S18 | No leftover dashes | ACME INC 800-555-0100 is Acme Inc | `S18` in tests/depth-MONEY-ANSWERS.test.cjs | stray punctuation stays, so the name reads 'Acme Inc - -' | proven |
<!-- results:end -->
