# WO-058: sealed sample G scored once, and each wrong reading fixed

## Why: sample G, scored once
Sample G has 100 more real postings:
- 40 Greenhouse, 30 Lever and 30 Ashby;
- seed 7, with no employer from samples A–F;
- each with its own location.

One posting (MetLife) has no required questions, so 99 are scored. G was captured by CI (run 39442366230,
`question-capture-g.yml`), sealed, and scored once on trunk 2fc9e4f9, after WO-057. The two independent reviewers read only
the persona brief, each posting's location and the fills, never the code. Rows about pay or work rights were kept apart by
location.

| Sample G on trunk 2fc9e4f9 (scored once, VERIFIED-S) | |
|---|---|
| Required questions filled | 624 / 867 (72.0%) |
| Postings fully ready | 23 / 99 |
| Fills judged right | **608 / 624 (97.4%)** |
| Judged wrong | 12 (1.9%) |
| Not settled by the persona | 4 (0.6%) |

**G is worse than F.** The trend on fresh samples, each scored once:

| Sample | Wrong |
|---|---|
| D (before WO-055) | at least 3.9% |
| E (before WO-056) | 1.6% |
| F (before WO-057) | 1.2% |
| G (before WO-058) | **1.9%** |

The rate is not falling steadily. Each sample brings wordings the rules have not seen. Four of G's twelve wrong fills come
from one form (AvidXchange), so one unusual form moves the rate by more than half a point.

The 16 fills:

| Posting | Question | Was | Why it was wrong |
|---|---|---|---|
| Nexxen (New York) | "Candidates must be authorized to work in the U.S. without current or future sponsorship by Nexxen. Are you legally authorized to work for ANY employer in the United States?" (checkbox) | unchecked | The rule stated before the question was read as the sponsorship question; the person is a US citizen |
| AvidXchange ×3 | "Primary Address Line 1" / "Primary Address City" / "Primary Address Zip Code" | the full address in each | Each asks one part of the address |
| World Wide Professional Solutions | "Home Address: City, State and Zip Code" | the full address | It asks for the city, state and zip, not the street |
| AvidXchange | "...worked with a staffing/contract agency to provide services for AvidXchange?" | No | Agency work is not on the person's employer list |
| US Conec (Hickory, NC) | "Where are you located currently? Are you able/willing to relocate or commute?" | Chicago, IL | Two questions, and only the first was answered |
| Freedom Technology | "What is the best phone number and email to reach you?" | the email | Asks for two things |
| Gong | "...what percentage ... net-new logos ... how many did you source yourself?" | Company website | "source" was read as how they heard |
| Tevora | "By providing your mobile number and consenting, you agree to receive SMS/text messages..." | the phone number | The number given here is consent to texts, which the person declined |
| Kabam (Montreal) | a checkbox: certify the answers, or consent to "reference checks, background checks, and/or credit checks" | the checks | A credit check is not the person's yes to a background check |
| PointClickCare | "What programming languages are you most proficient in?" | English | A programming language is not a spoken one |
| Colibri (not settled) | "Applicant's Statement" (no text shown) | checked | A heading does not say what is attested |
| Western Aircraft (not settled) | "I certify ... true and correct ... In consideration of my employment, I agree to" | I agree | An agreement beyond certifying the answers |
| Allegiant (not settled) | "employed by an Allegiant company, Sun Country, or through a Third Party Contractor Agency onsite?" | No, none of the above | Work through a contractor is not on the employer list |
| Allegiant (not settled) | "Do you consent to Allegiant sharing your application ... with Sun Country Airlines...?" | Yes | Sharing with another company is the person's own call; it was read as a travel screen ("Allegiant Travel Company") |

