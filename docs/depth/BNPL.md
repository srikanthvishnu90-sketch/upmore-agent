# BNPL: every buy now, pay later plan in one list, and the next 30 days with them

The owner's Full Agent Capability List, section 5 "Buy now, pay later": item 85 ("Show every BNPL plan in one list with
the total still owed. [Read]") and item 87 ("Warn before a new BNPL plan would push next month negative. [Read]"). Both
were NOT_BUILT (no registry capability, nothing in chat). They are mapped to CRDT-008 (debt inventory across all loans,
where the parity docs already put Pay in 4 and Afterpay) and, for 87, ANL-006 (the 30/60/90-day forecast it builds on).
Read-only, numbers only: no advice, nothing paid, paid off or rescheduled. Items 84 (pay instalments on time), 86 (pay
one off early) and 88 (reschedule) are money movement and are **not built**; the list answer says so on every reply.

## What the person's rows can and cannot say (research, 2026-10-12)

Researched by web search on 2026-10-12. The providers' own pages could not be opened from the build environment (DNS),
so each fact names its page and whether it is the provider's own, a store's, or a third party's. All of it lives as dated
data in `packages/offers/bnpl-providers.json` (checked_on 2026-10-12, fresh for 90 days; past that the answer says the
terms on file may have changed). Nothing below is hardcoded in the module.

| Provider | How a US statement row reads (as reported) | Schedule (as published) | Sources |
| --- | --- | --- | --- |
| Klarna | KLARNA, KLARNA INC, KLARNA.COM, KLARNA US; sometimes the store after "*" or "/" (KLARNA*ASOS.COM, KLARNA/LYST) | Pay in 4: 4 interest-free payments every 2 weeks, the first when the order ships (sometimes at checkout). Pay in 30 days: one payment within 30 days of shipping. Financing: monthly, may charge interest (WebBank line of credit) | third party: explaincharges.com/klarna-charge-on-credit-card, statementdecoder-web.onrender.com/charges/klarna; stores: pages.ebay.com/klarna, support.ruggable.com.au (Pay in 4), dell.com/en-ca/lp/klarna-faq (financing); review: nerdwallet.com/blog/loans/klarna-credit-review-online-payment-pos |
| Affirm | AFFIRM, AFFIRM PAY, AFFIRM.COM; "SP AFF*"/"SP+AFF" reported by third parties only and **not used** | Pay in 4: 4 interest-free payments every 2 weeks (0% APR). Monthly: 0-36% APR; Affirm's example: $400 as 12 monthly payments of $28.88 at 15% APR | provider: affirm.com/terms; store: samsung.com/ca/affirm-financing; third party: slash.com/charge-identifier/sp-aff, joingerald.com, explaincharges.com/affirm-charge-on-bank-statement |
| Afterpay | AFTERPAY, AFTERPAY AFTERPAY.COM, AFTERPAY US | 4 payments every 2 weeks, the first at purchase (on a large order the first can be bigger); several payments due together can be taken as one charge | provider: site-admin.afterpay.com/en-NZ/how-it-works, afterpay.com/en-AU/help/47727991226265, afterpay.com/en-AU/help/23950920510617; store: dsw.com/en/us/afterpay-faq; third party: slash.com, robots.net, explaincharges.com |
| Zip (formerly Quadpay) | **no source found** for the US statement text; ZIP.CO, ZIP PAY, ZIP CO and QUADPAY are read because they are the company's own names; the US Pay-in-4 is issued by WebBank, so a row may name neither | 4 payments over 6 weeks (every 2 weeks), the first at checkout; an installment fee that varies ($0 to $7.50 in Zip's disclosure), which the first payment can carry | stores: fanatics.com/zip-faq, fevo.com/zip-faq (Zip's disclosure), lifestride.com/help/zip, stuartweitzman.com/help/zip; en.wikipedia.org/wiki/Zip_Co |
| PayPal Pay in 4 | **no source confirms** the exact text; a row must say PAY IN 4, PAYIN4, PAY LATER or PAY MONTHLY next to PAYPAL. "PAYPAL INST XFER" is PayPal pulling money from the bank for any PayPal payment and is **never** read as Pay in 4; "PAYPAL *STORE" is an ordinary PayPal purchase | 4 interest-free payments, the first at purchase, then every 2 weeks; US $30-$1,500; no late fees | provider: paypal.com/us/cshelp/article/what-is-pay-in-4-help463; third party: explaincharges.com/paypal-instant-transfer-charge-on-credit-card, emma-app.com/who-charged-me/paypal |

What can be inferred from statement rows: that a provider took a payment, its amount and date, and (when the descriptor
carries it) the store; equal payments 2 weeks apart are the Pay in 4 shape every provider publishes, equal payments a month
apart a monthly plan. What cannot: the plan's balance, its APR, how many monthly payments a loan has, a payment made from
an account that isn't linked, an Afterpay charge that bundled two payments, and the store when the descriptor leaves it
out. So "still owed" is said only for a Pay in 4 whose first payment is in the rows (4 minus the payments seen, times the
amount, labeled as inferred from the pattern); everything else says what is unknown and points to the provider's app.

## What a person can say (chat, through `agent-chat/_shared/money_answers.ts`)

- "show my buy now pay later plans", "bnpl", "what do I owe klarna", "my afterpay payments", "how much is left on my zip
  plan", "when is my next afterpay payment": every plan in progress from the person's own rows (one provider named narrows
  it): the amount, every 2 weeks or a month, the payments seen with their dates, the next expected date (in the person's
  zone), and what is left when the plan's shape makes it certain; the certain total; the plans whose total isn't known;
  finished plans, refunded plans (a credit from the provider equal to what the plan paid), money back that matches no plan,
  pending payments and other currencies said apart; the not-built line; the source and as-of line
  (`MoneyAnswers.txSource`). With a cash account linked, a heads-up line when the newest plan takes the 30-day low point
  below zero and it would not be without it.
