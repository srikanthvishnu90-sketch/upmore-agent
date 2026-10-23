# Captured-form coverage for the forms-ci captures that had no pinned record — Greenhouse + Lever

## Corrections (2026-10-23) — on top of the measurement record below

The original push (`d8f64405`) stands as the measurement record; the four
coordinator-gated corrections below land as new commits on top and **supersede the
original summaries where they differ**:

1. **All 97 mapped-not-filled fields reconciled per field** (fixture:
   `expectation.reconciliation` — exact name, label, status from the captured
   schema, widget class, attempted value, the executor's outcome, its own reason;
   no bulk labeling). Composition by status class: **required 45 ·
   required-conditional 13 · optional 32 · core-contact 7**. By reason: 75
   custom-select non-persistence (unverified-against-live), 19 native-select
   placeholder-policy non-fills, 3 `DRIVER_ERROR`. The 97 are kept distinct from
   the separate read-back axis (174 filled vs 167 read back exactly = 7
   filled-but-not-exact fields, named in the doc).
2. **Custom-select framing corrected.** The 75 react-select non-fills are no
   longer described as a capture-replay limitation: on a stripped capture we
   cannot know whether those selects are required in effect or would persist
   live. Every affected field/record is labeled **unverified-against-live**; the
   live comparison is **held, not scheduled**. Related measured finding, stated
   with its limit: for the 19 Lever native `<select>` non-fills the only
   attempted value was the placeholder first option under the drive's
   first-option policy (one same-shaped Lever select filled, so the placeholder
   alone does not determine the outcome).
3. **Read-only safety test isolation fixed, fail-first.** Standalone
   (`--test-name-pattern="read-only"`) on the pre-correction code: **0 pass / 1
   fail** — the exact-set assertion failed on an empty command log because no
   drive test had run in that process. The test now drives the smallest captured
   form itself when no drive has run in-process, then judges that drive's logs;
   standalone post-fix: **1/1 pass**. Assertions unchanged, including the
   verbatim naming of offending requests/commands.
4. **Blanket `claimable: true` dropped.** The coverage block carries sums only.
   Claims are scoped: per-form claims (`capturedForms[].claim`, 11/11 claimable
   with per-form bases) and per-widget-class claims (`widgetClassClaims`):
   Greenhouse custom selects 75 mapped / 0 filled = **unverified-against-live**;
   Lever native selects 20 mapped / 1 filled = partial; Greenhouse number inputs
   partial (3 × `DRIVER_ERROR`); Lever checkbox group partial (pronouns read-back
   exceptions); the remaining classes covered. The gate now enforces the scoped
   shape (reconciliation completeness, the unverified label, tally equality,
   absence of the blanket flag) with unit cases for each tamper.

Derivation note: statuses/widget classes come from the captured schema artifacts
plus a discover-only re-run of the machinery over the same captures (no fills, no
new captures, no live contact), which reproduced the pin's mapped counts exactly
on all 11 forms. A VM replacement mid-corrections wiped the first derivation's
/tmp scratch; the re-run from durable copies is the derivation of record.

---

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

- Greenhouse maps everything discovered (139/139) but fills 61/139 — the non-fill
  outcomes are 75 react-select non-persistence (**unverified-against-live**, see
  the corrections section above — not a capture-replay claim) and 3 `DRIVER_ERROR`
  year inputs. Everything it filled read back exactly (61/61).
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
