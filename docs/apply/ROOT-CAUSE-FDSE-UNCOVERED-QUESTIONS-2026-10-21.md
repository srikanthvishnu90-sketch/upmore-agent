# ROOT CAUSE — FDSE's required questions that no answer can ever cover (2026-10-21, FDSE-QUESTION-KIND lane)

Ledger: MUSE-F-026 (proposed) in docs/apply/FAILURES-ADDENDUM-FDSE-2026-10-21.md.

## Witnessed (live, tonight)

FDSE Chicago (Lever, TEST profile, flag OFF, zero submits) stops
UNCOVERED_QUESTION even in a clean window: the diagnostic proof drive
(~/workspace/o5-batch/diag-fdse-mismatch-result.json) passed the
observation gate and ended awaiting_user with required asks, and the
batch re-drive composition inherits the same stop through 155. A fresh
scan-only inventory tonight (fdse-inventory-scan.cjs; defs 27, raw 63,
no fills — readback carried only the board's own placeholder text)
confirms the live form is unchanged.

## The wall, field by field (verified against the live form)

Of 16 required fields, 4 sit in a class nothing can answer, and 1 more
is a free-text draft:

- `language_skill_s_check_all_that_apply` — checkbox group, SPOKEN
  languages ("English (ENG)", "Spanish (SPA)", … 32 options). Kind:
  unknown. No stated fact on the TEST profile speaks to it.
- `please_tell_us_how_you_heard_about_this_internsh` — native select
  (20 options). Kind: unknown.
- `where_are_you_spending_summer_2026` — native select ("New York City
  or somewhere nearby" / "Palo Alto or somewhere nearby" / "Other").
  Kind: unknown.
- `as_part_of_our_interview_process_we_may_use_ai_n` — radio group,
  a consent choice ("Yes, I consent" / "No, I do not consent"; the
  posting states the choice does not impact candidacy). Kind: unknown.
- `we_have_two_software_engineer_roles_at_palantir_` — free_text with
  a question_key; answerable in principle (a confirmed draft), the one
  member of the wall that already has a key.

## Why (the exact mechanism)

Module 149's fill loop answers exactly five categories — standard
(profile key), screening (canonical question_key), free_text (slug
question_key, draft-confirmed), eeo (decline default), attestation
(explicit act). Everything else lands in the final else:

- packages/domain/149-career-portal-apply.js, prepareRound fill loop:
  `asks.push({ field_id: f.field_id, reason: "unknown_field_category" })`

Module 150's classifier produces that dead kind whenever no canonical
rule matches, including for ordinary question controls:

- packages/domain/150-career-portal-browser.js, classifyKind's final
  line: `return { kind: "unknown" };`

The ask is UNANSWERABLE by construction, for two reasons:

1. The def carries no question_key, so no stored answer can bind to
   it: the executor's input writer (149 portalInputsFromBank, layer 2)
   keys the profile's stored answers by question_key, and 149's fill
   loop looks answers up only by question_key.
2. Module 172's coverage model keys stated answers the same way
   (answer_key facts / profile.answers entries) — there is no key
   under which a user's stated answer to "how did you hear about us"
   could ever be recorded against this field.

So the stop is not a missing fact; it is a missing CATEGORY. Any board
whose required questions include a plain choice/text question outside
the canonical map — Lever custom cards are the witnessed shape — stops
UNCOVERED_QUESTION forever, no matter what the user states. That is
the general defect; FDSE is its witness, not its scope.

## The fix (one seam, two halves)

Complete the category system the same way free_text already works —
a board question is answered from a stored, confirmed answer keyed by
its label, or it asks:

1. 150 classifyKind: a field that matches no canonical rule but IS a
   question control — a native select, a radio/checkbox group, or a
   plain text input — classifies as kind "question" (not "unknown").
   classifyFields stamps the def's question_key = slug(label)
   truncated to 40, the exact keying free_text already uses. File
   inputs keep their existing verdicts (unknown for non-resume), and
   single checkboxes keep theirs (attestation rules first, else
   unknown): neither is a question control with a label-keyed answer.
2. 149's fill loop gains the "question" category with the screening
   contract verbatim: fill from profile.answers[question_key] when
   the entry is confirmed, else ask (no_confirmed_fact /
   answer_unconfirmed). No derivation is added anywhere; an
   unanswered question still stops named, and 155 still names it
   UNCOVERED_QUESTION.

Answers then flow through machinery that already exists: 172 records
a stated answer under the key (owner_reply provenance for real users;
for the TEST profile's doorstep world, clearly TEST-marked sample
answers with provenance {source:"test_sample"} and test_invented:true,
the marker the TEST bank's cover_note already carries), portalInputs-
FromBank layer 2 carries confirmed stored answers into the drive, and
155/175 card them with their tags.

## What this fix is NOT

- Not a phrase patch: no label of any specific board is named in code.
  The rule is control-shaped (select / group / text input), so the
  next employer's custom questions classify the same way.
- Not F-023: the major field is kind standard and stays untouched;
  its malformed derived discipline ("of Science in Computer Science
  and Finance" — deriveAnswers' degree-prefix strip does not handle
  "Bachelor of Science in …") still matches no board option, so a
  drive that clears this wall is expected to stop at the D13 gate as
  INCOMPLETE_PAYLOAD naming that field. That is F-023's own round.
- Not F-025: the discovery race was re-witnessed tonight (three
  discovers of this same page returned 0, 15, and 27 defs minutes
  apart); its fix shape is already recorded under F-025 and is not
  this lane's change. The drive harness's wrapper already re-reads;
  the executor's single form() call remains exposed to it.
