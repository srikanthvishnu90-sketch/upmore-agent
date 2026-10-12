# MONEY-PLANS: requests, scheduled and recurring sends, transfers, autosave and household rules (packet added for G4)

`packages/domain/60-agent-money-plans.js` (`AgentMoneyPlans`) is the pure half of money plans (spec docs 06, 07, 02:
PAY-003/007/008/009/023/025, SAVE-001/006, SOC-002/005/006/008/010): a request for money staged on the person's own rail,
a scheduled payment with its cutoff, an own-account transfer that never overdraws, autosave rules (round-ups, payday and
threshold sweeps) that keep a floor, the overdraft-prevention move, failed-payment triage, allowances under a monthly cap,
group expenses, shared goals, gifts, the off-by-default settled-debts feed and household roles. Every plan is a loop
request with exact confirm fields; nothing here moves money.

Reachability: **not yet imported by any edge or app path.** No build script bundles it (`scripts/build-router-core.py`,
`scripts/build-financial-core.py` and `src/build-app.py` leave it out) and nothing under `supabase/functions` or
`src/upmore-app-template.html` calls it; only its file path appears, as data, in the registry carried by the router
bundle. These tests pin the module itself, with the recipient layer (42), money math (48), group settling (54) and the
ledger's forecast (57) it loads beside it.
Check: `node --test tests/depth-MONEY-PLANS.test.cjs && node evals/depth/run.cjs MONEY-PLANS`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S01 (found here): rails were said by their ids: "Paypal request to ...", "by CASH_APP", "by VENMO". Now "PayPal",
  "Cash App", "Venmo", "Zelle", "ACH". D01 plants the uppercased ids back.
- S02 (found here): "2027-02-30" was scheduled ("Scheduled: ... on 2027-02-30"), and the send compares that string with
  today, so it would never go; "11/02/2026" threw a RangeError. Both now ask "Which date? I could not read that as a
  calendar day." D02 drops the check.
