# FAILURES ADDENDUM — FDSE mismatch lane (2026-10-21)

Entries in the canonical FAILURES.md format, filed by the FDSE mismatch lane on branch
muse/2026-10-21-fdse-mismatch for merge into FAILURES.md (canonical copy lives on
muse/2026-10-20-failures-backlog, PR #143). IDs are PROPOSED (F-019..F-023, continuing
the program numbering past F-018, the widget readback-scan fix); the backlog owner
confirms allocation at merge. Root-cause note:
docs/apply/ROOT-CAUSE-FDSE-MISMATCH-2026-10-21.md.

---

[ID: MUSE-F-019 (proposed)] [Status: FIXING]
Found: 2026-10-21 ~22:58 CDT, Muse (O5 live re-prepare, batch-5ab08dedd45c)
Area: shared
Input: live prepare of Palantir FDSE Chicago for the TEST profile through the production executor (155 → 149 → board service → Lever), flag OFF.
Expected: when a drive stops, the stored run record names the stop's field and the values involved, so the stop is diagnosable from the record.
Actual (verbatim): the app's stop record is {"code":"ANSWER_OBSERVATION_MISMATCH","reason":"the observed value differs from the confirmed fact; no review or submit is allowed"} — no field, no values, although 149's own result carried the field.
Evidence: ~/workspace/o5-batch/run-live-widgetfix.json (stored record), run-live-widgetfix-progress.jsonl (drive log).
Priority: P1
Root cause: PINNED — two seams drop the diagnosis: (1) 149's blocked result at packages/domain/149-career-portal-apply.js:859 carries field_id but not the expected/observed values it had just compared; (2) 155's generic blocked path (packages/domain/155-career-batch-apply.js, absorbPrepareResult) calls stopApp(run, app, res.code, res.reason) and discards res.field_id and every other stop detail, and summarizeRun copies only code+reason into the summary. Fix: 149 carries {field_id, expected, observed} on the result + stepLog; 155 forwards exactly those three keys (stopDetailOf) on both generic blocked paths (prepare + submit) and carries field_id in summary stops.
Fix: branch muse/2026-10-21-fdse-mismatch (149 + 155), applied to the live host tree 2026-10-21 (backups *.bak-20261022T041715Z). Guard: tests/career-observation-stop-record.test.cjs (a) tests — red pre-fix, green post-fix.
Verified by: guard suite (record shape at 149 + 155 + summary). A fresh REAL run proving the new record shape live is still owed — the round's re-drive (batch-02b162b8a829) stopped at a Lever captcha at open, before the gate; entry stays FIXING until a clean-window drive produces a named stop or a card.

[ID: MUSE-F-020 (proposed)] [Status: FIXING]
Found: 2026-10-21 ~22:58 CDT, Muse (O5 live re-prepare, batch-5ab08dedd45c)
Area: shared
Input: same live FDSE prepare; the university field filled from the confirmed fact "DePaul University (Driehaus College of Business)".
Expected: the board renders the school as "DePaul University" (its canonical single value); FR-395 exists for exactly this — 149 compares the readback against the board's rendered value and the drive proceeds.
Actual (verbatim): stop ANSWER_OBSERVATION_MISMATCH, although the fill was correct and the board's rendering matched its readback exactly.
Evidence: ~/workspace/o5-batch/diag-fdse-mismatch-result.json — the identical production composition with a getter-preserving wrapper produced stepLog answer_observation_rendered {field_id: "which_university_are_you_currently_attending_or_", matched: true, hatch_only: true} and no stop. hatch_only: true is the defect's signature.
Priority: P0 (it stops correct applications on any widget whose rendering shortens the fact — universities, countries, schools)
Root cause: PINNED — 149 reads the rendered value from board.renderedValues (149:844). On the production path that property is a GETTER on the worker bridge board (supabase/functions/_shared/career_task_bridge.js:330) fed by board-service snapshots. The drive harness's observation wrapper (run-live-widgetfix.cjs wrapBoard) copied every non-function own property ONCE at wrap time, invoking the getter while its state was still {} — the wrapped board carried a frozen {} for the whole drive, the hatch silently never fired, and the gate raw-compared the profile text against the widget's rendering. Fix: boards expose renderedValue(fieldId) as a METHOD (bridge board + module 150 board) and 149 prefers the method (property remains the fallback) — methods survive the delegation wrappers every observation harness uses; the harness wrapper is also corrected to re-read data properties per call.
Fix: branch muse/2026-10-21-fdse-mismatch (149 + 150 + bridge), applied to the live host tree 2026-10-21 (backups *.bak-20261022T041715Z; board service restarted; gate probes green). Guard: tests/career-observation-stop-record.test.cjs (b) tests — 149 composed over a provider board wrapped in the harness's exact snapshot shape: red pre-fix (stopped as drift), green post-fix (prepared); drift negative control still stops.
Verified by: guard suite + the diagnostic drive on the live posting. Entry stays FIXING until a fresh full batch drive on a clean (captcha-free) window passes the gate live end-to-end.

