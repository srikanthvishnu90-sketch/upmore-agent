# SUBS-LIST: "what subscriptions do I have?" (megadoc J03)

`packages/domain/100-subscription-list.js` (`SubscriptionList`) lists the person's subscriptions from their own rows,
read-only: charges that repeat (`AgentLedger.recurring`, 57-agent-ledger.js, keyed by the monitors' merchant key so
"AMAZON PRIME*AB1" and "*CD2" are one service) at services the chat counts as subscriptions (`MoneyAnswers.classify`
with the person's category rules) or that the ledger files as subscriptions. Each with its latest charge to the cent
(and the earlier price when it changed), how often, when last charged; one that hasn't charged for a full cycle and a
week (a month for yearly) is said apart as possibly ended; the monthly and yearly total, a yearly price spread to the
cent. It says what can't show (a new one before its second charge, a card that isn't linked) and names the cancel flow,
which asks for its own yes. Rows from the last 400 days, USD posted rows only, in the person's time zone.

Where it runs: kind "subs" in `supabase/functions/agent-chat/_shared/money_answers.ts`, through `moneyReply`;
`tests/edge/megadoc-money-asks.test.ts`.
Check: `node --test tests/depth-SUBS-LIST.test.cjs && node evals/depth/run.cjs SUBS-LIST`.

Found building this (fixed in `33-agent-monitors.js` merchantKey, FIND-MONEY S16): a reference code after "*" stayed in
the merchant key, so a yearly subscription billed "AMAZON PRIME*AB1" then "*CD2" never grouped, in this list, "what bills
are coming up" and the save engine's inventory alike. A code mixing letters and digits (never four letters in a row) or a
long number is now dropped; "MICROSOFT*365" and "1PASSWORD" stay names. 17 of 1,135 starred strings in the repo changed
key, each one of these.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | The latest charge | Netflix is $17.99 now, $15.99 before | `S01` in tests/depth-SUBS-LIST.test.cjs | the steady (median) amount is said instead of the latest charge | proven |
| S02 | Yearly at its yearly price | Amazon Prime $139.00 a year | `S02` in tests/depth-SUBS-LIST.test.cjs | yearly charges are left out | proven (also fails S03) |
| S03 | The monthly total to the cent | $40.56 a month | `S03` in tests/depth-SUBS-LIST.test.cjs | a yearly price is counted as monthly | proven (also fails S08, S14) |
| S04 | Bills are not subscriptions | rent is not listed | `S04` in tests/depth-SUBS-LIST.test.cjs | every repeating debit is listed | proven (also fails S03, S07, S08) |
| S05 | Stopped is said apart | Hulu is possibly ended | `S05` in tests/depth-SUBS-LIST.test.cjs | no grace: a charge a day late is called ended | proven (also fails S15) |
| S06 | Why one may be missing | the reply says a new one shows after its second charge | `S06` in tests/depth-SUBS-LIST.test.cjs | the limits line is dropped | proven (also fails S08) |
| S07 | The person's rules count | a gym moved to subscriptions is listed | `S07` in tests/depth-SUBS-LIST.test.cjs | the rules are not passed to the classifier | proven |
| S08 | No cancel without its yes | the reply names the cancel flow and its own yes | `S08` in tests/depth-SUBS-LIST.test.cjs | the reply promises to cancel on its own | proven |
| S09 | Pending and other currencies never count | a EUR service is not listed | `S09` in tests/depth-SUBS-LIST.test.cjs | the currency check is dropped | proven |
| S10 | None is said | no repeating subscription says so | `S10` in tests/depth-SUBS-LIST.test.cjs | the empty case is not handled | proven |
| S11 | Spending questions are not this | 'how much did i spend on subscriptions' is not a list ask | `S11` in tests/depth-SUBS-LIST.test.cjs | the end anchor is dropped | proven |
| S12 | Source and as-of | the source line ends the answer | `S12` in tests/depth-SUBS-LIST.test.cjs | the source line is dropped | proven |
| S13 | 400 days back | an old service from 2025 is not read | `S13` in tests/depth-SUBS-LIST.test.cjs | every row is read | proven |
| S14 | Weekly is 52 a year | $4.99 a week is $21.62 a month | `S14` in tests/depth-SUBS-LIST.test.cjs | a week is counted four times a month | proven |
| S15 | The person's today | 11:30 p.m. New York is Oct 12 | `S15` in tests/depth-SUBS-LIST.test.cjs | today is read in UTC | proven |
<!-- results:end -->