- S03 (found here): one $20.00 credit settled every open $20.00 request from the same person ("Maya Mock paid the
  $20.00 ..." twice). A credit now settles one request. D03 plants the old match.
- S04 (found here): round-ups counted pending purchases, which are rounded again when they post. Posted only now. D04.
- S05 (found here): with nothing in savings the overdraft move was "Moving $0.00 from savings by ..." with a $0.00
  transfer put up for a yes. Now it says savings has $0.00 available and how short checking is, and asks for nothing. D05.
- S06 (found here): a monthly allowance on the 29th-31st skipped every shorter month (the 31st: five months a year). It now
  goes on the month's last day, leap years included. D06.
- S07 (found here): a shared goal's monthly amounts were rounded to nearest, so "gets there by" was a cent short per
  share ($33.34 over three months as $11.11). Rounded up now. D07.
- S08 (found here): a gift without an amount said "$NaN.NaN to Sarah ...". It asks "How much?" now. D08.
- S09 (found here): the allowance text promised "Inside an envelope it runs with a receipt each time", which shipped
  code never does (envelope autonomy stays off; every send asks), and said "weekly on day 5". Now "every Friday ... I
  ask for your yes before each send." D09 plants the old promise back.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Rails said by their names | "PayPal request", "by Cash App", "by Venmo" | `S01` in tests/depth-MONEY-PLANS.test.cjs | the rail id is uppercased instead of named, so the person reads "PAYPAL" and "CASH_APP" (the bug found building this packet, with "Paypal" before) | proven (also fails S09) |
| S02 | Only calendar days are scheduled | 2027-02-30 and 11/02/2026 are asked about | `S02` in tests/depth-MONEY-PLANS.test.cjs | the calendar check is dropped: 2027-02-30 is scheduled for a day that never comes and 11/02/2026 throws (the bug found building this packet) | proven |
| S03 | One credit settles one request | two $20.00 requests, one $20.00 payment: one stays open | `S03` in tests/depth-MONEY-PLANS.test.cjs | a credit already used is not set aside, so it settles every request of the same amount (the bug found building this packet) | proven |
| S04 | Round-ups on posted purchases | a pending $3.10 is not rounded up | `S04` in tests/depth-MONEY-PLANS.test.cjs | pending charges are rounded up, then rounded again when they post (the bug found building this packet) | proven |
| S05 | No $0.00 overdraft move | empty savings asks for nothing | `S05` in tests/depth-MONEY-PLANS.test.cjs | the empty-savings stop uses < 0, so a $0.00 transfer is put up for confirmation (the bug found building this packet) | proven |
| S06 | Short months still get the allowance | the 31st goes on Nov 30; the 29th on Feb 28, 2027 | `S06` in tests/depth-MONEY-PLANS.test.cjs | the day is compared as written, so a 31st allowance skips five months a year (the bug found building this packet) | proven |
| S07 | The goal's monthly amounts get there | $33.34 over 3 months is $11.12 a month | `S07` in tests/depth-MONEY-PLANS.test.cjs | the monthly amount is rounded to nearest, a cent short of the share (the bug found building this packet) | proven |
| S08 | A gift asks how much | no amount asks "How much?" | `S08` in tests/depth-MONEY-PLANS.test.cjs | the gift has no amount guard, so it says "$NaN.NaN" (the bug found building this packet) | proven |
| S09 | An allowance waits for a yes | "I ask for your yes before each send." | `S09` in tests/depth-MONEY-PLANS.test.cjs | the allowance promises to run inside an envelope with only a receipt, which shipped code never does (envelope autonomy is off; the bug found building this packet) | proven |
| S10 | Never overdraws, all of it allowed | $1,420.00 of $1,420.00 available moves | `S10` in tests/depth-MONEY-PLANS.test.cjs | the overdraw check uses >=, so moving exactly what is there is refused | proven |
| S11 | The ACH cutoff skips the weekend | Monday Nov 2 cuts off Friday Oct 30 | `S11` in tests/depth-MONEY-PLANS.test.cjs | Saturday is counted as a business day | proven |
| S11 | The cutoff day still cancels | cancel on Oct 30 works | `S11` in tests/depth-MONEY-PLANS.test.cjs | the cutoff day itself is treated as in flight | proven |
| S12 | Reminders keep their pace | the friendly nudge comes on day 7 | `S12` in tests/depth-MONEY-PLANS.test.cjs | the wait uses <=, so every reminder comes a day late | proven |
| S12 | The first reminder is the first line | "Hey Sarah, when you get a sec" first | `S12` in tests/depth-MONEY-PLANS.test.cjs | the line index is off by one, so the first nudge reads like the second | proven |
| S13 | A retry is a new key | the retry key ends :retry:2026-10-12 | `S13` in tests/depth-MONEY-PLANS.test.cjs | the retry reuses the original key (a blind resend the loop would call already done) | proven |
| S14 | A sweep keeps the floor | $2,000.00 from $1,420.00 with a $1,000.00 floor is $420.00 | `S14` in tests/depth-MONEY-PLANS.test.cjs | the floor is checked against the balance before the move, not after | proven |
| S15 | Percent to the cent, half up | 10 percent of $1,234.55 is $123.46 | `S15` in tests/depth-MONEY-PLANS.test.cjs | the percent is floored, so it is $123.45 | proven |
| S16 | Who is owed and who owes | "me is owed $200.00" | `S16` in tests/depth-MONEY-PLANS.test.cjs | a member's share is added to what they are owed instead of taken off | proven |
| S17 | A teen's limit is inclusive | $25.00 on a $25.00 limit is allowed | `S17` in tests/depth-MONEY-PLANS.test.cjs | the limit check uses >=, so the limit itself is refused | proven |
| S18 | The feed needs a real yes | a stored "false" stays off | `S18` in tests/depth-MONEY-PLANS.test.cjs | any truthy setting turns the feed on | proven |
| S19 | The monthly cap is inclusive | $40.00 + $20.00 fits $60.00 | `S19` in tests/depth-MONEY-PLANS.test.cjs | the cap check uses >=, so the last allowed send is skipped | proven |
<!-- results:end -->
