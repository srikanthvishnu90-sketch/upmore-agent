# MERCHANT-LABEL: merchant names shown back safely (overnight G3, packet added for G4)

A card descriptor is partly the merchant's own text, so every name Upmore shows back in its own voice goes through
`MerchantLabel.safe` (packages/domain/32-merchant-label.js): links, emails, @handles and markup removed, the text cut at
the first instruction-like word, capped at 40 characters, and "Unknown merchant" when nothing is left. Matching still
uses the raw text. Check: `node --test tests/depth-MERCHANT-LABEL.test.cjs && node evals/depth/run.cjs MERCHANT-LABEL`.

Found building this packet: an @handle with a hyphen ("@eve-money") left "-money" behind; handles now include `.` and `-`
(S05, and D05 plants the old pattern back).

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Ordinary descriptors pass | VISITING NURSE SERVICE stays whole | `S01` in tests/depth-MERCHANT-LABEL.test.cjs | the instruction words lose their closing word boundary, so 'VISITING' cuts | proven |
| S02 | http links removed | an https link is gone | `S02` in tests/depth-MERCHANT-LABEL.test.cjs | only www links are removed | proven |
| S03 | www links removed | a bare www link is gone | `S03` in tests/depth-MERCHANT-LABEL.test.cjs | only http links are removed | proven |
| S04 | Emails removed | an email address is gone | `S04` in tests/depth-MERCHANT-LABEL.test.cjs | emails are kept | proven |
| S05 | Handles removed | @eve-money is gone, hyphen included | `S05` in tests/depth-MERCHANT-LABEL.test.cjs | a handle stops at the first hyphen (the bug found building this packet) | proven |
| S06 | Markup removed | no angle brackets survive | `S06` in tests/depth-MERCHANT-LABEL.test.cjs | tags are kept | proven |
| S07 | Role prefixes cut | SYSTEM: cuts the text | `S07` in tests/depth-MERCHANT-LABEL.test.cjs | role prefixes are not instructions | proven |
| S08 | Ignore and disregard cut | IGNORE PREVIOUS INSTRUCTIONS cuts | `S08` in tests/depth-MERCHANT-LABEL.test.cjs | ignore and disregard are not listed | proven (also fails S15) |
| S09 | Reply cuts | reply with ... cuts at reply | `S09` in tests/depth-MERCHANT-LABEL.test.cjs | reply is not listed | proven |
| S10 | Visit and click cut | click here to claim cuts | `S10` in tests/depth-MERCHANT-LABEL.test.cjs | visit and click are not listed | proven |
| S11 | A planted outcome cuts | you have been refunded cuts | `S11` in tests/depth-MERCHANT-LABEL.test.cjs | 'you have been' is not listed | proven |
| S12 | Send $ cuts | send $500 cuts | `S12` in tests/depth-MERCHANT-LABEL.test.cjs | 'send 
 is not listed | proven |
| S13 | Codes and passcodes cut | one-time code and passcode cut | `S13` in tests/depth-MERCHANT-LABEL.test.cjs | codes are not listed | proven |
| S14 | The 40-character cap | a long name is capped on a word boundary | `S14` in tests/depth-MERCHANT-LABEL.test.cjs | the cap is 400 | proven |
| S15 | Only an instruction is Unknown merchant | an instruction-only descriptor is 'Unknown merchant' | `S15` in tests/depth-MERCHANT-LABEL.test.cjs | the raw text is shown when nothing is left | proven |
<!-- results:end -->
