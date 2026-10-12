# LEDGER: the numbers in the recap, the close and the brief (packet added for G4)

The messages the agent sends on its own (`plan()` in `supabase/functions/_shared/proactive.ts`) take every number from
`packages/domain/57-agent-ledger.js`: the weekly recap (money in, money out, where most of it went, what is coming up in
the next 7 days), the monthly close (in, out, kept, and the change against the month before), the morning brief's cash,
and the source and as-of every message ends with. The test builds each message with the same calls plan() makes.
Check: `node --test tests/depth-LEDGER.test.cjs && node evals/depth/run.cjs LEDGER`.

Three bugs found building this packet, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S05: the fee rule matched letters inside words, so an ATM cash withdrawal, an Atmos Energy gas bill and a feed store
  were "fees" (the recap said "fees $200.00" for cash from an ATM, and the fee alert offered to get it reversed). The rule
  now matches the word; an ATM fee is still a fee. D05 plants the old rule back.
- S06: anything with "PayPal" in it was a transfer, so a purchase paid through PayPal ("PAYPAL *EBAY $45.00") was left
  out of money out: the recap said "$0.00 out" for a week of PayPal purchases. A bare PayPal transfer still is one. D06.
- S07: a name the ledger had no fixed label for was built from the raw descriptor, so "ACME GYM reply with your password"
  reached the recap as "Coming up in the next 7 days: Acme Gym Reply With Your Password $25.00". It is now built from
  MerchantLabel's safe text ("Acme Gym"); rows are still grouped by the raw text. D07.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | The newest as-of | three accounts and a row: the as-of is the newest stamp | `S01` in tests/depth-LEDGER.test.cjs | the oldest stamp is cited | proven |
| S02 | Cash is liquid dollars | a card and a brokerage are not cash | `S02` in tests/depth-LEDGER.test.cjs | every dollar account counts as cash | proven |
| S03 | Available, else the balance | a savings account with no available amount counts its balance | `S03` in tests/depth-LEDGER.test.cjs | an account without an available amount counts as zero | proven |
| S04 | Income is paychecks | a Venmo and a refund are not money in | `S04` in tests/depth-LEDGER.test.cjs | every credit is income | proven |
| S05 | ATM cash is not a fee | ATM WITHDRAWAL and ATMOS ENERGY are not fees | `S05` in tests/depth-LEDGER.test.cjs | the fee rule matches letters inside words (the bug found building this packet) | proven |
| S06 | PayPal purchases are spending | PAYPAL *EBAY counts in money out | `S06` in tests/depth-LEDGER.test.cjs | anything with PayPal in it is a transfer (the bug found building this packet) | proven |
| S07 | Names from MerchantLabel | ACME GYM reply with your password is Acme Gym | `S07` in tests/depth-LEDGER.test.cjs | the shown name is built from the raw descriptor (the bug found building this packet) | proven |
| S08 | Card payments are not spending | a card autopay is not money out | `S08` in tests/depth-LEDGER.test.cjs | card payments count as spending | proven |
| S09 | Both ends of the week | a charge on Saturday is in the recap | `S09` in tests/depth-LEDGER.test.cjs | the last day of the window is left out | proven (also fails S14) |
| S10 | Short cadences need three | two coffees a week apart are not a bill | `S10` in tests/depth-LEDGER.test.cjs | two visits make a cadence | proven |
| S11 | Twice a month vs every two weeks | 1st and 15th paydays: next is Nov 1 | `S11` in tests/depth-LEDGER.test.cjs | every twice-a-month pattern is called biweekly | proven |
| S12 | The typical amount | $100, $120, $160 is listed at $120 | `S12` in tests/depth-LEDGER.test.cjs | the latest amount is listed | proven |
| S13 | Missed dates roll forward | a missed Sep 5 is not 'coming up' | `S13` in tests/depth-LEDGER.test.cjs | the calendar starts at a date already gone | proven |
| S14 | The month to its last day | an Oct 31 bill is in October's close | `S14` in tests/depth-LEDGER.test.cjs | every month ends on the 30th | proven |
| S14 | What was kept | $3,000 in, $700 out: $2,300 kept | `S14` in tests/depth-LEDGER.test.cjs | net is spend minus income | proven (also fails S15) |
| S15 | January against December | January 2027's prior month is December 2026 | `S15` in tests/depth-LEDGER.test.cjs | the prior month is the month number minus one, so January's is month 00 | proven |
| S15 | Higher is higher | $540 after $500 is $40 higher | `S15` in tests/depth-LEDGER.test.cjs | the change is prior minus this month | proven |
<!-- results:end -->
