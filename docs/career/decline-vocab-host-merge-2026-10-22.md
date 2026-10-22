# DECLINE-VOCAB host merge — 2026-10-22 (night plan chunk 20%)

## Root cause (unchanged from the decline lane's finding)

Greenhouse renders the EEO decline option as "I don't wish to answer".
Module 149's observation gate accepted a decline fill only through an
inline regex (`decline|prefer not|not (to )?answer|not (to )?disclose`)
whose token set does not cover the boards' wish forms. Measured
2026-10-21 @ cc2932c9 on 24 verified EEO-decline fills: the board
rendered the decline answer correctly every time, but the gate accepted
5 and rejected 19 — ANSWER_OBSERVATION_MISMATCH blocked ~3/4 of
Greenhouse drives with every fill correct.

The fix was authored 2026-10-21 @ 04e24fde (branch
muse/2026-10-21-decline-vocab): the decline class became named DATA in
149 (EEO_DECLINE_MEANING + eeoDeclineMatch/isEeoDeclineText, WO-020
question_map shape), and the gate's decline disjunct became
class-vs-class. It was never applied to the host tree — the tree the
board service actually loads — so live Greenhouse drives kept stopping.
This change is the arbitered host application (F-020: one owning lane
per helper region; wholesale adoption or arbitered merge only).

## The merge

Three-way, `git merge-file` on packages/domain/149-career-portal-apply.js:

- base: 04e24fde^ (adeb3581) — the 149 the decline fix was written against
- ours: ac17d86f — current host 149; carries F-027 (phone digits
  equivalence), F-028 (location country-suffix equivalence), the
  FDSE-MISMATCH renderedValue-method hatch and the stop-record values
- theirs: 04e24fde (fbd997bd) — the decline change set

3 conflicts, all in the observation gate / exports; resolutions:

1. `same` declaration — ours is `let` (the F-027/F-028 block reassigns
   it); theirs added the DECLINE-VOCAB comment above a `const`.
   Resolved: theirs' comment + ours' `let`.
2. The decline disjunct line — replaced ours' inline-regex line with
   theirs' class-vs-class line verbatim; everything else in the region
   (equivalence block, FR-395 hatch logging, stop record) is ours,
   untouched.
3. Exports — ours' list (which carries `portalInputsFromBank`, absent
   on the decline line) + theirs' three added exports
   (EEO_DECLINE_MEANING, eeoDeclineMatch, isEeoDeclineText).

Diff proof: merged file vs ours = exactly the decline change set and
nothing else (52 diff lines: +37 the EEO_DECLINE_MEANING data block,
+11 the gate comment, 1 disjunct line, 1 export line). The F-027 and
F-028 equivalence regions are byte-identical to ours.

Merged 149 sha256: 2316b8fb766b72b77c7339e51b8d3fd8554fc85ea46a4355d8e28c6f0bf41e63

## Guards (merged tree, node --test)

- tests/career-decline-vocab.test.cjs — 12/12
- tests/career-phone-render-equivalence.test.cjs — 5/5 (F-027 unregressed)
- tests/career-location-render-equivalence.test.cjs — 7/7 (F-028 unregressed)
- tests/career-question-kind.test.cjs — 6/6
- tests/career-observation-stop-record.test.cjs — 5/5
- Portal suites (career-portal-apply + career-portal-answer-map +
  career-portal-submit-integrity): 29 pass / 11 fail — identical to
  the f028 base tree, failing-name sets identical (pre-existing
  D11–D14 environment class + F-007 pair). Regression delta +0.