- "would a $400 afterpay plan push me negative", "can I afford a $200 klarna pay in 4", "will my bnpl payments push me
  negative": the next 30 days from cash (checking and savings, the lower of balance and available), the repeating bills
  and paydays `TheNumbers.projection` already derives (86-the-numbers.js; a provider's own rows are taken out of the
  repeating bills so nothing counts twice) and the pay-later payments read here: the lowest point and its date. A new plan
  named with an amount is laid out on that provider's Pay in 4 terms (4 payments, the first today, every 2 weeks; the cents
  left over go on the first) and its own lowest point is said; without one, the newest plan already started is taken out
  to show the difference. Numbers only; a monthly plan isn't projected (its term and APR aren't known).
- Paying, paying off early, rescheduling, advice ("should i use afterpay"), and anything longer than a text go on.

Where: `packages/domain/97-bnpl.js` (in the router bundle), routed in `supabase/functions/agent-chat/_shared/money_answers.ts`
(kinds `bnpl` and `bnplcheck`, after "did it go through" and before the spending views).

Not built (for the owner): paying a plan (84), paying one off early (86) and rescheduling (88), which are money movement
behind a provider adapter; reading balances or schedules from the providers themselves (no BNPL connector; the catalog
rows for Affirm, Klarna and Afterpay are not live); a warning sent on its own when a new plan starts (the hourly scheduler
does not run this check; item 87 answers when asked and on the list); a Pay in 30 or financing plan's schedule from a single
payment; Sezzle and Shop Pay Installments (not researched in this packet). Known limit: `what bills are coming up`
(TheNumbers.upcoming) still lists a plan's equal payments as a repeating bill past the plan's end; only this packet's check
takes them out.

