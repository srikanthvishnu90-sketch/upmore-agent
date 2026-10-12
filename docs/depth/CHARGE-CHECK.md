# CHARGE-CHECK: "what's this charge?" (megadoc K01, K02, K05)

`packages/domain/102-charge-check.js` (`ChargeCheck`) answers "what's this 47.23 charge from SQ *ALLEY", "I don't
recognize a charge from ACME INC", "why did acme charge me" and "chipotle charged me twice" from the person's own rows,
read-only. It finds the charge in the last 90 days by the bank text (whole words, or the same words run together) and/or
the amount to the cent, and says what the statement itself shows: the amount, day, card and the bank's display-safe
words; the payment processor in front of the name (SQ * Square, TST* Toast, PAYPAL * PayPal, SP * Shopify, DD * DoorDash,
IC* Instacart, AMZN Mktp, APPLE.COM/BILL, GOOGLE *, Uber, Lyft), with the business after it never looked up or guessed;
how many earlier charges came from the same text and whether they repeat monthly; a pending charge's hold. Two charges of
the same amount from the same text within 3 days are a possible double charge (one charge, or different amounts, never
are). Nothing is disputed or sent: the business is asked first and the dispute flow is named. Dispute asks
("dispute", "unauthorized", "didn't authorize") stay with the dispute answer (79-dispute.js); vague asks ("what is this
charge") and non-charge questions go on.

Where it runs: kind "charge" in `supabase/functions/agent-chat/_shared/money_answers.ts`; `tests/edge/megadoc-money-asks.test.ts`.
Check: `node --test tests/depth-CHARGE-CHECK.test.cjs && node evals/depth/run.cjs CHARGE-CHECK`.

Found building it: the shared name cleaner (`80-money-answers.js` cleanName) left a phone number's dashes in names
("ACME INC 800-555-0100" read "Acme Inc - -") in every money answer; fixed (MONEY-ANSWERS S18). And this module's first
run-together match let "ACME" match inside "ACMEPAY" (S13).

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | The bank's own words | the charge is shown with its text, card and day | `S01` in tests/depth-CHARGE-CHECK.test.cjs | the bank's text is dropped | proven |
| S02 | The processor explained | SQ * is Square | `S02` in tests/depth-CHARGE-CHECK.test.cjs | the processor table is not read | proven |
| S03 | Earlier charges counted | one earlier charge on Sep 8, monthly | `S03` in tests/depth-CHARGE-CHECK.test.cjs | history is not read | proven |
| S04 | Pending explained | a pending $22.00 says it's a hold | `S04` in tests/depth-CHARGE-CHECK.test.cjs | the pending note is dropped | proven |
| S05 | Twice found | Chipotle $35.00 on Oct 4 and Oct 5 | `S05` in tests/depth-CHARGE-CHECK.test.cjs | the twice window is a day | proven (also fails S08) |
| S06 | One is not two | a single Acme charge is not a double | `S06` in tests/depth-CHARGE-CHECK.test.cjs | the pair check accepts a row paired with itself | proven (also fails S05, S07) |
| S07 | Same amount only | $35.00 and $12.50 are not a double | `S07` in tests/depth-CHARGE-CHECK.test.cjs | the amount check is dropped | proven |
| S08 | Nothing sent | the dispute flow is named, nothing sent | `S08` in tests/depth-CHARGE-CHECK.test.cjs | the reply claims to dispute it | proven |
| S09 | Not found is said | no $9.99 charge from zzzflix | `S09` in tests/depth-CHARGE-CHECK.test.cjs | the not-found case falls through | proven (also fails S12, S13, S14, S15) |
| S10 | Disputes go to the dispute answer | 'dispute the acme charge' is not this | `S10` in tests/depth-CHARGE-CHECK.test.cjs | the dispute guard is dropped | proven |
| S10 | Charge-less 'what is X' needs a star | 'what is netflix' is not this | `S10` in tests/depth-CHARGE-CHECK.test.cjs | any 'what is X' is taken as a charge | proven |
| S11 | 'why did X charge me' | 'why did acme charge me' finds acme | `S11` in tests/depth-CHARGE-CHECK.test.cjs | the why-did form is not read | proven (also fails S05, S06, S07, S08) |
| S12 | To the cent | $35.01 is not $35.00 | `S12` in tests/depth-CHARGE-CHECK.test.cjs | the amount is matched to the dollar | proven |
| S13 | Whole words | ACME is not ACMEPAY | `S13` in tests/depth-CHARGE-CHECK.test.cjs | the squashed term matches inside a word | proven |
| S14 | Charges only | a credit or a transfer is not a charge | `S14` in tests/depth-CHARGE-CHECK.test.cjs | credits are counted | proven |
| S15 | Nothing posted is said | only a pending row: no posted transactions | `S15` in tests/depth-CHARGE-CHECK.test.cjs | the empty case is not handled | proven |
<!-- results:end -->
