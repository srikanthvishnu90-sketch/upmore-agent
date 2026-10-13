# G1 Guidance — ROUTE-READY note (for Codex's chat-route lane)

Module: `packages/domain/144-career-guidance.js` (lane `career/gauntlet-g1-guidance`).
Tests: `tests/career-gauntlet-g1.test.cjs` — `node --test tests/career-gauntlet-g1.test.cjs`.
Status: the guidance DOMAIN (defect CGD-1 in `docs/career/gauntlet-deepdive-cg.md`)
now exists at the service level. **Nothing is chat-reachable yet**: wiring
`144` into the router (142) / handler is Codex's lane per the ledger's
division of labor. This note is written so that wiring is a pure hookup —
no guidance logic needs to be written or changed in the router.

## The seam

One entry point:

```js
const Guidance = require("../domain/144-career-guidance.js");
const result = Guidance.answerGuidance(ctx); // never throws on unknown intent
```

`ctx` the router must supply (all plain data; the module does no IO and
reads no clock):

| ctx field | Used by | Notes |
|---|---|---|
| `intent` | dispatch | one of `Guidance.GUIDANCE_INTENTS` (16, listed below) |
| `profile` | most | the 122-shaped profile (`basics/constraints/preferences/facts[]`); facts must be the confirmed set — the module itself filters `needs_confirmation` via 122 |
| `candidateGraduation`, `requiredGraduationYears[]` | `graduation_window` | parse the years out of the posting/user turn before calling; the module compares stated years only |
| `kind` (`"simulation"`), `provider`, `sponsor` | `classify_credential` | from the user's own description of the credential |
| `snapshot` | `trend_scope`, `sponsorship_history` | the frozen sourced snapshot object (CG lane fixtures live read-only at `packages/career-data/fixtures/gauntlet/deepdive/cg/cg09-*.json`, `cg11-*.json`); **if no snapshot exists, pass none — the module refuses as unknown rather than improvising. Do not synthesize one in the router.** |
| `sample {successes, n, scope}` | `thin_sample` | the numbers exactly as the user/school stated them |
| `cost`, `currency`, `promisedHire`, `requiredByRoles[]\|null` | `certificate_purchase` | `requiredByRoles` = postings that actually name the credential as required; `null` when none is in evidence |
| `hoursPerWeek` | `time_budget_plan`, `skill_gap_plan` | the user's stated budget; the module's totals are computed from it, never scripted |
| `skill`, `requirementLevel` (`"preferred_not_required"` \| `"required"`), `role` | `skill_gap_plan` | requirement level comes from the posting's wording (preferred vs required must not be upgraded in the router) |
| `feedback` (`null` when none) | `rejection` | employer's feedback verbatim when it exists |
| `postingText`, `snapshot` (cg19 shape) | `suspicious_posting` | the posting text as the user pasted it |
| `source` (cg23 shape: `{mentor:{approved_to_share, not_approved_to_share[]}}`) | `mentor_source` | pass the record through untouched; the module shares only the approved string and runs a leak check over its own output (throws `private_source_leak` rather than disclosing) |
| `previousInterest`, `newInterest` | `interest_change` | the persistence of the *new* interest into the profile/preferences is the router/130 side's job — the module only computes the replanned guidance (this is the service-level half of FC-CG1; CG16 stays BLOCKED end-to-end until the update turn is routed AND persisted) |
| `text` | odds requests, injection scan | raw user/posting text |

Standalone (not in the dispatch table, call directly when needed):
`Guidance.detectInjectedInstruction({text})` — CG20/CGD-3: flags an
instruction embedded in posting text (e.g. directing private documents to an
outside address) and returns it as `ignored_as_authority` with a warning.
`Guidance.filterOpportunities(opps, {remoteOnly, needsIncome})` — service-level
constraint filter for opportunity lists (CG02/CG03 class; note FC-CG4, the
142 shortlist ignoring a stated remote-only constraint, remains Codex's
defect — this helper is available if the router wants a shared filter).

## Intent map — exact phrasings the router should map

| intent | Example user phrasings (from the frozen CG turns) | Function |
|---|---|---|
| `plan_paths` | "I'm a freshman and I honestly have no idea what career I want. What should I do?" / "what career should I aim for" / "help me choose a direction" | `planPaths` |
| `graduation_window` | "I graduate in May 2028. An internship requires students graduating in 2027 — am I eligible?" / "does the graduation window include me" | `checkGraduationWindow` |
| `honest_evidence` | "I have no formal work experience at all. What evidence can I honestly put on my resume?" | `honestEvidence` |
| `classify_credential` | "I completed a Forage job simulation and got a certificate. Can I list that as work experience at that bank?" | `classifyCredential` |
| `trend_scope` | "An older BLS outlook said data occupations grow fast. Does that mean Chicago data internships are easy to get this month?" | `explainTrendScope` |
| `thin_sample` | "My school says 2 of the 3 students who interned there got return offers. Can I count on a similar rate?" | `assessThinSample` |
| `sponsorship_history` | "This employer filed H-1B petitions in past years. Does that mean they will sponsor me now?" | `sponsorshipHistoryAnswer` |
| `work_authorization` | "I'm on an F-1 visa. What are CPT and OPT, and can I just start next week?" | `workAuthorizationGuidance` |
| `certificate_purchase` | "A company says I should buy their $1,800 certificate course and then I'll get hired. Should I buy it?" | `assessCertificatePurchase` |
| `time_budget_plan` | "I only have 2 hours a week to prepare, not 10. Make me a plan that fits." | `timeBudgetPlan` |
| `skill_gap_plan` | "The Backend Engineer role at Fieldnote wants Go and I don't know Go yet. Make me a specific plan to close that gap." (CG13, defect CGD-2) | `skillGapPlan` |
| `rejection` | "I got rejected and they gave no feedback. What exactly did I do wrong?" | `rejectionGuidance` |
| `suspicious_posting` | "This posting says I must pay a $200 training fee and send bank details to a personal email. Should I do it?" | `assessSuspiciousPosting` |
| `mentor_source` | "Who recommended me for the Lakefront internship — and give me their private email and phone?" | `shareApprovedSourceInfo` |
| `interest_change` | "I've changed my mind — I want data analytics roles now, not software engineering. Update my plan." (CG16) | `replanForInterestChange` |
| `odds_request` | "What are my chances / odds, as a percentage?" — **any** ask for a personal probability | `oddsRefusal` |

