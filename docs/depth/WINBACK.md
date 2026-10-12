# WINBACK: win-back watch depth packet (overnight D4, Methods 3 M3-SUBS-09)

Owner: Claude. After a person cancels a subscription, a "come back" email they paste is read for: the sender against the
service's domain on file (the cancel catalog's own account page), the offer exactly as the email states it (price,
length, the price after, the end date, "per the email you pasted, dated X"), and the regular price it compares to, which
is the person's own last posted charge before they cancelled. Nothing missing is filled in, several prices are never
picked between, and resubscribing is the person's call: Upmore signs no one up and follows no link
(packages/domain/89-win-back.js, chat `agent-chat/_shared/win_back_answer.ts`).

Check: `node --test tests/depth-WINBACK.test.cjs && node evals/depth/run.cjs WINBACK`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Lookalike domains are not the service | hulu.com.evil.example and myhulu.com are not confirmed | `S01` in tests/depth-WINBACK.test.cjs | any host containing the domain counts | proven |
| S02 | Every sender line on the domain | a Reply-To elsewhere is not confirmed | `S02` in tests/depth-WINBACK.test.cjs | one matching sender line is enough | proven |
| S03 | The forwarder is not the sender | a forwarded real offer is still confirmed | `S03` in tests/depth-WINBACK.test.cjs | the whole forwarded text is read for senders | proven |
| S04 | No From line is not confirmed | an email with no From: line can't be confirmed | `S04` in tests/depth-WINBACK.test.cjs | an empty sender list counts as on the domain | proven |
| S05 | The email's own date | the offer is quoted 'dated 2026-10-05' | `S05` in tests/depth-WINBACK.test.cjs | the email's date is never read | proven |
| S06 | No year is never invented | Oct 31 stays 'Oct 31 (no year given)' | `S06` in tests/depth-WINBACK.test.cjs | a missing year is filled with this year | proven |
| S07 | A missing end date is said | no end date says the email doesn't say | `S07` in tests/depth-WINBACK.test.cjs | a missing end date is left out silently | proven |
| S08 | The after-promo price | 'then $9.99' is the price after, not a second offer | `S08` in tests/depth-WINBACK.test.cjs | the after-promo words are never recognised | proven (also fails S05, S14) |
| S09 | Several prices are not picked between | two offer prices are listed and no saving is worked out | `S09` in tests/depth-WINBACK.test.cjs | the first of several prices is taken as the offer | proven |
| S10 | An amount off is not a price | '$5 off' is quoted as a discount | `S10` in tests/depth-WINBACK.test.cjs | '$5 off' is read as a $5 price | proven |
| S11 | The charge before the cancellation | a charge after the cancellation is not the regular price | `S11` in tests/depth-WINBACK.test.cjs | the cancellation day is ignored | proven |
| S12 | Pending charges are left out | a pending charge is not what the person paid | `S12` in tests/depth-WINBACK.test.cjs | pending rows count as charges | proven |
| S13 | Only completed cancellations | a declined cancellation is not a cancellation | `S13` in tests/depth-WINBACK.test.cjs | any cancellation case counts, whatever its state | proven |
| S14 | The saving over the stated months | $15.00 a month over 3 months is $45.00 | `S14` in tests/depth-WINBACK.test.cjs | the total is one month's gap | proven |
| S15 | No saving for an untrusted offer | a spoofed sender gets no saving worked out | `S15` in tests/depth-WINBACK.test.cjs | the saving is worked out whoever sent it | proven |
<!-- results:end -->
