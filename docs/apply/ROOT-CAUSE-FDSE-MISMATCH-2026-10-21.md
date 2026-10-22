# ROOT-CAUSE NOTE — FDSE Chicago ANSWER_OBSERVATION_MISMATCH (batch-5ab08dedd45c)

Lane: FDSE mismatch (owner: "keep pushing things and working", 2026-10-21 22:45 CDT).
Evidence: ~/workspace/o5-batch/run-live-widgetfix.json + run-live-widgetfix-progress.jsonl
(the stopped batch), ~/workspace/o5-batch/diag-fdse-mismatch-result.json (the proof drive).
Host-tree line numbers below are the live files; host 149 / 150 / bridge are byte-identical
to commit cc74872b (LIVE-HOST SNAPSHOT), host 155 is that snapshot plus the LOOP Task 1
composition (family filter + attestation completion).

## Verdict — the exact field

- Field: `which_university_are_you_currently_attending_or_`
  ("Which university are you currently attending or did you last attend?")
- Filled from the confirmed fact: `DePaul University (Driehaus College of Business)`
- Observed on the board (answers readback): `DePaul University`
- The board's own rendering of the fill (FR-395 rendered value): `DePaul University`

The Lever university widget resolves the typed school to its canonical single value and
drops the college parenthetical. The fill was correct. The comparison never saw the
rendering it was designed to compare against.

## The chain (why · exact lines)

1. 149's observation gate compares the readback against the board's rendered value when
   one exists — `packages/domain/149-career-portal-apply.js:844`:
   `const rendered = board.renderedValues && board.renderedValues[id];` (expectation set
   at :845). Only when no rendered value exists does the raw profile text become the
   expectation.
2. On the production path the board is the worker bridge board
   (`supabase/functions/_shared/career_task_bridge.js`): the board service attaches a
   renderedValues snapshot to its call responses (`workers/career-browser/board-service.cjs:206-215`),
   the bridge merges them into `renderedState` (:319-321), and exposes them ONLY through a
   getter (:330): `get renderedValues() { return Object.assign({}, renderedState); }`.
3. The drive harness (`~/workspace/o5-batch/run-live-widgetfix.cjs`, `wrapBoard`, lines
   38-44) builds its observation wrapper by copying every non-function own property ONCE
   at wrap time. Reading `board.renderedValues` at that moment invoked the getter while
   `renderedState` was still `{}` — the wrapped board carried a frozen `{}` for the whole
   drive. Every other dynamic board member is a method (wrapped by delegation to the live
   board, unaffected); `renderedValues` is the one dynamic DATA property, and it froze.
4. With the hatch empty, 149 compared raw text:
   `depaul university (driehaus college of business)` ≠ `depaul university` → blocked at
   149:859. It is the first hatch-dependent field in fill order whose raw comparison
   fails: in the proof drive, name/email/phone/urls/screenings/school-name matched raw
   (`hatch_only: false`), and `eeo_veteran`'s raw mismatch is both later in fill order and
   rescued by the eeo-decline disjunct (149:849).

## Proof

`diag-fdse-mismatch.cjs` ran the identical production composition (same production
sources, same TEST profile, same board provider, same posting, 149 called exactly as 155
calls it) with a getter-preserving wrapper. Result stepLog:
`answer_observation_rendered { field_id: "which_university_are_you_currently_attending_or_", matched: true, hatch_only: true }`
— and NO mismatch (the run proceeded past the observation gate to awaiting_user).
`hatch_only: true` is the exact signature of this defect: the raw profile value alone
would have mismatched; the board's rendered value carried the comparison.

## Defect (i) — the stop record cannot name its field (observability)

- 149's blocked result DOES carry `field_id` (149:859) but not the expected/observed values.
- 155 discards even that: `absorbPrepareResult`'s generic blocked path
  (`packages/domain/155-career-batch-apply.js:345`) calls
  `stopApp(run, app, res.code, res.reason)` — `res.field_id` and every other stop detail
  are dropped; `summarizeRun` (:561) copies only code+reason into the run summary.
