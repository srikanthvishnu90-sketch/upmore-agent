# INVEST: investing without recommending, the arithmetic (packet added for G4)

`packages/domain/50-agent-invest.js` (`AgentInvest`, Instinct spec doc 09) is pure arithmetic over the person's own
holdings: value to the cent across accounts, each holding's share in basis points, an unrealized gain only when every
cost is on file, concentration and allocation as facts with their source and as-of, drift from the target the person
set with the trade list as math (never an instruction), screens that run only the person's criteria, tax-lot math
(harvest candidates, the 30-day wash-sale window, short vs long term by the calendar, realized gains with a partial
sale's share of cost), contribution room against limits the caller supplies, the order restatement the loop confirms
before any rail fires, the portfolio read, the person's own price alerts on fresh quotes, and the indirect rollover's
60-day clock. Nothing here is advice: no function returns a buy, sell or hold. The module is in the router bundle
(`scripts/build-router-core.py`); `AgentTrade` (`66-agent-trade.js`) requires it loaded. Every trade still runs only in
the person's own live account behind a fresh approval and the $5 per-order cap, which this module does not touch.
Check: `node --test tests/depth-INVEST.test.cjs && node evals/depth/run.cjs INVEST`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S16 (found here): the restatement read any side other than exactly "buy" as a sell: `{side: "BUY"}` was restated
  "Sell 2 VTI market in mock-fidelity ... Confirm?", and "short" or "cover" became a sell too. The side is now read as
  written ("BUY" and " Sell" work) and anything but buy or sell is refused. D18 plants the guess.
- S17 (found here): a quote with a price but no source or as-of gave "about $600.00 at $300.00 (undefined, as of
  undefined)". An estimate is a money statement, so it now needs a cited quote; without one the restatement says
  "price at execution". D19 plants the old condition.
- S18 (found here): a limit price with no type was restated "Buy 2.5 VTI market at $299.50": a market order that reads
  like it has a limit. A limit price now makes it a limit order, and a market order with a limit price is refused.
  D20 plants the market default.
- S13 (found here): long vs short term counted more than 365 days, so a lot bought Jan 15, 2024 and sold Jan 15, 2025
  (366 days across Feb 29) was "long" for realized gains and harvest math. The IRS rule is held more than one year by
  the calendar: it is short; Jan 16 is long. D14 plants the day count.
- S03 (found here): VTI held in two accounts, one without cost basis (common for a transferred-in position), showed an
  unrealized gain of $1,250.00: $3,750.00 of value against only Fidelity's $2,500.00 of cost. One holding without cost
  now makes the gain unknown. D03 plants the partial netting.
- S04 and S25 (found here): percents were formatted with `toFixed` on a binary fraction, so 10.35 percent was said
  "10.3" (10.25 was "10.3" and 10.15 "10.2"). They are now rounded half up in whole basis points ("10.4"). D04.
- S05 (found here): the concentration statement had dollar amounts and no source or as-of ("AAA is 10.3 percent of your
  invested assets ($1,035.00 of $10,000.00)."), which the advice guard's own grounding rule refuses. It now ends ", per
  Mock Brokerage, as of 2026-10-12T14:00:00Z." and, across accounts read at different times, cites the older read.
  D05, D06.
- S15 (found here): a contribution over the limit read only "$0.00 of room left this year ($7,500.00 of $7,000.00
  contributed)."; it now adds "That is $500.00 over the limit." (`excess_cents`). D16.
- S21 (found here): an account with no as-of time was read like a current one ("mock-manual $1,000.00 per manual"); it
  now says ", as-of time unknown". D23.
- S23 (found here): a quote with no as-of fired an alert ("X is $1.50, above your $1.00 line (Q, undefined).") though
  the module says a stale quote never fires. It no longer fires ("quote has no as-of time"). D25.
- S26 (found here): the rollover clock was printed as a raw number: "within -12 days" after the deadline and "within 1
  days" on the last day but one; a rollover with no stage threw. It now says "within 1 day", "today, the last day of
  the 60-day window", "the deadline ... was 12 days ago", and "stage unknown. Next: tell me the stage." D28, D29.