## What changed
- `question_map.ts`:
  - **Authorization:** the question a label asks is its last sentence with a "?". A sponsorship rule stated before "Are you
    authorized to work for any employer?" no longer turns it into the sponsorship question.
  - **Address:** "Address Line 1", "Address City" and "Address Zip Code" after a word ("Primary", "Home") are that part;
    an address label naming a part ("Address: City, State and Zip") is never the full address.
  - **Agencies:** work for this employer through a staffing agency, a vendor, a contractor or a third party is asked, in the
    label or in the options (SpaceX's list offers "contracted by a third-party employer").
  - **How heard:** "source" is how they heard only as the field's name ("Source", "Candidate source"), never inside a
    question.
  - **Languages:** programming, coding, computer, scripting or query languages are not spoken languages.
  - **Statements:** a bare "Applicant's Statement" is asked. An agreement "in consideration of my employment", or a consent
    to credit or reference checks, is beyond the standing consents.
  - **Sharing:** a consent to share the application with another company is asked.
  - **Travel:** "Travel Company" in a name is not travel.
  - **Two questions:** "Where are you located? Are you able to relocate or commute?" is asked.
- `career_apply.ts` (`classifyField`, the direct path):
  - a location question that also asks about relocating or commuting;
  - a box asking for both a phone number and an email;
  - a phone number given as consent to text messages.

## Every fill on A–G before and after (the rule for keeping any change)

| | |
|---|---|
| Added | 0 |
| Changed | 4, all now right: AvidXchange's three address parts ("1 Example St", "Chicago", "60601"); Nexxen checked |
| Removed (now asked) | 17 |

The 17 removals:
- 12 are G's flagged fills.
- AvidXchange's optional "Primary Address Line 2" had been getting the full address. It was wrong, and no reviewer saw it
  because the question is optional.
- 4 are on A, B and C, each consistent with a ruling already made:
  - SpaceX's and xAI's employment-history lists, which offer "contracted by a third-party employer" (as Allegiant);
  - WPP's "Are you currently an employee of a WPP agency?" (B): any company in WPP's group, as in WO-056;
  - Jane Street's "Additional information (for source)" (C): not how they heard.

## Numbers (VERIFIED-S offline; synthetic persona; a real person's rate is NOT_RUN)
| | Before (trunk 2fc9e4f9) | After |
|---|---|---|
| A: required filled | 757 / 1,011 (74.9%), ready 21 | 755 / 1,011 (74.7%), ready 21 |
| B | 654 / 847 (77.2%), ready 38 | 653 / 847 (77.1%), ready 37 |
| G (spent, tuned on: not a measure) | 624 / 867 (72.0%), ready 23 | 612 / 867 (70.6%), ready 22 |
| Fully ready, A and B (`email-apply-coverage.ts`) | 59 / 199 | 58 / 199 (29.1%) |

- In the answer-once eval, 2 stand-in answers on A are now refused. They are SpaceX's and xAI's first option ("I have never
  worked for SpaceX..."), and the panel never keeps an answer that names one employer. It stays on that card.
  This is the panel working, not a defect.

## Gates
- **Architect tests:** 581 passed, 0 failed.
- **Browser, Workday, schema, location and picker suites:** 86 passed, 0 failed.
- **Bundle `--check`:** fresh.
- **`deno check scripts/apply.ts`:** clean.

## Not done (blunt)
- **G is spent.** Sample H (seed 8, no employer from A–G) is being captured on `ci/question-capture-h`, to be scored once on
  the trunk with this order.
- **Wrong is not falling steadily on fresh samples:** D at least 3.9%, then 1.6%, 1.2% and 1.9%. Rules learned from samples
  catch the wordings they have seen. The card shows every answer before the one tap, and none is sent without it (D-007).
  That is the backstop, and it does not make a 1–2% wrong rate acceptable on its own.
- **Composite questions are asked, not composed.** "City, State and Zip" and "phone and email" could be built from the
  person's own facts. That needs a composition step this order does not add.
- **Coverage is far from the 85% target:** 74.7% / 77.1% on A and B, and 72.0% on G before this order. Most of what is
  left is the person's own: essays, experience screens and offices in other cities. Unmapped questions ("unknown") are the
  largest group: 597 of the 1,868 unfilled required questions across A–G.
