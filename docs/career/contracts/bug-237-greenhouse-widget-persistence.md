# CONTRACT — BUG-237 / FR-395: Greenhouse widget fills do not persist on the CURRENT UI (R-1)

**Written:** 2026-10-15, BEFORE the fix (contract first).
**Registered:** master issue list — R-1 allocation (Crew A registry, 2026-10-15):
BUG-237 / FR-395. Crew B build, lane `work/drive-blockers`. Prevention wiring:
MI-109 (form-schema drift sentinel, Crew B) + the MI-120 telemetry schema lane.
**Failing witness:** Drive Pass 2 (2026-10-15 evening, records
`~/workspace/your_files/real-apply/submissions/drive2-2026-10-15.md`): 228
widget/file fills failed across 24 driven boards; resume file inputs failed to
mount on 18 of 24 boards (`file_input_not_mounted`); on liontree's doorstep run
EVERY widget fill failed (country, school_0, degree_0, discipline_0, the
sponsorship widget, gender, hispanic_ethnicity, veteran_status) while text
fills + the resume upload persisted. The failure is session-variant AND
board-variant on the same code: Arc verified 17/17 in the afternoon and 5/17
the same evening. The sandbox fixture suite passes throughout — the fixture
reproduces an OLD Greenhouse UI, which is exactly why it lies.

## What the live capture proved (2026-10-15, read-only probes of the live liontree board)

Probes: `/tmp/gh-probe.cjs`, `/tmp/gh-probe2.cjs`, `/tmp/gh-probe3.cjs` against
`https://boards.greenhouse.io/liontree/jobs/5250586007` (redirects to
`job-boards.greenhouse.io` — the new board host; 149's host gate already
admits `*.greenhouse.io`).

1. **Every widget on the current UI is a react-select v5 combobox** —
   country, school, degree, discipline, start/end month, the sponsorship
   question, gender, hispanic_ethnicity, veteran_status: `input.select__input`
   with `role="combobox"`. There are NO native `<select>` elements on the form.
   DOM shape (captured verbatim):
   `.select__control > .select__value-container > (.select__placeholder +
   .select__input-container[data-value] > input.select__input) +
   .select__indicators`; the chosen value renders in a `.select__single-value`
   element inside the VALUE container. Hidden `remix-css-*-requiredInput`
   dummy inputs sit after several widgets. Options are local (zero network
   calls on open/filter); the menu is `.select__menu > .select__menu-list`
   (`react-select-<id>-listbox`) with `.select__option` children.
2. **The helper's readback climbs to the wrong container.** `fnReadback`
   resolves the widget root as
   `closest('[class*="select__container"], [class*="-container"]')` — on the
   current markup the FIRST `-container` ancestor is `.select__input-container`,
   which does NOT contain the single-value element. Readback therefore returns
   empty even when a pick landed, `verifyPersisted` reports
   `value_did_not_persist`, and the fill is recorded as failed. On the old
   fixture shape an outer `.select__container` existed, so the suite stayed
   green while production failed.
3. **The country widget's single-value is the dial code only.** After a real
   pick (keyboard path, probe 3), the single-value renders `+971` / `+1`,
   while the menu option's text is `United States +1`. So even with the right
   root, comparing readback against the option text fails. The persisted
   comparison for react-select must accept the board's own rendering of the
   picked option (single-value text equal to the option text, or a suffix of
   it — the dial-code case), never free text.
4. **Pick mechanics work and persist.** Menu opens on click and on type;
   ArrowDown+Enter picks; the value survives blur (probe 3, afterBlur).
   Unpicked search text is discarded on blur — the known law, unchanged.
5. **The resume file input exists at rest on this board**
   (`input#resume.visually-hidden`, accept `.pdf,.doc,.docx,.txt,.rtf`).
   The 18/24 `file_input_not_mounted` boards are therefore a variant shape:
   the input mounts only after the Attach control is engaged. The helper
   never engages it.

## The rule change

Module 150's helper (`scripts/career/portal-browser-helper.cjs`) only:

1. **Readback root:** for a `select__input`, climb to the element carrying
   `select__control`; read `.select__single-value` text within it. Fall back
   to the previous container search only when no control ancestor exists.
