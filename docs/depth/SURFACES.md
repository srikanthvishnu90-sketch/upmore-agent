# SURFACES: earn and purchase-time surfaces (packet added for G4)

`packages/domain/63-agent-surfaces.js` (`AgentSurfaces`, Instinct spec docs 07, 08 and 02) rates side income by its
effective hourly rate after fees, unpaid time, vehicle cost and cash-out fees; filters signup bonuses by what the person
can meet and nets the interest a parked balance forgoes; keeps portal money pending, confirmed or landed; routes a
purchase through a portal and a card-linked offer; stages a card-offer activation as a request the person approves
once (`activateOffer`); picks the card for a purchase from the person's own reward table (windows, caps, activation,
foreign fees); and drafts dispute packets, complaint letters, energy plan comparisons, move budgets, a crypto tax CSV
and the bill calendar. Nothing here calls a portal or an issuer, and nothing executes.
Check: `node --test tests/depth-SURFACES.test.cjs && node evals/depth/run.cjs SURFACES`.

Where it runs today: **not reachable in production.** No edge function or app path loads it: it is in neither the
router bundle (`scripts/build-router-core.py`) nor the financial core, and `src/upmore-app-template.html` never
references it. It runs in `tests/surfaces.test.cjs` and this packet; `docs/methods/map.cjs` already counts its
bonus finder and portal routing as not reachable. Its bonus catalog ("Example National", "Example Credit Union",
"Example Online Bank", "Example Savings") and portal table ("Portal A", "Portal B") are placeholder rows, not offers.
`activateOffer` (the path the owner has been asked about) was tested as it is and not widened: it returns a request
for `EARN-010` with an idempotency key and a restated confirmation, and the text "I'll stage the activation; you approve
it once"; it never executes, and an already-activated offer returns `done` with nothing staged. S09 pins the request's
exact fields, so any widening (D09b plants `executes: true`) fails. No live reply has said any of the words below.

Bugs this packet pins, each written as a failing test first on the original module (logged in
`docs/playbook-drift-2026-10-12.md`):
- S03: with nothing but the benefits screening fitting, the text read "With 0 hours a week and no stated skills: .
  Also worth ten minutes: a benefits screening, ... worth more than any of these." Now "Nothing in the catalog fits the
  skills, gear and hours you gave me. Still worth ten minutes: a benefits screening, which is not work." D03.
- S04: a state-only bonus compared the person's state as typed, so "tx" was told "only in TX, OK". States compare in
  capitals. D04.
- S05: a direct-deposit requirement over a window was compared with one month's pay: $3,000 a month was "needs
  $5,000.00 of direct deposit within 60 days" and filtered out, though two paychecks clear it. The window's whole
  months of pay count now (at least one). D05.
- S10: a rotating category with only one end of its window ignored the window: last quarter's "5 percent on gas through
  2026-09-30" was still recommended in October ($5.00 back instead of $1.00). Each end bounds it. D10.
