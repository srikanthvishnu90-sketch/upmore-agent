# Root cause — a board-normalized phone rendering stops the run as a mismatch (FDSE drive batch-8ef4497b16db)

Lane: FDSE question-kind (Muse), 2026-10-21. Witness: the first
live FDSE prepare after the F-026 fix — every previously-walled
field filled and read back, and the run stopped at the observation
gate on a field that was filled correctly.

## What happened (measured)

Run `batch-8ef4497b16db` (live, TEST profile, 104.8s): 20 fills;
all five F-026 question fields filled and read back verbatim
(language ["English (ENG)"], heard-about "University Job Board",
summer-2026 "Other", the two-roles essay, notetaker "Yes, I
consent"); the university field passed observation through the
FR-395 rendered-value hatch (board renders "DePaul University").
The run then stopped:

    { "code": "ANSWER_OBSERVATION_MISMATCH",
      "reason": "the observed value differs from the confirmed fact; no review or submit is allowed",
      "field_id": "phone", "expected": "+1 2246029341", "observed": "2246029341" }

## Why (the exact mechanism)

149's observation gate compares the doorstep payload value to the
board's `answers()` readback exactly. Its one benign-render
channel is the FR-395 hatch: it fires only when the helper
recorded a renderedValues snapshot for the field — and the helper
records those snapshots for WIDGET fills (the driveWidget path).
A phone input is a scalar fill, so no snapshot exists. Lever's
phone input normalizes the value to the US national form (its
mask drops the "+1" country prefix); `answers()` faithfully
reports "2246029341". Exact compare fails; the gate stops the run.
The fact is true, the fill is right, the rendering is benign —
the gate has no evidence channel that can tell it so.

## Fix shape (its own round — NOT this lane's change)

Value equivalence per profile key at the observation compare
only (never altering the payload): for `phone`, compare digit
sequences — "+1 2246029341" and "2246029341" are the same number.
General form: a small normalizer map keyed by profile/semantic
key, each normalizer guarded fail-first with negative controls (a
genuinely different number must still stop the run). Complementary
option: the helper records scalar fills' persisted values into the
same rendered channel widgets use.

Sequencing note: the mismatch gate runs before the doorstep
payload-completeness step, so F-023 (major closest-option) remains
queued behind this stop on FDSE — witnessed again in this drive
(the major fill returned null).