2. **Widget persisted comparison:** a react-select fill verifies when the
   post-pick single-value is non-empty AND (normalized-equal to the picked
   option's text OR the option text ends with it). `verifyPersisted` keeps
   its exact-match law for every non-widget kind.
3. **Pick matcher widening:** an option also matches when the normalized
   option text is a prefix of the wanted value (school names: the board's
   "DePaul University" vs the profile's "DePaul University - Driehaus
   College of Business") or the wanted value's first ` - `-segment matches.
4. **File late-mount recovery:** when no `input[type=file]` exists at fill
   time, engage the board's attach/upload control once (a button or label
   whose text matches /attach|upload|add resume/i within the resume area),
   re-discover, and only then report `file_input_not_mounted`. Also prefer a
   stable id/data-marker over the positional `:nth-of-type` selector on
   re-discovery.
5. Widget drives stay at ONE full type+pick sequence (repeated drives
   degraded live pages, probe-bisected 2026-10-15); a menu that never opens
   may be re-clicked once inside that sequence.

## Prevention (acceptance criteria, not extras)

- **P1 — fixture from the captured UI + canary (MI-109):** the fixture
  server gains a `GH_CURRENT` page reproducing the captured current-UI
  shape (control/value-container/input-container nesting, dial-code
  single-value for country, requiredInput dummies, visually-hidden file
  input) plus a `GH_CURRENT_LATE_FILE` variant whose file input mounts only
  after Attach. The same fixture spec drives a standing canary:
  `scripts/career/widget-canary.cjs` replays the fixture AND takes a
  read-only probe of one live board per family, failing loudly on drift
  (widget root shape, single-value placement, option text format). The
  canary is the MI-109 sentinel's Greenhouse leg — one mechanism, shared.
- **P2 — per-family driveability verdicts, pass^k (k=3):** a board family
  is "driveable" only after 3 successful verified-fill sessions at
  different times, recorded in the standing artifact
  `~/workspace/your_files/real-apply/submissions/driveability-verdicts.md`.
  The drive lane reads it BEFORE attempting a family; a family that loses
  its verdict mid-drive stops honestly instead of burning attempts. Arc's
  17/17 → 5/17 swing is the standing proof one good run means nothing.

## Done-test

1. `GH_CURRENT` fails against the pre-fix helper (widget fills report
   `value_did_not_persist`) and passes post-fix — the fail-first replay
   stays in `tests/career-portal-submit-integrity.test.cjs` forever (bug law).
2. A live doorstep re-drive (nothing transmits) of three named targets —
   Arc + liontree + one more parked board — shows widget fills persisting
   at readback.
3. The canary runs green on the fixture and on one live board per family;
   the verdicts artifact is updated from the re-drives (k counting starts
   from these sessions, honestly labeled).
4. If any widget family proves genuinely undriveable on the current UI,
   the deliverable is a per-family capability verdict with evidence —
   never silent fill failures.

## Out of scope

No change to census-first, readback law, doorstep posture, the 15/day cap
(enforced on this lineage by MI-110), or approval binding (MI-116). No
captcha interaction of any kind. The release merge is owned by the
combine lane; this branch does not merge to release.

## Landing addendum (2026-10-15 evening — mechanisms found by live bisection after the first fixture pass)

The fixture pass closed the readback-root and short-rendering causes. Four
further mechanisms were bisected live (liontree / Sigma / claudecorps
tenants) and are part of this fix; the fixture reproduces each:

1. **Async option searches** (degree/discipline/school): "Loading..." for
   6–10 s; retyping into a loading widget RESTARTS its search past the
   poll budget. The drive never retypes while a loading indicator shows
   and polls ~17 s within the one drive. Fixture: async discipline with a
   7 s search that restarts on a new query.
2. **Filter starvation**: the board's substring filter can empty its own
   list (hyphenated wanted vs unhyphenated label; the veteran decline
   "I don't wish to answer" shares no token with "Decline to
   self-identify"). Ladder step: clear the search and judge the FULL
   list; the matcher carries the decline-class equivalence (both the
   widget matcher and matchOption, incl. the "don t wish" normalization).
3. **Discovery phantoms**: react-select's hidden *-requiredInput
   validation dummies were discovered as fields and minted a second
   Degree def; discovery skips them. And the "Degree" classification
   anchor now reads the label free of the board's required marker.
4. **Lazy-mounted uploads**: the upload input mounts when its section
   nears the viewport; the file branch scrolls the block into view
   first, re-discovers by identity, and engages attach controls across
   button/label/div shapes before ever reporting not-mounted. Judging a
   resume uses its END state (first-attempt logs are append-only).

Also landed under this contract's lineage note: the BUG-209 completeness
gate + BUG-207 doorstep repair were ported from fix/submit-path's module
149 (they had never reached this lineage), restoring FR-364/365
enforcement here; the imported integrity suite stands at 18/18.
Live verdict: Greenhouse DRIVEABLE, k = 3 banked —
submissions/driveability-verdicts.md.