- Consequence, measured: the stored record for batch-5ab08dedd45c says only "the observed
  value differs from the confirmed fact" — naming the field required a separate diagnostic
  drive for a fact the code already had in hand.

## Defect (ii) — a property-copying wrapper silently disables FR-395

The board contract exposes its one dynamic data property behind a getter. Any wrapper
that snapshots own properties (Object.keys copy, spread, Object.assign) freezes it at its
initial `{}` and 149's rendered-value hatch silently no-ops — the gate then raw-compares
widget renderings it was designed (FR-395) never to raw-compare. No error anywhere; the
failure mode is a wrong stop on a correct fill.
Fix shape (this round): boards also expose rendered values through a METHOD
(`renderedValue(fieldId)` — methods survive delegation wrappers, which is how every
observation harness wraps boards), and 149 prefers the method when present, falling back
to the property. The harness wrapper additionally stops snapshotting data properties.

## NOT this stop — reproduced in both drives, ledgered separately

- **Major pick null fill.** Field `what_is_your_major_please_choose_the_closest_res...`
  (REQUIRED, kind standard, profile_key `education_discipline`). The confirmed fact value
  is a degree string ("of Science in Computer Science and Finance"); the board asks for
  its closest fixed response. `board.fill` returned null in ~131-143ms in both drives and
  the field is absent from answers(). Because the field WAS attempted, 149 treats its
  absence as a persistence/doorstep matter, not this gate — it did not cause this stop.
  It is the F-007-class mapping gap (confirmed fact → the board's closest option, which
  needs the mapping layer / user confirmation, never invention), and it stands between
  FDSE and a doorstep even after this round's fix.
- **EEO disability null fill.** `eeo_disability` (optional): the same EEO_DECLINE text
  that `eeo_veteran` accepted (rendered "I decline to self-identify for protected veteran
  status") returned null in ~133-173ms in both drives; the field is absent from answers().
  Optional + absent-from-observed ⇒ skipped by the gate; did not cause this stop. The
  decline-vocab fix 04e24fde aligns 149's GATE-side acceptance; this is the FILL side on
  Lever's disability select — a different seam.
- **Decline-vocab 04e24fde absent from host 149: TRUE, and NOT this stop's cause.** Host
  149 carries only the inline decline regex (149:849) and no EEO_DECLINE_MEANING. But the
  one EEO field that reached comparison (eeo_veteran) was rescued by the existing
  disjunct, and the proof drive passes the gate with host 149 exactly as-is. Its host
  application remains owed on its own round (one fix per round).

## Standing behind this stop (named by the proof drive; not this lane's defects)

With the gate passed, FDSE prepare reaches `awaiting_user` on REQUIRED uncovered fields
of the live Lever form: `language_skill_s_check_all_that_apply` (kind unknown),
`please_tell_us_how_you_heard_about_this_internsh` (unknown),
`where_are_you_spending_summer_2026` (unknown),
`we_have_two_software_engineer_roles_at_palantir_` (free_text — needs a confirmed draft),
`as_part_of_our_interview_process_we_may_use_ai_n` (unknown). In 155 these surface as an
UNCOVERED_QUESTION stop. A live FDSE card cannot form until those carry confirmed
facts/drafts (the module-172 ask path) — separate from this round's fix, and the honest
expected end-state of this round's re-drive.

## EMPTY_FORM race (attempt 1, batch-7ac6d3b30fa5)

Both postings stopped EMPTY_FORM in ~100ms with 0 fields while bracketing drives through
the same service minutes apart returned 27/34 fields; this lane's proof drive also
returned the full 27-field form. Confirmed as a page-timing race in open's single
post-apply-click discover scan (the scan can land before the form mounts). Ledgered with
that evidence; not reproduced in this lane's drives; not this lane's fix.
