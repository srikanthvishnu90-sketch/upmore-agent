# MI-038 R3 — the delegated-answers binding pass (2026-10-17)

Companion to `mi-038-r2-binding-audit.md`. Phase 1 bound everything the
record already answered and left 47 facts on `owner-ask-sheet-final.md`.
The owner then delegated the answers themselves ("answer all of these
questions urself. For test", 2026-10-17 ~10:59 CDT). This pass enters
those answers as confirmed facts and wires every one into the answer
map so the re-drive (R3) consumes them. The answered sheet with each
answer's written basis lives outside the repo by the privacy rule:
`~/workspace/your_files/real-apply/owner-ask-sheet-answered-2026-10-17.md`;
the facts are F-027..F-079 in the same directory's `fact-bank.json`,
provenance `owner-delegated 2026-10-17 (answer-all directive)`.

## The three fact shapes

1. **Profile facts** (kind `profile`, consumed by `deriveAnswers` like
   F-022/F-023/F-024): citizenship status, education start/end months,
   highest completed education, how-heard standard, current ZIP.
   Derivations:
   - `citizenship_status` — the fact's value, verbatim.
   - `student_visa_holder` = No, `us_person_status` = Yes,
     `deemed_export_affects_employment` = No — ONLY from an affirmative
     U.S.-citizen/national value. Any other status derives the status
     text alone; the three directions stay asks (guard-pinned).
   - `education_level_completed` — ONLY from the explicitly completed
     credential fact. The BUG-238 law is unchanged and re-pinned: an
     in-progress enrollment never answers this class.
   - `how_heard` — the standard fact, verbatim.
   - Education block gains `start_month` / `end_month`
     (`EDUCATION_KEYS` extended) and profile gains `zip_code`.
2. **Application answers** (kind `application_answer`): each fact
   carries its `question_key` + value. `deriveAnswers` emits a key ONLY
   when it is declared in `ANSWER_KEY_SOURCES` (declared-source law —
   an undeclared key emits nothing and the suite names it). 34 keys:
   `restrictive_agreements` (the delegation IS the personal
   confirmation R2 reserved for the owner — superseded by his answer,
   recorded as fact F-033, not by an inference), `acknowledgment_receipt`
   (the Fact-5 class approval, value `true`), and the one-line classes
   (military, languages, first-gen, gender identity, relatives/federal
   pair, SQL+Python, English, offers, Winternship, office preference,
   the relocation/onsite/availability set, comp shapes, Grosvenor
   relationships, Figma area choices, areas of interest).
3. **Application texts** (kind `application_text`): company-scoped
   confirmed drafts (essays + GCM's two paragraphs), exempted in
   `NON_ANSWER_FACT_KINDS` WITH the reason: they are host-supplied at
   drive time for their company only — the same pattern as attestations
   and the MI-108 manual set — keyed by the free-text label slug module
   150 computes.

## Attestation wiring (149 + 150)

- Module 150 canonicalizes attestation question_keys:
  acknowledgment/privacy checkboxes → `acknowledgment_receipt`; the
  certify class → `certify_true` (so the owner's explicit confirmation
  reaches the checkbox whatever DOM id the board assigned). Gusto's two
  availability questions that merely CONTAIN "acknowledge" route to
  their screening keys first.
- Module 149's attestation fill accepts an explicit attestation
  addressed by field_id OR canonical question_key, and otherwise falls
  back to a confirmed answer under the field's key (the class
  approval's shape). No approval on file → the field stays an ask
  (guard-pinned both directions).

## Classifier notes (150)

The R3 screening block sits with the R2 block, above EEO/education.
Load-bearing order: the federal-relatives rule precedes both the
federal-employment rule (its label matches "federal government …
contractor") and the general relatives rule; GCM's DETAILED comp
paragraph is excluded from `comp_expectations` (stays a draft);
why-essays classify `free_text` on any element type (Workshop's is a
plain text input). Education month keys precede the generic start/end
rules so the year values can never land in month fields.

## Guards

`tests/career-portal-answer-map.test.cjs` R3 section: 16 tests
(coverage of the new kinds, the undeclared-key forcing function, the
citizenship trio incl. the non-citizen refusal, derivation of every
delegated key traced to its fact, verbatim-label classification for
every R2 label in scope, the federal-pair pins, attestation
canonicalization, why-essay widening, and four end-to-end fills with
fact-removal reversals). Fail-first: 17 red on the pre-R3 tree
(incl. the one bank-aware assertion update) → 40/40 green.

## Follow-ons from the live re-drive (same day)

The R3 drives surfaced four more defects of the same family, fixed the
same day with verbatim-label guards (answer-map suite at 45/45): the
location rule's bare substrings (`city` in "capacity", `location` in
"relocation") word-boundaried; the prior-employment pattern extended to
the "currently working at" shape; `reside_near_posting` (posting-relative,
company-scoped facts only) and `graduation_year_or_later` (a readiness
mirror) added; region-named work-authorization questions
(`work_authorization_other_region`) given NO derivation — the bank's
authorization fact is U.S.-scoped and no other region's answer exists
in the record; essay free-text patterns widened; attestation
canonicalization made label-keyed across widget shapes. Two helper-side
defects (attach ladder filling cover-letter/transcript slots with the
packet; react-select single-drive persistence) are named in the run
summary for the helper's owner, not fixed here.
