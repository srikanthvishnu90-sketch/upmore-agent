# RENT-SHORT: "rent is due and I only have 1900" (megadoc D13)

`packages/domain/106-rent-short.js` (`RentShort`) answers whether rent is covered, from the person's own rows, read-only.
Rent is the next payment of a rent that repeats in their rows (`TheNumbers.projection` over 45 days; a payee that reads as
rent, property management, apartments, leasing, a landlord or a rent portal), or the amount and due date they give, which
win (the last one paid is said beside it). Cash is the amount they say, said as theirs with the linked cash beside it, or
their linked checking and savings. The gap today is to the cent; paychecks and other repeating bills between today and
the due date are listed with their dates, with what is left after rent on the due date, said as counting repeating rows
only. Still short on the due date: a draft to the landlord (part on time, the rest by the next payday after the due
date) the person sends; nothing is paid, moved or sent. No rent in the rows and none said is asked, never guessed; no
cash account and no amount said is said. "Pay my rent" (the standing rent flow), "did my rent go through" and splitting
rent are not this.

Where it runs: kind "rentshort" in `supabase/functions/agent-chat/_shared/money_answers.ts`; `tests/edge/megadoc-money-asks.test.ts`.
Check: `node --test tests/depth-RENT-SHORT.test.cjs && node evals/depth/run.cjs RENT-SHORT`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Rent from the repeating payment | $2,400 due Nov 1 to Oak Property | `S01` in tests/depth-RENT-SHORT.test.cjs | the rent payee is not read | proven (also fails S04, S05, S06, S08, S09, S10, S11) |
| S02 | The person's cash, said as theirs | what you said; linked reads $2,050 | `S02` in tests/depth-RENT-SHORT.test.cjs | the linked cash is not said beside it | proven |
| S03 | Linked cash when nothing is said | your linked checking and savings | `S03` in tests/depth-RENT-SHORT.test.cjs | the linked cash is ignored | proven (also fails S04, S06) |
| S04 | The gap to the cent | short by $500.00 | `S04` in tests/depth-RENT-SHORT.test.cjs | the gap is rounded to the hundred | proven |
| S05 | Bills before the due date | Verizon $85 on Oct 20 | `S05` in tests/depth-RENT-SHORT.test.cjs | bills before rent are not counted | proven (also fails S06, S11) |
| S06 | Draft when still short | part on time, the rest by Nov 6 | `S06` in tests/depth-RENT-SHORT.test.cjs | the next payday is not read | proven |
| S07 | No draft when covered | covered: nothing to send | `S07` in tests/depth-RENT-SHORT.test.cjs | the draft is always offered | proven |
| S08 | The rent the person gives | $2,600, last was $2,400 | `S08` in tests/depth-RENT-SHORT.test.cjs | the rows' rent wins | proven |
| S09 | The due date the person gives | due the 25th is Oct 25 | `S09` in tests/depth-RENT-SHORT.test.cjs | the rows' due date wins | proven |
| S10 | No rent: asked | how much and when | `S10` in tests/depth-RENT-SHORT.test.cjs | the rows' first bill is used | proven |
| S11 | No paycheck said | no paycheck shows up | `S11` in tests/depth-RENT-SHORT.test.cjs | the missing paycheck is not said | proven |
| S12 | 1.5k is $1,500 | k thousands | `S12` in tests/depth-RENT-SHORT.test.cjs | k is ignored | proven |
| S13 | Not this | pay my rent is the rent flow's | `S13` in tests/depth-RENT-SHORT.test.cjs | the not-this guard is dropped | proven |
| S14 | No cash account: said | can't see a checking or savings balance | `S14` in tests/depth-RENT-SHORT.test.cjs | a card balance is taken as cash | proven |
| S15 | Source line | every answer ends with its source | `S15` in tests/depth-RENT-SHORT.test.cjs | the source is dropped when covered | proven |
<!-- results:end -->
