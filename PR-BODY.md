# Captured-form coverage for the forms-ci captures that had no pinned record — Greenhouse + Lever

The 17 application forms captured in `tests/fixtures/forms-ci/` (2026-10-19 CI capture)
now all carry pinned captured-form coverage records: the 6 Ashby forms were pinned by
the Ashby verdict pack, and this branch pins the remaining 11 (5 Greenhouse + 6 Lever)
by driving each locally served capture through the product's own portal-browser
helper and shared binder — fail-closed runner, submit controls recorded never
clicked, GET-only local server. **Recorded coverage (gate-verified sums of the
per-form pins): 11 forms · 398 fields discovered · 271 questions mapped · 174
filled+verified · 167 read back exactly.** This is captured-form coverage — not live
driveability, not production quality. No new captures; no live site was contacted in
any way; no Palantir capture exists in forms-ci (suite-asserted; the standing hold is
pinned as a test).

## What changed

- `tests/career-forms-ci-coverage.test.cjs` — the coverage suite: inventory tests
  (drive set == the manifest's captured Greenhouse + Lever application forms; Ashby
  set == the set pinned by the Ashby pack and never served here; not-captured entries
  recorded; Palantir hold test), the coverage gate (SmartRecruiters-pack pattern,
  strengthened so the recorded coverage block must equal the sums of the per-form
  pins), per-form drive tests against the pin, and the read-only proof (command log
  is exactly open/discover/fill/readback/close; server saw GETs only).
- `tests/fixtures/forms-ci-coverage-expected.json` — the pin: per-form provenance
  (source URL, capture timestamp, capture method, capture-time bot check) + pinned
  drive expectation (discovered/mapped/filled/read-back counts, per-field fill
  outcomes with the executor's reasons, file-question and attestation inventories),
  the already-pinned Ashby set with its citation, the not-captured records, and the
  coverage block.
- `docs/engine/FORMS-CI-COVERAGE-2026-10-23.md` — inventory (all 24 manifest
  entries), the per-family coverage table, exclusions, failure records, boundary.

## Measured findings (from the pin)

- Greenhouse maps everything discovered (139/139) but fills 61/139 — the dominant
  non-fill outcome is `value_did_not_persist` on JS-widget selects/typeaheads over
  the script-stripped captures. Everything it filled read back exactly (61/61).
- Lever's binder maps 132/259 discovered (the two largest forms map 28 each) and
  fills 113/132; 7 filled values did not read back exactly (pronouns ×2, card fields
  ×3, survey responses ×2), pinned per field.
- Attestation-class questions: 2 (TSMG "I agree" policies confirmation; Lyra Health
  Internal Mobility Policy certification) — inventoried as stops. File questions: 17
  (resume on all 11 forms; cover-letter/question files on EOS, SpaceX, Anduril).
- 3 fills returned the helper's `DRIVER_ERROR` (year spinbutton inputs on EOS
  Fitness ×2, Anduril ×1) — deterministic across repeat drives, pinned as measured
  outcomes.

## Fail-first evidence (coverage gate, recorded before the pin was relied on)

1. Headline tamper (`FORMS_CI_COVERAGE_EXPECTED` → coverage block inflated by 1,
   pins untouched): gate test **red** — 1 fail / 1 pass in the gate test pair,
   suite exit 1 (run 2026-10-23).
2. Pin tamper (EOS Fitness `mapped` 36→37 with the coverage block inflated to match,
   internally consistent): EOS drive test **red** on re-drive — actual
   `{rawFields: 36, mapped: 36, filledCount: 19, readbackMatched: 19}` vs pinned
   `mapped: 37`; suite exit 1 (run 2026-10-23).

## Verification

- **This suite, full run on this branch: 18 tests / 18 pass / 0 fail** (all 11 drive
  tests against the pin, both gate tests, all 4 inventory tests, the read-only
  proof; 1,578s on this VM, 2026-10-23).
- Neighbors: `tests/career-form-ci-fixtures.test.cjs` **4/4 pass** on this branch ·
  Ashby verdict pack suite **7/7 pass** in its own worktree (its pin intact) ·
  `tests/career-apply-real-forms.test.cjs`: 1 pass / 17 fail on this branch and
  **byte-identical failing set on unmodified trunk** — every failure is
  `BROWSER_SANDBOX_REQUIRED` (apply.ts refuses this VM's sandbox posture in both
  directions; the established environment red, not a branch effect). This branch's
  diff is additive only (3 new files + this PR-BODY).

## Boundary

Pre-existing repo fixtures only (2026-10-19 captures). No new captures, no live
contact of any kind, no Palantir, no production anything (freeze; host down).
Chromium ran under the helper's recorded sandbox opt-out on this VM
(`UPMORE_CHROMIUM_SANDBOX=off`). Measurement on this VM was interrupted by VM
replacements in early attempts; final numbers come from clean per-family runs with
identical outcomes on repeat drives (EOS Fitness ×5, Anduril ×4, Prolific ×3).
