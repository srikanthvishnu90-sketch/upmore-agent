# IOU: the IOU log in chat (megadoc C05, D08, D09, D10)

`packages/domain/105-iou-log.js` (`IouLog`) keeps who owes whom, in the person's own words, restated back exactly. A note
only: nothing is paid, requested or sent, nobody else is messaged, and no account is read. Log: "I owe Mom $200", "log
that I owe Mom 200", "I owe $15 to Sam for lunch", "I borrowed 50 from Dad", "Jake owes me 20", "I lent Maya 40 for concert
tickets", "Sam borrowed $30 from me". No amount is asked, never guessed. Settle: "Jake paid me back", "Jake paid me 5"
(part: the rest stays open), "I paid Mom back", "I paid Mom 300" (more than open is said), "mark Mom's 200 as paid"; the
direction must match (Jake paying the person never settles what they owe Jake); two open IOUs with one person ask which.
List: "what do I owe people", "who do I owe", "who still owes me", "how much does Jake owe me", "show my IOUs", each said
as the person's own log, not checked against accounts. Forget: "forget the IOU with Maya". Not this: taxes, a card, rent,
pronouns ("I owe you one"), "pay Mom 200" (a send), "did Jake pay me back" (a question MoneyIn answers from rows).
Stored in `agent_proactive_settings.ious` (`supabase/migrations/20261012050000_ious.sql`, `tests/db/ious.test.sql`): at most
40, a settled one makes room, never a run of 9+ digits, whole cents up to $100,000, owner-only.

Where it runs: `supabase/functions/_shared/proactive.ts` parseCommand (the settings path, before the flows); the flow
router's old "Upmore doesn't keep an IOU log yet" now says an IOU it couldn't read, with the form it reads. Edge test:
`tests/edge/iou.test.ts`. "Who owes me money" stays with the money-owed answer (companies that owe the person).
Check: `node --test tests/depth-IOU.test.cjs && node evals/depth/run.cjs IOU`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Restated with the note | you owe Mom $200.00, nothing paid | `S01` in tests/depth-IOU.test.cjs | the note that nothing moved is dropped | proven (also fails S02, S08, S09, S10, S15, S16) |
| S02 | Owed to the person | Jake owes you $20.00 | `S02` in tests/depth-IOU.test.cjs | owes-me is stored as i-owe | proven (also fails S05, S06, S07, S08, S09, S10, S16, S17, S18, S19) |
| S03 | Other I-owe forms | I borrowed 50 from Dad | `S03` in tests/depth-IOU.test.cjs | the borrowed form is not read | proven |
| S04 | No amount is asked | 'jake owes me money' asks how much | `S04` in tests/depth-IOU.test.cjs | no amount is taken as $20 | proven |
| S05 | What I owe, totaled | $215.00 in all | `S05` in tests/depth-IOU.test.cjs | the total counts both sides | proven (also fails S06) |
| S06 | Who still owes me | Jake and Maya, $60.00 | `S06` in tests/depth-IOU.test.cjs | owed-to-me is never listed | proven |
| S07 | One person only | Jake owes you $20.00 | `S07` in tests/depth-IOU.test.cjs | every IOU is listed for one name | proven |
| S07 | The running balance | Jake $20 and I owe $5: net $15 | `S07` in tests/depth-IOU.test.cjs | both directions are added | proven |
| S08 | Settled stays settled | Jake paid me back marks it paid | `S08` in tests/depth-IOU.test.cjs | the status is never changed | proven (also fails S10, S16) |
| S09 | Part paid | $5 of $20 leaves $15 | `S09` in tests/depth-IOU.test.cjs | a part payment settles it all | proven |
| S10 | Which one is asked | two with Sam: asked | `S10` in tests/depth-IOU.test.cjs | the first is settled | proven |
| S11 | Direction must match | Jake paid me back never settles what I owe Jake | `S11` in tests/depth-IOU.test.cjs | the direction is ignored | proven (also fails S16) |
| S12 | Not a person | 'i owe you one' is not an IOU | `S12` in tests/depth-IOU.test.cjs | pronouns pass as names | proven |
| S13 | Forget one person | only Maya's is forgotten | `S13` in tests/depth-IOU.test.cjs | forget takes every IOU | proven (also fails S18) |
| S14 | Bounded | a full open log refuses | `S14` in tests/depth-IOU.test.cjs | the cap is not checked | proven |
| S14 | No long digit run | an order number is masked | `S14` in tests/depth-IOU.test.cjs | the note keeps digits | proven |
| S15 | The person's relation | my sister is your sister | `S15` in tests/depth-IOU.test.cjs | my is kept | proven |
| S16 | Paid offline, as people say it | sam says he already paid cash settles it | `S16` in tests/depth-IOU.test.cjs | a relayed or cash payment is not read | proven |
| S17 | Who is never a name | who owes me money lists the log | `S17` in tests/depth-IOU.test.cjs | "who owes me money" is not read as the list ask, so it falls to the name forms | proven |
| S18 | Forget one person, never the log | forget what sam owes me forgets Sam's only | `S18` in tests/depth-IOU.test.cjs | the name from the new forms is not read, so the whole log is forgotten | proven |
| S19 | Still owes is a restatement | sam still owes me 40 is not logged twice | `S19` in tests/depth-IOU.test.cjs | 'still owes' logs a second IOU on top | proven |
<!-- results:end -->
