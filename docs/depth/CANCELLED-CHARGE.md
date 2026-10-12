# CANCELLED-CHARGE: "I got charged for something I cancelled" (megadoc J08)

`packages/domain/104-cancelled-charge.js` (`CancelledCharge`) answers "I got charged for something I cancelled",
"Netflix charged me after I cancelled", "I cancelled Hulu on Sep 20 but they still charged me" and "still being billed for
Planet Fitness even though I cancelled" from the person's own rows, read-only. The cancel day comes from the cancel flow's
own record (cancelled, verified or accepted: the merchant's record, with its confirmation) in the person's own day, or from
the day they say ("on Sep 20", "9/20", "in August" = after Aug 31, "last month", "2 weeks ago" with slack). Charges from that
merchant (whole words, or run together across whole words; never inside a longer word) posted after it are listed to the
cent; one within 2 days may have been made before the cancel and is said so, never called a yes. With no cancel day on
file or said, the last 90 days of charges are listed and the day is asked. A cancel the merchant never confirmed is never
called cancelled. With no service named: the only one cancelled with Upmore, or asked. The next step is the merchant
first, in a draft the person sends, then the dispute flow by name; nothing is sent. Disputes, trials, win-back offers,
"how do I cancel" and plain charge questions go on to their own answers.

Where it runs: kind "cancelled" in `supabase/functions/agent-chat/_shared/money_answers.ts` (before refund and charge),
the cancel records read by `readCancellations` (win_back_answer.ts); `tests/edge/megadoc-money-asks.test.ts`.
Check: `node --test tests/depth-CANCELLED-CHARGE.test.cjs && node evals/depth/run.cjs CANCELLED-CHARGE`.

Found building it: the shared `termMatch` (80-money-answers.js) matches a name squashed inside any longer text ("hulu" in
"HULULAND"); this module uses its own whole-token match (S10). The cancel flow tracks charges after its own cancels
("zombie"), but nothing answered the person's question on ask, or for a cancel they made themselves.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | From the cancel record | Netflix $15.49 on Oct 5 after Sep 20, confirmation NF-88A | `S01` in tests/depth-CANCELLED-CHARGE.test.cjs | the record's confirmation is dropped | proven |
| S02 | The day the person says | on Sep 10 / 9/10 | `S02` in tests/depth-CANCELLED-CHARGE.test.cjs | a day not yet come stays this year | proven |
| S03 | A month is the whole month | in August = after Aug 31 | `S03` in tests/depth-CANCELLED-CHARGE.test.cjs | a month counts from its first day | proven |
| S04 | Within 2 days is not a yes | Sep 22 after a Sep 20 cancel | `S04` in tests/depth-CANCELLED-CHARGE.test.cjs | the lag window is dropped | proven (also fails S12, S14) |
| S05 | Pending said apart | a pending Spotify $11.99 | `S05` in tests/depth-CANCELLED-CHARGE.test.cjs | pending rows are not read | proven |
| S06 | No day is asked | Hulu's charges listed and the day asked | `S06` in tests/depth-CANCELLED-CHARGE.test.cjs | no day is taken as 30 days ago | proven (also fails S07) |
| S07 | Unconfirmed is never cancelled | not_confirmed is said | `S07` in tests/depth-CANCELLED-CHARGE.test.cjs | any record's date is used | proven |
| S08 | Two cancelled: asked | Netflix and Hulu with me: which | `S08` in tests/depth-CANCELLED-CHARGE.test.cjs | the first record is taken | proven |
| S09 | Draft first, nothing sent | the message to Netflix and the dispute named | `S09` in tests/depth-CANCELLED-CHARGE.test.cjs | the draft is dropped | proven |
| S10 | Whole words | Hulu is not HULULAND | `S10` in tests/depth-CANCELLED-CHARGE.test.cjs | the name may sit inside a word | proven |
| S11 | Disputes and trials go on | 'dispute the netflix charge i cancelled' is not this | `S11` in tests/depth-CANCELLED-CHARGE.test.cjs | the not-this guard is dropped | proven |
| S11 | A name after the verb | 'why is hulu still charging me' finds hulu | `S11` in tests/depth-CANCELLED-CHARGE.test.cjs | the charging-me form is not read | proven (also fails S03, S07) |
| S12 | The person's own day | 10 p.m. Sep 20 in New York is Sep 20 | `S12` in tests/depth-CANCELLED-CHARGE.test.cjs | the cancel day is UTC's | proven (also fails S01, S09, S13) |
| S13 | Charges only | a credit, a transfer, EUR are not charges | `S13` in tests/depth-CANCELLED-CHARGE.test.cjs | credits count | proven |
| S14 | Rough days have slack | Sep 30 after '2 weeks ago' is maybe before | `S14` in tests/depth-CANCELLED-CHARGE.test.cjs | no slack for a rough day | proven |
| S15 | Source line | every answer ends with its source | `S15` in tests/depth-CANCELLED-CHARGE.test.cjs | the source line is dropped | proven (also fails S09) |
<!-- results:end -->
