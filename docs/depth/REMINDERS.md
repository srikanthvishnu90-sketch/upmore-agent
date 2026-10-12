# REMINDERS: reminders in chat (megadoc D11 "remind me to pay rent on the 28th")

`packages/domain/103-reminders.js` (`Reminders`) sets a reminder from the person's own words and says it back on the day
they asked for. It never pays, moves or cancels anything, and says so each time. When: "today", "tomorrow", "in 3 days",
"in 2 weeks", "next week", a weekday (the next one, never today), "the 28th" (this month if still ahead, else next),
"Oct 28" or "10/28" (next year once passed), "before the 20th" (the 19th, said as the day before), and "every month on the
28th" (the 31st is a shorter month's last day). No day said is asked about, never guessed; a past or impossible date is
refused. A reminder is said once by its key from 9 a.m. in the person's own time zone; a day the hourly run missed is
said the next day from 9 a.m. with the day and an apology, never later. C24 (Wave 1): a fired reminder also carries
the action its own words name (an annual fee -> the retention offer, CARD-008; a cancellation or subscription ->
the cancel path, subscriptions.cancel; nothing named, nothing invented), and a fired one-off reminder survives
until dismissed — it re-surfaces once a day under its own key ("dismiss the <name> reminder" marks the stored
watch dismissed; "stop" still removes one). "Show my reminders", "stop the reminder to pay
rent", "delete all my reminders". At most 5; a one-off whose day has passed is dropped on the next save; the same one
twice is refused. Stored as a watch of kind "reminder" in `agent_proactive_settings.watches` (no migration: the table's
no-long-digit rule holds, the words keep no run of 9+ digits, the id is base 36), never pushed out by a new watch.
Not this: a route reminder ("... for R2748", the route path), "remind me when Netflix charges me" (a watch, now read as
"tell me when"), and a free trial with its end date (the trial tracker).

Where it runs: `supabase/functions/_shared/proactive.ts` parseCommand (the settings path, before the flows; no direct
answer takes "remind me", `tests/edge/fixtures/direct-asks.json`), plan() (as a watch: asked for, so outside the daily
budget; also for people with nothing linked, who the hourly run now reads when they have a reminder), describe() for
"show my alerts". Edge test: `tests/edge/reminders.test.ts`.
Check: `node --test tests/depth-REMINDERS.test.cjs && node evals/depth/run.cjs REMINDERS`.

Found building it: every "remind me ..." without a route id got "Which route is this reminder for?" from the legacy path
(handler.ts isGenericReminderRequest), so a person could not set a plain reminder at all; "remind me when Netflix charges
me" got the same; and "tell me when Netflix charges me" said twice saved the same watch twice (now "I'm already
watching that").

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Restated with day and hour | the 28th is Wednesday, Oct 28, from 9 a.m. New York time | `S01` in tests/depth-REMINDERS.test.cjs | the zone is dropped from the reply | NOT PROVEN: test passed with the defect in place |
| S02 | A weekday is the next one | monday on a Monday is next Monday | `S02` in tests/depth-REMINDERS.test.cjs | a weekday today is today | NOT PROVEN: test passed with the defect in place |
| S03 | The Nth rolls to next month | the 5th on Oct 12 is Nov 5 | `S03` in tests/depth-REMINDERS.test.cjs | a passed day stays this month | NOT PROVEN: test passed with the defect in place |
| S04 | The 31st in a shorter month | Nov 30 for the 31st | `S04` in tests/depth-REMINDERS.test.cjs | the monthly day is not clamped | NOT PROVEN: test passed with the defect in place |
| S05 | No day is asked | 'remind me to pay rent' is asked when | `S05` in tests/depth-REMINDERS.test.cjs | no day defaults to tomorrow | NOT PROVEN: test passed with the defect in place |
| S06 | Impossible dates refused | feb 30 is refused | `S06` in tests/depth-REMINDERS.test.cjs | the month-day check is dropped | NOT PROVEN: test passed with the defect in place |
| S07 | Before is the day before | before the 20th is the 19th | `S07` in tests/depth-REMINDERS.test.cjs | before is ignored | NOT PROVEN: test passed with the defect in place |
| S08 | From 9 a.m. local | not at 8:59 a.m. | `S08` in tests/depth-REMINDERS.test.cjs | the hour check is dropped | NOT PROVEN: test passed with the defect in place |
| S09 | Once by key | a sent key is not said again | `S09` in tests/depth-REMINDERS.test.cjs | the sent keys are not read | NOT PROVEN: test passed with the defect in place |
| S10 | Missed day caught up once | yesterday's said today, never two days late | `S10` in tests/depth-REMINDERS.test.cjs | the catch-up window is two days | NOT PROVEN: test passed with the defect in place |
| S11 | Said in Upmore's voice | check your refund | `S11` in tests/depth-REMINDERS.test.cjs | my is not turned to your | NOT PROVEN: test passed with the defect in place |
| S12 | A watch is not a reminder | 'remind me when netflix charges me' is a watch | `S12` in tests/depth-REMINDERS.test.cjs | the when guard is dropped | NOT PROVEN: test passed with the defect in place |
| S12 | A trial is the trial tracker's | a trial with its end date is not this | `S12` in tests/depth-REMINDERS.test.cjs | the trial guard is dropped | NOT PROVEN: test passed with the defect in place |
| S12 | A route reminder is the route path's | R2748 is not this | `S12` in tests/depth-REMINDERS.test.cjs | the route guard is dropped | NOT PROVEN: test passed with the defect in place |
| S13 | Stop by its words | stop the reminder to pay rent stops only that one | `S13` in tests/depth-REMINDERS.test.cjs | the term is ignored | patch did not apply |
| S14 | At most 5 | a sixth is refused | `S14` in tests/depth-REMINDERS.test.cjs | the cap is not checked | NOT PROVEN: test passed with the defect in place |
| S14 | Same one twice refused | the same reminder twice is refused | `S14` in tests/depth-REMINDERS.test.cjs | the duplicate check is dropped | NOT PROVEN: test passed with the defect in place |
| S14 | Past one-offs dropped on save | the Oct 1 reminder is dropped | `S14` in tests/depth-REMINDERS.test.cjs | past one-offs are kept | NOT PROVEN: test passed with the defect in place |
| S15 | No long digit run stored | 123456789012 is not stored | `S15` in tests/depth-REMINDERS.test.cjs | the digit scrub is dropped | NOT PROVEN: test passed with the defect in place |
| S16 | Past one-offs hidden | the Oct 1 one is not listed | `S16` in tests/depth-REMINDERS.test.cjs | the past filter is dropped | NOT PROVEN: test passed with the defect in place |
| S16 | The year said | Jan 15, 2027 | `S16` in tests/depth-REMINDERS.test.cjs | the year is never said | NOT PROVEN: test passed with the defect in place |
| S17 | Hours are said not kept | remind me in 2 hours says reminders go out once a day | `S17` in tests/depth-REMINDERS.test.cjs | an hour-based reminder falls into the 'when?' question with its words garbled | NOT PROVEN: test passed with the defect in place |
<!-- results:end -->
