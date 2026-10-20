# CAREER-WRITING: the writing-pattern system (module 154; MI-097 / BUG-236 / FR-394)

`packages/domain/154-career-writing.js` (`CareerWriting`) is the system built after the owner's real
12-draft networking wave of 2026-10-13 passed every then-existing QA gate while failing on sameness:
the words were clean; the sameness was the tell, and nothing measured it. This module measures it.

Pipeline (design `docs/career/writing-pattern-prompt-v2.md`):

- [G0] prohibition gate runs FIRST and cannot be overridden downstream: a context that bans
  AI-written text (the MATS registry entry, or a ban recorded on the context itself) refuses
  drafting and offers fact-organizing assistance instead. UNKNOWN defaults to owner-write-only —
  absence of a found prohibition is not permission. A disclose-policy context is allowed and its
  verdict carries `disclosureRequired`.
- Voice profile: measured statistics from the user's OWN writing samples only. Cold start is
  honestly null — no profile is ever synthesized — and fewer than 3 sentences is too thin to be
  a voice. Samples spanning audiences produce per-audience sub-profiles. User edits fold back
  into the profile as statistics only; no prose is retained.
- Structural seeds sample opening mode, length band and lead fact kind from the profile's own
  distributions; an assigned opening mode or lead fact kind is honored. Prompt v2 renders with
  the profile's measured voice targets filled in; with no profile it returns null (v1 fallback).
- Slop gate (per draft, deterministic): substance floor, profile-relative sentence-variance
  (CV bar + uniform-run bar), hard-banned phrases (one hit fails), marker vocabulary (two fail),
  tell taxonomy (not-X-but-Y frames, tricolons, repeated openings, summary closes, unanchored
  praise, staged run-ups), fact-anchor density per paragraph, and the fact-lock: every number,
  date and capitalized entity must trace to the fact pack — an untraced span is a hard fail,
  named, and a rewrite deletes it rather than rephrasing it.
- Rewrite loop: generate → gate → targeted rewrite from the scorecard, max 2 rewrites; a
  still-failing draft returns FLAGGED with its failing metrics named, never unflagged.
- Batch gate (per wave, the HS classes): verbatim sentence reuse, bridge-clause monoculture,
  subject frames (one frame >50%, or an identical subject to two people at one firm), length
  spread at ≥8 drafts, lead-fact-kind spread, logistics-string repetition, opening diversity,
  and structure fingerprints. The reference generator + wave assembler compose drafts whose
  ask, facts and seed are carried on the draft object.

Honest limits: this module never runs or quotes a third-party AI detector and never claims a
draft is "undetectable"; it measures distance to this user's own writing, sameness within and
across drafts, and fact-tracing. That is all it claims.

Where it runs:

- `packages/domain/123-career-tailor.js` (cover-letter scorecard + MATS outline-only degrade)
  and `packages/domain/124-career-outreach.js` (draft scorecard), both only when the caller
  enables `writingPattern`.
- Tested in `tests/career-writing-pattern.test.cjs` (the fail-first corpus suite) and here.

