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

## Follow-up 2 (2026-10-17): Sezzle's final two fields — degree-pursuit + CEFR rulings

The containment follow-up above closed with both Sezzle fields
still honestly empty, because the board's actual lists qualify
under no word-based tier: the degree question is a Yes/No widget
(mis-bound to `education_discipline`), and the English question
is a CEFR scale. The coordinator ruled on both the same day
(owner answer-all delegation); this lane implemented the rulings
and re-drove Sezzle to a clean doorstep.

### Ruling 1 — degree-pursuit yes/no questions

A yes/no question of the form "are you (currently) pursuing /
studying / enrolled in a degree in <field list>" binds to a
degree-pursuit derivation, NOT to `education_discipline`:

- Module 150 `classifyKind` → `{ screening, degree_pursuit }`,
  narrowly: pursuit phrasing + "degree in" + at least one NAMED
  field (`degreePursuitFields` — a trailing "related discipline"
  is filler, not a field; a question naming NO fields stays
  unbound, an honest ask) + a choice-shaped widget. When the
  board's options are visible at classification (native select
  `f.options`; radio/checkbox group members, now passed into the
  group classification) they must be exactly Yes/No — a
  pursuit-worded label over a discipline vocabulary keeps its
  old binding. When they are not visible (react-select combobox)
  the shape + label carry it, and the derived Yes/No can only
  land on a widget that actually offers it — any other vocabulary
  fails the fill honestly, so the fill remains the final arbiter.
  `degree_pursuit` joins the semKeyFor canonical list. A plain
  discipline select binds `education_discipline` exactly as
  before (pin).
- Module 149: `degree_pursuit: ["education"]` in
  ANSWER_KEY_SOURCES; `resolveScreeningFromRecord` resolves it
  at fill time: the label's fields (mirror parse — the two
  parses must agree on what a field is) token-match against the
  education fact's disciplines ("Computer Science and Finance" →
  {Computer Science, Finance}); token-match = equal token sets
  or one entirely inside the other. Yes iff any field matches;
  an honest No iff fields are named and none match; nothing
  when no discipline is on record (the field stays an ask).

### Ruling 2 — native proficiency onto an ordinal scale

When a language-level fact is native-class (its normalized
value carries the token "native") and the board's options form
the CEFR ladder (labels beginning A1/A2/B1/B2/C1/C2, at least
two DISTINCT bands present), the driver picks the top band
present — C2 when offered, else the highest offered. Basis: a
native speaker sits at the top of any ordinal proficiency scale
the board offers; the pick adds no claim the fact does not
state. Narrow: ONLY the CEFR prefix pattern, ONLY native-class
facts — a non-native fact (e.g. "Fluent") never scale-maps
(pin), and a proficiency list without band prefixes is not a
ladder (pin). Implemented as the WEAKEST tier in both option
matchers — the helper's `matchOption` (pure `cefrTopPick`,
below subset-containment: a literal subset of the fact's words
always outranks a scale translation) and `driveWidget`'s
in-page mirror (distinct-band counting, so one option seen
through several selector pools cannot fake a ladder).

### Guards (fail-first, verified on base d477103)

- `tests/career-portal-answer-map.test.cjs`, degree-pursuit
  section (3 tests): Sezzle's verbatim label classifies
  degree_pursuit on the combobox shape AND on a native select
  with visible Yes/No options (RED on base); pins — no-fields
  stays unbound, free-text shape untouched, visible discipline
  vocabulary keeps its binding, plain discipline select
  unchanged (green on both); end-to-end over a stub board —
  Yes for the Sezzle list, honest No for Law/Medicine, ask
  when no discipline is on record (RED on base).
- `tests/career-portal-cefr.test.cjs` over the new `/gh-cefr`
  fixture (the verbatim Sezzle ladder): widget → "C2 - Mastery"
  and ladder-to-C1 widget → "C1 - Advanced" and native select →
  "C2 - Mastery" (all RED on base); pins — "Fluent" on the same
  ladder picks nothing (value_did_not_persist), a non-CEFR
  proficiency select picks nothing (option_not_found) — green
  on both code states. 3/3 green post-fix; containment guards
  4/4 (no stronger tier disturbed).

### Sweep + live proof

- Portal suites all green. Full sweep on the fixed tree:
  4,437 tests — 4,407 pass, 5 fail, 25 skipped. The 5 fails are
  the 2 tolerated SC-300 pins plus the 3 portal-browser
  environment fails, PROVEN IDENTICAL on pristine d477103 in
  the same environment (`career-portal-browser` 11/14 there
  too, same names, same signatures) — zero regressions. The +6
  tests over the d477103 baseline (4,431) are this lane's new
  guards. Bundles regenerated (full + career-only; 149
  changed) and verified with `--check`.
- LIVE: Sezzle re-driven doorstep-only (tier 2, NEVER
  submitted) on the fixed tree — CAPTCHA_HANDOFF, asks [],
  ZERO fillFailures (both prior runs: the same two). The
  degree widget renders "Yes" and the English widget renders
  "C2 - Mastery", both visible on the final screenshot with
  the form stopped at the captcha. Record:
  submissions/redrive-r3-finish-2026-10-17/30-sezzle/record.json
  (run `run-2026-10-17-finish-followup2`; the prior record is
  preserved as `record.previous.json`). The finish kit's
  Sezzle entry now names captcha + submit as the only
  remaining steps, and the ledger's Sezzle DISPOSITION row is
  closed (superseded by this lane's PENDING-ALLOCATION row).