- S11: a cap partly used paid the bonus rate on the whole purchase: with $200 of a grocery cap left, a $1,000 purchase
  was "$50.00 back" and beat a flat 2 percent card. The bonus rate now applies to what is left of the cap and the base
  rate to the rest ($18.00, so the flat card's $20.00 wins) and the reason says so. D11.
- S12: an activation note for a merchant offer read "5 percent on undefined needs activating first". It names the
  merchant. D12.
- S13: a card with a stated 0 base rate was given 1 percent ("$1.00 back on $100.00" from a debit card that earns
  nothing). A stated 0 is 0; a missing base rate still defaults to 1 percent (noted below). D13.
- S15: a complaint draft missing details asked "I need what_happened, on to write it." It asks in words: "I need what
  happened and the date to write it." `tests/surfaces.test.cjs` pinned the field names and is corrected. D15.
- S16: with no usage, plans were priced on zero kWh ("On your 0 kWh a year: Mock A costs about $0.00"), and a month with
  no reading counted as 0 kWh (three readings and a blank made 9,000 kWh a year instead of 12,000). Months with a number
  only; with none it asks for a month of usage. D16, D16b.
- S17: `deposit_months: 0` (no deposit) became one month's rent: a $2,000.00 deposit line the person never owes. A stated
  0 is now no deposit line; a missing figure still assumes one month, marked as such. D17.
- S18: a tiny crypto quantity was written in exponent form ("1.2e-7") in the tax CSV. It is written 0.00000012. D18.
- S19 (words): one bill read "1 bills in the next 30 days" and "1 need a manual payment". Singular now.

Fixed after merge (each red first in this file, logged in `docs/playbook-drift-2026-10-12.md`):
- S21: `activateOffer` took no date, so it staged an offer whose `expires_on` had passed. It takes today like the
  module's other functions (`activateOffer(offer, user, today)`, or `user.today`). An expired offer reads "The Mock Blue
  offer at ShoeCo expired on 2026-10-11, so there is nothing to activate. Nothing is staged."; an offer expiring today
  still stages; with an expiry and no date it asks for today. It stays staging only (S09 pins the request). D21, D21b.
- S07: portal payouts were matched by words like "cashback", so a card's own cash-back credit counted as portal money
  landed. Only a credit from a portal itself counts: one the person has a statement for, by name, or Rakuten,
  TopCashback or Honey on the credit. D07b.
- S22: a bill the person named and the same bill found in their recurring rows were both listed. It is listed once,
  from what the person said ("as you told me, also in your recurring payments", with the recurring amount when it
  differs), when the names match (equal, or one the start of the other) and the dates are within 7 days. D22, D22b.

Noted, not changed (for the owner): the bonus catalog and portal table are placeholder rows in a production module; a
card with no base rate on file is assumed to earn 1 percent; move-budget figures not given are typical amounts (marked
"typical"); the crypto CSV does not neutralize a note starting with "=" for spreadsheet tools; a portal named on a credit
is still matched by its letters ("honey" anywhere in the descriptor), as before.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | "car or bike" takes either | a driver with a car fits delivery | `S01` in tests/depth-SURFACES.test.cjs | an either-or gear line needs both words | proven |
| S01 | Best rate first | rideshare before delivery | `S01` in tests/depth-SURFACES.test.cjs | the fits are sorted lowest rate first | proven |
| S02 | Unpaid time comes off | 15 unpaid minutes an hour take a fifth off | `S02` in tests/depth-SURFACES.test.cjs | unpaid time is ignored | proven (also fails S01) |
| S03 | Nothing fits, said whole | no work fits reads as a sentence | `S03` in tests/depth-SURFACES.test.cjs | an empty list is written into the sentence (the bug found building this packet) | proven |
| S04 | "tx" is Texas | a lower-case state meets a TX-only bonus | `S04` in tests/depth-SURFACES.test.cjs | the state must match in capitals (the bug found building this packet) | proven |
| S04 | The new-customer clock starts at closing | an account closed 364 days ago still counts | `S04` in tests/depth-SURFACES.test.cjs | the clock starts when the old account opened | proven |
| S05 | Deposits over the window | $3,000 a month meets $5,000 within 60 days | `S05` in tests/depth-SURFACES.test.cjs | one month's pay must cover the window's total (the bug found building this packet) | proven |
| S06 | A 365-day year | $15,000 for 90 days at 4 percent forgoes $147.95 | `S06` in tests/depth-SURFACES.test.cjs | interest is figured on a 360-day year | proven |
| S07 | Landed means a credit | a Rakuten purchase is not a payout | `S07` in tests/depth-SURFACES.test.cjs | debits count as landed portal money | proven |
| S07 | Only a portal's own credit has landed | a card's cash-back credits are not portal money | `S07` in tests/depth-SURFACES.test.cjs | any credit worded cashback or cash back counts as portal money (the bug fixed after merge) | proven |
| S08 | Expired offers are gone | yesterday's $30.00 offer is left out | `S08` in tests/depth-SURFACES.test.cjs | the expiry is not checked | proven |
| S08 | An offer expiring today still counts | o4 expiring Oct 12 is on the list | `S08` in tests/depth-SURFACES.test.cjs | the expiry day is dropped | proven |
| S09 | Already activated is done | an activated offer stages nothing | `S09` in tests/depth-SURFACES.test.cjs | an activated offer is staged again | proven |
| S09 | A request, never an execution | the request has exactly its six fields | `S09` in tests/depth-SURFACES.test.cjs | the request is widened to execute itself | proven |
| S10 | One end of a window still bounds it | a category that ended Sep 30 is 1 percent in October | `S10` in tests/depth-SURFACES.test.cjs | a window with one end is open forever (the bug found building this packet) | proven |
| S11 | The cap left, then the base rate | $1,000 with $200 of cap left is $18.00 | `S11` in tests/depth-SURFACES.test.cjs | the bonus rate is paid on the whole purchase (the bug found building this packet) | proven |
| S12 | Activation named | "5 percent on Mock Shoes needs activating first" | `S12` in tests/depth-SURFACES.test.cjs | a merchant offer is named by its missing category (the bug found building this packet) | proven |
| S12 | Frozen cards are left out | a frozen 9 percent card is not suggested | `S12` in tests/depth-SURFACES.test.cjs | only closed cards are left out | proven |
| S13 | Zero is zero | a card earning nothing is 0 percent | `S13` in tests/depth-SURFACES.test.cjs | a 0 base rate becomes 1 percent (the bug found building this packet) | proven |
| S13 | The foreign fee comes off abroad | Mock Blue nets $0.00 abroad | `S13` in tests/depth-SURFACES.test.cjs | the foreign fee is not netted | proven |
| S14 | The disputed amount is positive | the dispute is for $89.99 | `S14` in tests/depth-SURFACES.test.cjs | the charge's sign is kept, so it reads -$89.99 | proven |
| S15 | Asked in words | "I need what happened and the date" | `S15` in tests/depth-SURFACES.test.cjs | the raw field names are asked for (the bug found building this packet) | proven |
| S15 | Follow up in two weeks | the follow-up is Oct 26 for a letter on Oct 12 | `S15` in tests/depth-SURFACES.test.cjs | the follow-up is ten days out | proven |
| S16 | No usage, no price | an empty usage list asks for a month of kWh | `S16` in tests/depth-SURFACES.test.cjs | plans are priced on zero kWh (the bug found building this packet) | proven |
| S16 | A missing month is not zero | three months with one blank make 12,000 kWh a year | `S16` in tests/depth-SURFACES.test.cjs | a month with no reading counts as 0 kWh (the bug found building this packet) | proven |
| S17 | No deposit means none | deposit_months 0 adds no deposit line | `S17` in tests/depth-SURFACES.test.cjs | 0 months becomes one month's rent (the bug found building this packet) | proven |
| S18 | Plain decimals | 0.00000012 BTC is not 1.2e-7 | `S18` in tests/depth-SURFACES.test.cjs | tiny quantities are written in exponent form (the bug found building this packet) | proven |
| S18 | A trade needs a basis too | the SOL trade is listed as missing a basis | `S18` in tests/depth-SURFACES.test.cjs | only sales are checked for a basis | proven |
| S19 | The window's last day counts | a bill due in 30 days is listed | `S19` in tests/depth-SURFACES.test.cjs | the last day of the window is left out | proven |
| S19 | Past bills are not coming up | a bill due yesterday is not listed | `S19` in tests/depth-SURFACES.test.cjs | past due dates are listed | proven |
| S19 | One bill, singular | "1 bill ... 1 needs a manual payment" | `S19` in tests/depth-SURFACES.test.cjs | one bill is written in the plural (the words bug found building this packet) | proven |
| S20 | The calendar's as-of | the bill calendar says today as its as-of | `S20` in tests/depth-SURFACES.test.cjs | the bill calendar drops its as-of | proven |
| S20 | The best card's as-of | the card pick says today as its as-of | `S20` in tests/depth-SURFACES.test.cjs | the card pick drops its as-of | proven |
| S21 | An expired offer is not staged | yesterday's offer is refused, nothing staged | `S21` in tests/depth-SURFACES.test.cjs | the expiry is not checked before staging (the bug fixed after merge) | proven |
| S21 | No date, no staging | with an expiry and no date it asks for today | `S21` in tests/depth-SURFACES.test.cjs | an offer is staged when there is no date to check its expiry against | proven |
| S22 | One bill, listed once | the power bill named and recurring is one line | `S22` in tests/depth-SURFACES.test.cjs | a named bill and its recurring row are both listed (the bug fixed after merge) | proven |
| S22 | The same bill is close in time | a named bill 15 days from the recurring one stays separate | `S22` in tests/depth-SURFACES.test.cjs | any named bill with the same name absorbs the recurring row, whatever the date | proven |
<!-- results:end -->
