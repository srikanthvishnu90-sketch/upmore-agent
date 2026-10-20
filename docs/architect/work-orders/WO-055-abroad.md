# WO-055: a job abroad, and a question beyond what a fact says

## Why: sealed sample D, scored once
Sample D: 100 more real postings, seed 4, no employer from A, B or C, each with its own location (WO-053). It was
captured by CI (run 39415679037), sealed and scored once on trunk 0175e523. The reviewer was independent and read only
the TEST persona, each posting's location and the planner's fills, never the code.

| Sample D on trunk 0175e523 (scored once, VERIFIED-S) | |
|---|---|
| Required questions filled | 636 / 846 (75.2%) |
| Postings fully ready | 27 / 100 |
| Fills judged right | 599 / 636 (94.2%) |
| Judged wrong | **24 (3.8%)** |
| Not settled by the persona | 13 (2.0%) |

The reviewer judged distinct fills: a wording asked the same way at several postings was read once, at the first
posting's location. That hid one more wrong fill. loveholidays (London) "What are your salary expectations?" → 95000
was merged with the same question at a US posting. By the reviewer's own verdict on Faculty AI's London box, it is wrong
too. **D's honest count is at least 25 wrong of 636 (3.9%).**

Two causes, both missed by the A/B/C reviews, whose reviewers were never told where the job was:
1. **A job abroad.**
   - Work rights and pay there are that country's. "Will you now, or in the future, require sponsorship?" at Neo4j's
     London posting is about the UK; the person's "No" is about the US.
   - A bare 95000 in a London, Tokyo or Stockholm pay box reads as pounds, yen or kronor.
   - 15 of the 24 wrong were these (19 of the 24 were at jobs abroad).
2. **A question that names a fact's topic and asks more than the fact says.** For example:
   - "the field of study for your second highest qualification" (the persona has one degree on record);
   - "Does your work authorization involve CPT or OPT?" (a visa type, not authorization);
   - "Would you need to relocate to work from one of these offices?" (whether moving is needed, not whether they would);
   - "the school you are currently attending" (the persona graduated);
   - "worked for Microsoft as an employee or vendor" (a vendor's placement is not on the person's employer list);
   - "a non-compete or non-solicitation agreement" (the fact covers non-competes only);
   - "U.S. Citizenship is required. Are you able to meet this requirement? y/n" (answered "United States").

