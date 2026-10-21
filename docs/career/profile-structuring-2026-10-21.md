# Canonical Profile Structurer — module 169 (Lane F, 2026-10-21)

Owner outcome: a user's confirmed facts become ONE canonical,
platform-shaped profile — headline, normalized education/experience
entries, canonical date/degree/GPA formats — that boards and surfaces
consume, instead of every form re-deriving fields from a raw fact list.

## What shipped

- `packages/domain/169-career-profile-structure.js` — pure,
  deterministic UMD module. `buildProfile(input, deps)`,
  `toBoardProfile(model)`, `toMatchProfile(model, opts)`.
- `tests/career-profile-structure.test.cjs` — 14 guards, synthetic
  corpus only (the owner's real-corpus run is local evidence and is
  never committed; the repo is public).

## Input: trusted facts only, through the reader contract

Facts arrive in the two standing shapes: fact-bank facts (module 122:
`{id, kind, title, text, bullets, status, needs_confirmation, data?}`)
and host stated facts (`{kind, key?, value}` — assertion-only). Every
fact passes the shared trusted-fact reader contract FIRST (module 167,
D-007 quarantine): `readTrustedFacts(facts) -> {trusted, quarantined:
[{fact, reason}]}` with reasons `QUARANTINED_FLAG`,
`UNCONFIRMED_DRAFT` (122 drafts / needs_confirmation),
`UNRESOLVED_PLACEHOLDER` (`[n]` anywhere in the record).

**167 has NOT landed on this base** — no branch carries it. 169 ships
a stub implementing the contract exactly as documented in its header
and accepts the real reader by injection (`deps.reader`);
`model.provenance.reader.stub` records which one ran. Swapping in 167
at integration is a one-line wiring change; the quarantine marker test
runs against whichever reader is injected.

Structured slots ride a fact's `data` object (or the fact itself). A
fact with no structured slots is carried UNSTRUCTURED (verbatim
title/text/bullets) with a gap flag per missing slot — free text is
never parsed into structure it does not declare.

## The canonical model

`{ kind: "career_canonical_profile", version: 1, user_id, headline,
contact, education[], experience[], skills[], certifications[],
honors[], target, gaps[], conflicts[], unplaced[], provenance }`

Every normalized value is a field record `{value, verbatim, fact_id,
rule}` — normalized value, the original exactly as stated, the source
fact id, and the named rule. Rules: TEXT_CLEAN, DEGREE_CANONICAL
(explicit token table + bare-abbreviation heads; unrecognized degrees
stay verbatim, flagged DEGREE_UNRECOGNIZED), DEGREE_DISCIPLINE_SPLIT,
GPA_CANONICAL (stated scale kept; a scale is never invented, a value
never rescaled), SPAN_NORMALIZE (month precision ONLY where the fact
carries a month), SPAN_SORT (entries carry `source_index`, so sorting
never loses the original order), SKILLS_AS_STATED, SKILL_DEDUPE,
STATED_FILL, STATED_SCHOOL_ENTRY, HEADLINE_* (stated wins; else
current role → recent role → student-at-school; never a model call).
Stated facts fill only ABSENT slots; a differing stated value is a
recorded conflict — the confirmed fact is kept, nothing overwritten.

Gap law: missing elements are GAP FLAGS, never filled — NAME/EMAIL/
PHONE/CITY/LINKEDIN_MISSING, EDUCATION/EXPERIENCE/SKILLS_MISSING,
DEGREE/DATE_MISSING, DATE_PARTIAL (year-precision span end: the
graduation-month case), HEADLINE_MISSING, USER_ID_MISSING. Trusted
facts of unmapped kinds are listed in `unplaced` with a reason —
reported, never swallowed (e.g. an `application_answer` fact: module
149 owns those, 169 says so).

## Emitters (one model, both shapes)

- **Board profile** (`toBoardProfile`) — module 149's standing
  profile contract, the field set profile-import boards ask for:
  flat `name, email, phone, location, linkedin, github, website,
  current_company, preferred_name, country` + education in the
  fact-bank F-001 shape `{school, degree, discipline, start_date,
  end_date, gpa, graduation_year}` (149's EDUCATION_KEYS; the same
  core set as 149's Greenhouse-shaped SANDBOX_FIELDS). Fields the
  canonical model does not source (github, preferred_name) emit null
  and are named in `_unfilled`, with the model's gap codes in `_gaps`.
- **Connector match profile** (`toMatchProfile`) — module 157's
  shape exactly: `{kind: "connector_match_profile", version: 1,
  user_id, needs, offers, visibility_scope: "internal_only",
  created_at, updated_at}`, honoring 157's caps (≤12 items, ≤280
  chars, case-insensitive dedupe; non-conforming items excluded and
  named in `notes`, never truncated) and its clock discipline (the
  timestamp is the caller's canonical ISO or the emitter refuses
  `timestamp_required`). Needs come from the stated career goal
  (MATCH_NEED_FROM_GOAL) plus caller-passed stated needs; offers ONLY
  from caller-passed stated offers — a skill list is never
  manufactured into an offer. Cross-check against 157's own validator
  happens at assembly (157 is not on this base).

## Real-corpus run (local evidence, 2026-10-21)

The owner's true facts (delivered 13:40 CDT) transcribed to fact
records: headline "Founder at Sporv AI" (HEADLINE_CURRENT_ROLE);
DePaul education canonical (Bachelor's; fields CS, Finance via
STATED_FILL from stated majors; span 2025 – 2029; GPA 3.9/4.0); four
experience entries in span order; 9 skills as stated; 2 certifications;
goal carried to target + match needs. **Exactly one gap:
DATE_PARTIAL — graduation month, as expected.** One recorded
conflict: contact city kept the confirmed fact "Chicago, IL" over the
stated variant "Chicago IL" (textual divergence, reported, not
merged). The work-authorization fact was honestly reported unplaced
(KIND_NOT_PROFILE_MAPPED — 149 owns application answers).

## Not done / boundaries

No router wiring, no bundle registration (assembly's job, like
156–165), no deploy, no sends, no submits. The 167 swap and the 157
validator cross-check are the two named integration follow-ups.
