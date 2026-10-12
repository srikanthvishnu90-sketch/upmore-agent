# DISPUTE: dispute a charge from a text (live gauntlet S16-17; packet added for G4)

The charge is found in the person's own rows (packages/domain/79-dispute.js) by what they said: merchant words count
only when they match a merchant they have, an amount to the cent, a date within three days with the exact day
preferred, "the last one" the newest. Several that could be it are asked about, newest first; none is said honestly.
The reply is a draft the person sends themselves: the merchant first, then the card issuer or bank if the merchant
says no or is quiet for 10 days, with the 60-day limits stated. Merchant names go through MerchantLabel; a photo with
nothing in the text is left to the photo reader. Upmore never sends or files a dispute.
Check: `node --test tests/depth-DISPUTE.test.cjs && node evals/depth/run.cjs DISPUTE`.

Found building this packet (fixed red-first, regression tests in tests/dispute.test.cjs):
- S16: a 45.00 EUR charge was stated as "$45.00" in the draft and the pick list. It is now said in its own currency.
- "dispute a charge I don't recognize" answered "I couldn't find that charge" (the words "dont" and "recognize" were
  read as a merchant name). Those words now name nothing, so the charges to pick from are listed (asserted in S09).

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Dispute words, not dispute questions | 'what is a chargeback' is the model's | `S01` in tests/depth-DISPUTE.test.cjs | the general-question guard is gone | proven |
| S02 | The amount said, comma included | $1,048.20 reads as 104820 | `S02` in tests/depth-DISPUTE.test.cjs | the thousands comma is not removed | proven |
| S03 | A date with no year | Dec 30 asked on Jan 2 is last year's | `S03` in tests/depth-DISPUTE.test.cjs | a date with no year is always this year's, even in the future | proven |
| S04 | The best merchant match | 'uber eats' picks UBER *EATS over UBER *TRIP | `S04` in tests/depth-DISPUTE.test.cjs | any merchant word match counts as well as the best | proven |
| S05 | The amount to the cent | $48.20 is not $48.99 | `S05` in tests/depth-DISPUTE.test.cjs | amounts are matched in whole dollars | proven |
| S06 | Three days, not a week | a charge 10 days from the date said is not it | `S06` in tests/depth-DISPUTE.test.cjs | the date window is 30 days | proven |
| S07 | The exact day wins | Oct 5 picks the Oct 5 charge | `S07` in tests/depth-DISPUTE.test.cjs | the exact day is not preferred | proven |
| S08 | The last one is the newest | the last Streamflix is Oct 3 | `S08` in tests/depth-DISPUTE.test.cjs | 'the last one' takes the oldest | proven |
| S09 | Several are asked | two Streamflix charges list both | `S09` in tests/depth-DISPUTE.test.cjs | the newest of several is drafted without asking | proven |
| S10 | Not found is said | no Hulu: not a Netflix draft | `S10` in tests/depth-DISPUTE.test.cjs | words that name no merchant are ignored | proven |
| S11 | Merchant first, issuer after the wait | the issuer step waits 10 days | `S11` in tests/depth-DISPUTE.test.cjs | the wait is 30 days | proven |
| S12 | The 60-day limits | 90 days old says the window may be closing | `S12` in tests/depth-DISPUTE.test.cjs | the warning starts at 120 days | proven |
| S13 | Names through MerchantLabel | a descriptor's planted words are not repeated | `S13` in tests/depth-DISPUTE.test.cjs | the merchant name skips MerchantLabel | proven |
| S14 | A photo is deferred | a photo with no details is left to the photo reader | `S14` in tests/depth-DISPUTE.test.cjs | the photo is ignored and the charges are listed | proven |
| S15 | A photo's merchant must match | a Hulu photo is not the Netflix row | `S15` in tests/depth-DISPUTE.test.cjs | the amount alone matches a photo to a row | proven |
| S16 | Another currency is said in it | a 45.00 EUR charge is never $45.00 | `S16` in tests/depth-DISPUTE.test.cjs | every amount is said in dollars (the bug found building this packet) | proven |
<!-- results:end -->
