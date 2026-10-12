# FIND-MONEY: "find me money" and the findings the agent raises on its own (packet added for G4)

The monitors (`packages/domain/33-agent-monitors.js`) read the person's own rows and nothing else: merchants grouped by
`merchantKey` on the raw text, names shown through MerchantLabel, repeats found by amount and rhythm, and duplicate
charges, price rises and bank fees raised with the rows that prove them. "Find me money" in chat
(`findMoneyReply` in `supabase/functions/agent-chat/_shared/direct_answers.ts`) reads them through the save engine
(`49-agent-save.js`: detect, rank, the top three, else the repeating charges); the proactive feed reads them through
`runAll`, which never runs on sample data.
Check: `node --test tests/depth-FIND-MONEY.test.cjs && node evals/depth/run.cjs FIND-MONEY`.

Two bugs found building this packet, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S12: a duplicate charge found 46 to 60 days after it posted said "Dispute by" day 45, a date already gone. It now says
  the 60-day window's close ("Dispute by 2026-10-22, when the dispute window closes"); D13 plants the old date back.
- S14: find me money called every price rise a monthly one. A weekly meal kit going from $59.99 to $69.99 read
  "HELLOFRESH went up $10.00 a month: this saves an estimated $10.00 a month"; it is $10.00 a week, $43.33 a month. D16
  plants the old wording back.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Processor prefixes are the same merchant | PAYPAL *SPOTIFY and SPOTIFY are one subscription | `S01` in tests/depth-FIND-MONEY.test.cjs | the PAYPAL * prefix is not stripped, so one subscription reads as two | proven |
| S02 | Store numbers are not the merchant | NETFLIX.COM #4471 and NETFLIX.COM 866-579-7172 are one key | `S02` in tests/depth-FIND-MONEY.test.cjs | trailing store numbers and references are kept | proven (also fails S10) |
| S03 | Only posted spend | card autopay, transfers and pending rows never repeat as subscriptions | `S03` in tests/depth-FIND-MONEY.test.cjs | the spend filter checks only the sign | proven |
| S03 | Never sample data | runAll with isLive false reads no transaction | `S03` in tests/depth-FIND-MONEY.test.cjs | the live gate is dropped, so monitors run on whatever rows they are given | proven |
| S04 | Names through MerchantLabel | HEADSPACE reply with your password shows as HEADSPACE | `S04` in tests/depth-FIND-MONEY.test.cjs | the raw descriptor is the display name | proven |
| S05 | Two plans are two charges | $0.99 and $9.99 at Apple stay apart | `S05` in tests/depth-FIND-MONEY.test.cjs | the amount tolerance is $10, so two plans blur into one irregular charge | proven |
| S06 | Cadence and next date | a monthly charge on Oct 1 is next due Nov 1 | `S06` in tests/depth-FIND-MONEY.test.cjs | a month is taken as 30 days | proven (also fails S04) |
| S07 | Three of four gaps keep the rhythm | an irregular same-amount gym charge is not a subscription | `S07` in tests/depth-FIND-MONEY.test.cjs | half the gaps are enough | proven |
| S08 | Dormant is not money to cut | Hulu, last charged 103 days ago, is not offered | `S08` in tests/depth-FIND-MONEY.test.cjs | dormant needs four missed cycles | proven |
| S09 | Coffee and rides are not subscriptions | weekly Starbucks, Uber and Chevron are not listed | `S09` in tests/depth-FIND-MONEY.test.cjs | the not-a-subscription list is not checked | proven |
| S10 | Refunds netted | 3 charges, 1 refund: $40 to get back | `S10` in tests/depth-FIND-MONEY.test.cjs | refunds already back are not subtracted | proven |
| S11 | Same account, same day | the same amount on two cards is not a duplicate | `S11` in tests/depth-FIND-MONEY.test.cjs | the account is left out of the grouping | proven |
| S12 | Never a past dispute date | a 50-day-old duplicate says the 60-day close, not day 45 | `S12` in tests/depth-FIND-MONEY.test.cjs | the date is always day 45, already gone after it (the bug found building this packet) | proven |
| S12 | Nothing past the window | a 61-day-old duplicate raises nothing | `S12` in tests/depth-FIND-MONEY.test.cjs | the window is 90 days | proven |
| S13 | A rise is 5% and $0.50 | $15.49 to $16.20 (4.6%) is not a rise | `S13` in tests/depth-FIND-MONEY.test.cjs | only the $0.50 floor is checked | proven |
| S14 | A rise at its own cadence | a $10 weekly rise is $43.33 a month | `S14` in tests/depth-FIND-MONEY.test.cjs | every rise is called a monthly one (the bug found building this packet) | proven |
| S15 | Bank fees inside 60 days | a 72-day-old service fee is not raised | `S15` in tests/depth-FIND-MONEY.test.cjs | the fee window is 90 days | proven |
<!-- results:end -->
