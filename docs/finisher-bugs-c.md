# Finisher lane C — bugs found & fixed (SC-242/243/244)

## FIN-C-003 — LCA xlsx reader missed inline-string cells; openpyxl path too slow
- Found: 2026-10-13. The openpyxl read_only aggregation of the 79MB FY2025 Q4 file ran
  >20 min without finishing (killed); the replacement streaming XML reader then failed its
  own roundtrip unit test: openpyxl-written files store strings as `inlineStr` (no `<v>`),
  which the reader skipped, so the header row came back empty (KeyError: EMPLOYER_NAME).
  The DOL file itself uses shared strings and parsed correctly (563,689 rows).
- Replay test: `tests/aggregate-lca.test.py::TestXlsxReader` — errored before the fix.
- Fix: reader handles `inlineStr` cells; aggregation completed via the streaming reader
  (563,689 rows scanned, 9,392 matched). Tests green after.

## FIN-C-002 — gradSchoolROIRead reply failed verifyClaims + lintAdvice on first canonical run
- Found: 2026-10-13, SC-243 canonical run came back LEARN. Two defects in the composer
  (packages/domain/134-career-paths.js): (1) the citation "Table 5.1" in the Sources line
  parses as the unsourced number 5.1 under 125's numbersIn; (2) BLS one-decimal unemployment
  rates (2.5% / 2.2%) trip lintAdvice's false-precision-decimal-percent rule.
- Replay test: `tests/career-evidence-fin-c.test.cjs` — "134 evidence functions pass
  verifyClaims + lintAdvice" failed on gradSchoolROIRead before the fix.
- Fix: composer drops the "5.1" table numeral from the reply text and states unemployment
  qualitatively ("low single digits for both groups") — the exact one-decimal rates stay in
  the dataset, where they belong, instead of in advice prose. Scenario rerun: COMPLETE.

## Pre-existing (NOT this lane, not fixed — reports are out of scope)
- `tests/mutation-report.test.cjs` fails 2 tests on untouched pivot/career HEAD as well
  (verified 2026-10-13): `docs/depth/MUTATION-COVERAGE.md` is stale and 120-career-access.js
  is neither covered nor gap in it. Full-suite result on this branch is therefore
  2702/2704 with exactly those 2 pre-existing failures; the career subset is 283/283.

## FIN-C-001 — posting-signal extractor counted company boilerplate as a major requirement
- Found: 2026-10-13, while building `posting-degree-signals.json`. Coinbase/Robinhood/Ramp
  scored `specific_majors_named` on 100% of postings — the pattern matched boilerplate
  ("build the future of finance", "infrastructure for finance teams"), not requirements.
- Replay test: `tests/career-evidence-fin-c.test.cjs` — "boilerplate major words do not
  count" failed before the fix (signal true on boilerplate-only text).
- Fix: `specific_majors_named` in `scripts/career/datasets/extract-posting-signals.cjs`
  now only counts a named major when a requirement-context word (degree / field / major /
  education / background / qualifications / studying / pursuing) appears within 120
  characters of it. Test green after the fix; aggregates regenerated.
