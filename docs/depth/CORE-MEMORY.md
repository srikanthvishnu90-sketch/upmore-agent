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

RESULTS_TABLE
