# CLASSIFICATION — Gusto's ten uncovered questions (MUSE-F-029), 2026-10-22

Lane: F-029 (Gusto question coverage, the F-026 path). Witness drive:
batch-2891c869c36a (TEST profile b2625909…, prepare-only, flag OFF) —
stop UNCOVERED_QUESTION with 10 asks. Field labels, kinds, and
question_keys below are from a scan-only inventory of the live form
through the board service on 2026-10-22 (28 fields, no fills;
~/workspace/o5-batch/gusto-inventory-2026-10-22.json), cross-checked
against the Greenhouse public boards API for option lists. The TEST
master was read the same day: 20 confirmed facts (TP-001…TP-033),
12 stored answers. No ZIP, relocation, availability, or
first-generation fact exists on it, and none exists in the owner's
stated fact set for this lane.

Classes (the F-026 basis): (a) answerable from a confirmed fact on
the TEST master · (b) non-fact sample material → a TEST-sample answer
stored on the TEST master ONLY (provenance {source:"test_sample"},
test_invented: true; never on a real profile, never presented as a
fact) · (c) fact-shaped with no confirmed fact → stays UNANSWERED;
it is the person's own answer to give (module 172's ask), never
invented and never TEST-sampled onto a question the owner has not
classed.

| # | field_id | label (verbatim) | kind / question_key | class | basis |
|---|----------|------------------|---------------------|-------|-------|
| 1 | cover_letter | "Attach" — the Cover Letter file input (Greenhouse also offers a cover_letter_text variant, not in the discovered defs) | unknown / — (required: false) | (b) basis, category gap — left unfilled | The TEST basis marks cover letters TEST-sample-only, and the master already carries a TEST-sample cover note (`cover_note`, test_invented draft). But this control is a document ATTACH: 149 fills documents as {filename, sha256}, and no cover-letter document exists on the TEST master to attach — the question-kind mechanism keys text answers, not documents. The field is OPTIONAL on this form (149 blocks only on required asks), so it does not block the doorstep or the card. Decision: no document category is built in this round (one fix per round; the F-029 fix is required-question coverage). The remaining gap is named, not patched around: a future round may classify cover-letter file inputs as a document category filled from a stored, confirmed cover-letter document. |
| 2 | question_69649385 | "Zip Code / Postal Code (Non-U.S. based candidates, please enter \"00000\")" | question / zip_code_postal_code_non_u_s_based_candi | (c) | Fact-shaped: the applicant's own postal code. No ZIP exists in the authorized facts or on the TEST master (TP-033 hometown is "Chicago, IL" only). Deriving or sampling a ZIP would invent a fact. UNANSWERED. |
| 3 | how_did_you_hear_about_this_opportunity_select_a | "How did you hear about this opportunity? (select all that apply)" — options: LinkedIn, Glassdoor, Indeed, Facebook, Built In Colorado, News Article, Conference or Meetup, Gusto Blog, Gusto Employee, Gusto Website, Billboard/Outdoor Ads | question / how_did_you_hear_about_this_opportunity_ | (b) | Non-fact sample material (discovery channel) — the FDSE how-heard precedent exactly. TEST-sample ["LinkedIn"], chosen from the board's own option list, TEST master only. |
| 4 | question_69847997 | "Tell us a little bit about yourself and why you think you would be a good fit at Gusto." | free_text / tell_us_a_little_bit_about_yourself_and_ | (b) | Essay/draft question. TEST draft written under module 168's fact-bound discipline from cleared facts TP-001/TP-002/TP-003/TP-005 plus framing, TEST header first; auditSentences must pass before recording. |
| 5 | question_69847999 | "Are you willing to relocate to New York for the duration of this internship?" (Yes/No) | question / are_you_willing_to_relocate_to_new_york_ | (c) | Fact-shaped personal commitment. No confirmed fact states relocation willingness, and the owner has not classed this question. UNANSWERED. Tension named for the owner: the FDSE lane TEST-sampled a future-location question ("Where are you spending summer 2026?" → "Other") on the TEST profile; this lane's ruling classes unclassed fact-shaped questions (c). One owner word reclasses it. |
| 6 | question_69848000 | "This internship is from May 17, 2027 to August 6, 2027 (12 weeks). Are you available for the full duration of this cohort?" (Yes/No) | question / this_internship_is_from_may_17_2027_to_a | (c) | Fact-shaped availability commitment; no confirmed fact covers the cohort dates. UNANSWERED; same reclass note as #5. |
| 7 | question_69848001 | "To help make sure everyone has the same experience, we are not able to adjust the internship start or end dates. Are you able to acknowledge and agree to this requirement?" (Yes/No) | question / to_help_make_sure_everyone_has_the_same_ | (c) | An acknowledge-and-agree act — attestation-shaped. Consent/attestation is the person's own act (149's attestation category demands explicit confirmation), UNANSWERED by design until the person acts through the 172 ask. |
| 8 | question_69848002 | "Do you have any upcoming offer deadlines or recruiting timelines we should be aware of?" | free_text / do_you_have_any_upcoming_offer_deadlines | (b) | The product classes this a draft field (needs_user_draft_confirmation), and drafts are class (b) sample material on the TEST profile. The TEST draft is header + framing ONLY: it asserts no deadline and no timeline for any real application. |
| 9 | question_69848003 | "As Gusto grows, we are always aiming to expand our recruitment presence at conferences, gatherings, or other partnerships. Please let us know of any you're planning to take part in or have taken part in to help inform our team about future recruitment opportunities." | free_text / as_gusto_grows_we_are_always_aiming_to_e | (b) | Draft field, same basis as #8. The TEST draft is header + framing ONLY: no conference or partnership is named, because none is a cleared fact on this master — naming one would invent it. |
| 10 | 1012 | "I identify as a first-generation professional (please select one):" | question / i_identify_as_a_first_generation_profess | (c) | Identity self-description — a fact about the person. No confirmed fact states it. Sampling an identity claim on the TEST profile is exactly what the TEST-sample rule forbids. UNANSWERED. |

Class (a): none of the ten. Every field that COULD have bound to a
fact already did on the witness drive (LinkedIn URL, work
authorization, sponsorship, graduation year 2029, the EEO block).

## What the fix therefore is

Data, not code: the F-026 mechanism (kind "question" + free_text
draft branch, keyed by label slug) is already host-live and already
binds stored confirmed answers. The four class-(b) answers are
recorded on the TEST master (script:
~/workspace/o5-batch/record-gusto-test-answers.cjs, the F-026
recording pattern; owner profile read for a non-interference
baseline and never written). No product code changes, so nothing is
host-applied and F-027/F-028/DECLINE-VOCAB cannot regress; their
guards are re-run as witnesses.

Expected re-drive outcome, stated before the drive: the four (b)
fields fill; the run stops awaiting_user / UNCOVERED_QUESTION on
exactly the five required class-(c) asks (69649385, 69847999,
69848000, 69848001, 1012), with cover_letter's optional ask carried.
The card renders only when the person answers the five — that is
the product working as designed, and the five are the owner's to
answer or reclass.
