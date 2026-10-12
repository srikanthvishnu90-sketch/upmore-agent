# LATE-FEE: "set a late fee alert for bills" (megadoc D15)

`packages/domain/112-late-fee-watch.js` (`LateFeeWatch`) is a watch the person turns on in chat. The reply restates its
terms: what it watches, from when, from where it reads, that it only tells, and how to stop it. It is stored as a watch of
kind `late_fee` in `agent_proactive_settings.watches` (no migration).

From then on, the hourly run says each charge the bank's own words call a late fee, once:
- What qualifies: "LATE FEE", "LATE PAYMENT FEE", "LATE CHARGE" or "LATE PMT FEE", posted on or after the day the alert
  was set.
- What the message gives: the amount to the cent, the bank's words, the account and the date, with the bank's source and
  as-of.
- What never counts: pending rows, credits, reversals, waivers, and words like "Late Night Tacos" that only start with
  "late".

It only tells. Nothing is paid, disputed or asked of the bank. Bank rows are saved only when the person refreshes their
connected bank, so a fee is seen after the refresh that brings it in, and the set reply says so.

Where it runs:
- `parseCommand` and `plan()` in `supabase/functions/_shared/proactive.ts` (log key `latefee:<row id>`; a watch, outside
  the daily budget).
- Tested in `tests/edge/late-fee.test.ts`.

Check: `node --test tests/depth-LATE-FEE.test.cjs && node evals/depth/run.cjs LATE-FEE`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Terms restated | the set reply says it only tells and how to stop | `S01` in tests/depth-LATE-FEE.test.cjs | the reply drops the terms | proven |
| S02 | One alert | a second set changes nothing | `S02` in tests/depth-LATE-FEE.test.cjs | every set adds another watch | proven |
| S03 | The bank's words | LATE PAYMENT FEE and LATE CHARGE are late fees | `S03` in tests/depth-LATE-FEE.test.cjs | only the exact words LATE FEE are read | proven (also fails S05, S12, S15) |
| S04 | Only since it was set | an Oct 1 fee before the Oct 5 alert is not said | `S04` in tests/depth-LATE-FEE.test.cjs | every late fee ever is said when the alert is turned on | proven |
| S04 | A reversal is not a fee | LATE FEE REVERSAL is not said | `S04` in tests/depth-LATE-FEE.test.cjs | a reversal's words are read as a fee | proven |
| S05 | Said once | a fee already sent is not said again | `S05` in tests/depth-LATE-FEE.test.cjs | the sent keys are ignored | proven (also fails S13) |
| S06 | A stopped alert is silent | status stopped says nothing | `S06` in tests/depth-LATE-FEE.test.cjs | a stopped watch still counts | proven |
| S07 | The person's own day | 10 p.m. New York is Oct 12 | `S07` in tests/depth-LATE-FEE.test.cjs | the UTC day is used | proven |
| S08 | No 9-digit run stored | the id carries 8 digits | `S08` in tests/depth-LATE-FEE.test.cjs | the id carries the clock in milliseconds | proven |
| S09 | Stop words | stop telling me about late fees stops it | `S09` in tests/depth-LATE-FEE.test.cjs | only 'stop the late fee alert' is read | proven |
| S10 | Off says how to turn it on | do i have a late fee alert, when off | `S10` in tests/depth-LATE-FEE.test.cjs | the off case says it is on | proven |
| S11 | No account name, no 'on' | a row without an account says no account | `S11` in tests/depth-LATE-FEE.test.cjs | the account is always said | proven |
| S12 | Description fallback | the description carries LATE PAYMENT FEE | `S12` in tests/depth-LATE-FEE.test.cjs | only the merchant field is read | proven |
| S13 | A stable key | a row without an id has one key | `S13` in tests/depth-LATE-FEE.test.cjs | a row without an id gets a key from the clock, so it repeats | proven |
| S14 | Questions are not commands | did i get a late fee is not a set | `S14` in tests/depth-LATE-FEE.test.cjs | any message naming a late fee turns the alert on | proven (also fails S06) |
| S15 | Words tidied | spaces collapsed, 60 characters | `S15` in tests/depth-LATE-FEE.test.cjs | the bank's words are passed raw | proven |
<!-- results:end -->
