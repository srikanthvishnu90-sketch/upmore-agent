# YEAR: the year in money

The owner's Full Agent Capability List, section 2 "Reports", item 26 ("Year in money: annual review, including confirmed
dollars Upmore saved or recovered. [Read]", registry ANL-012, SAVE-007, EARN-004). It was "module only":
`57-agent-ledger.js` has `annualReport` (ANL-012), but over the ledger's own row shape and category rules, whole calendar
years with no time zone, no coverage, pending, currency or refund lines, and nothing reached it from the chat. The chat
answer is built on the money answers' rules instead (`80-money-answers.js`: the same categories, merchant list,
`isSpend` and source line, and the person's category rules), in `packages/domain/96-year-in-money.js`. Read-only,
numbers only: no advice, nothing moved.

What a person can say, in chat (through `agent-chat/_shared/money_answers.ts`, `moneyKind` and `moneyReply`):

- "my year in money", "year in review", "how did my year go financially", "how did 2026 go", "annual review", "show me
  my year", "how's my year going", "my 2025 year in review", "year-end recap", "recap my 2025", "how did last year go
  financially": this calendar year so far in their own time zone, or the year they name (a past year is read from its
  Jan 1, further back than the chat's usual 400-day read).
- What it says, every number from their own rows: money in and money out and the net; spending by category (their own
  category rules included, and what a rule moved said with its amount), spending no category matches said apart; the top
  5 places; the biggest month and the quietest full month; what repeating bills and subscriptions (found in the rows by
  `AgentLedger.recurring`, the same kinds "what bills are coming up" counts) charged in the year; refunds taken off what
  went out (never counted as money in) and said; pending charges and other currencies said, never added; then the
  source and as-of line.
