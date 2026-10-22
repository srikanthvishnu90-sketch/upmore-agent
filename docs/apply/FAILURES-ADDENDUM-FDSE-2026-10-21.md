# FAILURES ADDENDUM — FDSE mismatch lane (2026-10-21)

Entries in the canonical FAILURES.md format, filed by the FDSE mismatch lane on branch
muse/2026-10-21-fdse-mismatch for merge into FAILURES.md (canonical copy lives on
muse/2026-10-20-failures-backlog, PR #143). IDs are PROPOSED (F-021..F-025, continuing
the program numbering past the widget lane's F-018/F-019/F-020, committed @ 6c1929e3
on muse/2026-10-21-widget-attach the same night); the backlog owner confirms
allocation at merge. (First committed as F-019..F-023; renumbered by the follow-up
commit when the widget lane's same-night allocations were seen.) Root-cause note:
docs/apply/ROOT-CAUSE-FDSE-MISMATCH-2026-10-21.md.

---

[ID: MUSE-F-021 (proposed)] [Status: FIXING]
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

[ID: MUSE-F-022 (proposed)] [Status: FIXING]
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

[ID: MUSE-F-023 (proposed)] [Status: OPEN]
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

[ID: MUSE-F-024 (proposed)] [Status: OPEN]
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

[ID: MUSE-F-025 (proposed)] [Status: OPEN]
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

[ID: MUSE-F-026 (proposed)] [Status: FIXED — host-live, drive-verified for its scope]
Found: 2026-10-21 ~23:3x CDT, Muse (FDSE question-kind lane; inventory scan of the live FDSE form)
Area: brain/shared
Input: any board form carrying a REQUIRED question outside 150's canonical map (Lever FDSE: spoken-language checkbox group, heard-about select, summer-2026 select, AI-notetaker consent radio).
Expected: such a field is answerable from a stored confirmed answer under a stable key, or asks a question an answer can bind to.
Actual (pre-fix): 150's classifyKind returned kind "unknown" for these controls with no question_key; 149's fill loop filed them as asks with reason unknown_field_category, keyed by nothing a stored answer could bind — every such posting stopped UNCOVERED_QUESTION forever, regardless of answers on file.
Evidence: ~/workspace/o5-batch/fdse-inventory-2026-10-21.json (live form: 27 fields, 16 required, the four fields above kind unknown); root-cause note docs/apply/ROOT-CAUSE-FDSE-UNCOVERED-QUESTIONS-2026-10-21.md @ 8a9a573e.
Root cause: two halves — (1) 150 classifyKind's final return made "unknown" the verdict for ordinary question controls (select/radio/group/text) that matched no canonical rule; (2) 149's fill loop had no category that answers such fields from the stored-answer map.
Fix: @ cc6aaaab (branch muse/2026-10-21-fdse-question-kind) — 150: unmapped select/radio/group/text controls classify kind "question", keyed by the label slug truncated to 40 (free_text's keying); the D4 education-block contextual bind still promotes question defs (stronger signal wins, question_key cleared). 149: a "question" fill branch under the screening contract verbatim — a confirmed stored answer fills (source user_confirmed_answer); otherwise an ask (no_confirmed_fact / answer_unconfirmed); nothing derived. Applied to the host tree 2026-10-22T04:49Z (.bak-20261022T044925Z), board service restarted, gate probes green (401/401/403/403/Lever 201+close 200).
Verified by: tests/career-question-kind.test.cjs 6/6 (fail-first on base: 4 red + 1 green; the D4-promotion guard added after it caught a real regression in the first fix shape); neighbor suites' failing sets identical to base (portal family 46 pass / 2 fail = the pre-existing F-007 pair; submit suites' failing set identical by name); offline replay of the fixed classifier over the captured live form: 27 defs, 22 identical, exactly the 5 intended fields changed; LIVE drive batch-8ef4497b16db: all five fields filled and read back verbatim (language ["English (ENG)"], heard "University Job Board", summer "Other", two-roles essay, notetaker "Yes, I consent") — the run stopped later, on F-027 below.

[ID: MUSE-F-027 (proposed)] [Status: FIXED — host-live; guard-proven on the exact live shape; live re-drive advanced past the phone gate (see Verified by)]
Found: 2026-10-21 ~23:55 CDT, Muse (FDSE question-kind lane drive, batch-8ef4497b16db)
Area: shared
Input: live FDSE prepare, TEST profile, phone fact "+1 2246029341".
Expected: the filled phone passes the observation gate — the board accepted and holds the same number.
Actual (verbatim stop): { "code": "ANSWER_OBSERVATION_MISMATCH", "reason": "the observed value differs from the confirmed fact; no review or submit is allowed", "field_id": "phone", "expected": "+1 2246029341", "observed": "2246029341" }. Run status completed, app stage stopped, no card (cardSha256 null; module 175 returns NO_CARD_HASH).
Evidence: ~/workspace/o5-batch/run-live-fdse-question.json + run-live-fdse-question-progress.jsonl; root-cause note docs/apply/ROOT-CAUSE-PHONE-RENDER-2026-10-21.md.
Priority: P1 (blocks the FDSE doorstep; any board that normalizes phone input hits it)
Root cause: PINNED — 149's observation gate compares payload vs answers() exactly; its only benign-render channel (the FR-395 hatch) needs a helper renderedValues snapshot, which exists only for widget fills. A phone input is a scalar fill: no snapshot. Lever's phone mask normalizes to the US national form (drops "+1"), answers() reports "2246029341", exact compare fails. The fact is true and the fill is right; the gate lacks the evidence channel. Fix shape (its own round): value equivalence per profile key at the compare only (phone: digit-sequence compare), each normalizer fail-first guarded with negative controls; never alters the payload.
Fix: @ c799d095 (branch muse/2026-10-22-f027-phone-render) — 149's observation compare gains a per-key equivalence, keyed by the field def's profile_key: for "phone", digit sequences compare equal when they differ only by a single leading country "1" on either side (minimum 7 digits); strings only; the payload/fill value is NEVER altered — equivalence lives at the compare only. The acceptance is logged as step answer_observation_equivalent {field_id, equivalence: "phone_digits", expected, observed}, the hatch's evidentiary standard. Applied to the host tree 2026-10-22T05:08Z (.bak-20261022T050859Z; host 149 sha 440bdefc…, byte-identical to the branch file; syntax-checked). No service restart: 149 loads fresh per executor/drive process (the board service does not load 149); gate probes re-verified green after application (401/401/403 DRIVER_HOST_REFUSED/403 FAMILY_NOT_DRIVEABLE/Lever 201+close 200).
Verified by: tests/career-phone-render-equivalence.test.cjs 5/5 — fail-first on the unfixed base 3 pass / 2 fail (the two benign-render shapes red; both negative controls + the keying control green pre- and post-fix); same-tree neighbor delta +0 (career-w3 / career-portal-apply / career-portal-answer-map / career-portal-submit-integrity failing-name sets identical with the change stashed vs applied — the D11–D14 environment class + F-007 coverage pair are pre-existing in this tree); composition suites green (career-observation-stop-record 5/5, career-question-kind 6/6). LIVE re-drive batch-29ea020da986 (2026-10-22T05:14Z, 27.2s, prepare-only): the phone gate did NOT stop the run — this drive's readback carried the full "+1 2246029341", so the equivalence branch was not the carrying channel this time; the national-form shape it exists for is guard-proven above. The run advanced one gate further and stopped on the NEW F-028 below (location), so the FDSE card is still not rendered.

[ID: MUSE-F-028 (proposed)] [Status: OPEN]
Found: 2026-10-22 00:14 CDT, Muse (F-027 lane re-drive, batch-29ea020da986)
Area: shared
Input: live FDSE prepare, TEST profile, location fact "Chicago, IL".
Expected: the filled location passes the observation gate — the board accepted and holds the same place.
Actual (verbatim stop): { "code": "ANSWER_OBSERVATION_MISMATCH", "reason": "the observed value differs from the confirmed fact; no review or submit is allowed", "field_id": "location", "expected": "Chicago, IL", "observed": "Chicago, IL, USA" }.
Evidence: ~/workspace/o5-batch/run-live-fdse-f027.json + run-live-fdse-f027-progress.jsonl (answers() readback: location "Chicago, IL, USA"; 12 fills incl. phone "+1 2246029341" filled and read back).
Priority: P1 (blocks the FDSE doorstep; any board that canonicalizes a place to its country-suffixed form hits it)
Root cause (sketch, same class as F-027 — to be pinned in its own round): the location/typeahead fill is scalar from the gate's perspective — no FR-395 renderedValues snapshot carried the acceptance — and the board canonicalized the picked place by appending the country ("Chicago, IL" → "Chicago, IL, USA"); the exact compare stops a correct fill. Fix shape (its own round): per-key equivalence for "location" at the compare only — tolerate a board-appended trailing country suffix (country name or code) when the remaining place text matches the confirmed fact exactly; negative controls mandatory (a different city or state still stops; a suffix that changes the place still stops); payload never altered; acceptance logged like answer_observation_equivalent.

Corroborations from drive batch-29ea020da986 (2026-10-22T05:14Z):
- F-023 / F-024: NOT exercised this drive — the run stopped at the observation gate (location) with 12 fills recorded; the major and EEO-disability fields were not attempted in this run's record, so neither is corroborated or cleared. F-023 remains queued behind the mismatch gate (now F-028).

Corroborations from drive batch-8ef4497b16db (2026-10-22T04:52–04:55Z):
- F-023: the major field's fill returned null again (04:54:33Z, ~337ms); the field is absent from answers(). It remains queued behind F-027 (the mismatch gate runs before the doorstep completeness step). No new mechanism.
- F-024: eeo_disability fill returned null again (04:54:38Z). New cost observation: the Lever disability block's signature and signature-date fields (eeo_disabilitysignature / eeo_disabilitysignaturedate) were classified standard (name/date keys) and attempted — 30.6s and 30.2s, both null — ~60s of every FDSE drive spent on optional EEO signature fields that never fill.
- F-025: NOT reproduced (the form mounted in full on the single fresh attempt; no retry was needed or used).
