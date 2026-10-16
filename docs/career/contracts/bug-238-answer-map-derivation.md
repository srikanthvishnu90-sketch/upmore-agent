# CONTRACT — BUG-238 / FR-396: module 149's answer map reaches only 2 of the bank's confirmed facts (R-2)

**Written:** 2026-10-15, BEFORE the fix (contract first).
**Registered:** master issue list — R-2 allocation (Crew A registry,
2026-10-15): BUG-238 / FR-396. Crew B build, lane `work/drive-blockers`.
**Failing witness:** the Claude Corps staging run (2026-10-15,
`~/workspace/your_files/real-apply/fellowships/claude-corps-staging-2026-10-15.md`)
stopped `awaiting_user` on "Are you 18 or older?" although the bank already
carried F-023 (date of birth, confirmed). The pipeline's answer map was
hand-built in the drive harness and carried exactly two keys —
`work_authorization` + `sponsorship` — so drives stopped on questions the
bank already answers: 18-or-older (F-023), preferred/first name
(basics.name), currently located in the US (F-022 + location), highest
education level (F-001), state of residence (F-024), time zone (Chicago =
Central), 3+ months' experience (F-002…F-005). Drive Pass 2's per-application
blocker table is the census of the same defect.

## The rule change

The answer map is DERIVED from the fact bank, in module 149, never
hand-maintained again:

1. **`deriveAnswers(bank, now)`** (149, exported) builds
   `{ answers, profileFields, traces }` from `status: "confirmed"` facts
   only. Every emitted answer carries its **factId**; every derivation is
   named in `traces`. Derivations:
   - `eligibility` facts → `work_authorization`, `sponsorship` (the two
     existing keys, now derived + traced instead of hand-set).
   - `profile` facts → country (`profileFields.country`); country =
     United States → `located_in_us = "Yes"`; date of birth →
     `profileFields.date_of_birth` + `age_18_plus` computed against the
     run's `now` (149 stays pure — the clock is passed in); hometown /
     basics.location → `state_of_residence` (segment after the comma;
     a 2-letter code expands via the US state table) and `time_zone`
     (IANA zone of the bank's own residence city — no city in the table,
     no derivation; the field stays an ask).
   - `basics.name` → `preferred_name` (first token; traced to
     `basics.name` — no separate preferred-name fact exists).
   - `education` facts → `education_level` (level token extracted from
     the degree text) + the `profile.education` block from the fact's
     structured fields (org / title / start / end / bank GPA default).
   - `experience` facts → `years_of_experience` (completed years across
     the span from the earliest confirmed start) and
     `experience_3mo_plus` ("Yes"/"No" against the same span).
2. **Classification (module 150 `classifyKind`)** gains the question
   patterns that consume these keys, placed so they cannot shadow the
   existing rules: `age_18_plus` ("at least 18", "18 or older", "are you
   18…"), `located_in_us` (before the location standard rule),
   `education_level` (level-of-education phrasings), `state_of_residence`
   and `time_zone` standard keys, `date_of_birth`, and duration-threshold
   experience phrasings (`experience_3mo_plus` for the 3-month form,
   `years_of_experience` for years phrasings; textareas excluded so
   "describe your experience" stays free text). The new screening keys
   join `semKeyFor`'s canonical list (D6 dedupe stability).
3. **The "completed" nuance (honesty-critical):** `education_level` is the
   current program's level. A field asking for the highest COMPLETED level
   routes to `education_level_completed`, which resolves ONLY from an
   explicitly completed credential fact. The bank has none (F-001 is in
   progress, 2025–2029), so that exact field STAYS an honest ask. Lanes
   never add bank facts; only the owner's confirmation can.

## Prevention (acceptance criterion — the root cause was a hand-maintained map)

- **P3 — contract test forces the wiring:** `ANSWER_KEY_SOURCES` is the
  only place an answer key may be declared (key → fact kinds).
  `answerMapCoverage(bank)` reports every bank fact kind as consumed,
  exempt-with-reason (`NON_ANSWER_FACT_KINDS`: leadership, certification,
  other, skill, research, metric — document/tailoring material, not
  screening answers), or uncovered. The contract test
  (`tests/career-portal-answer-map.test.cjs`) FAILS when: a confirmed fact
  kind exists that no question-pattern consumes and no exemption covers;
  a derived answer lacks a factId trace or a declared source kind; an
  unconfirmed fact yields an answer. A synthetic bank carrying a novel
  kind proves the forcing function fires. Bank grows → test forces the
  wiring. Hand-edits to the map without a fact-kind source are a test
  failure by construction.

## Done-test

1. The contract test passes on the real bank (zero uncovered kinds) and
   fails on the synthetic novel-kind bank.
2. End-to-end stop proof on a sandbox board: a form carrying a raw
   "Are you 18 or older?" field (classified by 150 from the raw
   descriptor) is FILLED from the DOB fact when present and stops
   `awaiting_user` when the fact is removed; an unmapped required field
   still stops the drive.
3. The Claude Corps staging re-run (staging harness pointed at this
   branch, profile built via `deriveAnswers`) passes the "Are you 18 or
   older?" field from F-023 and still stops on the genuine owner items
   (certificates, essays, decision fields).

## Out of scope

Education start/end MONTHS are not in the bank and remain asks. No bank
facts are created or edited by this lane. Nothing transmits; doorstep
posture, caps (MI-110), and approval binding (MI-116) are unchanged. The
release merge is owned by the combine lane.

## Landing addendum (2026-10-15 evening)

- The widget-shaped built-in "Degree" field routes to `education_level`
  (its options are levels); a plain text degree field keeps
  `education_degree`. Classification reads the label free of the board's
  trailing required marker ("Degree *") — the anchored rule never fired
  on real boards before that normalization.
- "Completed education" classification is a WORD-SET test (complet +
  education + highest/level, any order): the live claudecorps wording
  "What is the highest level of education you have completed?" puts
  "completed" after "education" and escaped the first pattern, which
  nearly fed an in-progress degree to a completed-education question.
  The completed key stays deliberately unanswerable from an in-progress
  enrollment — on the staging re-run that field is an honest ask.
- Live done-test stands: Claude Corps staging filled "Are you 18 or
  older?" from F-023 (driver-verified, source user_confirmed_answer);
  without the fact the same field stops the drive (contract test).