- Coverage: rows that start after Jan 1 are said ("Your linked transactions start Mar 4, 2026, so this covers only from
  then"), a past year the rows end inside is said, a year the rows do not reach is never a $0.00 year, and only a month
  the rows cover from its 1st to its last day can be the quietest. A read cut at the chat's 5,000-row cap says the rows
  it read start there, not the history.
- Confirmed dollars Upmore saved or recovered: said only from a confirmed record, and none exists that the chat can read
  today. Recovery cases carry no recovered amount (`agent_recovery_case_json` returns `recovered_cents: null`,
  `"unavailable_user_report_only"`), the save engine's ledger (`49-agent-save.js`) books verified deltas in memory only,
  and `action_ledger` rows (the cancel watcher's "Avoided" entries) can be written by the app's own client, so they
  prove nothing. So the review says "no confirmed savings are on record yet, so none is counted here" and estimates
  nothing.

Near misses that go on: "how much did I spend this year" and "last year" (the spending answer), advice ("how can I do
better next year"), taxes, a portfolio or the market, "how did this year go" with no money word (small talk), a
performance review at work.

Not built: a yearly message the agent sends on its own (no scheduler entry), EARN-004 referral payouts and SAVE-007
negotiated-bill savings in the review (no confirmed record exists to read), income by source, a comparison with the
year before, and net worth over the year (no balance history is read). The rows carry no time of day, so a Jan 1 row
the bank posted the evening before (UTC) counts in the new year when the year is named.

Check: `node --test tests/depth-YEAR.test.cjs && node evals/depth/run.cjs YEAR`; exact strings
`node --test tests/year-in-money.test.cjs`; chat `deno test tests/edge/year-in-money.test.ts`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Year asks are recognized | "my year in money", "how did 2026 go", "annual review" and six more are the year's | `S01` in tests/depth-YEAR.test.cjs | no year ask is ever recognized | proven (also fails S03, S04, S08, S09, S10, S25) |
| S02 | Near misses go on | "how did this year go" with no money word, advice, taxes, a portfolio and the market are not answered | `S02` in tests/depth-YEAR.test.cjs | "how did this year go" small talk is answered as a year review | proven |
| S03 | A named year | "how did 2025 go" is 2025 | `S03` in tests/depth-YEAR.test.cjs | a year in the words is ignored | proven (also fails S08, S09, S10, S25) |
| S04 | Last year | "how did last year go financially" is 2025 | `S04` in tests/depth-YEAR.test.cjs | last year is read as this year | proven |
| S05 | The person's year | 11 p.m. Dec 31 in New York is still 2026 | `S05` in tests/depth-YEAR.test.cjs | the year is read in UTC | proven (also fails S06, S07, S08, S22, S25, S26) |
| S06 | Tomorrow's UTC date is this evening | the coffee the bank dated Jan 1 counts in 2026: $82.00 out | `S06` in tests/depth-YEAR.test.cjs | a row dated tomorrow is left out | proven (also fails S07, S11, S13, S14, S15, S16) |
| S07 | A mid-year start is said | rows from Mar 4 say "this covers only from then" | `S07` in tests/depth-YEAR.test.cjs | the months before the rows read as empty | proven |
| S08 | No invented year | 2025 before the rows start is said, never $0.00 | `S08` in tests/depth-YEAR.test.cjs | a year the rows don't reach is reviewed as nothing | proven |
| S09 | A past year's end is said | rows that stop Jun 20, 2024 say so | `S09` in tests/depth-YEAR.test.cjs | the months after the rows stop read as empty | proven |
| S10 | Quietest is a full month | April $30.00, not June's cut-off $20.00 | `S10` in tests/depth-YEAR.test.cjs | a month the rows cover only partly can be the quietest | proven |
| S11 | Transfers and card payments stay out | a $700.00 transfer and a $400.00 card payment leave $13,243.92 | `S11` in tests/depth-YEAR.test.cjs | every debit counts as money out | proven (also fails S07, S10, S13, S14, S15, S16, S17, S19) |
| S12 | A refund is not money in | $24,000.00 in, the $20.00 Kroger refund not among it | `S12` in tests/depth-YEAR.test.cjs | refunds are counted as money in | proven (also fails S07) |
| S13 | A refund comes off what went out | $13,243.92 out after the $20.00 refund, said | `S13` in tests/depth-YEAR.test.cjs | refunds are ignored | proven (also fails S07, S11, S14, S15) |
| S14 | Pending said, not added | a dated $28.50 pending DoorDash stays out of $13,243.92 | `S14` in tests/depth-YEAR.test.cjs | pending charges are added | proven (also fails S07, S11, S13, S15, S16) |
| S15 | Other currencies never added | a 30.00 EUR charge stays out of $13,243.92 | `S15` in tests/depth-YEAR.test.cjs | a EUR charge is added as dollars | proven (also fails S07, S11, S13, S14, S16) |
| S16 | The person's category rules | Target counted as groceries: $520.00 | `S16` in tests/depth-YEAR.test.cjs | the person's rules are ignored in the categories | proven |
| S17 | Uncategorized said apart | $12,539.00 matched no category, said | `S17` in tests/depth-YEAR.test.cjs | spending outside every category disappears | proven (also fails S16) |
| S18 | Top 5 places | rent, Delta, Kroger, Netflix, Target | `S18` in tests/depth-YEAR.test.cjs | only four places are shown | proven |
| S19 | The biggest month | May, $2,004.99 | `S19` in tests/depth-YEAR.test.cjs | the smallest month is called the biggest | proven (also fails S10) |
| S20 | Repeating bills only | rent and Netflix, $12,127.92; weekly Trader Joe's is not a bill | `S20` in tests/depth-YEAR.test.cjs | weekly groceries are counted as a repeating bill | proven |
| S21 | Confirmed savings only | no confirmed record, so none counted and no dollar figure | `S21` in tests/depth-YEAR.test.cjs | refunds are passed off as money Upmore saved | proven |
| S22 | Source and as-of | the last line names linked accounts, the through date and the as-of time | `S22` in tests/depth-YEAR.test.cjs | the source line is dropped | proven |
| S23 | A rule's move is said | "Target" as groceries $90.00 | `S23` in tests/depth-YEAR.test.cjs | what the person's rule moved is not said | proven |
| S24 | Nothing linked yet | no rows: said plainly | `S24` in tests/depth-YEAR.test.cjs | no rows is reviewed as a year | proven |
| S25 | A year not here yet | "how did 2027 go" in 2026 is said, not reviewed | `S25` in tests/depth-YEAR.test.cjs | a future year is reviewed | proven |
| S26 | Pay is not a refund | a Target payroll deposit is $1,500.00 in | `S26` in tests/depth-YEAR.test.cjs | pay from a store is taken off spending as a refund | proven |
<!-- results:end -->
