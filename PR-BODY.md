# Eligibility separation — Branch A implementation

Base: `arch/eligibility-separation-proposal` @ `9f5b46d5278d89abd96c99e67474b3f43a493b67`
Branch: `arch/eligibility-separation-impl`
Spec: `docs/architect/ELIGIBILITY-SEPARATION-PROPOSAL.md` (governs; §7 defines Branch A)

## What landed

- **New module `packages/domain/156-career-eligibility.js`** — the eligibility
  contract: `statedValue` (line-for-line port of G2's
  `supabase/functions/_shared/eligibility_draft.ts` reader, parity-pinned by
  the acceptance test), `classifyLegacy`, `eligibilityOf`, `answerFor`,
  `fromStatement`, `ROUTER_FALLBACK_TEXTS`. It is **not** added to any bundle
  list, build script list, or index wiring — Branch A's isolation holds.
- **Generated copies of the one contract body** (byte-identical, verified by
  extraction): `supabase/functions/_shared/eligibility_facts.js` (ES module
  for edge importers) and an inline generated section in
  `supabase/functions/_shared/extension_sync.js`. The inline copy is a
  deliberate mechanism, not drift: the extension-sync node guard suite loads
  `extension_sync.js` with a linker that rejects imports, so a static import
  of `eligibility_facts.js` would break that suite at load. One source (156),
  three carriers, hash-verified identical bodies.
- **`extension_sync.js` seam** — `composeSavedAnswers` now serves
  `work_authorization` and `sponsorship` only from a confirmed typed fact,
  each from its own fact (factIds
  `profile.constraints.eligibility.work_authorization_us` /
  `profile.constraints.eligibility.sponsorship`). The legacy seam —
  sponsorship from the `needsSponsorship` flag, work authorization by
  tokenizing the stored text — is removed; that tokenizer turned the
  router's "No longer needs sponsorship" into a served "No". Unconfirmed:
  nothing is served (the extension asks, the G2 pattern); a stored saved
  answer the person recorded for that exact question stands.
- **`answer_options.ts`** — the `work_authorization` case no longer picks an
  option whose label also takes a sponsorship position; combined questions
  stay with `career_apply.ts`'s both-facts path, per §4.
- **`fact_schema.ts`** — a comment recording the separation above the
  `work_authorization` entry. The schema `note` string is data and is
  unchanged in Branch A (see deviations).
- **`extension/lib/trainee-core.js`** — regenerated via
  `deno run -A extension/build.ts` (the repo's own prescription; WO-031/1
  fails the suite when stale). Its delta is exactly the two seams above,
  verified line by line. It is a generated artifact of allowed-seam sources,
  not a bundle list: 156 does not enter it (it embeds no domain modules).
- **§8 of the proposal** — the measured Branch B blast-radius addendum
  (research only; no Branch B code): 199 test files / 1,162 test
  definitions in the surface, the pins on today's legacy behavior
  enumerated, baseline 1300 passed / 0 failed on the base commit.

## Acceptance — the 29 fail-first tests

`tests/architect/pending/eligibility-separation.test.ts`, run in place:

- Base `9f5b46d5`: **1 passed / 28 failed** (the 1 = the regression guard).
- This branch: **9 passed / 20 failed** — exactly Branch A's set per §7:
  contract ×4 (incl. the G2 parity test), extension-sync ×3,
  answer_options ×1, regression guard ×1.
- The 20 still red are Branch B's by the spec's own scoping (they exercise
  frozen modules 121/124/130/132/141/142/149): writer/142 ×1, reader/141 ×3,
  reader/149 ×3, reader/132 ×3, reader/130 ×3, reader/124 ×4, reader/121 ×1,
  typed/readers ×2. They were not made green by touching frozen code.

## Deviations and blockers — named, not worked around

1. **Test promotion is blocked as a literal move.** The acceptance file
   resolves its root as `new URL("../../..", import.meta.url)`, which is
   correct from `tests/architect/pending/` and resolves to `/` from
   `tests/architect/` — moved, every load in the file breaks. Repo law
   forbids editing an architect test. The file therefore stays in
   `pending/` on this branch and is run from there; the one-line architect
   fix on promotion is to change `../../..` to `../..` in the moved copy
   (or set the `ELIGIBILITY_ROOT` it already honors). Nothing was edited,
   skipped, or loosened.
2. **`fact_schema.ts` note form.** §4's table describes the end-state
   definition ("authorized to work in the US, yes or no…"), while §7 and
   the lane's seam list scope Branch A to "a note, not behavior". The
   schema `note` string is consumed as data, so changing it is behavior;
   Branch A records the separation as a comment and leaves the string for
   the landing decision.
3. **Predicted delta in `tests/career-extension-sync.test.cjs`** (outside
   the allowed diff — not edited): its fixture personas carry
   `workAuthorization: "US citizen (TEST)"`, `needsSponsorship: false`, and
   the suite asserts the legacy servings (work_authorization "Yes" /
   sponsorship "No" under the legacy factIds, both counted as filled).
   Under Branch A those servings stop — §9 names exactly this as the cost
   ("extension-sync stops serving a sponsorship answer from the legacy
   flag… consistent with D-007"). The suite cannot execute on this VM
   (jsdom is provisioned only in CI, under `extension/tools/`, which is not
   in the repo), so this delta is predicted from the suite's own
   assertions, not measured here; the first CI run will surface it for the
   architect to re-pin.

## Affected existing suites — base vs branch

Deno (gate invocation per file):

| suite | base | branch |
|---|---|---|
| architect/g2-eligibility-draft | 14 / 0 | 14 / 0 |
| architect/wo-020-fill | 6 / 0 | 6 / 0 |
| architect/wo-020-question-map | 5 / 0 | 5 / 0 |
| architect/wo-031-extension | 18 / 0 | 18 / 0 (after the bundle regeneration above) |
| architect/wo-042-sixty | 12 / 0 | 12 / 0 |
| architect/wo-048-workday | 15 / 0 | 15 / 0 |
| architect/wo-054-answer-once | 9 / 0 | 9 / 0 |
| architect/wo-059-sample-h | 4 / 0 | 4 / 0 |
| architect/pending/g2-workauth-honest (informational) | 1 / 3 | 1 / 3 (unchanged; Branch B/C scope) |
| **full architect suite** (`--ignore=pending`) | **1300 / 0** | **1300 / 0** |

Node:

- `tests/career-extension-sync.test.cjs` — unrunnable on this VM on both
  trees (identical import-time failure: jsdom not provisioned); see
  deviation 3 for its predicted, spec-priced delta.
- `tests/career-decline-one-class.test.cjs` — 2 passed / 1 failed on both
  trees; the failure is `Cannot find module 'esbuild'` (not provisioned),
  identical base and branch. Its answer_options assertion was mirrored
  under Deno against this branch's `answer_options.ts`: 15/15 decline
  renderings still picked.

## Frozen boundary — diff vs base

Changed/added paths are only: `packages/domain/156-career-eligibility.js`
(new), `supabase/functions/_shared/eligibility_facts.js` (new, generated),
`supabase/functions/_shared/extension_sync.js`,
`supabase/functions/_shared/answer_options.ts`,
`supabase/functions/_shared/fact_schema.ts`,
`extension/lib/trainee-core.js` (regenerated artifact),
`docs/architect/ELIGIBILITY-SEPARATION-PROPOSAL.md` (§8 only), and this
file. Modules 141/142/149/132, `extension_domain.js`, and `router_core*`
are untouched; no bundle list gains 156.
