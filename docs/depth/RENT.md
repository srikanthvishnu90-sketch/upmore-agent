# RENT: monthly rent as a standing flow (real-world C110, spec 16 S16-15; packet added for G4)

The owner's automation rule applied to rent (packages/domain/81-standing-rent.js): the standing rule is restated in
exact terms (who, how much, which day, which app, from which account) and saved only on a yes; every month's card asks
for its own yes; each month is STAGED for the person to send in their own app (Upmore never moves the money); every
card expires in 10 minutes; "stop rent" turns it off in one message; a rent change is restated on a card; the scheduler
side (`dueSoon`) only says when a month's card is due to be offered. Nothing moves without a yes.
Check: `node --test tests/depth-RENT.test.cjs && node evals/depth/run.cjs RENT`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Rent words route to rent, a memo stays a send | 'pay sam 900 for rent' is not the rent flow | `S01` in tests/depth-RENT.test.cjs | any words may sit between the verb and 'rent' | proven |
| S02 | The terms from the words | 1.5k is $1,500.00 | `S02` in tests/depth-RENT.test.cjs | the k is ignored | proven |
| S03 | Only what is missing is asked | no day -> asked, no card | `S03` in tests/depth-RENT.test.cjs | a missing day is assumed to be the 1st | proven |
| S04 | The setup card saves nothing | a card drains no write; the yes inserts the exact row | `S04` in tests/depth-RENT.test.cjs | the rule is saved when the card goes up, before the yes | proven (also fails S05, S12) |
| S05 | NO saves nothing | NO on setup and on change writes nothing | `S05` in tests/depth-RENT.test.cjs | a NO on a setup or change card is taken as the yes | proven |
| S06 | Next month's card past the due day | on Oct 29 the card is November's, due Nov 1 | `S06` in tests/depth-RENT.test.cjs | next month is 30 days after this month's due day | proven (also fails S07, S08, S09, S12, S13) |
| S07 | Staged, never sent | the staged reply says the person sends it | `S07` in tests/depth-RENT.test.cjs | the staged reply claims the rent was sent | proven |
| S08 | A late month, never before the rule | a rule set up on the 2nd is not offered October | `S08` in tests/depth-RENT.test.cjs | the rule's start date is not checked | proven |
| S09 | Never staged twice | a month the table says is staged is not carded again | `S09` in tests/depth-RENT.test.cjs | only this session's staged list is checked, not the saved month | proven |
| S10 | Stop rent in one message | the stopped status is written | `S10` in tests/depth-RENT.test.cjs | stop turns it off in memory only | proven |
| S11 | A change is restated | $1,450 to $1,500 is a change card | `S11` in tests/depth-RENT.test.cjs | the amount is not compared, so a new amount is 'already your rent' | proven (also fails S05) |
| S12 | 10-minute cards | a yes 11 minutes later stages nothing | `S12` in tests/depth-RENT.test.cjs | cards last an hour | proven |
| S13 | Stop-on-change before staging | a new amount since the card stops the stage | `S13` in tests/depth-RENT.test.cjs | the amount is not re-checked at the yes | proven |
| S14 | The scheduler only says when | a staged month is not offered again | `S14` in tests/depth-RENT.test.cjs | the staged month is not checked | proven |
| S15 | The 1st to the 28th | the 31st is asked again | `S15` in tests/depth-RENT.test.cjs | any day of the month is accepted | proven |
| S16 | The payee after pay | pay mike on zelle names Mike | `S16` in tests/depth-RENT.test.cjs | only 'to' names the payee, so 'pay mike' asks who | proven |
<!-- results:end -->