Check: `node --test tests/depth-CAREER-WRITING.test.cjs && node evals/depth/run.cjs CAREER-WRITING`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | MATS is owner-write-only | MATS refused, assistance offered | `S01` in tests/depth-CAREER-WRITING.test.cjs | the MATS registry entry allows AI drafting | proven |
| S02 | Context ban wins | a context-recorded ban refuses outreach | `S02` in tests/depth-CAREER-WRITING.test.cjs | the explicit context ban is not read | proven |
| S03 | UNKNOWN defaults closed | an unchecked statement kind is UNKNOWN | `S03` in tests/depth-CAREER-WRITING.test.cjs | personal statements default to AI_OK | proven |
| S04 | Disclosure flag carried | a disclose-policy verdict carries disclosureRequired | `S04` in tests/depth-CAREER-WRITING.test.cjs | the disclosure flag is dropped from the verdict | proven |
| S05 | Cold start is null | no samples means no profile | `S05` in tests/depth-CAREER-WRITING.test.cjs | an empty sample list synthesizes a profile | proven |
| S06 | Too thin is null | two sentences are too thin for a profile | `S06` in tests/depth-CAREER-WRITING.test.cjs | a single sentence is enough for a profile | proven |
| S07 | Short share measured | bursty samples show a short-sentence share | `S07` in tests/depth-CAREER-WRITING.test.cjs | sentences of six words or fewer are never counted short | proven |
| S08 | Per-audience profiles | two audiences produce two sub-profiles | `S08` in tests/depth-CAREER-WRITING.test.cjs | per-audience sub-profiles are never built | proven |
| S09 | Assigned opening honored | an assigned opening mode is the seed's mode | `S09` in tests/depth-CAREER-WRITING.test.cjs | the assigned opening mode is ignored | proven |
| S10 | Prompt carries the voice | the rendered prompt contains the voice targets | `S10` in tests/depth-CAREER-WRITING.test.cjs | the voice block is rendered empty | proven |
| S11 | Numbers trace | a faithful draft's numbers all trace | `S11` in tests/depth-CAREER-WRITING.test.cjs | the fact corpus's numbers are never collected | proven |
| S12 | Fact-lock hard-fails invention | an invented $40 million is named untraced | `S12` in tests/depth-CAREER-WRITING.test.cjs | the tracer reports every span traced | proven |
| S13 | Substance floor | a 3-word text is below the draft minimum | `S13` in tests/depth-CAREER-WRITING.test.cjs | the substance floor is two words | proven |
| S14 | Hard-banned opener | 'i hope this email finds you well' is a hard hit | `S14` in tests/depth-CAREER-WRITING.test.cjs | the finds-you-well opener is not on the hard list | proven |
| S15 | Two markers fail | delve + tapestry together fail the metric | `S15` in tests/depth-CAREER-WRITING.test.cjs | any number of marker words passes the metric | proven |
| S16 | Uniform run fails | six same-length sentences show a run of 6 | `S16` in tests/depth-CAREER-WRITING.test.cjs | a uniform run of any length passes | proven |
| S17 | Profile-relative CV bar | a flat draft fails against a CV-1.0 profile | `S17` in tests/depth-CAREER-WRITING.test.cjs | the CV bar is a tenth of the profile's own CV | proven |
| S18 | Tricolons are tells | two tricolon sentences fail tells | `S18` in tests/depth-CAREER-WRITING.test.cjs | tricolons are never counted as tells | proven |
| S19 | Anchor density | an unanchored long paragraph is named | `S19` in tests/depth-CAREER-WRITING.test.cjs | unanchored paragraphs are never collected | proven |
| S20 | Still-failing is flagged | an unfixable draft returns flagged with metrics | `S20` in tests/depth-CAREER-WRITING.test.cjs | a still-failing draft returns unflagged | proven |
| S21 | Instruction from scorecard | the second generation receives the scorecard's instruction | `S21` in tests/depth-CAREER-WRITING.test.cjs | the rewrite loop passes an empty instruction | proven |
| S22 | HS-1 verbatim reuse | a sentence in 4 of 4 drafts fails reuse | `S22` in tests/depth-CAREER-WRITING.test.cjs | verbatim reuse is tolerated at any share | proven |
| S23 | HS-3 same-firm subject dup | an identical subject at one firm is flagged | `S23` in tests/depth-CAREER-WRITING.test.cjs | same-firm subject duplicates are never detected | proven |
| S24 | HS-4 length spread | eight equal-length drafts fail at ratio 1 | `S24` in tests/depth-CAREER-WRITING.test.cjs | a length ratio of 1 passes the spread check | proven |
| S25 | HS-6 logistics repetition | one logistics string in 4 of 4 drafts fails | `S25` in tests/depth-CAREER-WRITING.test.cjs | logistics repetition is tolerated at any share | proven |
| S26 | Edit capture counts | one captured edit makes basis.edits 1 | `S26` in tests/depth-CAREER-WRITING.test.cjs | captured edits are never counted | proven |
| S27 | Generator ships the ask | a composed draft contains the logistics ask | `S27` in tests/depth-CAREER-WRITING.test.cjs | the composed draft never appends its ask | proven |
| S28 | Opener classes | a question opener classifies as question | `S28` in tests/depth-CAREER-WRITING.test.cjs | question openers are never classified as questions | proven |
<!-- results:end -->