## What changed
- `career_apply.ts` `otherCountry` (now also given whether the person's home is in the US):
  - **Work rights at a job abroad** (every place the posting names is abroad) are asked unless the question names the US.
    A posting in the US and abroad together ("Shanghai; U.S.; Canada; Toronto") stays asked when the question names
    no country (WO-053).
  - **Work rights where the person lives are theirs wherever the job is**: "in your country of residence", "remain in
    your current location", "your current work authorization status", for a person whose home is in the US. A foreign
    country named in the question still makes it that country's.
  - **Pay** (expected or current) is asked:
    - at a job abroad;
    - in another currency (JPY, £, lakhs);
    - as a bracket, band or range;
    - as more than the stated expectation ("inclusive of bonus/commission", "Variable Salary", OTE).
    Only the question asked counts: "[Example: base salary, annual commission]" after FiscalNote's question, and
    Filevine's note about geographic pay, are not the ask.
  - **The salary currency** "of the country where this position is based" is asked at a job abroad.
- `career_apply.ts` `beyondFact`: per fact, what it does not say.
  - Work authorization: a visa type (CPT, OPT). A sponsorship question that lists OPT among its examples is still the
    sponsorship question.
  - School: being enrolled now.
  - Education: a second degree.
  - Relocation: whether moving is needed, and a "select all that apply" list of where they live and would move.
  - US person: a clearance.
  - Worked here before: through a vendor, a consultancy or an agency, or "for a health insurance company". A contractor's
    own work is on the person's list: Workday's "employed by X as a Full-time, Part-time, Contractor or Temporary worker"
    is still derived from it.
  - Applied before: to an affiliate or another company.
- `askedPart`: the question a label asks is its last sentence with a "?" (else its last sentence). Thrive Causemetics
  states "must be authorized ... without sponsorship" and then asks "Will you require sponsorship?". That was answered
  "Yes" (the statement's shape); it is now "No" (the question's).
- `fitsField`: a box marked "y/n", "yes/no" or "(yes or no)" takes only a yes or a no.
- `question_map.ts`:
  - a non-solicitation, restrictive covenant or post-employment restriction is not the non-compete fact;
  - "referred by a government official" is a disclosure question, not "who referred you";
  - "salary expectations (including currency)" asks for the amount, not the currency;
  - "a non-compete agreement with your current employer" is not the current employer. It was typed as "Example
    Analytics" into a text box: a wrong fill already on trunk, found while testing this order.
- `tests/fixtures/extension/answer-key.json`: two corrections, with reasons. WPP Media (London) and Airwallex (Hong Kong)
  pay boxes went from salary_expectation to null; neither is a held-out form.

## Also here: an answer about a job abroad is never kept as the person's own
Found while reviewing WO-054 (answer once before the session). Saved answers are stored and read back by `answerKey`,
and the key knew nothing of where the job is. Two failures followed:
- **London's answer became the person's fact.** A person who answers "Yes" to London's "Will you now, or in the future,
  require sponsorship?" (they need UK sponsorship) had it stored as `fact:sponsorship`. Every US form would then say
  they need sponsorship.
- **A US answer filled London's question.** A "No" saved as that fact filled London's question through the saved-answer
  path, which skipped the checks above.

Now:
- `factStaysHere` (`career_apply.ts`) holds an answer to this posting alone wherever the planner would not use the
  person's fact there (`otherCountry`, `beyondFact`). `answerKey`'s `here` option then gives it a job key.
- The store (`questionsToStore`) and the planner both use it, from the posting's own location:
  - the extension sends `location` with its questions and its form answers;
  - the cloud worker writes it into its needs-answers result.
- The same fix stops "Have you ever worked for a health insurance company?" from becoming the person's "worked here
  before" for every employer.

Test WO-055/6 covers this end to end, from storage to the read-back at a London and a US posting. Each half was planted
as a defect and caught.

## Tests
- `tests/architect/wo-055-abroad.test.ts`:
  1. Every one of the 36 fills the review judged wrong or not settled no longer gets that answer
     (`tests/fixtures/apply/wo-055-sample-d-audit.json`, each with its posting's location).
  2. Jobs abroad, the person's own country, pay and currency, each both ways.
  3. The pay rules stop at the question asked.
  4. Each beyond-fact rule, and the fact still answering its own question (sponsorship with OPT as an example, Thrive,
     Robinhood "employee, intern or contractor", "willing to relocate?").
  5. The y/n box and the four mapping changes.
- `tests/architect/wo-020-fill.test.ts` F6: floors lowered, with the 22 fills counted in the test.

## Every fill on A, B, C and D before and after (the rule for keeping any change)
Fills, required or not, with each posting's own location:

| | |
|---|---|
| Added | 0 |
| Changed | 1: Thrive "Yes" → "No", right |
| Removed (now asked) | 73 |

Each removal was read with its posting's location:
- **A and B: 22 required.**
  - 20 at jobs abroad: London, Dublin, Madrid, Munich, Stockholm, Singapore, Sydney, Shanghai, Dubai, Hong Kong,
    India, Toronto, Latin America.
  - 2 beyond the fact: a firm in Aprio's alliance; a vendor at Woven by Toyota.
- **D: 37 required.** These are 36 fields of the reviewer's 35 flagged questions (Thrive was corrected, not asked;
  the "second highest qualification" question is on one form twice), plus loveholidays above.
- **C: 9 required, all at jobs abroad.** Seven pay boxes and one sponsorship question in Hyderabad, Malaysia, Noida,
  London and Manchester. C's reviewer, who was not told the location, judged 8 of them right and 1 unsure.

**C's record changes again.** By the standard D's reviewer applied, those 8 were wrong. C stood at 9 wrong of 607
(WO-053); it is **17 wrong of 607 (2.8%)**.

The first version of this order removed 7 more fills; checking every removal caught each one, and all 7 are kept:
- Five were right answers about the person's own country at postings abroad: Okta Madrid, Oyster ×2, GitLab and
  Snowflake. Fixed by the home rule above.
- One was Sword Health's "What currency should we use for your desired salary?" at a US posting. Fixed by narrowing the
  currency rule.
- One was a whole class: "contractor", in Workday's standard former-employee question. WO-048/9 caught it, and the
  reviewer had judged Robinhood's "employee, intern or contractor" → "never worked here" right.

## Numbers (VERIFIED-S offline; synthetic persona; a real person's rate is NOT_RUN)
| | Before (trunk 0175e523) | After |
|---|---|---|
| A: required filled | 775 / 1,011 (76.7%), ready 24 | 761 / 1,011 (75.3%), ready 21 |
| B | 662 / 847 (78.2%), ready 38 | 654 / 847 (77.2%), ready 38 |
| C (spent) | 598 / 771 (77.6%), ready 31 | 589 / 771 (76.4%), ready 31 |
| D (spent, tuned on: not a measure) | 636 / 846 (75.2%), ready 27 | 599 / 846 (70.8%), ready 24 |
| Fully ready, A+B (email-apply-coverage) | 62 / 199 (31.2%) | 59 / 199 (29.6%) |
| 17 live forms, corrected key (browser suite) | 0 wrong | 0 wrong; Lever 71/74, Ashby 62/63, Greenhouse 38/38 outside widgets |
| 17 real pages, live, never sent (CI apply-bench-live, this PR's first head) | 190 correct, 0 wrong, 96.0% | **187 correct, 0 wrong, 95.4% (VERIFIED-LIVE)** |

Coverage fell because fills that were wrong at jobs abroad are no longer counted. A Chicago person's 95000 is not their
expectation in London, and their US work rights are not their UK work rights. 29 of A's 99 postings and 18 of B's 100
are abroad (8 and 12 show no location). A US-only person would mostly skip those jobs; the planner now asks rather than
guesses.

## Gates
- Architect tests: 562 passed, 0 failed.
- Cloud-worker suites (approve-first, cloud worker, owned worker): the same 7 environment-only failures as trunk, by name.
- Browser, Workday, schema, location and picker suites: 85 passed, 0 failed.
- Bundle `--check`: fresh.
- `deno check scripts/apply.ts`: clean.

## Not done (blunt)
- **D is spent**: these rules were written from its review, so its "after" is not a measure. The next honest number
  needs sample E: captured with locations, sealed, then scored once by a reviewer told each location.
- **A person who lives abroad** is still asked about their own country's rights everywhere. The persona facts state US
  work rights only; there is no fact for another country.
- **"Nearby" is not home**: a question about "your current location" answers from the US home, wherever that is.
- **The reviewer's distinct-row merge** hid at least one wrong fill (loveholidays). Sample E's review must key distinct
  rows by location whenever the question is about pay or work rights.
