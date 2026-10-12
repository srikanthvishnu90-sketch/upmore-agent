# EARN: the earn engine, from a bank bonus's checklist to a verified credit (packet added for G4)

`packages/domain/44-agent-earn.js` (`AgentEarn`, Instinct spec doc 08) reads the person's own rows and the programs
they name and finds money to earn: a bank bonus's requirements tracked against the bonus account's own transactions
(direct deposit, debit count, minimum balance, the early-closure reminder), the employer match, ESPP, HSA seed and
stipends left on the table, settlements and recalls matched to the person's own merchants and states, points valued at
the real redemption rate, referral payouts, and earn apps rated per hour after their cash-out fee. Deadlines carry the
7-day and 1-day alerts. Every play is an estimate with its time cost; `verify()` looks for the credit itself, and the
ledger books verified credits only. Nothing here acts: no enrollment, no contact with anyone, no adapter call.
Check: `node --test tests/depth-EARN.test.cjs && node evals/depth/run.cjs EARN`.

Where it runs today: **not reachable in production.** No edge function or app path loads it. It is not in the router
bundle (`scripts/build-router-core.py` leaves `44-agent-earn.js` out) or the financial core, so the proactive feed's
earn branch in `56-agent-proactive.js` (`if (Earn)`) never runs in `supabase/functions/_shared/proactive.ts`; the app
(`src/upmore-app-template.html`) never loads it. It runs in `tests/earn.test.cjs`, `tests/alerts.test.cjs`, the eval
harness (`evals/runner.cjs`) and this packet. The programs it reads (bonuses, settlements, recalls, referrals, earn
apps) are inputs nothing collects yet. No live reply has said any of the words below.

Bugs this packet pins, each written as a failing test first on the original module (logged in
`docs/playbook-drift-2026-10-12.md`):
- S02: the debit-count rule threw out any descriptor with the letters "fee" in it, so "STARBUCKS COFFEE" and "PEETS
  COFFEE" were not purchases and a 3-debit bonus read 1 of 3. Now the word fee(s). D02 plants the old test.
- S03: a deposit or purchase after a requirement's deadline still counted: a $2,000 paycheck on Oct 5 for a Sep 30
  deadline made "Mock Bank $300.00 bonus: earned awaiting payout" with $300 expected. Rows after the deadline no longer
  count, and a requirement unmet past its deadline makes the bonus "missed" ($0 expected, nothing to chase). D03.
- S06: every balance reading counted as a day, so two readings on Oct 1 met a two-day minimum balance. Days are now
  distinct dates. D06.
- S08: the queue's reason added a play's yearly dollars and twelve months of its monthly figure, so the $1,350 match gap
  read "$2,700.00 a year estimated" (and ranked as if it were). A year is said once. D08.
- S09: a stipend past its expiry was offered ("$1,000.00 of the Learning stipend unused" after Sep 30). Expired stipends
  are not offered; the expiry day still is. D09.
- S11: a recall whose refund deadline had passed was "refund of $129.99 available" (settlements already skipped a past
  deadline; recalls did not). D11.
- S12: expired points were valued ("10,000 Old Mock Points points are worth $100.00" after they expired). D12.
- S14: one $50 referral credit was counted as the payout for every paid referral after it (`paid_seen: 2`). One credit
  pays one referral. D14.
- S17: a bonus was verified by any bonus credit of the same size in any account, so another bank's $300 bonus verified
  this one. The credit must post to the bonus account. D17.
- S18: raising the 401(k) election "verified" the whole year's match ($1,350.00 booked as found and verified) before any
  match posted, against the module's own rule that nothing is booked until the credit posts. The election verifies
  with $0 booked and the note "contribution raised; the match verifies as it posts on payroll". D18.
- S19: the ledger kept one entry per key per day, so the same $300 credit verified on three days was booked three
  times ("$600.00 found" after two). A credit is booked once, by its row id. D19.