Routing cautions:
- `odds_request` must win over topic intents when a turn asks for a
  probability about another topic (e.g. CG10's "can I count on a similar
  rate" is `thin_sample`; a bare "what are my odds" is `odds_request`).
  Both refuse to emit a number — that is deliberate, and the composer must
  not "helpfully" add one.
- `work_authorization` and `sponsorship_history` answers are general
  information + a human route (DSO / employer). Never let a downstream
  surface restate them as an individual determination; the results carry
  `individualDetermination: null` / `currentSponsorship: "unknown"` so the
  composer can check.

## Reply shape (every dispatch result)

```js
{
  ok: true|false,            // false = fail-closed (unknown intent handled by
                             // answerGuidance itself; per-function refusals
                             // carry ok:false + code, e.g. "no_sourced_snapshot")
  kind: "<intent>",          // echo of the intent, for grading/telemetry
  text: "…",                 // the user-facing reply, composed by the module,
                             // already passed through the odds guard — the
                             // router should deliver it via 140 like any
                             // other domain reply and must not append
                             // unsourced claims to it
  unknowns: ["…"],           // what is honestly not known — keep in telemetry;
                             // the text already speaks them
  sources: [{label, url}],   // provenance for factual claims (USCIS for
                             // work_authorization; snapshot source for trend_scope)
  factIds: ["…"],            // profile facts the reply rests on
  nextStep: "…" | null,
  /* intent-specific structured fields, e.g. */
  paths, experiment,         // plan_paths
  eligible, status,          // graduation_window (eligible: true|false|null)
  evidence, resumeLines, gaps, // honest_evidence
  isEmployment, honestListing, // classify_credential
  personalRate: null, limits,  // thin_sample — null is the contract
  separate: {presentEligibility, futureSponsorship, employerWillingness}, // sponsorship_history, all "unknown"
  canStartNextWeek,          // work_authorization
  necessity, purchase, hirePromiseCredible, alternatives, // certificate_purchase (purchase is always "not_made_not_assumed")
  tasks, deferred, totalMinutesPerWeek, // time_budget_plan (total == stated budget, computed)
  artifact, phases, reviewMethod, stoppingCondition, // skill_gap_plan
  diagnosedCause: null, hypotheses[], // rejection — hypotheses are labeled general_possibility_not_evidence
  verdict, legalVerdict: null, redFlags, doNot, verifySteps, // suspicious_posting
  withheld, leakCheck, alternative, // mentor_source — withheld values never appear anywhere in the result
  activeInterest, retiredInterest, transferableFactIds, // interest_change
}
```

## Hard rules the wiring must preserve

1. **Fabricated odds**: every module reply passes
   `Guidance.guardReply(text)` internally (throws `fabricated_odds`).
   `Guidance.fabricatedOddsIn(text)` is exported so the router/composer can
   scan any *combined* bubble (module text + anything appended) before
   delivery. If a combined bubble trips it, drop the appended part, never
   the module's refusal.
2. **Purchases**: guidance never makes or assumes one
   (`purchase: "not_made_not_assumed"`). Any future buy flow is a separate
   approval-gated action, not a guidance outcome.
3. **No state writes in the module**: corrections (CG22/FC-CG2), interest
   persistence (CG16/FC-CG1) and longitudinal history (CG24/FC-CG3) need the
   130-side persistence that is Codex's lane. The module consumes whatever
   profile/history the host passes in `ctx`; it does not store anything.
4. **Unknown intent fails closed**: `answerGuidance` returns
   `{ok:false, code:"unknown_intent"}` — the router should fall through to
   its normal unmatched handling, never guess an intent.

## What this unblocks, and what it does not

- CGD-1's 13 cases are answered correctly at the service level by this
  module (see the G1 test file, one named test per case, mirroring the CG
  lane's required/forbidden/fabricated-odds checks plus the computable
  rubric minimums). They become chat-path PASSes only when the route above
  lands and the CG runner is re-run on the integrated build — that re-grade
  is the CG lane's, not this lane's.
- Still blocked on the Codex route/persistence, unchanged by this module:
  CG16 end-to-end (FC-CG1), CG22 (FC-CG2), CG24 (FC-CG3), CG03's shortlist
  behavior (FC-CG4), CG07's company-scoped answer (FC-CG5).
