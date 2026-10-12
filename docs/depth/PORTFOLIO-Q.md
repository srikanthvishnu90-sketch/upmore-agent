# PORTFOLIO-Q: portfolio questions, quotes and order status in the trade flow (megadoc G01, G03, G06, G09, E16, E18)

`packages/domain/66-agent-trade.js` answers "what do I own", "what's my biggest (or smallest) position", "what's my order
status" and "did my buy fill?" from the broker's own reads, with no model call and nothing placed. The portfolio lists
every position with its value, buying power, the source (said once when the account's name already carries it) and the
as-of time. The biggest or smallest position is ranked by the read's own market values with its share of the positions'
value; a single position is said as the only one; a holding the read gives no value for is named and nothing is ranked.
Order status reads the latest order this chat placed, or the one named by its ticker, back from the broker now: filled
(price, total, fill time), partly filled, working or queued (with how to cancel), canceled, rejected (the broker's
reason), replaced; a failed read says the last status read; none placed says so and points to the brokerage app.
"What's NVDA trading at" (G09) gives the broker's own quote with its source and time, said as what a buy pays; a ticker
is read only with stock words ("trading at", "stock", "a share") or in capitals ("price of gas" is not GAS); an unknown
ticker, no quote, or an asset record without a symbol is said, never a number. "How much did I make on NVDA" (G03)
gives the held shares' gain from the broker's average entry price against their value now, up or down to the cent and in
percent, said as unrealized (shares sold earlier and dividends aren't in the read); not held or no basis is said; a month
or a common word ("in August", "on my house") is never a ticker.

Where it runs: the trade flow through the router (`69-agent-router.js`: the gate, the question rule and the order words
let these questions reach it). Router tests 17 and 18 in `tests/router.test.cjs`.
Check: `node --test tests/depth-PORTFOLIO-Q.test.cjs && node evals/depth/run.cjs PORTFOLIO-Q`.

Found building it: the router's gate kept every one of these questions from the trade flow, which already parsed "what
do I own"; "did my VOO buy go through" went to the card-charge answer; the portfolio line said the account twice; the
first "said once" check was a substring match that dropped a source ("Mock Broker" inside "Mock brokerage") (S01).

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Every position listed | what do I own: three positions with values | `S01` in tests/depth-PORTFOLIO-Q.test.cjs | the list keeps only the first | proven |
| S02 | Source said once | the account name carries the source | `S02` in tests/depth-PORTFOLIO-Q.test.cjs | the source is never dropped | proven |
| S03 | Biggest by value | VOO $1,024.20, 53.8% | `S03` in tests/depth-PORTFOLIO-Q.test.cjs | the first row is called biggest | proven (also fails S04) |
| S04 | Smallest is smallest | F $120.00 | `S04` in tests/depth-PORTFOLIO-Q.test.cjs | smallest sorts like biggest | proven |
| S05 | Only position said | PLTR, your only position | `S05` in tests/depth-PORTFOLIO-Q.test.cjs | a lone position gets a 100% share | proven |
| S06 | Unvalued: no ranking | XYZ has no value | `S06` in tests/depth-PORTFOLIO-Q.test.cjs | unvalued rows are skipped and the rest ranked | proven |
| S07 | None placed is said | no order from this chat | `S07` in tests/depth-PORTFOLIO-Q.test.cjs | the latest of nothing is read | proven |
| S08 | Filled with price and total | bought 0.01 VOO at $500.00, $5.00 total | `S08` in tests/depth-PORTFOLIO-Q.test.cjs | the total is dropped | proven |
| S09 | Working is not filled | working, with how to cancel | `S09` in tests/depth-PORTFOLIO-Q.test.cjs | working is called filled | proven |
| S10 | Partly filled | 0.004 of 0.01 | `S10` in tests/depth-PORTFOLIO-Q.test.cjs | the filled part is said as the whole | proven |
| S11 | Canceled said | nothing filled | `S11` in tests/depth-PORTFOLIO-Q.test.cjs | canceled falls to the generic line | proven |
| S12 | Rejected with its reason | insufficient buying power | `S12` in tests/depth-PORTFOLIO-Q.test.cjs | the reason is dropped | proven |
| S13 | A failed read is said | the last status read | `S13` in tests/depth-PORTFOLIO-Q.test.cjs | the last status is not said | proven |
| S14 | The named ticker | VOO picks ord-1 | `S14` in tests/depth-PORTFOLIO-Q.test.cjs | the ticker is ignored | proven |
| S15 | Nothing placed by a question | writes stay at 1 | `S15` in tests/depth-PORTFOLIO-Q.test.cjs | a status ask goes on to a new order | proven (also fails S07, S08, S09, S10, S11, S12, S13, S14) |
| S16 | Status asks read as status | did my buy fill is status | `S16` in tests/depth-PORTFOLIO-Q.test.cjs | the status words are not read | proven (also fails S07, S08, S09, S10, S11, S12, S13, S14, S15) |
| S17 | The quote with its source | VOO $500.00 (Mock Quotes, 13:59 UTC) | `S17` in tests/depth-PORTFOLIO-Q.test.cjs | the source and time are dropped | proven |
| S18 | No quote is said | no quote for VOO | `S18` in tests/depth-PORTFOLIO-Q.test.cjs | a missing quote reads as $0.00 | proven |
| S19 | Stock words or capitals | price of gas is not GAS | `S19` in tests/depth-PORTFOLIO-Q.test.cjs | any word after 'price of' is a ticker | proven |
| S20 | A symbol-less asset is no instrument | nothing quoted for a record without a symbol | `S20` in tests/depth-PORTFOLIO-Q.test.cjs | the asset record is trusted without a symbol | proven |
| S21 | Cost from shares times average | 2 shares at $450 cost $900 | `S21` in tests/depth-PORTFOLIO-Q.test.cjs | the average is taken as the whole cost | proven (also fails S22) |
| S22 | A loss is down | PLTR down $164.65 | `S22` in tests/depth-PORTFOLIO-Q.test.cjs | every result is said as up | proven |
| S23 | No basis: said | F has no cost basis | `S23` in tests/depth-PORTFOLIO-Q.test.cjs | a missing basis is taken as zero | proven |
| S24 | Never a month | in august is not a ticker | `S24` in tests/depth-PORTFOLIO-Q.test.cjs | the stoplist is dropped | proven |
| S25 | Withholding counted | $0.49 withheld leaves $7.30 | `S25` in tests/depth-PORTFOLIO-Q.test.cjs | withholding is ignored, so the gross is said as what landed | proven |
| S26 | Last year is last year | VOO dividends last year is 2025 | `S26` in tests/depth-PORTFOLIO-Q.test.cjs | every period is read as this year | proven |
| S27 | Unreadable is said | a failed read gives no number | `S27` in tests/depth-PORTFOLIO-Q.test.cjs | a failed dividends read is answered as none paid | proven |
| S28 | A period is never a ticker | in 2026 has no ticker | `S28` in tests/depth-PORTFOLIO-Q.test.cjs | the parse's general query fills in when no ticker was named | proven (also fails S26) |
| S29 | Missing history is not an empty account | no point before Oct 1 says the first day with a value | `S29` in tests/depth-PORTFOLIO-Q.test.cjs | a start later than asked is labeled as the whole period | proven |
<!-- results:end -->
