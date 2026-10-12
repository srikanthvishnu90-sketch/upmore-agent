# PROACTIVE: what the agent raises on its own, and in what order (packet added for G4)

`packages/domain/56-agent-proactive.js` (`AgentProactive.feed`) runs the monitors, the save engine and the alerts over
the person's rows and turns what they find into the loop's inputs: safety, the person's own watches, and findings, each
with the reason the person cares and a real deadline when there is one, in order (money at risk first, then the sooner
deadline, then the larger amount). `plan()` in `supabase/functions/_shared/proactive.ts` takes the findings in that
order, lets one unrequested finding a day through `AgentLoop.budgetAllows` (four a week; a real deadline within two days,
safety and the person's watches are exempt), and turns a `trial_converting:<id>:<date>` finding into "Should I cancel it
for you? Reply YES or NO."; nothing is cancelled without that yes (`offerMessage`). The Deno bundle carries no earn
engine and no news brain, so the test loads exactly the modules `plan()` runs with.
Check: `node --test tests/depth-PROACTIVE.test.cjs && node evals/depth/run.cjs PROACTIVE`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S14 (found here): one overdraft fee was three findings (the monitors' `bank_fee`, the save engine's `fee_refund`, and
  on the day itself the alerts' `fee`), so the one-a-day budget spent consecutive days saying the same $35 fee
  ("$35.00 bank fee ... Upmore can write the request" on day 0, "$35.00 overdraft fee. Want the refund request
  drafted?" on day 1). A finding whose charges are all cited by one already kept is now dropped, keeping the
  longest-lived source so the key the person was told under is the one that comes back. A rent rise was the same (the
  alerts' `bill_increase` and the monitors' `price_rise`); the testing agent's F:ALRT-004 now asks for it exactly once
  under either key. D14 plants the old behavior.
- S13 (found here): the fraud check read the finding's words, which carry the merchant's descriptor, so a merchant
  named "UNAUTHORIZED USE GUARD" turned a new-subscription note into a safety alert (safety skips quiet hours and the
  budget, so it would go out at 3 a.m.). The check now reads the rule that fired. D13 plants the old check.
- S16 (found here, fixed in merge review): the feed handed the monitors `accounts_live`, which `plan()` never sets, and
  the monitors read dollar balances while the feed's accounts are in cents, so the deposit-insurance check never ran:
  a $312,500 savings balance was never mentioned. USD checking and savings now reach it in dollars, with their source
  and as-of, and the finding says "Balance per <source>, as of <time> UTC." Brokerage accounts and cash sweeps never do.
  D16 and D16b plant the missing path and an every-account path; tests/edge/proactive.test.ts checks it through plan().

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | A trial's end is a real deadline | a trial ending in 2 days gets through a spent budget | `S01` in tests/depth-PROACTIVE.test.cjs | trial_converting is left out of the deadline kinds, so the warning waits behind the budget | proven (also fails S10) |
| S02 | The key the cancel offer is built on | the key is trial_converting:sub-9:2026-10-14 | `S02` in tests/depth-PROACTIVE.test.cjs | monitor keys are namespaced like save: and earn:, so plan() no longer sees a trial and never asks "should I cancel it for you?" | proven (also fails S01, S03, S04, S05, S06, S09, S10, S13, S16) |
| S03 | A new subscription is not a deadline | MAX.COM billing tomorrow still waits for the budget | `S03` in tests/depth-PROACTIVE.test.cjs | new_subscription is added to the deadline kinds | proven |
| S04 | The dispute-by date is a deadline | a duplicate due for dispute tomorrow gets through | `S04` in tests/depth-PROACTIVE.test.cjs | duplicate_charge is left out of the deadline kinds | proven |
| S05 | Amounts to the cent | $16.99 is 1699 | `S05` in tests/depth-PROACTIVE.test.cjs | dollars are floored into cents, so $16.99 is 1698 | proven |
| S06 | The reason is the rule | the trial's reason is 'A trial you track, ending within 7 days.' | `S06` in tests/depth-PROACTIVE.test.cjs | the finding's kind is given as its reason | proven |
| S07 | Offers never act without the person | the cancel offer says you approve it first | `S07` in tests/depth-PROACTIVE.test.cjs | the cancel offer promises to do it (a cancel without a yes) | proven |
| S08 | A one-time saving carries its amount | a $35 fee refund is 3500 | `S08` in tests/depth-PROACTIVE.test.cjs | only the monthly saving is read, so a one-time refund is $0 | proven (also fails S11) |
| S09 | Money at risk first | a duplicate charge outranks a renewal due sooner | `S09` in tests/depth-PROACTIVE.test.cjs | the priority is left out of the order | proven |
| S10 | Sooner deadline first | the trial before the dispute | `S10` in tests/depth-PROACTIVE.test.cjs | the deadline order is reversed | proven |
| S11 | Larger amount first | $35 before $12 | `S11` in tests/depth-PROACTIVE.test.cjs | the amount order is reversed | proven |
| S12 | Fraud shapes stay safety | three first-time merchants are safety | `S12` in tests/depth-PROACTIVE.test.cjs | the alerts' safety items are queued as findings | proven |
| S13 | A merchant's words are not a fraud shape | UNAUTHORIZED USE GUARD stays a finding | `S13` in tests/depth-PROACTIVE.test.cjs | the finding's words are scanned, descriptor included (the bug found building this packet) | proven |
| S14 | One charge, one finding | an overdraft fee is said once | `S14` in tests/depth-PROACTIVE.test.cjs | findings citing the same charge are all kept (the bug found building this packet) | proven (also fails S11) |
| S15 | The person's large-charge line | $60 is over a $50 line | `S15` in tests/depth-PROACTIVE.test.cjs | the person's line is not passed to the alerts | proven |
| S15 | The person's quiet hours | at 11 p.m. the large charge is held | `S15` in tests/depth-PROACTIVE.test.cjs | quiet hours are not passed to the alerts | proven |
| S15 | The person's watches | a balance watch fires | `S15` in tests/depth-PROACTIVE.test.cjs | the person's watches are not passed to the alerts | proven |
| S16 | Deposits reach the insurance check | a $312,500 savings balance is flagged with its source and as-of; a brokerage is not | `S16` in tests/depth-PROACTIVE.test.cjs | the feed hands the monitors no accounts (the path found missing building this packet) | proven |
| S16 | Only deposits are insured | a $400,000 brokerage cash sweep is never called over the deposit-insurance limit | `S16` in tests/depth-PROACTIVE.test.cjs | every account kind is handed to the insurance check | proven |
| S17 | Each fee is its own offer | two overdraft fees are two keys | `S17` in tests/depth-PROACTIVE.test.cjs | a fee refund offer is keyed by kind only, so a later fee is never said | proven |
<!-- results:end -->
