# CONTRACT — R2 binding audit (MI-038): questions the R2 re-drive stopped on although a confirmed source already answered them

**Written:** 2026-10-17, Phase 1 of finishing the owner's 25 real applications
(parent dispatch). **Registered:** BUG/FR requested from the Crew A registry
(MI-093 single-writer rule) — ledger row stands as PENDING-ALLOCATION;
integration record's counters suggest BUG-270 / FR-425. Lane:
`finish/answer-bindings` off `depth/integration` 5711b77.
**Witness:** Lane E's R2 re-drive (2026-10-16), 25/25 verified end states,
0 submitted — 20 applications parked on 131 uncovered asks (85 required).
The audit of every ask against the fact bank, the resume, the batch
packets, and the product's own application record found **12 required +
3 optional asks already answered by a confirmed source**.

## The rule

A binding exists only when a source states the answer verbatim or
unambiguously. Anything a reasonable reader would have to defend as
"probably" stays an owner ask. Three binding shapes were added, each
with refusal rails:

1. **Phrasing reach (module 150, classifier only).** The value was
   already derived; the label wording missed the rule: "eligible to
   work legally" → `work_authorization` (F-020); "3+ months of
   internship / work experience?" → `experience_3mo_plus` (slash-joined
   qualifiers flattened, up to two qualifiers); "Which U.S. State or
   Canadian Province do you reside in?" → `state_of_residence`;
   "Legal Name (if different than above)" → `name`.
2. **Missing derivations (module 149, `deriveAnswers`).**
   `current_company` = org of the confirmed experience fact marked
   current (end: "present"); `employers` = the org set of all confirmed
   experience facts; `certifications` = the confirmed certification
   facts' titles, carried as a STANDARD profile field (document
   material into a field that asks for it — the BUG-238 non-answer law
   for screening keys stands); `outside_activities` = "Yes" when a
   confirmed experience fact is current — the Yes direction ONLY: no
   current activity on file derives nothing, never a guessed No.
   Declared in `ANSWER_KEY_SOURCES` (outside_activities: ["experience"])
   so the coverage contract keeps forcing the wiring.
3. **Record resolutions (module 149, `prepareRound`).** Answers that
   are properties of the record, resolved at fill time by
   `resolveScreeningFromRecord`, each refusing to derive when the
   record is ambiguous:
   - `prior_employment` → "No" iff the posting's company is absent from
     the employer set AND no employer matches it exactly, as a
     substring, or at ≥ 0.5 token overlap (a name variant of a real
     employer stays an ask). Module 150's rule carries the
     federal/government carve-out: "employed by the U.S. Federal
     Government…" is a different question and never takes this answer.
   - `prior_application` → "No" iff the host attested the manual set
     (the MI-108 `manualApplications` input is an array) AND neither
     it nor the submission ledger carries an application to this
     company. No attested set → no derivation.
   - `full_time_readiness` → the label's 4-digit year against the
     education fact's graduation year (ready iff graduation ≤ asked
     year). No year or no graduation fact → ask.

**Deliberate non-derivation.** `restrictive_agreements` (non-compete /
non-solicitation / post-employment restrictions) got a classifier key
and NO derivation, ordered before the current-company rule: GitLab's
restrictions label contains the words "current employer" and was one
derivation away from being filled with a company name. The key makes
the mis-fill structurally impossible while the question stays the
owner's personal confirmation.

**Held line (reversed during the audit).** "Highest level of COMPLETED
education" remains owner-only: no source states a completed credential,
and module 150's pinned law is that only an explicitly completed
credential fact may answer it. One owner-stated fact closes the class.

## Guards

`tests/career-portal-answer-map.test.cjs`, R2 section (16 tests,
employer labels verbatim from the R2 records): fail-first **14 red** on
the pre-fix tree → **24/24 green** after (the 2 always-green tests are
pins: the federal carve-out and the GitLab mis-fill trap). Submit-path
suites (answer-map + collision + contracts + submit-integrity) 31/31.
Full sweep: 4,393 tests (baseline 4,377 + these 16). In this sandbox:
11 fails post-fix — 9 Chromium drive tests (D11–D14) failing identically
on the pristine 5711b77 base here (environment-class; the browser
helper does not run in this sandbox) plus the 2 dispositioned SC-300
pins. Zero regressions attributable to this branch.

## Scope

Code + guards only. No submissions, no form driving, no captcha
interaction in this phase; the owner's resume / fact bank / packets
never enter the repo. Files: `packages/domain/149-career-portal-apply.js`,
`packages/domain/150-career-portal-browser.js` (classifier rules only),
`tests/career-portal-answer-map.test.cjs`, regenerated router bundles
(149 only; 150 is not bundled), this contract, the ledger row, the
BUILD-STATUS claim. No 120/130/142 or `_shared` edits — no named
requests arose; every binding fit inside 149/150.