Noted, not changed (for the owner): `grounded()` gives every analytics result the newest account's as-of, though a
total is only as current as its oldest read (the statements now cite the oldest); price-alert text cites
"(Mock Quotes, 2026-10-12T14:30:00Z)" without the words "per"/"as of" that the advice guard's grounding regex looks for;
`harvest()` takes prices with no source or as-of, so its statement cannot cite one; the portfolio read prints a UTC
time without saying UTC and defaults a missing source to "manual"; a rollover's clock runs from the date the funds were
sent, which is earlier (so stricter) than the IRS's date of receipt.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Value to the cent | 0.5 x $123.45 is $61.73 | `S01` in tests/depth-INVEST.test.cjs | a fractional share's value is floored, so $61.725 is $61.72 | proven |
| S02 | Shares in basis points, rounded | two thirds is 6667 | `S02` in tests/depth-INVEST.test.cjs | shares are floored | proven |
| S03 | No gain without every cost | VTI without Schwab's cost basis has no gain | `S03` in tests/depth-INVEST.test.cjs | the costs on file are netted against the whole value (the bug found building this packet) | proven |
| S04 | Half-up percent | 1035 bps is 10.4 percent | `S04` in tests/depth-INVEST.test.cjs | the percent is formatted with toFixed on a binary fraction, so 10.35 is 10.3 (the bug found building this packet) | proven (also fails S05, S25) |
| S05 | The statement cites its source | AAA's share says per Mock Brokerage, as of | `S05` in tests/depth-INVEST.test.cjs | the statement drops its source and as-of (the bug found building this packet) | proven |
| S05 | As of the older read | Fidelity and Schwab, as of Schwab's Oct 10 read | `S05` in tests/depth-INVEST.test.cjs | the newest account's time is given for the whole | proven |
| S06 | The line is inclusive | exactly 10.0 percent is flagged | `S06` in tests/depth-INVEST.test.cjs | the line is exclusive | proven |
| S07 | By asset class by default | equity, bond, unknown | `S07` in tests/depth-INVEST.test.cjs | with no grouping named, every holding falls in one undefined bucket | proven |
| S08 | The way back, not the way out | equity sells $630.00, bond buys $630.00 | `S08` in tests/depth-INVEST.test.cjs | the trade sign is flipped | proven (also fails S09) |
| S09 | Holdings outside the target count | bond with no target shows as a $1,450.00 sell | `S09` in tests/depth-INVEST.test.cjs | buckets outside the target are left out | proven |
| S10 | Inclusive screen bounds | pe <= 15 includes 15 | `S10` in tests/depth-INVEST.test.cjs | lte is read as less than | proven |
| S11 | Wash sales are out of the total | $350.00 is harvestable, not $2,150.00 | `S11` in tests/depth-INVEST.test.cjs | wash-sale-blocked losses are counted | proven |
| S12 | 30 days, inclusive | a buy 30 days after washes the sale | `S12` in tests/depth-INVEST.test.cjs | day 30 is outside the window | proven |
| S13 | Long term by the calendar | Jan 15, 2024 to Jan 15, 2025 is short | `S13` in tests/depth-INVEST.test.cjs | more than 365 days is long term, so a year with Feb 29 is long (the bug found building this packet) | proven |
| S14 | A partial sale's share of cost | 4 of 10 shares carry $800.00 | `S14` in tests/depth-INVEST.test.cjs | the whole lot's cost is the basis | proven |
| S15 | Over the limit is said | "That is $500.00 over the limit." | `S15` in tests/depth-INVEST.test.cjs | an over-contribution is shown only as $0.00 of room (the bug found building this packet) | proven |
| S15 | Room never below zero | $0.00 of room, not -$500.00 | `S15` in tests/depth-INVEST.test.cjs | room is not floored at zero | proven |
| S16 | Buy or sell, never guessed | "short" is refused, not restated as a sell | `S16` in tests/depth-INVEST.test.cjs | any side other than buy is a sell (the bug found building this packet: "BUY" was a sell) | proven |
| S17 | An estimate cites its quote | a quote with no source gives no estimate | `S17` in tests/depth-INVEST.test.cjs | any quote with a price gives an estimate, "(undefined, as of undefined)" (the bug found building this packet) | proven |
| S18 | A limit price is a limit order | "limit at $299.50", not "market at $299.50" | `S18` in tests/depth-INVEST.test.cjs | the type defaults to market whatever the price (the bug found building this packet) | proven |
| S19 | A positive quantity | -1 shares is refused | `S19` in tests/depth-INVEST.test.cjs | only a missing or zero quantity is refused | proven |
| S20 | Older than a day is named | Schwab's Oct 10 read is named | `S20` in tests/depth-INVEST.test.cjs | an account is stale only after a week | proven |
| S21 | No as-of is said | "as-of time unknown" | `S21` in tests/depth-INVEST.test.cjs | an account with no as-of reads like a current one (the bug found building this packet) | proven |
| S22 | At the line fires | $190.00 at a $190.00 line fires | `S22` in tests/depth-INVEST.test.cjs | the line is exclusive | proven |
| S23 | No as-of, no alert | a quote with no time never fires | `S23` in tests/depth-INVEST.test.cjs | a quote with no as-of is treated as fresh (the bug found building this packet) | proven |
| S24 | A day, not two | a quote 24 hours and a second old is stale | `S24` in tests/depth-INVEST.test.cjs | quotes are fresh for two days | proven |
| S25 | A drop is a move | a 10.35 percent drop fires | `S25` in tests/depth-INVEST.test.cjs | only a rise is compared to the line | proven |
| S26 | The clock in words | "within 1 day", "today, the last day", "was 12 days ago" | `S26` in tests/depth-INVEST.test.cjs | the clock is printed as a number of days whatever it is: "within -12 days", "within 1 days" (the bug found building this packet) | proven |
| S26 | No stage, no crash | a rollover with no stage asks for it | `S26` in tests/depth-INVEST.test.cjs | the stage is read without a default (the crash found building this packet) | proven |
<!-- results:end -->
