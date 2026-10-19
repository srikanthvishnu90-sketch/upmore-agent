# GC PASS #2 — forbidden-rules garbage collection (B-04, MI-045)

**Date:** 2026-10-19 · **Crew:** A · **Cadence:** weekly (protocol §11), same cycle as the
weekly production sampling pass (live failure registry, "WEEKLY FULL PASS, 2026-10-19").
**Register:** `docs/career/forbidden-rules.md` + `~/workspace/your_files/upmore-forbidden-rules.md`
(verified byte-identical at the end of this pass, `cmp` clean).

## Canonical recount (status-cell parse of the index, per gc-pass-001)

| Copy | Index rows | ENFORCED | UNENFORCED | HARD-SHUT | Detail blocks | Totals comment |
|---|---|---|---|---|---|---|
| Repo copy, at pass start | 387 | 295 | **91** | 1 | 378 | 378 / 286 / 91 / 1 |
| Shared copy (`your_files`), at pass start | 416 | 321 | **94** | 1 | 407 | 407 / 312 / 94 / 1 |
| **Both copies, at pass end** | **416** | **323** | **92** | **1** | **407** | **407 / 314 / 92 / 1** |

## Findings & actions

1. **The two copies had drifted — 29 blocks.** The shared register (updated 2026-10-17,
   hourly run 9) carries FR-388…FR-416; the repo copy stopped at FR-387 (its totals comment
   still dated 2026-10-15). Registry notes 6–9 record the repo carry as repeatedly owed to
   "the next merge owner"; it never landed. The drift also *hid* 3 UNENFORCED rules from the
   repo copy (FR-404, FR-408, FR-416), which is why the repo copy showed 91 against the
   canonical 94. **Repair per protocol: the corrected (shared) register was copied over the
   repo copy — neither side was hand-edited.** `cmp` clean after the copy.
2. **Index vs detail disagreement persists (carried from pass #1, item 6 — still a finding).**
   416 index rows vs 407 detail blocks: FR-309…FR-317 hold index rows with no detail
   sections. All nine are ENFORCED, so the UNENFORCED count agrees by both parses (92);
   total and ENFORCED counts do not. Writing the nine detail sections is owed (Crew A
   registry); it does not block the UNENFORCED line.
3. **FR-011 + FR-020 CLOSED mechanically — the pass's closables.** Both rules prescribe the
   same enforcement (a CIR-coverage test), designed in gc-pass-001. It now stands as the
   FR-011/FR-020 guard in `tests/career-gc-guards.test.cjs`: every company named in a
   scenario ask (`scripts/career/scenarios/SC-*.cjs`, 328 files — `s.user(...)` literals +
   title line) must find its CIR file under `packages/career-data/cirs/` (38 files), with
   named-but-uncovered firms held in an explicit EXPECTED_ABSENT list that fails if it goes
   stale in either direction. Scan result: 24 covered firms are named in asks and all hold
   CIRs — including the original BUG-011/020 companies (Ramp ×8 scenarios, Figma, Stripe,
   Datadog ×9, Palantir), which had no files when the rules were written. **EXPECTED_ABSENT
   = Centerview only** (named in SC-012; the missing CIR content is Crew B's, MI-084).
   Guard verified: **2/2 green** on this tree (with FR-031), and **fail-first proven** —
   hiding `ramp.json` turns it red with the rule's own assertion naming the scenarios;
   restored, green again. Both rules flipped to ENFORCED in the register (index + detail +
   totals comment), in both copies.
4. **UNENFORCED movement: 94 → 92 (canonical line, one direction).** The repo copy's
   nominal 91 → 92 is an artifact of finding 1 (the sync restored 3 hidden UNENFORCED
   rules, then the 2 flips landed); the canonical register's line is 94 → 92.
5. **Not closed this pass (named, not silently carried):** pass #1's 30 cited-but-unflipped
   candidate rules still owe their per-rule assertion-vs-rule verification before any flip
   (the FR-355 lesson stands: a citation is not a verdict) — they remain the GC queue's top
   item for pass #3. FR-404 / FR-408 / FR-416 stay UNENFORCED with their fixes owed by their
   named lanes (Crew B worker / Crew B 149 / the next lane touching evals/depth/run.cjs).
   FR-363's wording guard stays owed to the next wording round. The FR-309…FR-317 detail
   sections (finding 2) are owed by this registry.

## Delta (B-04, measured)

Pass #2 closed the FR-011/020 pair with a fail-first-proven tree guard, burned the
29-block register drift down to byte-identity, and moved the canonical UNENFORCED line
94 → 92. The structural catch of this pass is the same shape as pass #1's: the register's
two copies disagreed, and the *lower* number was the wrong one — the drift was hiding
open rules, not closed ones.
