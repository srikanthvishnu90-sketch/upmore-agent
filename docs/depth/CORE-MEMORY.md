# CORE-MEMORY: durable workflow references and corrections

This is a repair packet, not a new registry capability or a live VERIFIED claim. Check: `node --test tests/depth-CORE-MEMORY.test.cjs && node evals/depth/run.cjs CORE-MEMORY`.

Before implementation, these 15 user-observable contracts define the scope:

1. S01: A currency-only payment correction replaces the amount on the pending card.
2. S02: That correction retains the named recipient and memo.
3. S03: The corrected payment still requires a fresh yes; nothing stages on the correction.
4. S04: A split-total correction recalculates all participant shares.
5. S05: A corrected split retains participants and memo.
6. S06: A number in an unrelated split question never changes the total.
7. S07: A blocked cancellation remembers its identified merchant for "cancel that".
8. S08: A subsequently identified merchant supersedes that referent.
9. S09: An ambiguous category never becomes a fabricated merchant referent.
10. S10: A staged-payment status question says staged and unconfirmed, never sent.
11. S11: Posted status is stated only from the matching stored posting evidence.
12. S12: Unrelated financial questions keep their existing handler ownership.
13. S13: Repeated yes replies retain the settlement summary and never duplicate an action.
14. S14: Repeat acknowledgments do not extend the original approval-reply time window.
15. S15: The latest explicitly settled request supersedes the old settlement summary.

The broader 50-case suite restores JSON state every turn and runs three trials. It measures deterministic workflow memory, not career-profile semantics, live model understanding or actual delivery. Expected outputs were frozen before production changes. Two initial probe assumptions were corrected before freezing: split receipts list the payee before the share, and a new payee must supply a rail and type the handle back after the read-back. Those were audit mistakes, not product bugs.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Exact currency correction | Exact currency correction | `S01` in tests/depth-CORE-MEMORY.test.cjs | Break exact currency correction in a parseable production module | proven (also fails S02, S03) |
| S02 | Retained correction facts | Retained correction facts | `S02` in tests/depth-CORE-MEMORY.test.cjs | Break retained correction facts in a parseable production module | proven (also fails S01, S03) |
| S03 | Fresh approval after correction | Fresh approval after correction | `S03` in tests/depth-CORE-MEMORY.test.cjs | Break fresh approval after correction in a parseable production module | proven (also fails S01, S02) |
| S04 | Recalculated split shares | Recalculated split shares | `S04` in tests/depth-CORE-MEMORY.test.cjs | Break recalculated split shares in a parseable production module | proven (also fails S05) |
| S05 | Retained split context | Retained split context | `S05` in tests/depth-CORE-MEMORY.test.cjs | Break retained split context in a parseable production module | proven (also fails S04) |
| S06 | Numbers in questions are not corrections | Numbers in questions are not corrections | `S06` in tests/depth-CORE-MEMORY.test.cjs | Break numbers in questions are not corrections in a parseable production module | proven |
| S07 | Blocked cancellation referent | Blocked cancellation referent | `S07` in tests/depth-CORE-MEMORY.test.cjs | Break blocked cancellation referent in a parseable production module | proven (also fails S08, S09) |
| S08 | Newest merchant referent | Newest merchant referent | `S08` in tests/depth-CORE-MEMORY.test.cjs | Break newest merchant referent in a parseable production module | proven (also fails S07, S09) |
| S09 | Ambiguous category cannot invent referent | Ambiguous category cannot invent referent | `S09` in tests/depth-CORE-MEMORY.test.cjs | Break ambiguous category cannot invent referent in a parseable production module | proven (also fails S07, S08) |
| S10 | Honest staged status | Honest staged status | `S10` in tests/depth-CORE-MEMORY.test.cjs | Break honest staged status in a parseable production module | proven (also fails S11) |
| S11 | Transaction-evidenced posting | Transaction-evidenced posting | `S11` in tests/depth-CORE-MEMORY.test.cjs | Break transaction-evidenced posting in a parseable production module | proven |
| S12 | Unrelated questions retain ownership | Unrelated questions retain ownership | `S12` in tests/depth-CORE-MEMORY.test.cjs | Break unrelated questions retain ownership in a parseable production module | proven (also fails S13, S14, S15) |
| S13 | Repeated approval settlement memory | Repeated approval settlement memory | `S13` in tests/depth-CORE-MEMORY.test.cjs | Break repeated approval settlement memory in a parseable production module | proven |
| S14 | Original repeat time window | Original repeat time window | `S14` in tests/depth-CORE-MEMORY.test.cjs | Break original repeat time window in a parseable production module | proven |
| S15 | Latest settled goal | Latest settled goal | `S15` in tests/depth-CORE-MEMORY.test.cjs | Break latest settled goal in a parseable production module | proven |
<!-- results:end -->
