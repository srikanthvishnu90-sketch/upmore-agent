# WO-095: memory's write path has an assertion gate (B-MEM-1)

Stacked on WO-090 (`wo/090-port-live`, PR #120), which ports the T3 span fix into module 142.

## Why
- **Symptom (verified).** On the 2026-10-20 battery account, two plain asks rewrote the user's record:
  - "Find 55 people at Google who interned at startups first" wrote `target_firm = "Google"`.
  - "Find 75 data scientists at fintechs in SF who share my major" wrote `geography = "SF"`. Before T3 it also wrote
    `majors = "at fintechs in SF who share my"`.
  - The true facts were Meridian Capital, economics and Denver.
- **Why the record changed.** Single-value kinds replace on write. One false write silently destroys a true fact.
- **Why it spread.** The account merge (`career_host.js`) seeds every later thread from the record. The false facts
  then anchored later plans: the next ask was planned "at Google".
- **Why the writes happened.** Memory has two writers, and neither one checks the speech act:
  1. `captureStatedFacts` runs on every turn's raw text. Its clause check (`clauseIsAssertion`) rejected only clauses
     that end in "?" or open with a fixed question word, so an imperative ask passed as an assertion. The bare
     imperative "network into <Firm>" and "find analysts …" both had capture frames.
  2. `handleCampaignPlan` recorded the ask's own named firm and geography as `target_firm` and `geography`. Its only
     gate was "not a question".
- **Polarity.** "I do not require sponsorship" was stored as `needsSponsorship = true`. The negation list covered
  "need" but not "require", so the positive "require sponsorship" matched.
- **Corrections.** "sorry, I meant Denver" replaced nothing. The only correction shapes were "make it X not Y" and
  "actually X, not Y" for cities, plus a few firm shapes.
- **Capitalisation.** "My target firm is X." at the start of a sentence never matched, because the frame looked for a
  lowercase "my".

## What changed
- **`packages/domain/142-career-router.js`**
  - **The assertion gate.** `clauseIsAssertion` now means: not a question and not a request.
    - The old question-only test is kept as `clauseIsNotQuestion`.
    - `clauseIsRequest` first strips discourse fillers. It also strips a memory wrapper ("remember that …", "let me
      tell you about me: …"), because that wrapper's payload is the user's own statement.
    - It then rejects a clause that opens with a request verb: find, show, get, give, help, build, email, draft,
      apply, list, search, send, network, tailor, write, line up, and others.
    - It also rejects an ask frame: "I want you to …", "I'd like to find …", "I need 40 …", "let's …", "please …".
  - **Sentence context.** `gatedFactClausesOf` drops the comma clauses inside a request sentence ("…, in SF, who share
    my major"). The one exception is a clause that opens with the user as subject ("Find me banks, I'm a junior").
    The keyed frames (recruiter contact and the others) apply the same rule through `asserted()`.
  - **Goal statements.** A first-person goal is the user's own target, and a goal frame records it. Examples: "I want
    to network into Northbeam in Boston", "I'm trying to break into X". The bare imperative "network into X" is a
    request and records nothing.
  - **`handleCampaignPlan` no longer writes facts.** A follow-up that points back at the last ask ("line up analysts
    there first") is anchored to the standing plan (`ctx.plan`), not to the record. "line up" joins the
    people-ask gate, so that follow-up is planned instead of falling back.
  - **Corrections.** These shapes replace any single-value kind:
    - "change / update my <kind> to <value>", "my <kind> is actually <value>".
    - "not <old>, <new>" and "<new>, not <old>", where <old> must be the value on record.
    - "sorry, I meant <value>". This replaces only a kind that the **previous** turn recorded (the new
      `statedFacts.lastTurn` marker). After an ask, the same words write nothing.
  - **Polarity.** New single-value kinds `sponsorship` and `citizenship`, with the negative frames tested first.
    `sensitiveCorrectionOf` reads "do not / don't / no longer / won't / never" + "need / require" as no need. The
    stated-facts profile bridge carries `needsSponsorship` with its polarity.
  - **Capitalisation.** "My target firm is …" now matches at the start of a sentence.
  - **Offer capture.** The offer-thread capture keeps the question-only test. The negotiation record is a separate store,
    and offers are routinely reported inside an ask.
- **`packages/domain/130-career-onboarding.js`**: the visa answer's negation covers "do not / don't / no longer … need
  / require".
- **`supabase/functions/_shared/career_host.js`**
  - `sponsorship` and `citizenship` merge as single-value kinds.
  - The thread's `lastTurn` marker survives the account seed.
  - The new kinds ride the existing `keyed` carriage, so no migration is needed.
- **Bundles**: `router_core.js` and `router_core.career.js` are rebuilt.

## Tests
- `tests/career-assertion-gate.test.cjs`: 37 tests on the deployed path (the real CareerHost, with assertions on the
  committed account record). On the base branch, 25 of them fail:
  - the MI-124 journey (the true facts survive; thread B recalls Meridian Capital);
  - 11 of the 14 request shapes (the other 3 already wrote nothing on the base);
  - "My target firm is …";
  - every polarity case;
  - every correction case.
  The questions, most assertion cases and the T3 compound sentence pass on both. They are there to guard against
  regressions.
- Existing T3, T1 and wave-1 suites: green.
- All `tests/career-*.test.cjs`, compared with `wo/090-port-live` in the same environment: no new failures. The base
  branch's pre-existing failures are unchanged. See the PR for the numbers.
- Architect suite: 632 passed, 0 failed.
- `build-router-core.py --check` and `--career-only --check`: verified.

## Demo (owner)
`node --test tests/career-assertion-gate.test.cjs`.

## Out of scope / follow-ups
- **Old false facts are not healed.** The facts already written on live accounts stay (e.g. `target_firm=Google` with
  evidence "Find 55 people…"). A heal-at-seed rule could drop stored facts whose evidence is a request. That needs its
  own order and the owner's word, because it changes stored records.
- **Plan anchoring.** A universe-less ask is still anchored to the firm on record (LF-09). "Find 75 data scientists at
  fintechs…" is planned at the stated target firm, because 124's parser does not read "fintechs" as a category.
- **Stale threads.** Across threads, a stale thread snapshot still wins over a newer account value for single-value
  kinds (the host merge rule). Comparing timestamps there is a separate change.