Check: `node --test tests/depth-BNPL.test.cjs && node evals/depth/run.cjs BNPL`; exact strings
`node --test tests/bnpl.test.cjs`; chat `deno test tests/edge/bnpl-answer.test.ts`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Each provider from its descriptor | Klarna, Affirm, Afterpay, Zip (and Quadpay), PayPal Pay in 4 | `S01` in tests/depth-BNPL.test.cjs | only a provider's first pattern is read, so QUADPAY is missed | proven |
| S02 | The store only when the descriptor carries it | KLARNA*TARGET is Target; AFFIRM *PAY names no store | `S02` in tests/depth-BNPL.test.cjs | a generic word after "*" is taken as the store | proven (also fails S09) |
| S03 | Look-alikes are not payments | AFFIRMATIVE INSURANCE, ZIPCAR, ZIPRECRUITER, PAYPAL INST XFER | `S03` in tests/depth-BNPL.test.cjs | word boundaries are dropped from the patterns | proven |
| S04 | Plans of different amounts stay apart | a $40.00 plan and a new $60.00 plan from Klarna on the same day | `S04` in tests/depth-BNPL.test.cjs | plans are grouped without their amount | proven (also fails S08, S10) |
| S05 | Every 2 weeks, not every week | two $25.00 Afterpay plans a week apart | `S05` in tests/depth-BNPL.test.cjs | payments a week apart are chained as one plan | proven |
| S06 | What's left, not the whole plan | 3 of 4 seen is $40.00 left | `S06` in tests/depth-BNPL.test.cjs | the plan's whole amount is said as still owed | proven (also fails S10, S21) |
| S07 | "Up to" when the first payment is not in the rows | rows from Sep 28 give up to 2 payments, up to $80.00 | `S07` in tests/depth-BNPL.test.cjs | a plan whose start is not in the rows is counted as if it were | proven (also fails S08) |
| S08 | An earlier payment from the provider makes the start uncertain | a $55.00 Klarna payment on Sep 14 before $40.00 on Sep 28 and Oct 12 | `S08` in tests/depth-BNPL.test.cjs | a payment two weeks before the chain is ignored | proven |
| S09 | A monthly plan is read, its total never guessed | Affirm $62.18 a month, next Nov 3, still owed not in the rows | `S09` in tests/depth-BNPL.test.cjs | monthly payments are never chained into a plan | proven |
| S10 | Zip's first payment with a fee joins its plan | $26.50, then $25.00 twice: 3 of 4 seen, $25.00 left | `S10` in tests/depth-BNPL.test.cjs | a different first payment is left out of the plan | proven |
| S11 | A refund equal to what was paid closes the plan | Best Buy $100.00 back after 2 payments of $50.00 | `S11` in tests/depth-BNPL.test.cjs | a matching refund is never applied | proven |
| S12 | Money back is never a payment | a $15.00 credit from Klarna | `S12` in tests/depth-BNPL.test.cjs | a credit from the provider is read as a payment | proven (also fails S11) |
| S13 | Pending said, not counted | a pending $20.00 Afterpay payment | `S13` in tests/depth-BNPL.test.cjs | a pending payment is counted as made | proven |
| S14 | Other currencies never added | 25.00 EUR Klarna payments | `S14` in tests/depth-BNPL.test.cjs | a EUR payment is read as dollars | proven |
| S15 | The person's day | 11:30 p.m. Oct 12 in New York: next expected today | `S15` in tests/depth-BNPL.test.cjs | today is read in UTC | proven |
| S16 | The bank's tomorrow is this evening | a payment dated Oct 13 counts on Oct 12 in New York | `S16` in tests/depth-BNPL.test.cjs | a row dated tomorrow is left out | proven |
| S17 | A finished plan owes nothing | Afterpay 4 of 4 paid is listed as finished | `S17` in tests/depth-BNPL.test.cjs | a plan with all 4 payments stays in progress | proven |
| S18 | Item 87 counts the pay-later payments | $1,000.00 cash, $40.00 Oct 19, $800.00 rent Nov 1: lowest $160.00 | `S18` in tests/depth-BNPL.test.cjs | the pay-later payments are left out of the projection | proven (also fails S21) |
| S19 | Item 87 never counts a plan twice | Klarna payments are not also a repeating bill | `S19` in tests/depth-BNPL.test.cjs | a plan's payments are also projected as a repeating bill | proven (also fails S18, S21) |
| S20 | A new plan on the provider's terms | $400.00 Afterpay: 4 payments of $100.00 every 2 weeks from today | `S20` in tests/depth-BNPL.test.cjs | a new plan is laid out every week | proven |
| S21 | The newest plan with and without | -$80.00 on Nov 9 with it, $120.00 on Nov 1 without | `S21` in tests/depth-BNPL.test.cjs | the newest plan is never taken out | proven |
| S22 | No cash, no number | only a credit card linked | `S22` in tests/depth-BNPL.test.cjs | a projection is made from $0.00 | proven |
| S23 | The list asks | "bnpl", "what do I owe klarna", "my afterpay payments" and three more | `S23` in tests/depth-BNPL.test.cjs | list asks are never recognized | proven |
| S24 | Paying, paying off, moving a date and advice go on | "should i use a $400 klarna plan or will it push me negative" | `S24` in tests/depth-BNPL.test.cjs | advice and money-movement asks are answered | proven |
| S25 | Source and as-of | the last line names the rows and their as-of time | `S25` in tests/depth-BNPL.test.cjs | the source line is dropped | proven (also fails S26) |
| S26 | Not built is said | paying, paying off early and moving a date are not built | `S26` in tests/depth-BNPL.test.cjs | the not-built line is dropped | proven |
| S27 | Stale provider terms are said | terms checked Jan 2, 2026 may have changed | `S27` in tests/depth-BNPL.test.cjs | terms past their window are never flagged | proven |
| S28 | One provider named narrows it | "my afterpay payments" lists Afterpay only | `S28` in tests/depth-BNPL.test.cjs | every provider is listed whatever was asked | proven |
| S29 | A missing payment makes what's left uncertain | Sep 21 expected and not in the rows | `S29` in tests/depth-BNPL.test.cjs | a plan whose payment never came is still counted as certain | proven |
<!-- results:end -->
