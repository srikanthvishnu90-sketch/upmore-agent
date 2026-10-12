# SCHED-SEND: "pay maya 40 tomorrow at 9" (megadoc A08)

`packages/domain/113-scheduled-send.js` (`ScheduledSend`) never sends on its own. At the time the person asked, the hourly
run asks whether to put up the send card, and the card still needs its own yes.

Setting one:
- It is set in chat and restated with the day and time in the person's zone.
- With no am or pm, 7 to 11 is morning and 1 to 6 is afternoon; "tonight" is evening. The reply says which it took.
- A day with no time is 9 a.m.

What it refuses or leaves alone:
- A time already past.
- More than 60 days ahead, or more than 5 at once.
- Amounts outside $0.01 to $10,000.00.
- Rent and bills, repeating sends and sends that wait on a condition keep their own paths.

It can be shown and cancelled by name or all at once, any time before.

The recipient is resolved only when the card goes up, by the send flow, with all its checks. Times are the person's own
clock across daylight-saving changes. It is stored as a watch of kind `scheduled_send` (no migration).

Where it runs:
- In `supabase/functions/_shared/proactive.ts`: `parseCommand` sets it, `plan()` asks the question as an offer (one offer
  per run; it comes through quiet hours because the person asked for it), and `offerMessage` handles the answer.
- Yes runs the send flow on the person's own words, no skips it, and a day late offers nothing.
- Tested in `tests/edge/scheduled-send.test.ts`.

Check: `node --test tests/depth-SCHED-SEND.test.cjs && node evals/depth/run.cjs SCHED-SEND`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Nothing sent without a yes, said | the restating reply says it still needs a yes | `S01` in tests/depth-SCHED-SEND.test.cjs | the yes line is dropped from the reply | proven |
| S02 | Afternoon for 1 to 6 | at 3 is 3 PM | `S02` in tests/depth-SCHED-SEND.test.cjs | a bare hour is always morning | proven |
| S03 | Minutes kept | 6:30pm is 18:30 | `S03` in tests/depth-SCHED-SEND.test.cjs | minutes are dropped | proven |
| S04 | Tonight is evening | tonight at 8 is 8 PM | `S04` in tests/depth-SCHED-SEND.test.cjs | tonight is read as today | proven |
| S05 | Today's weekday is next week's | monday on a Monday is next Monday | `S05` in tests/depth-SCHED-SEND.test.cjs | today's weekday is today | proven |
| S06 | m/d read month first | 10/14 is Oct 14 | `S06` in tests/depth-SCHED-SEND.test.cjs | m/d is read day first | proven |
| S07 | No time is 9 a.m., said | tomorrow alone says the morning | `S07` in tests/depth-SCHED-SEND.test.cjs | no time is midnight | proven |
| S08 | Time with no day | 9am after 9am is tomorrow | `S08` in tests/depth-SCHED-SEND.test.cjs | a bare time is always today | proven |
| S09 | A past time is refused | today at 9am at 11am is refused | `S09` in tests/depth-SCHED-SEND.test.cjs | a past time is saved and fires at once | proven |
| S10 | 60 days at most | Dec 20 is refused | `S10` in tests/depth-SCHED-SEND.test.cjs | there is no far limit | proven (also fails S06) |
| S11 | The amount cap | $20,000 is refused | `S11` in tests/depth-SCHED-SEND.test.cjs | no upper bound | proven |
| S12 | Rent and bills keep their paths | pay my rent tomorrow is not this | `S12` in tests/depth-SCHED-SEND.test.cjs | rent and bills are caught as sends | proven |
| S13 | Cancel by name | cancel the one to maya keeps jake's | `S13` in tests/depth-SCHED-SEND.test.cjs | cancel drops every scheduled send | proven |
| S14 | At most 5 | a sixth is refused | `S14` in tests/depth-SCHED-SEND.test.cjs | there is no limit | proven |
| S15 | Never a day late | 25 hours after is not asked | `S15` in tests/depth-SCHED-SEND.test.cjs | a missed question is asked any time later | proven |
| S16 | The person's clock across DST | Nov 2 9am is 14:00 UTC | `S16` in tests/depth-SCHED-SEND.test.cjs | the offset is taken once at today's offset | proven (also fails S08) |
<!-- results:end -->
