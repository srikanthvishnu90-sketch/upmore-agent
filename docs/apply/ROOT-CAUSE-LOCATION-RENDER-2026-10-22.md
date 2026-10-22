# ROOT CAUSE — F-028: location benign render stops a correct fill (2026-10-22)

## Witness

Live FDSE prepare, batch-29ea020da986 (2026-10-22T05:14Z, TEST profile,
prepare-only, flag OFF): 12 fills, resume sha matched, phone gate passed,
all five F-026 answers filled — then the run stopped:

```json
{ "code": "ANSWER_OBSERVATION_MISMATCH",
  "reason": "the observed value differs from the confirmed fact; no review or submit is allowed",
  "field_id": "location", "expected": "Chicago, IL", "observed": "Chicago, IL, USA" }
```

Evidence: ~/workspace/o5-batch/run-live-fdse-f027.json (stored run record:
stop carries field_id/expected/observed) + run-live-fdse-f027-progress.jsonl
(answers() readback: location "Chicago, IL, USA").

## Why

1. **The field's profile key is `location`.** Module 150's classifyKind
   (packages/domain/150-career-portal-browser.js:324) maps a
   location/city/current-residence label to
   `{ kind: "standard", profile_key: "location" }`, so the Lever location
   field def that reaches 149 carries `profile_key: "location"` — the same
   keying channel F-027's equivalence uses for `phone`.
2. **The fill was correct; the board canonicalized it.** The location
   control is a places pick: the driver selects the board's own suggestion
   for the confirmed fact "Chicago, IL", and the board's canonical form of
   that very place appends the country — answers() reads back
   "Chicago, IL, USA". Nothing about the place changed; only its rendered
   form grew a trailing country suffix.
3. **No FR-395 hatch fires for this fill.** In 149's observation loop
   (packages/domain/149-career-portal-apply.js, prepareRound, the
   `answer_observation_*` block), the expectation is
   `board.renderedValue(id)` when the board offers a rendered snapshot,
   else the raw profile value. The stop record's expected is the raw
   profile value ("Chicago, IL"), proving `rendered` was undefined for
   this field in this drive — the helper's renderedValues snapshot
   carries widget-fill verifications, and this scalar places fill
   produced none. The expectation therefore fell to the exact `norm`
   compare, which a country suffix defeats.
4. **The per-key equivalence channel (F-027) does not cover it.** The
   equivalence block in the same loop fires only for
   `fd.profile_key === "phone"` (digit-sequence equivalence). Location
   fell through every channel: exact compare, the yes/no prefix rule,
   the EEO-decline rule, and the phone equivalence.

Same defect class as F-027 (a board-side benign render of a scalar fill
with no evidence channel), different profile key, different equivalence
shape.

## Fix

Extend the SAME per-key equivalence block F-027 built — no parallel
mechanism. For a field whose profile key is `location`:

- A closed, named suffix set in code as data
  (`LOCATION_COUNTRY_SUFFIXES`: "usa", "u.s.a.", "us", "u.s.",
  "united states", "united states of america") names the trailing
  country suffixes a board may append (or the profile may carry).
- The compare strips one trailing `, <suffix>` from BOTH sides (after
  the gate's existing `norm`); the remaining place text must match
  EXACTLY and be non-empty. Only then is the render benign.
- The payload/fill value is never altered; the acceptance is recorded
  with the same evidence step as F-027
  (`answer_observation_equivalent`, `equivalence:
  "location_country_suffix"`).

Negative controls (must still stop): a different city; the same city
name in a different state ("Springfield, IL" vs "Springfield, MO, USA");
an observed value that merely contains the expected as a prefix of a
DIFFERENT place ("Chicago, IL" vs "Chicago Heights, IL, USA"); and a
non-location profile key carrying the same suffix-shaped difference
(the equivalence must not leak across keys).

## Guard

tests/career-location-render-equivalence.test.cjs — the exact live
shape plus the "United States" long form, the symmetric profile-carries-
suffix shape, and the four negative/keying controls above. Fail-first:
the benign shapes are red on the unfixed 149 (blocked at the location
compare) and green after; the controls are green both ways.