[ID: MUSE-F-021 (proposed)] [Status: OPEN]
Found: 2026-10-21 ~22:58 CDT, Muse (batch-5ab08dedd45c; reproduced in the diagnostic drive)
Area: brain
Input: live FDSE form field what_is_your_major_please_choose_the_closest_res… (REQUIRED, kind standard, profile_key education_discipline), confirmed fact value is a degree string ("of Science in Computer Science and Finance").
Expected: the confirmed fact is mapped to the board's closest fixed response (the field's own instruction: "Please choose the closest response"), or the run surfaces a named ask — never a silent unfilled required field.
Actual: board.fill returned null in ~131-143ms in both drives; the field is absent from answers(). The run treats the absence as a persistence/doorstep matter, so the gap is invisible until the doorstep gate.
Evidence: ~/workspace/o5-batch/run-live-widgetfix-progress.jsonl (fill result null), diag-fdse-mismatch-result.json (same, 131ms).
Priority: P1 (a REQUIRED field on a flagship posting; blocks any FDSE doorstep)
Root cause: PINNED to the seam — the helper's fill matches the requested text against the widget's option set; a free-text degree string equals none of the board's closest-response options, and no layer maps a confirmed education_discipline fact to the board's option vocabulary (the F-007 answer-mapping family's gap, at fill time). The fix belongs to the mapping layer / ask path (module 172): derive the closest option from the confirmed fact WITH user confirmation, never by invention. NOT fixed by the FDSE-mismatch round (one fix per round); it did not cause the batch-5ab08dedd45c stop (the field was attempted, so the observation gate skips it).
Fix:
Verified by:

[ID: MUSE-F-022 (proposed)] [Status: OPEN]
Found: 2026-10-21 ~22:58 CDT, Muse (batch-5ab08dedd45c; reproduced in the diagnostic drive)
Area: shared
Input: live FDSE EEO disability field (eeo_disability, optional), filled with 149's EEO_DECLINE text "Decline to self-identify" — the same text the sibling eeo_veteran field accepted (rendered "I decline to self-identify for protected veteran status").
Expected: the decline answer lands on the disability widget as it does on the veteran widget, or the fill reports a named failure the record can show.
Actual: board.fill returned null in ~133-173ms in both drives; the field is absent from answers(); nothing in the record names the failure (149 does not read board.fillFailures for EEO fields).
Evidence: run-live-widgetfix-progress.jsonl; diag-fdse-mismatch-result.json.
Priority: P2 (optional field; but a silently unfilled EEO answer on a real submission would misstate the applicant's response)
Root cause: PINNED to the seam — the fill side of the decline vocabulary on Lever's disability select: the widget's decline rendering is not matched from 149's EEO_DECLINE text by the helper's option matcher, while the veteran select's rendering is. The decline-vocab fix (04e24fde, EEO_DECLINE_MEANING in 149) aligns the GATE-side acceptance in 149 and remains NOT applied to the host tree; this entry is the FILL side, a different seam (helper matcher for the Lever EEO disability select). Did not cause the batch-5ab08dedd45c stop (optional + absent-from-observed ⇒ the gate skips it).
Fix:
Verified by:

[ID: MUSE-F-023 (proposed)] [Status: OPEN]
Found: 2026-10-21 ~22:54 CDT, Muse (O5 live re-prepare attempt 1, batch-7ac6d3b30fa5)
Area: shared
Input: live prepare of both Palantir postings through the production executor.
Expected: open returns the mounted form (27/34 fields, as bracketing drives through the same service returned minutes apart).
Actual (verbatim): both postings stopped EMPTY_FORM ("the board exposed zero fillable fields") in ~100ms with form = 0 fields.
Evidence: ~/workspace/o5-batch/run-live-widgetfix-attempt1.json + run-live-widgetfix-attempt1-progress.jsonl; bracketing direct drives returned 27 (FDSE) and 34 (SWE NY) fields; this lane's diagnostic drive returned the full 27-field FDSE form.
Priority: P2 (transient; the one permitted retry cleared it — but a retry is a cost, and in an unattended batch it would read as two dead postings)
Root cause: PINNED (prior lane's measurement, confirmed by bracketing) — a page-timing race in open: the helper's single post-apply-click discover scan can land before the form mounts on a slow first paint, and 149's D2 gate (correctly) stops on zero fields. The fix shape is a bounded re-scan on an empty first discovery inside open/form (the board is known-mounted when the apply click succeeded), with the EMPTY_FORM stop preserved for genuinely formless pages. NOT fixed by the FDSE-mismatch round; not reproduced in this lane's drives (diagnostic + re-drive both mounted full forms — the re-drive stopped later, at a captcha).
Fix:
Verified by:
