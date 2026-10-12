# UNCLAIMED: state treasurer letters and failed banks (overnight C6)

Owner cards M2-UNCLAIMED-01 (state auto-return check watch) and M2-UNCLAIMED-10 (failed bank deposits), read-only
(packages/domain/91-unclaimed.js). A state letter is called matching only from the official domain on file
(`packages/offers/unclaimed-programs.json`); a mailed letter is never called real. A failed bank is checked against the
FDIC Failed Bank List kept as dated data (`packages/offers/failed-banks.json`; each row says how it was checked, since
fdic.gov does not resolve from the build container), with where the deposits went only as the sources say it and the
FDIC's 18-month and 10-year rules cited. Upmore searches no records and files nothing.
Check: `node --test tests/depth-UNCLAIMED.test.cjs && node evals/depth/run.cjs UNCLAIMED`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | The data validates | a non-FDIC page fails validation | `S01` in tests/depth-UNCLAIMED.test.cjs | any https page passes as the FDIC's | proven |
| S02 | When it failed and who acquired it | the date and the acquirer are the list's, cited | `S02` in tests/depth-UNCLAIMED.test.cjs | the citation is dropped | proven |
| S03 | Deposits as the sources say | unknown deposits never say where the money is | `S03` in tests/depth-UNCLAIMED.test.cjs | unknown is treated as all | proven |
| S04 | A shared name is not assumed | Citizens Bank without a city names Sac City first | `S04` in tests/depth-UNCLAIMED.test.cjs | the ambiguous flag is ignored | proven |
| S05 | The 18-month rule | a failure 9 months ago is not yet with the state | `S05` in tests/depth-UNCLAIMED.test.cjs | the months are counted in years | proven |
| S06 | A linked account at a failed bank | an account at Republic First Bank is found | `S06` in tests/depth-UNCLAIMED.test.cjs | accounts are never read | proven |
| S07 | No shared name from rows | a Citizens Bank account is not a match | `S07` in tests/depth-UNCLAIMED.test.cjs | ambiguous banks are scanned too | proven |
| S08 | A failed bank in the transactions | a Pulaski Savings Bank deposit is found | `S08` in tests/depth-UNCLAIMED.test.cjs | transactions are never read | proven |
| S09 | The list's reach, each failure once | 15 failures since Mar 10, 2023 | `S09` in tests/depth-UNCLAIMED.test.cjs | alias rows are counted as failures | proven |
| S10 | A stale list is said | 50 days after the check it may be missing failures | `S10` in tests/depth-UNCLAIMED.test.cjs | the list never goes stale | proven |
| S11 | Not every 'failed' is a bank failure | 'my bank failed to send my transfer' is not this answer's | `S11` in tests/depth-UNCLAIMED.test.cjs | the 'failed to' guard is gone | proven |
| S12 | The official sender matches | illinoistreasurer.gov matches with its citation | `S12` in tests/depth-UNCLAIMED.test.cjs | the program is found only by its words, never by its sender | proven (also fails S15) |
| S13 | A lookalike is never real | illinoistreasurer.gov.claims-center.com is not official | `S13` in tests/depth-UNCLAIMED.test.cjs | a domain that only starts with the official one passes | proven |
| S14 | A mailed letter is never real | no sender: look it up yourself | `S14` in tests/depth-UNCLAIMED.test.cjs | a letter naming the program is taken as from it | proven |
| S15 | Red flags win | an official sender with another contact address can't be confirmed | `S15` in tests/depth-UNCLAIMED.test.cjs | a second address in the body is ignored | proven |
<!-- results:end -->
