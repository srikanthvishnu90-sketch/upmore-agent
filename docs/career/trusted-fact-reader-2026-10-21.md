# D-007 quarantine bypass — root cause, the shared reader, the conversions

Owner ruling 2026-10-21 13:56 CDT ("every drafter converts onto it").
Branch `muse/2026-10-21-trusted-fact-reader`, base `cea914fe`.
Tests: `tests/career-trusted-facts.test.cjs` — 8/8 (fail-first record below).

## What "quarantine" is in this codebase

There is no symbol named "quarantine" for facts. The state exists under
122's confirmation model: resume-ingested facts arrive with
`needs_confirmation: true` and `status: "draft"` ("a resume draft can
never arrive confirmed by accident", 122-career-profile.js:340) and are
cleared only by `confirmFact()`. A second, separate quarantine
(47-data-guard.js) wraps connector strings as inert data — unrelated.

The WO-030 essay drafter named in the ask (`essay_draft.ts` /
`career_apply_questions.ts`) does NOT exist on this base — it lives on
the WO trunk line only (not in v248). The essay drafter on this base is
133's `medEssayPacket`; it is the proof subject for (a). There is no
separate cover-note drafter: the cover letter is 123's
`generateCoverLetter`, proved as drafter (c) through its own entry.

## Root cause

No single read path enforced the quarantine. Each drafter hand-rolled
its own filter — or none — and the filters disagreed:

| reader | predicate | verdict |
|---|---|---|
| 122 `confirmedFacts` (:126) | `!needs_confirmation` only | misses `status:"draft"` with the flag off |
| 149 `deriveAnswers` local `confirmed()` | `status==="confirmed" && needs_confirmation!==true` | stricter; a third semantics |
| 123 truth audit | per-fact check inside `factEvidencesSkill` (:741) + violation at :723 | guarded, at one site only |
| 132 saved answers / employer guard | **none** | **BYPASSED** |
| 124 `determineTier` | none (draftFor's body filter had one; tiering didn't) | **BYPASSED (tier)** |
| 127 `failureStoryFromFacts` / story mining | none (its refusal text even claims "no *confirmed* fact…") | latent |

Measured on base (probe, marker `ZXQMARKER` in quarantined facts only):

- 132 `savedSponsorshipAnswer`: quarantined text "…F-1 OPT then H-1B"
  flipped the drafted answer to `"Yes — F-1 OPT then H-1B."`; control
  without the fact: `"Yes — I will require sponsorship."`
- 132 `checkCurrentEmployer`: a quarantined experience fact BLOCKED an
  application and was quoted to the user as their confirmed employer.
- 124 `determineTier`: an UNSOURCED strong personalization fact
  elevated the draft to Tier A (the body stayed clean — draftFor's
  inline `source_url` filter worked; tiering read the raw array).
- 123 tailor / cover, 133 essay, 149 answers, 123 audit: no leak in
  the probed shapes — guarded, but each by its own predicate.

## The fix — module 167, the shared trusted-fact reader

`packages/domain/167-career-trusted-facts.js`. Contract: given a
profile (or a fact bank of the same shape) it returns ONLY cleared
facts. Quarantine is any hold signal: `needs_confirmation === true`,
`status` in {draft, quarantined, held, suppressed}, or
`quarantined === true`. There is no option or second export that
includes quarantined facts — they are unreachable through its API by
construction. Exports: `isQuarantined`, `isTrusted`, `trustedFacts`,
`trustedProfile` (a drop-in view whose facts array is pre-cut),
`trustedFactById` (quarantined reads as absent), and
`trustedContactFacts` for 124's universe (a contact's
personalization_facts: usable only with a `source_url`; referral claims
only when verified — the accounting draftFor kept inline, now shared
so tiering and drafting read the same pool). Deterministic, no model
calls. Registered in `scripts/build-router-core.py` after 122; both
bundles rebuilt and `--check`-verified.

## Conversions (every drafting read now routes through 167)

- **123 tailor + cover**: all `Profile.confirmedFacts` pools (×6),
  the skill `listFacts` read, the assemble() name corpus (:602 — it
  spanned ALL facts), the audit's skill-proof fallback (:754), and
  `evidencedFullTimeYears` (:989) now read `Trusted.trustedFacts`.
- **133 essay**: `medEssayPacket` + the employer-hit and skills reads
  converted from `confirmedFacts`/`listFacts`.
- **132 answers**: `profileEmployers`, `savedSponsorshipAnswer`'s
  fact-text corpus, `yearsForSkill` (incl. passing a trusted view into
  122's `skillEvidence`).
- **149 portal answers**: `deriveAnswers` operates on a
  `trustedProfile` view of the bank; its own stricter `confirmed()`
  stays as a second gate — nothing weakened.
- **124 outreach (drafting side only; the SEND_DISABLED sink is
  untouched)**: `draftFor` and `determineTier` share
  `trustedContactFacts`; `prepBrief` talking points read the same pool.
- **127 prep**: profile-sourced mining in `composeBrief`,
  `storyMapping`, `buildStoryBank`, `failureStoryFromFacts`.

Named non-conversions (judgment reads, not drafting pools):
123 audit's `Profile.getFact` (its job is to judge cited facts,
including naming the unconfirmed-citation violation — reading them is
the point); 124 qualityGate's record lookups (verifying a citation
against the record); 149 `answerMapCoverage` (a kind census — it must
see every kind to report an uncovered one) and its `Array.isArray`
shape guards; 122 itself (the store; its `confirmedFacts` is unchanged
for non-drafting callers). 142 the router is the conversation host,
not a drafter: it legitimately surfaces the user's own draft facts to
the user; every drafter it hands a profile to now cuts quarantine at
its own read.

Conversion grep (post-fix): `profile.facts` / `bank.facts` content
reads in 123/133/132 = 0; in 149 = the two named exceptions above;
`Trusted.trusted*` call sites: 123 ×10, 133 ×3, 132 ×4, 149 ×1 (the
entry view), 124 ×3, 127 ×5.

## Proof tests — one per drafter, same shape

Seed a quarantined fact carrying the unique marker `ZXQMARKER`; run
the drafter; assert the marker appears NOWHERE in the output, with a
positive control (cleared content DOES appear):

- reader unit contract — PASS before and after (the module is new)
- (b) tailor `tailorResume` — PASS before (own filter), locked in
- (c) cover `generateCoverLetter` — PASS before, locked in
- (a) essay `medEssayPacket` — PASS before, locked in
- (d) outreach `draftFor` + `determineTier` — **FAIL before** (tier A
  from an unsourced fact), PASS after
- (e) answers `savedSponsorshipAnswer` + `checkCurrentEmployer` —
  **FAIL before** (both leaks), PASS after
- (f) portal answers `deriveAnswers` — PASS before, locked in
- (g) prep `failureStoryFromFacts` — harness-corrected (storyMapping
  is not exported), PASS after

Fail-first verified by re-running the suite with the converted 124
stashed: outreach proof fails on base code, passes on converted code;
the answers proof failed on the unmodified tree in the first run
(5 pass / 3 fail incl. the since-corrected prep harness error).
