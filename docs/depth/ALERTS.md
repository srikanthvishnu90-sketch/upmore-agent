# ALERTS: what the agent says on its own, and when (packet added for G4)

`packages/domain/59-agent-alerts.js` decides what fires today (low balance ahead, a large or unusual charge, fraud
shapes, a fee, the person's own watches), when it may be said (quiet hours on the person's own clock; safety at once) and
how a busy day is said (one bundle). `plan()` in `supabase/functions/_shared/proactive.ts` reaches it through
`AgentProactive.feed` (`Alerts.run`) and `AgentAlerts.inQuiet`, and turns "tell me when ..." into a watch with
`parseWatch` and `restateWatch`.
Check: `node --test tests/depth-ALERTS.test.cjs && node evals/depth/run.cjs ALERTS`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S05 (found here): quiet hours held the person's own watches with every finding, while the quiet-hours reply promises
  "Only safety alerts and things you asked me to watch come through then". A "tell me when my checking drops below $500"
  that fired at 11 p.m. was held; a charge watch held past midnight was never said at all (watches read today's charges).
  Watches now come through quiet hours; findings and urgent items still wait. D05 plants the old hold back.
- S03 (found building LEDGER): an ATM cash withdrawal fired "Fee: Atm Withdrawal $200.00 ... Banks often reverse a fee
  when asked". The fee rule now matches the word; D03 plants the old rule back.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Quiet hours across midnight | 7:30 a.m. is no longer quiet | `S01` in tests/depth-ALERTS.test.cjs | the end hour itself still counts as quiet | proven (also fails S02) |
| S02 | The person's own clock | 03:00 UTC is 8 p.m. in Los Angeles | `S02` in tests/depth-ALERTS.test.cjs | the UTC hour is used as the person's hour | proven (also fails S01) |
| S03 | A fee alert is for a fee | an ATM withdrawal fires no fee alert | `S03` in tests/depth-ALERTS.test.cjs | the fee rule matches letters inside words, so ATM cash is a fee (the bug found building the LEDGER packet) | proven |
| S04 | Safety at once, the rest in the morning | a fraud shape at 11 p.m. goes out now | `S04` in tests/depth-ALERTS.test.cjs | safety is held with everything else | proven (also fails S14) |
| S05 | Watches come through quiet hours | a balance watch at 11 p.m. is delivered | `S05` in tests/depth-ALERTS.test.cjs | a watch is held like any finding (the bug found building this packet) | proven |
| S06 | Held until 7 a.m. local | held until 11:00 UTC in New York | `S06` in tests/depth-ALERTS.test.cjs | the end hour is taken as UTC | proven |
| S07 | Watches are never bundled | a watch stays its own message beside a bundle | `S07` in tests/depth-ALERTS.test.cjs | a watch is folded into the bundle | proven |
| S08 | Two are said one by one | two ordinary items are not bundled | `S08` in tests/depth-ALERTS.test.cjs | two items make a bundle | proven |
| S09 | The exact number | $1,250.50 is 125050 cents | `S09` in tests/depth-ALERTS.test.cjs | the thousands comma is not removed | proven |
| S10 | Refused, never guessed | 'gas prices go below $3' is not a balance watch | `S10` in tests/depth-ALERTS.test.cjs | 'go below' is read as a balance falling | proven |
| S11 | Available, not the books | $600 with $400 available is below $500 | `S11` in tests/depth-ALERTS.test.cjs | the watch compares the ledger balance | proven |
| S12 | The last 3 days, from the watch's own day | a charge from before the watch was set does not fire; one 5 days old does not either | `S12` in tests/depth-ALERTS.test.cjs | every charge in the rows is read | proven |
| S13 | Usual needs five past charges | two $15 dinners do not make $60 large | `S13` in tests/depth-ALERTS.test.cjs | one past charge sets the usual | proven |
| S14 | Three first-time merchants is safety | three new shops in a day go out as safety | `S14` in tests/depth-ALERTS.test.cjs | four are needed | proven |
| S15 | The person's buffer | under a $500 buffer on Oct 15 | `S15` in tests/depth-ALERTS.test.cjs | the default $100 buffer is always used | proven |
<!-- results:end -->
