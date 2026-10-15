# GC PASS #1 — forbidden-rules garbage collection (B-04, MI-045)

**Date:** 2026-10-15 · **Crew:** A · **Cadence:** weekly (protocol §11) · **Register:**
`docs/career/forbidden-rules.md` + `~/workspace/your_files/upmore-forbidden-rules.md`
(verified byte-identical at the end of this pass, `cmp` clean).

## Canonical counting method (adopted this pass)

Parse index rows (`| FR-nnn (source) | STATUS | guard |`) and read the **status cell**
exactly. Before this pass the register gave three different UNENFORCED counts depending on
the ruler — 91 (predecessor's count), 103 (the register's own totals comment), 95 (the true
figure once unindexed rules were counted) — and the totals comment (257 ENFORCED / 103
UNENFORCED) matched **no** parse of the file it sat in. A register whose totals cannot be
reproduced is decoration, not law; the GC cadence now recounts by this method weekly.

## Findings & actions

1. **Index incomplete:** detail sections FR-363–FR-366 stood in the register with no index
   rows. → Index rows restored (all four UNENFORCED, per their own enforcement texts).
2. **FR-367 added** (MI-001's clock-source class rule, ENFORCED from birth) — index row +
   detail section.
3. **FR-031 CLOSED mechanically:** its enforcement text prescribed "a tree check asserting
   exactly one 126-career-track.js." Stood up as `tests/career-gc-guards.test.cjs` FR-031 —
   green (exactly one copy: `packages/domain/126-career-track.js`). → FR-031 flipped to
   ENFORCED in both copies.
4. **Totals reconciled:** the totals comment now reads the canonical count.
   **Register state after this pass: 367 rules = 272 ENFORCED / 94 UNENFORCED / 1 HARD-SHUT.**
5. **FR-363–366 detail sections carry no STATUS line** (their state is unambiguous from
   their enforcement texts). Clerical; left as-is this pass, noted for pass #2.
6. **358 detail sections vs 367 index rows:** 9 index rows have no detail section in the
   file. Not chased this pass; recorded as a known gap for pass #2.

## The 94 UNENFORCED, dispositioned

Citation scan (this pass): each rule's FR id and source id grepped over `tests/`;
citing files then checked against the 2026-10-15 full sweep (3,855/3,821/12 — none of the
citing files is in the failing set).

- **30 CITED + citing file green** — candidate flips for pass #2, which verifies
  assertion-vs-rule per rule before flipping (the FR-355 lesson: a citation is not a
  verdict): FR-062, FR-065, FR-066, FR-067, FR-074 (career-finisher-f), FR-090
  (receipt-items), FR-113 (g5), FR-123 (g1), FR-134 (bundle), FR-135 (g2), FR-163
  (agent100 stubs), FR-166–FR-171, FR-174–FR-184, FR-186, FR-187 (the IB integration
  suites: career-ibtn-integration, career-ibap-integration, career-ib-outreach-integration,
  career-pool-coverage).
- **64 with no test citation** — the true unguarded queue. Themes: the finance-era FIN-*
  clusters (shelved with the shelved finance build; they flip or retire with that build's
  fate, an owner call, not a GC call), the IB-wave remainder, the apply/portal rules
  FR-364/365/366 (the portal lane owes the guards, per their texts), FR-363 (the next
  wording round owes the guard), and the CIR pair below.
- **FR-011 / FR-020 (CIR coverage) — guard designed, build queued:** assert, for every
  scenario in the 300 whose ask names a company, that the company's CIR file exists under
  `packages/career-data/cirs/` (38 files), with the named-but-uncovered firms recorded as
  an explicit expected-absent list so a new claim fails loudly and a new file shrinks the
  list deliberately. MI-045 stays open on this pair + the pass-#2 flip verifications.

## Delta (B-04, measured)

Pass #1 moved the register from three irreconcilable counts to one canonical count,
restored 4 missing index rows, and closed 1 rule mechanically (94 UNENFORCED, from a true
95). The bigger catch is the 30 cited-but-unflipped rules: enforcement existed on disk and
the register didn't know — the exact drift the weekly cadence exists to burn down.
