# Portal-driver R3 fixes — contract (2026-10-17)

Branch `fix/portal-driver-r3` off `finish/answer-bindings` @ c4014fa.
Scope: the three portal-driver defects from the R3 re-drive
(`submissions/redrive-r3-2026-10-17-summary.md`), plus the P0 Gusto
doorstep chain and the P0b coordinator rulings the same lane was
re-prioritized to (owner, 2026-10-17). Ledger rows:
PENDING-ALLOCATION (R3 portal-driver D1 / D2 / D2-Gusto / D3 / P0b)
in `docs/bug-ledger.md`. No submissions were made by this lane;
every live drive stopped at the doorstep or was abandoned.

## D1 — the attach ladder is slot-faithful

The helper's attach ladder was slot-blind (first `input[type=file]`
in DOM order, first visible Attach control page-wide) and filed the
packet PDF into cover-letter/transcript slots. Now:

- `slotClassOf` derives the slot class from the binding's
  `profile_key`; 150's `bindingFor` carries `slotId`/`slotName` from
  discovery onto the binding.
- `fnFindSlotFileInput` accepts an input only via the binding's own
  selector, the slot's discovery id/name, or the upload section
  naming exactly this slot class. `fnMarkSlotAttachControl` engages
  only the slot's own section control. Scroll/poll/CDP fallback are
  section-scoped. Another slot's input is never touched.

Guard: fixture `/gh-multifile` + test "R3-D1"
(`tests/career-portal-driver-r3.test.cjs`) — the fixture beacons
every attach (slot + filename) to its server; the beacon log must be
exactly `["resume"]`. Red on base, green post-fix. Live: Gemini DRY
drive — packet chipped in Resume/CV only, Cover Letter untouched;
Sezzle finish drive — transcript slot empty.

## D2 — fill verify judges the board's truths, polled

- File fills verify via `verifyAttach` polling three truths: the
  fresh-readback input bytes (`input_bytes`), the ladder-used
  input's FileList (`input_files`), and the slot section's filename
  chip (`section_chip`). Board upload-error text ends the poll early
  for one re-attach; ≤2 attempts. `file_input_not_mounted` only when
  the slot was never seen.
- Widget fills verify via `pollWidgetVerified`: the rendered value
  polled until two equal reads (≤3.6s); the verified page value is
  recorded as `rendered`. One repair re-drive only when no pick ever
  landed; a landed-then-dropped pick stays an honest failure (the
  doorstep repair in 149 is the recovery).
- Non-file fills: per-attempt try/catch (STALE still propagates),
  retries act on `reresolveBinding`-fresh bindings, verify waits the
  settle BEFORE the first read, then polls ≤1.8s.
- `fnWidgetValue` and `readbackBinding` read react-select
  multi-value chips (the EEO multi-select shape).

Guard: fixture `/gh-widget-late-render` + test "R3-D2" (pick
renders, control remounts at +700ms wiping it, commit re-renders at
+2100ms). Red on base, green post-fix.

## D2/Gusto — the doorstep chain

Five seams kept Gusto from its doorstep after (or before) its fills
verified; each is fixed generically, none Gusto-keyed except the
matcher class:

