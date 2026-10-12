# CLASSIFIED-LEDGER: spending and income from the person's own reviews (packet added for G4)

`packages/domain/40-agent-classified-ledger.js` (`AgentClassifiedLedger.report`) turns retained posted USD rows plus the
person's explicit transaction reviews into spending and income for an inclusive date range. A review counts only while
the bank's facts still match it (`fact_hash`) and points the right way (a purchase is money out, income is money in); the
newest revision wins. A refund needs its reviewed original purchase, dated on or after it, takes that purchase's
category, lowers spending in the month it posts and is never income; refunds that together pass the purchase are not
believed, even across months. A transfer or card payment needs both legs reviewed, on different accounts, equal and
opposite, saying the same thing; a transfer the bank itself labeled needs no review; loan money is counted on its own.
Anything unreviewed or changed keeps spending and income unknown while the known subtotals stay visible; an empty
period is unknown, never $0. The totals carry their as-of: the oldest bank fetch of a counted row.
Check: `node --test tests/depth-CLASSIFIED-LEDGER.test.cjs && node evals/depth/run.cjs CLASSIFIED-LEDGER`.

Where it runs (read from the repo on 2026-10-12): in the financial core bundle (`scripts/build-financial-core.py`), used
by `supabase/functions/_shared/financial_service.ts` `classifiedLedgerReport`, reached two ways: agent-chat's financial
planner tool `get_spending_income_report` (rendered by `_shared/financial_tools.ts`: "Spending $X, income $Y. Known
user-classified expenses ..."), and agent-workflows "ledger_report" for the app's "Review bank activity" screen
(`src/financial-review.js`). agent-chat is deployed by `scripts/launch/go-live.sh`; `agent-workflows` is not in it.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S21 (found here): the report stated spending and income with no as-of at all, and `financial_tools.ts` gave the chat
  fact `observed_at: null` (CLAUDE.md: every user-facing money statement cites its data source and as-of). The report now
  carries `oldest_receipt_at`, the oldest bank fetch of a counted row (unknown when any counted row has none, the same rule
  as POSTED-FLOW), and the chat fact's source uses it (`tests/edge/classified-ledger.test.ts`). D21 removes it, D21b
  states one from any single row.

Noted, not changed (for the owner): a refund in a month with no purchases makes that month's spending negative ("Spending
-$40.00"); that is the documented rule ("Refunds reduce spending in their posting period"), pinned by
`tests/edge/classified-ledger.test.ts`, but the words read oddly in chat. A report whose total overflows says
`classification_complete: true` with `spending_cents: null` (S20): unknown, never a rounded number.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Purchases are spending | $42.37 and $1,850.00 are $1,892.37 spent | `S01` in tests/depth-CLASSIFIED-LEDGER.test.cjs | a purchase's sign is not flipped, so spending reads negative | proven (also fails S02, S07, S08, S17, S18, S19) |
| S02 | Unreviewed keeps totals unknown | one unreviewed $10.00 keeps spending null | `S02` in tests/depth-CLASSIFIED-LEDGER.test.cjs | totals are stated while rows are still unreviewed | proven (also fails S04, S05, S06, S09) |
| S03 | No records is unknown | an empty month is not $0 spent | `S03` in tests/depth-CLASSIFIED-LEDGER.test.cjs | an empty period is called complete | proven |
| S04 | Changed facts void the review | a $100 review does not cover the bank's corrected $90 | `S04` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the review is not compared with the row's current facts | proven |
| S05 | The newest review wins | a later "unknown" takes the expense back | `S05` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the first review seen wins | proven |
| S06 | A purchase is money going out | an "expense" on a $50 credit is not believed | `S06` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the purchase direction check is dropped | proven |
| S07 | A refund takes the purchase's category | the $40 refund lands under Clothing | `S07` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the refund's own category is used | proven |
| S08 | A full refund is a refund | $120 back on a $120 purchase counts | `S08` in tests/depth-CLASSIFIED-LEDGER.test.cjs | a refund equal to the purchase is rejected | proven |
| S09 | Refunds together cannot pass the purchase | $60 + $60 back on $100 is not believed | `S09` in tests/depth-CLASSIFIED-LEDGER.test.cjs | refunds are checked one by one, never together | proven |
| S10 | No refund before the purchase | a refund dated the day before is not believed | `S10` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the date order check is dropped | proven |
| S11 | Transfer legs must match to the cent | -$500.00 and +$499.99 are not a transfer | `S11` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the amounts of the two legs are not compared | proven |
| S12 | Both legs say the same thing | a transfer leg paired with a card-payment leg is not believed | `S12` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the partner's kind is not compared | proven |
| S13 | The bank's own transfer label | an unreviewed bank-labeled transfer is a transfer | `S13` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the provider's transfer flag is ignored | proven |
| S14 | Loans are not income | a $5,000 loan is not in income | `S14` in tests/depth-CLASSIFIED-LEDGER.test.cjs | loan proceeds are added to income | proven |
| S15 | Other currencies stay aside | a EUR row is counted aside, not as a record | `S15` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the currency check is dropped | proven |
| S16 | Categories in name order | Dining before Uncategorized | `S16` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the category order is reversed | proven (also fails S07) |
| S17 | The last day is in the range | Oct 31 counts in Oct 1 to Oct 31 | `S17` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the range's last day is left out | proven |
| S18 | One account means one account | the checking report has 2 records, not 3 | `S18` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the account filter is dropped | proven |
| S19 | Conflicting copies stop the report | the same id at $1.00 and $1.01 throws | `S19` in tests/depth-CLASSIFIED-LEDGER.test.cjs | a later copy silently replaces the earlier one | proven |
| S20 | Too big is unknown | MAX_SAFE_INTEGER + 1 cents is null | `S20` in tests/depth-CLASSIFIED-LEDGER.test.cjs | a total past 2^53 is rounded and shown | proven |
| S21 | The totals carry their as-of | the oldest counted fetch, Oct 3 07:15 UTC; none if a counted row has no fetch time | `S21` in tests/depth-CLASSIFIED-LEDGER.test.cjs | the report states no as-of for its money (the bug found building this packet) | proven |
| S21 | Unknown fetch time, unknown as-of | one counted row without a fetch time makes the as-of null | `S21` in tests/depth-CLASSIFIED-LEDGER.test.cjs | any fetch time is enough to state an as-of | proven |
<!-- results:end -->
