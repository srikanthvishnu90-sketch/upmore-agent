# ALERTS: what the agent says on its own, and when (packet added for G4)

`packages/domain/59-agent-alerts.js` decides what fires today (low balance ahead, a large or unusual charge, fraud
shapes, a fee, the person's own watches), when it may be said (quiet hours on the person's own clock; safety at once) and
how a busy day is said (one bundle). `plan()` in `supabase/functions/_shared/proactive.ts` reaches it through
`AgentProactive.feed` (`Alerts.run`) and `AgentAlerts.inQuiet`, and turns "tell me when ..." into a watch with
`parseWatch` and `restateWatch`.
Check: `node --test tests/depth-ALERTS.test.cjs && node evals/depth/run.cjs ALERTS`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S05 (found here): quiet hours held the person's own watches with every finding, while the quiet-hours reply promises
  "Only safety alerts and things you asked me to watch come through then". A "tell me when my checking drops below $500"
  that fired at 11 p.m. was held; a charge watch held past midnight was never said at all (watches read today's charges).
  Watches now come through quiet hours; findings and urgent items still wait. D05 plants the old hold back.
- S16 (megadoc L09, 2026-10-12): "text me when I spend over 100 on one thing" got the list of watch kinds back and
  nothing was set. Spending words for one charge ("on one thing", "in one purchase", "at once", "anything over $100")
  are now the existing charge-over watch; the whole condition must be that, so "on food" or "at target" is still refused.
  D16 drops the end anchor, which would guess a charge-over watch from "over 100 on one thing at target".
- S03 (found building LEDGER): an ATM cash withdrawal fired "Fee: Atm Withdrawal $200.00 ... Banks often reverse a fee
  when asked". The fee rule now matches the word; D03 plants the old rule back.

Item 38 (2026-10-12): a refund the person was promised is a watch ("tell me if my $45.99 Amazon refund doesn't arrive
by Oct 20", "text me when my $120 refund from REI shows up", "alert me if my Delta refund hasn't come in within 7
business days"): the merchant as typed (required, never guessed; a tax refund is not this), the amount when said, the
deadline counted from the day the watch was set (business days skip weekends; bank holidays are not counted and the
restatement says so). It says the refund posting once, to the cent (a credit up to 3 days before the watch counts, since
banks sync late); another credit from that merchant is said and the watch stays; the day after the deadline with no
matching credit it says so once, with the transactions it checked through and the dispute flow named, nothing sent.
Pending credits are never the refund. S17-S22, D17-D22.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Quiet hours across midnight | 7:30 a.m. is no longer quiet | `S01` in tests/depth-ALERTS.test.cjs | the end hour itself still counts as quiet | proven (also fails S02) |
| S02 | The person's own clock | 03:00 UTC is 8 p.m. in Los Angeles | `S02` in tests/depth-ALERTS.test.cjs | the UTC hour is used as the person's hour | proven (also fails S01) |
| S03 | A fee alert is for a fee | an ATM withdrawal fires no fee alert | `S03` in tests/depth-ALERTS.test.cjs | the fee rule matches letters inside words, so ATM cash is a fee (the bug found building the LEDGER packet) | proven |
| S04 | Safety at once, the rest in the morning | a fraud shape at 11 p.m. goes out now | `S04` in tests/depth-ALERTS.test.cjs | safety is held with everything else | proven (also fails S14) |
| S05 | Watches come through quiet hours | a balance watch at 11 p.m. is delivered | `S05` in tests/depth-ALERTS.test.cjs | a watch is held like any finding (the bug found building this packet) | proven |
| S06 | Held until 7 a.m. local | held until 11:00 UTC in New York | `S06` in tests/depth-ALERTS.test.cjs | the end hour is taken as UTC | proven |
| S07 | Watches are never bundled | a watch stays its own message beside a bundle | `S07` in tests/depth-ALERTS.test.cjs | a watch is folded into the bundle | proven |
| S08 | Two are said one by one | two ordinary items are not bundled | `S08` in tests/depth-ALERTS.test.cjs | two items make a bundle | proven |
| S09 | The exact number | $1,250.50 is 125050 cents | `S09` in tests/depth-ALERTS.test.cjs | the thousands comma is not removed | proven (also fails S16) |
| S10 | Refused, never guessed | 'gas prices go below $3' is not a balance watch | `S10` in tests/depth-ALERTS.test.cjs | 'go below' is read as a balance falling | proven |
| S11 | Available, not the books | $600 with $400 available is below $500 | `S11` in tests/depth-ALERTS.test.cjs | the watch compares the ledger balance | proven |
| S12 | The last 3 days, from the watch's own day | a charge from before the watch was set does not fire; one 5 days old does not either | `S12` in tests/depth-ALERTS.test.cjs | every charge in the rows is read | proven |
| S13 | Usual needs five past charges | two $15 dinners do not make $60 large | `S13` in tests/depth-ALERTS.test.cjs | one past charge sets the usual | proven |
| S14 | Three first-time merchants is safety | three new shops in a day go out as safety | `S14` in tests/depth-ALERTS.test.cjs | four are needed | proven |
| S15 | The person's buffer | under a $500 buffer on Oct 15 | `S15` in tests/depth-ALERTS.test.cjs | the default $100 buffer is always used | proven |
| S16 | One thing means one charge, nothing more (megadoc L09) | 'spend over 100 on one thing at target' is refused | `S16` in tests/depth-ALERTS.test.cjs | the end anchor is dropped, so a merchant after 'one thing' is ignored and a charge-over watch is guessed | proven |
| S17 | No merchant, no refund watch | 'tell me when refund posts' is not a refund watch | `S17` in tests/depth-ALERTS.test.cjs | a refund with no merchant is watched with an empty merchant, matching every credit | proven |
| S17 | The merchant as typed | REI stays REI | `S17` in tests/depth-ALERTS.test.cjs | the merchant is kept lower-cased and title-cased, so REI becomes Rei | proven |
| S18 | Business days skip weekends | 7 business days from Mon Oct 12 is Wed Oct 21 | `S18` in tests/depth-ALERTS.test.cjs | business days are counted as calendar days | proven |
| S18 | No impossible date | Feb 30 is no deadline | `S18` in tests/depth-ALERTS.test.cjs | Feb 30 rolls over to Mar 2 | proven |
| S19 | The refund to the cent | a $45.99 credit is the $45.99 refund | `S19` in tests/depth-ALERTS.test.cjs | any credit from the merchant is taken as the refund | proven (also fails S20) |
| S20 | Another credit is said, not swallowed | a $12.00 credit is said with the watch still on | `S20` in tests/depth-ALERTS.test.cjs | other credits from the merchant are ignored | proven |
| S21 | Late is the day after | on the deadline day nothing is late | `S21` in tests/depth-ALERTS.test.cjs | the deadline day itself is called late | proven |
| S22 | Pending is not posted | a pending $45.99 credit is not the refund | `S22` in tests/depth-ALERTS.test.cjs | a pending credit is said as posted | proven |
| S23 | No apostrophe still a refund watch | 'refund from airbnb doesnt show up' is merchant airbnb | `S23` in tests/depth-ALERTS.test.cjs | the negation is kept in the merchant ("airbnb doesnt") | proven |
| S23 | The payer as subject | 'amazon hasnt refunded me' is a refund watch | `S23` in tests/depth-ALERTS.test.cjs | only 'my X refund' is read | proven |
| S23 | By the 20th | 'by the 5th' after the 5th is next month's | `S23` in tests/depth-ALERTS.test.cjs | a passed day of the month is this month's | proven |
| S23 | A generic payer is not a merchant | 'my refund from the airline' sets nothing | `S23` in tests/depth-ALERTS.test.cjs | "airline" is taken as the merchant | proven (also fails S17) |
| S24 | A re-fire updates the last reported low | the second report is counted and becomes the comparison point | `S24` in tests/depth-ALERTS.test.cjs | a re-fire does not update the episode's report count, so the next comparison is against a stale low | proven |
| S25 | Seven days sooner is material | a first day 8 days closer re-fires; 6 days does not | `S25` in tests/depth-ALERTS.test.cjs | the date leg needs a month, so a dip arriving a week sooner is never said | proven |
<!-- results:end -->
