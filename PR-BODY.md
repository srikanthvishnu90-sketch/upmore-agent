# Widget-gap lane — PR body (branch `muse/2026-10-23-widget-gap`)

**Base:** `muse/2026-10-23-forms-ci-coverage` @ `04eb62af` (the corrected forms-ci
coverage pack). This branch is built directly on that head; nothing else is merged in.
(This file replaces the base branch's PR-BODY.md on this branch only; the base's own
PR body remains on its branch.)

**Scope (coordinator order, 2026-10-23):** close the measured widget gap in the
coverage pack, repo-only on the captured fixtures in `tests/fixtures/forms-ci`.
The pack's reconciliation pinned 97 mapped-not-filled fields: 75 custom
react-selects + 19 native selects + 3 number inputs, 58 of them schema-required.
Live-network halt in force throughout: locally served captures only, no external
fetch/load/API call of any kind; git push is the only network operation used.

## What the machinery looked like before (measured)

- The pack's drive policy (`valueFor` in `tests/career-forms-ci-coverage.test.cjs`)
  answered every option field with its FIRST option's label. For Lever native
  selects the first option is the placeholder ("Select...", value "") — so no
  non-placeholder option was ever attempted. One exception proved the shape: a
  Shield AI card select whose placeholder label ("Please select an option") does
  not read back as select-like was counted **filled on a placeholder selection**.
- The 3 number inputs (education years) were attempted with the date string
  "06/01/2027" (the label `/date/i` fallback) → the helper threw DRIVER_ERROR.
- Greenhouse react-selects: the captures carry **no menu DOM** (0 `select__menu`
  nodes, 0 native `<select>` elements in all 5 Greenhouse captures) and are served
  with scripts stripped, so no widget drive can open or set them here. Option lists
  for the `question_*` selects exist in the captured boards-API artifact
  `tests/fixtures/forms-ci/greenhouse-options.json`; country / candidate-location /
  school / degree / discipline / end-month / hispanic_ethnicity carry no option
  list anywhere in the captured material.
- Two conditional follow-ups were attempted unconditionally (WPP disability
  follow-up; EOS "If no…" CPR follow-up), and two attestation-class fields were
  attempted — one of them (a Lyra radio) was counted **filled**.

## Fail-first record (guards red on the pre-change machinery)

Guard tests were added to `tests/career-forms-ci-coverage.test.cjs`
("widget-gap guard: …") and run against the unmodified base machinery
(helper + policy @ `04eb62af`) BEFORE any implementation:

Run 2026-10-23 (this VM, `UPMORE_CHROMIUM_SANDBOX=off`, name pattern
"widget-gap guard"): **6 tests — 1 pass / 5 fail** on the pre-change machinery:

- ✖ EEO select policy: policy emitted `'Select ...'` (the placeholder) where the
  guard requires `'Decline to self-identify'`.
- ✖ Placeholder guard: the base helper counted the Shield card select's
  placeholder as a fill — verbatim response
  `{"filled":true,"verified":true,"attempts":1,"rendered":"Please select an option"}`.
- ✖ Number inputs: policy emitted `'06/01/2027'` where the guard requires the
  persona's numeric year `'2027'` (the non-numeric crash half of this guard is
  exercised after the policy fix; the base outcome for that fill is the pinned
  DRIVER_ERROR in the fixture).
- ✖ Conditional gating: `the drive has no conditional gate`.
- ✖ Attestation stop: the TSMG attestation select measured
  `'value_did_not_persist'` (attempted) where the guard requires
  `'attestation_stop'` (the Lyra half of the same guard measures the attestation
  radio as filled on the base drive — pinned in the base fixture).
- ✔ Pin-gate guard (an unfilled required select flipped to "filled" in the pin
  is rejected): **already green on the base gate** — the coverage gate's sums +
  reconciliation exact-set reject the flip. Recorded honestly: this guard locks
  an existing property by name; it is not new red.

## Changes

<!-- COMMITS -->

## Re-pins

<!-- REPINS -->

## Verification

<!-- VERIFICATION -->