Noted, not changed (for the owner): a settlement match has no eligibility window (class period) although its evidence
rule says "in the eligibility window"; a recall naming only a merchant matches any purchase there (a Best Buy recall
matches any Best Buy purchase); the ESPP estimate is contribution times discount with no $25,000 purchase limit; a
minimum balance counts days at or above the amount, not an unbroken run (a dip does not reset it); "Mock Points" as a
program name reads "Mock Points points".

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Payroll into the bonus account only | a $3,250 paycheck into checking is not the bonus deposit | `S01` in tests/depth-EARN.test.cjs | deposits into any account count toward the bonus | proven |
| S02 | Coffee is a purchase, not a fee | two coffee purchases count toward the debits | `S02` in tests/depth-EARN.test.cjs | "fee" is matched inside COFFEE (the bug found building this packet) | proven |
| S02 | A transfer is not a purchase | a $50 transfer to savings does not count | `S02` in tests/depth-EARN.test.cjs | transfers count as debit purchases | proven |
| S03 | Late deposits do not meet the requirement | a deposit five days after the deadline leaves the bonus missed | `S03` in tests/depth-EARN.test.cjs | rows after the deadline count (the bug found building this packet) | proven |
| S03 | The deadline day counts | a deposit on the deadline day meets it | `S03` in tests/depth-EARN.test.cjs | the deadline day itself is left out | proven |
| S03 | Due today is not missed | a requirement due today is still in progress | `S03` in tests/depth-EARN.test.cjs | a requirement due today reads as missed | proven |
| S04 | The bonus is its own amount | a $25 promotional credit is not the $300 bonus | `S04` in tests/depth-EARN.test.cjs | any bonus-worded credit marks it paid | proven |
| S05 | Overdue only after the payout date | on the payout date it is still awaited | `S05` in tests/depth-EARN.test.cjs | the payout date itself reads as overdue | proven |
| S06 | Days, not readings | two balances on Oct 1 are one day | `S06` in tests/depth-EARN.test.cjs | every balance reading counts as a day (the bug found building this packet) | proven |
| S06 | No history is unknown | no balance history is never "in progress" | `S06` in tests/depth-EARN.test.cjs | no history reads as not met instead of unknown | proven |
| S07 | Thirty days before the early-closure window ends | the reminder is Feb 18 for Mar 20 | `S07` in tests/depth-EARN.test.cjs | the reminder is a day early | proven |
| S08 | A year is said once | the match gap's reason says $1,350.00 a year | `S08` in tests/depth-EARN.test.cjs | the yearly figure and twelve months of it are added (the bug found building this packet) | proven |
| S09 | An expired stipend is gone | the Learning stipend that expired Sep 30 is not offered | `S09` in tests/depth-EARN.test.cjs | the expiry is not checked (the bug found building this packet) | proven |
| S09 | The last day to claim still counts | a stipend expiring today is offered | `S09` in tests/depth-EARN.test.cjs | a stipend expiring today is dropped | proven |
| S10 | Merchant and state, both | a CA resident does not match a TX-only settlement | `S10` in tests/depth-EARN.test.cjs | the state check is dropped | proven |
| S10 | The last claim day is open | a settlement closing today still matches | `S10` in tests/depth-EARN.test.cjs | the claim deadline day is treated as closed | proven |
| S11 | A closed recall window is not money | a recall whose refund deadline was Oct 1 is not offered | `S11` in tests/depth-EARN.test.cjs | the recall's deadline is not checked (the bug found building this packet) | proven |
| S12 | Expired points are worth nothing | points that expired Oct 1 are not valued | `S12` in tests/depth-EARN.test.cjs | expired points are valued (the bug found building this packet) | proven |
| S12 | The real rate, not the advertised one | 40,000 points are $500.00, not $800.00 | `S12` in tests/depth-EARN.test.cjs | the advertised rate is the expected value | proven |
| S13 | The transfer is worth the difference | Mock Air is worth $108.00 more than cash | `S13` in tests/depth-EARN.test.cjs | the whole transfer value is the expected gain | proven |
| S14 | One credit, one referral | one $50.00 credit is one payout seen | `S14` in tests/depth-EARN.test.cjs | a used credit can pay a second referral (the bug found building this packet) | proven |
| S15 | The cash-out fee comes off | Mock Surveys is $4.00 an hour | `S15` in tests/depth-EARN.test.cjs | the cash-out fee is ignored in the hourly rate | proven |
| S16 | The deadline day alerts | a deadline today fires | `S16` in tests/depth-EARN.test.cjs | the day itself stays quiet | proven |
| S16 | Seven days out, not six | Oct 19 fires on Oct 12, Oct 18 does not | `S16` in tests/depth-EARN.test.cjs | the week-out alert fires a day late | proven |
| S17 | The bonus credit lands in the bonus account | another bank's $300 bonus does not verify this one | `S17` in tests/depth-EARN.test.cjs | the account is not checked (the bug found building this packet) | proven |
| S18 | An election is not dollars | a raised election books $0.00 | `S18` in tests/depth-EARN.test.cjs | the year's match is booked as verified on the election (the bug found building this packet) | proven |
| S19 | One credit is booked once | the same $300.00 verified on three days is one entry | `S19` in tests/depth-EARN.test.cjs | a credit is booked again on each new day (the bug found building this packet) | proven |
| S19 | Verified credits only | an unverified result is refused | `S19` in tests/depth-EARN.test.cjs | any result object is booked | proven |
| S20 | Verified money first | the verified $1.00 tops the queue | `S20` in tests/depth-EARN.test.cjs | verified plays rank by their dollars only | proven |
| S20 | Time divides the dollars | $8.00 for four hours sinks below $5.00 for one | `S20` in tests/depth-EARN.test.cjs | time cost is ignored | proven |
| S21 | Today is required | a missing or US-format today throws | `S21` in tests/depth-EARN.test.cjs | today is not validated | proven |
<!-- results:end -->