1. **Company-website equivalence** (helper `matchOption` +
   `driveWidget`'s in-page matcher): exact text always wins; when
   no option literally carries the fact's text, an option of the
   form `<brand> Website` / `<brand> Careers` matches the fact
   "Company Website". A bare "Website" never matches. Pin:
   `/gh-gusto-shapes-neg`.
2. **Chip-only readback**: boards retire the file input after the
   attach (the upload survives as the filename chip). The helper
   remembers verified file fills per board; `cmdReadback` accepts
   the live chip naming that exact file and answers with the
   fill-time-verified `{filename, sha256}`. Guard: `/gh-file-chip`.
3. **Binding-history fallback**: 150 `fill()` falls back to
   `state.bindingHistory[fieldId]` — a field retired from the
   current discovery keeps a fillable binding (the repair's
   UNKNOWN_FIELD is gone).
4. **Review group semantics**: `cmdReview` treats a required
   checkbox whose named group has a checked member as satisfied
   (boards mark every box of a required group `required`; HTML5
   validity is per-box). A lone required checkbox still flags. The
   verdict carries `invalidFields` evidence through 150 into 149's
   blocked result.
5. **Review re-observation**: `cmdReview` re-observes before
   judging (boards remount controls as the form completes; the old
   drift check dereferenced dead handles and threw STALE →
   needsFields forever → FORM_STEP_LIMIT). The fresh observation
   rides the result; 150 `atReview` adopts it. 149 logs
   `review_needs_fields` with the helper's detail. Guard:
   `/gh-review-remount`; armed-path regression guard:
   submit-integrity 18/18.

Live: Gusto finish drive — prepared at the doorstep, 27 fills,
`fillFailures: []`, screenshot-verified (record:
`submissions/redrive-r3-finish-2026-10-17/4-gusto/`).

## D3 — capped essays verify against the board's cap

Discovery carries `maxLength` (input/textarea, > 0); 150
`bindingFor` carries it; the fill writes and expects the capped
rendering and returns `capped`; 150 logs it. Module 149's FR-395
comparison (observed vs the driver's verified rendering) is
unchanged — it now compares against a rendering the board can
actually hold. The mismatch stop records `observed` + `expected`.

Guards: fixture `/gh-capped-essay` + "R3-D3" 149 end-to-end (red
on base: ANSWER_OBSERVATION_MISMATCH; green: prepared, payload =
the 255 prefix, `capped=255` logged) + two unit pins that the seam
still stops on divergent observed values. Live DRY (gauntlet
persona, abandoned): Workshop `question_12894805007` and Gemini
`question_69514066` both cap-verified; `answers()` read back
exactly the 255-char prefix.

## P0b — coordinator rulings as facts + bindings

- 150 `classifyKind`: relocation-requirement rule →
  `relocation_required` (before the Bay-Area willingness rule);
  key added to the `semKeyFor` canonical list.
- 149 `ANSWER_KEY_SOURCES`: `relocation_required` and
  `work_authorization_other_region` ← `["application_answer"]`,
  commented with the ruling and the no-derivation law (the
  region-named class never derives from the U.S. fact F-020).
- Fact bank (outside the repo): F-082 relocation_required = "Yes";
  F-083 work_authorization_other_region = "No" (absence-of-grant).

Guards: answer-map P0b section (classification, derivation,
absence pins; fail-first 2 red). Live: Justworks + Sezzle finish
drives — both CAPTCHA_HANDOFF, asks [].

## Named leftovers

- Gemini `question_69514065` ("Are you currently enrolled in a
  bachelor's…") misclassifies as `education_degree` (the /bachelor/
  rule takes a Yes/No widget) — classifier lane, named here, not
  fixed by this branch.
- Sezzle's two vocabulary-gap selects: the containment ruling the
  ledger disposition anticipated was ISSUED and implemented the
  same day — see the follow-up section below. Both fields still
  remain owner picks on this board: its actual option lists
  qualify under neither field (verbatim lists below).
- A board that canonicalizes a widget pick after the 3.6s verify
  window still produces an honest doorstep mismatch — by design.

## Follow-up (2026-10-17): Sezzle containment ruling + re-drive

Coordinator ruling (under the owner's answer-delegation): when a
select's bound answer has no exact/containment match, the driver
MAY pick an option whose normalized text is a strict token subset
of a composite fact — it states part of the truth and invents
nothing. Never a superset, never a foreign token, never the
fact's tokens reordered (an equal claim, not a lesser one);
preference is deterministic (the fact's first component, else
the longest qualifying option, else list order); composite
facts only (≥3 tokens).

Implemented as the weakest tier in both option matchers — where
the decline/website equivalence classes already live:
`containmentPick` in the helper's `matchOption` and the mirrored
tier in `driveWidget`'s in-page matcher
(`scripts/career/portal-browser-helper.cjs`, commented with the
ruling at both sites). Modules 149/150 needed no change. Guards:
`tests/career-portal-containment.test.cjs` over the new
`/gh-containment` fixture (6 widgets + 4 native selects) —
fail-first 2 positive tests red on base 0c02148, 4/4 green
post-fix; 2 pins (honest failure with no qualifying option;
superset/foreign/reordered refusals) green on both code states.

Live Sezzle probe (scoped, read-only, 2026-10-17) captured the
board's actual option lists verbatim:
- Degree question ("Are you currently pursuing a degree in
  Computer Science, Data Science, Artificial Intelligence or
  related discipline?"): options exactly `["Yes", "No"]` — a
  yes/no widget bound to `education_discipline`. No token subset
  exists; the rule correctly does not fire. The record-supported
  owner pick is "Yes". (The mis-binding is the same classifier
  family as the Gemini leftover above — classifier lane.)
- English question ("What is your English level?"): options
  exactly `["A1 - beginner", "A2 - Pre-Intermediate",
  "B1- Intermediate", "B2 - Upper-intermediate", "C1- Advanced",
  "C2- Mastery"]` — a CEFR scale. No option is token-contained
  in "Native or bilingual proficiency", and mapping the fact
  onto a scale band would add a claim the fact does not state —
  forbidden by the ruling. The record-supported owner pick is
  "C2 - Mastery".

Sezzle re-driven on the fixed tree (doorstep-only, never
submitted): CAPTCHA_HANDOFF, asks [], 18 fills, the same two
fillFailures — now explained by the lists above. The finish
kit's Sezzle entry was corrected to the verbatim lists.

## Verification summary

- Guards: `tests/career-portal-driver-r3.test.cjs` (new) +
  answer-map P0b section — every guard demonstrated red on base
  code and green on the fixed tree (fail-first evidence in the
  ledger rows).
- Batch checks: unit batch 96/96; R3 guards + submit-integrity
  23/23 (pre-Gusto additions) and submit-integrity 18/18 after the
  review re-observation; portal-browser 11/14 with the 3 fails
  byte-identical on pristine base c4014fa (environment class).
- Bundles regenerated (full + career-only) after the 149 changes.
- Full sweep numbers are recorded in the closing BUILD-STATUS note
  on this branch.
