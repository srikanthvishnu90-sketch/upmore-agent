# POSTED-FLOW: money in and out of the bank, as posted (packet added for G4)

`packages/domain/39-agent-posted-flow.js` (`AgentPostedFlow.report`) adds up the person's retained, observed, posted
USD rows in an inclusive date range to exact cents: bank debits, bank credits, net flow (credits minus debits) and the
merchants behind them, biggest money out first. It never calls credits income or debits spending (both stay `null`):
unclassified transfers, refunds, loan proceeds and card payments change those. Pending, superseded, vanished,
other-currency and bank-labeled transfer rows are left out and counted; a repeated row counts once; two different copies
of one transaction, a broken date, a missing identity or an unknown amount stop the report instead of becoming $0. The
as-of is the oldest bank fetch of a counted row, unknown when any counted row has none.
Check: `node --test tests/depth-POSTED-FLOW.test.cjs && node evals/depth/run.cjs POSTED-FLOW`.

Where it runs (read from the repo on 2026-10-12): in the financial core bundle (`scripts/build-financial-core.py`), used
by `supabase/functions/_shared/financial_service.ts` `postedFlowReport`, which agent-chat's financial planner calls as
the tool `get_posted_flow_report`. `_shared/financial_tools.ts` renders it: "<from> through <to>: N retained USD posted
records. Recorded bank debits $X, credits $Y, net flow $Z. These are not verified spending or income totals. Top
merchants by recorded debits: ...", with `oldest_receipt_at` as the source's as-of. The service reads posted, observed
rows only, so it reports the pending, superseded and unavailable counts as `null` (a posted-only read cannot count them).
agent-chat is deployed by `scripts/launch/go-live.sh`.

Bugs: none found. Every sub-capability below was already right; the packet pins it.

Settled in the caller (7cc1058): the range is whatever the planner passes, and the planner is now told the person's
local date as well as the UTC date, and that bank rows are dated by calendar day, so a row dated the UTC date can be
from this evening (`financial_planner.ts`, tests/edge/financial-planner.test.ts). The module itself has no notion of
today.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Net flow is credits minus debits | $2,500.00 in and $57.86 out nets $2,442.14 | `S01` in tests/depth-POSTED-FLOW.test.cjs | the net flow has the wrong sign | proven (also fails S03, S04, S05, S06, S07, S08, S09, S10) |
| S02 | Credits are not income | spending and income stay unknown | `S02` in tests/depth-POSTED-FLOW.test.cjs | bank debits are reported as spending and credits as income | proven |
| S03 | Pending is left out | a pending $90.00 hold is not in the debits | `S03` in tests/depth-POSTED-FLOW.test.cjs | the pending check is dropped | proven |
| S04 | Superseded is counted as such | a replaced pending row is superseded, not unavailable | `S04` in tests/depth-POSTED-FLOW.test.cjs | superseded rows are not told apart | proven |
| S05 | Only observed rows count | a row with no presence is unavailable | `S05` in tests/depth-POSTED-FLOW.test.cjs | only rows marked not_seen are left out | proven |
| S06 | The last day is in the range | Oct 31 counts in Oct 1 to Oct 31 | `S06` in tests/depth-POSTED-FLOW.test.cjs | the range's last day is left out | proven (also fails S15) |
| S07 | One account means one account | the savings report has only the $1,000.00 | `S07` in tests/depth-POSTED-FLOW.test.cjs | the account filter is dropped | proven |
| S08 | Other currencies stay aside | a EUR 20.00 row is not $20.00 | `S08` in tests/depth-POSTED-FLOW.test.cjs | the currency check is dropped | proven |
| S09 | Bank-labeled transfers stay aside | a $500 transfer to savings is not a debit | `S09` in tests/depth-POSTED-FLOW.test.cjs | the transfer check is dropped | proven |
| S10 | A re-read counts once | the same row fetched twice is one $15.49 | `S10` in tests/depth-POSTED-FLOW.test.cjs | the fetch time is compared, so a re-read stops the report | proven |
| S11 | Conflicting copies stop the report | the same id at $15.49 and $15.94 throws | `S11` in tests/depth-POSTED-FLOW.test.cjs | a repeated id is skipped without comparing its facts | proven |
| S12 | Biggest money out first | rent before the two cafes | `S12` in tests/depth-POSTED-FLOW.test.cjs | the order is reversed | proven |
| S13 | One merchant, two spellings | NETFLIX.COM and NETFLIX.COM 866-... are one merchant | `S13` in tests/depth-POSTED-FLOW.test.cjs | the bank's raw text is grouped before the merchant key | proven |
| S14 | Unknown fetch time, unknown as-of | one row without a fetch time makes the as-of null | `S14` in tests/depth-POSTED-FLOW.test.cjs | any fetch time is enough to state an as-of | proven |
| S15 | Days in order | Oct 31 to Oct 1 is refused | `S15` in tests/depth-POSTED-FLOW.test.cjs | a reversed range is accepted | proven |
| S16 | A broken date stops the report | posted_on 2026-10-1 throws | `S16` in tests/depth-POSTED-FLOW.test.cjs | the posted-date check is dropped | proven |
| S17 | Unknown amounts stop the report | a null or 12.5-cent amount throws | `S17` in tests/depth-POSTED-FLOW.test.cjs | the amount check is dropped | proven |
| S18 | No rows, no as-of | an empty range has oldest_receipt_at null | `S18` in tests/depth-POSTED-FLOW.test.cjs | the as-of is computed over no rows | proven |
| S19 | Identity is required | a row with no transaction id throws | `S19` in tests/depth-POSTED-FLOW.test.cjs | the identity check is dropped | proven |
| S20 | Too big is unknown | MAX_SAFE_INTEGER + 1 cents is null | `S20` in tests/depth-POSTED-FLOW.test.cjs | a total past 2^53 is rounded and shown | proven |
<!-- results:end -->
