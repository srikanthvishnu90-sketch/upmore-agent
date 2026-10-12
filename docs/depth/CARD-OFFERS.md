# CARD-OFFERS: card-linked offer matcher depth packet (overnight F4)

The person pastes or forwards card-linked offers (Amex Offers, Chase Offers, BankAmeriDeals and the like). Each offer's
terms come only from the pasted text; each is matched against the person's own posted purchases over the last 180 days
and sorted into likely to use anyway, out of their way, already expired and expiring soonest. Upmore never adds,
activates or enrolls an offer (Methods 1 M1-CARD-08; packages/domain/90-card-offers.js). Check:
`node --test tests/depth-CARD-OFFERS.test.cjs && node evals/depth/run.cjs CARD-OFFERS`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Terms from the pasted line | the minimum, expiry and enroll-by are the pasted ones | `S01` in tests/depth-CARD-OFFERS.test.cjs | the "spend $X" minimum is never read | proven (also fails S07) |
| S02 | The cap stops the % | 10% of $90 under a $5 cap is $5 | `S02` in tests/depth-CARD-OFFERS.test.cjs | the cap is not applied | proven |
| S03 | Missing terms said missing | no expiry and no cap are said | `S03` in tests/depth-CARD-OFFERS.test.cjs | a missing expiry reads as "expires soon" | proven |
| S03 | An amount it can't place | "$50 in gift cards" stops the earnings line | `S03` in tests/depth-CARD-OFFERS.test.cjs | unplaced amounts are ignored and the reward is stated | proven |
| S04 | No look-alike match | TARGET offer vs TARGETED ADS LLC | `S04` in tests/depth-CARD-OFFERS.test.cjs | a row prefix matches without a word boundary | proven |
| S05 | Descriptor variants match | WALGREENS offer vs WALGREEN PHARMACY row | `S05` in tests/depth-CARD-OFFERS.test.cjs | the plural/possessive S is not folded | proven (also fails S03) |
| S06 | Use-anyway needs a habit | one purchase is out of the way | `S06` in tests/depth-CARD-OFFERS.test.cjs | a single purchase counts as a habit | proven (also fails S08, S09) |
| S07 | The minimum gates qualifying | two $20 purchases under a $50 minimum | `S07` in tests/depth-CARD-OFFERS.test.cjs | every purchase qualifies | proven |
| S08 | The 180-day window | March and April purchases are left out | `S08` in tests/depth-CARD-OFFERS.test.cjs | the window start is ignored | proven |
| S09 | Pending, other currency, transfers left out | only the posted USD purchase counts | `S09` in tests/depth-CARD-OFFERS.test.cjs | the purchase check accepts pending rows, any currency and transfers | proven |
| S10 | Typical is the median | $20, $30, $100 -> $30 | `S10` in tests/depth-CARD-OFFERS.test.cjs | the typical purchase is the largest | proven |
| S11 | Soonest expiry first | Target (Oct 20) before Walgreens (Nov 30) | `S11` in tests/depth-CARD-OFFERS.test.cjs | the expiry order is reversed | proven |
| S12 | A card that isn't linked is said | BankAmeriDeals with only Amex and Chase linked | `S12` in tests/depth-CARD-OFFERS.test.cjs | any linked card counts as the issuer's | proven (also fails S13) |
| S13 | The offer's own card | paid with Chase and checking, the offer is on the Amex | `S13` in tests/depth-CARD-OFFERS.test.cjs | purchases on any account count as on the offer's card | proven |
| S14 | No push to spend | out-of-the-way says count only spending you'd do anyway | `S14` in tests/depth-CARD-OFFERS.test.cjs | the caution is dropped | proven |
| S14 | Never activates | adding is the person's tap | `S14` in tests/depth-CARD-OFFERS.test.cjs | the never-activate line is dropped | proven |
| S15 | Offer lists only | a dispute that mentions an offer is not an offer list | `S15` in tests/depth-CARD-OFFERS.test.cjs | the dispute/refund exclusion is gone | proven |
| S15 | A question is not a paste | "any offers with 5% back at costco, should i add one?" | `S15` in tests/depth-CARD-OFFERS.test.cjs | a one-line question is read as an offer list | proven |
<!-- results:end -->
