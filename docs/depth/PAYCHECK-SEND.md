# PAYCHECK-SEND: "pay maya 40 but only if my paycheck landed" (megadoc A15)

`packages/domain/115-paycheck-send.js` (`PaycheckSend`) reads the send and its paycheck condition apart, and reads the
person's own rows to see whether a paycheck landed. A paycheck is a posted payroll, direct deposit, salary or paycheck
credit; refunds, transfers, pending rows and charges never count.

- **Landed** (today or yesterday in the person's day): it's said with the deposit, then the send flow's own card goes up
  and needs its yes.
- **Not yet:** the send is saved as a watch. When a paycheck posts on or after the day it was set up, the hourly run asks
  once, "Want the card?". The yes runs the send flow on the person's words. A send waiting more than 35 days lapses.

Upmore never sends on its own. It can be cancelled by name or all at once, and shown. Other conditions ("if it rains"),
times (the scheduled send's), rent and bills keep their own paths. Amounts are $0.01 to $10,000.00. Stored as a watch of
kind `paycheck_send` (no migration).

Where it runs:
- `agent-chat/_shared/paycheck_send.ts`, before the settings commands and the flows: the rows read, the watch saved, the
  send flow run when it landed.
- `plan()` and `parseCommand` in `_shared/proactive.ts`: the question, and cancel or show.
- Tested in `tests/edge/paycheck-send.test.ts`.

Check: `node --test tests/depth-PAYCHECK-SEND.test.cjs && node evals/depth/run.cjs PAYCHECK-SEND`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Send and condition apart | the command is pay maya 40 | `S01` in tests/depth-PAYCHECK-SEND.test.cjs | the condition stays in the command | proven (also fails S02, S08, S10, S13) |
| S02 | Payday words | after payday is a paycheck condition | `S02` in tests/depth-PAYCHECK-SEND.test.cjs | only 'paycheck' is read | proven |
| S03 | Rent is not this | pay rent when my paycheck lands is not this | `S03` in tests/depth-PAYCHECK-SEND.test.cjs | rent and bills are read as a person | proven |
| S04 | Today or yesterday | Oct 10 has not landed on Oct 12 | `S04` in tests/depth-PAYCHECK-SEND.test.cjs | any recent paycheck counts as landed | proven |
| S05 | The latest | Oct 9 is the latest | `S05` in tests/depth-PAYCHECK-SEND.test.cjs | the oldest is said | proven |
| S06 | Only payroll, posted | a pending payroll does not count | `S06` in tests/depth-PAYCHECK-SEND.test.cjs | pending rows count | proven |
| S07 | Direct deposit | DIR DEP is payroll | `S07` in tests/depth-PAYCHECK-SEND.test.cjs | only PAYROLL is read | proven |
| S08 | The person's day | 10 p.m. New York is Oct 12 | `S08` in tests/depth-PAYCHECK-SEND.test.cjs | the UTC day is stored | proven |
| S09 | Only a new paycheck | Oct 9 before an Oct 12 set-up is not due | `S09` in tests/depth-PAYCHECK-SEND.test.cjs | an older paycheck fires the question | proven |
| S10 | The offer carries the words | command pay maya 40 | `S10` in tests/depth-PAYCHECK-SEND.test.cjs | the offer carries no command | proven |
| S11 | Once | a sent key is not asked again | `S11` in tests/depth-PAYCHECK-SEND.test.cjs | sent keys are ignored | proven |
| S12 | Lapse at 35 days | Nov 20 says nothing | `S12` in tests/depth-PAYCHECK-SEND.test.cjs | a watch never lapses | proven |
| S13 | Cancel by name | cancel the one to maya keeps jake's | `S13` in tests/depth-PAYCHECK-SEND.test.cjs | cancel drops all | proven |
| S14 | The amount cap | $20,000 is refused | `S14` in tests/depth-PAYCHECK-SEND.test.cjs | no upper bound | proven |
| S15 | Tonight's row counts | a row dated tomorrow UTC has landed | `S15` in tests/depth-PAYCHECK-SEND.test.cjs | tomorrow-dated rows are ignored | proven |
<!-- results:end -->
