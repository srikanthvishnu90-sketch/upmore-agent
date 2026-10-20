# WO-056: sealed sample E scored once, and each wrong reading fixed

## Why: sample E, scored once
Sample E has 100 more real postings:
- 40 Greenhouse, 30 Lever and 30 Ashby;
- seed 5, with no employer from samples A, B, C or D;
- each with its own location.

It was captured by CI (run 39429820358, `question-capture-e.yml`), sealed, and scored once on trunk f23d3d81, after
WO-055 and WO-054. The two independent reviewers read only the persona brief, each posting's location and the planner's
fills, never the code. This time, distinct rows about pay, currency or work rights were kept apart by location (D's merge
had hidden one wrong fill).

| Sample E on trunk f23d3d81 (scored once, VERIFIED-S) | |
|---|---|
| Required questions filled | 619 / 858 (72.1%) |
| Postings fully ready | 31 / 100 |
| Fills judged right | **605 / 619 (97.7%)** |
| Judged wrong | 10 (1.6%) |
| Not settled by the persona | 4 (0.6%) |

Sample D, before WO-055, was 94.2% right and at least 3.9% wrong. E is better but **not zero wrong**. The 14 fills:

| Posting | Question | Was | Why it was wrong |
|---|---|---|---|
| Retell AI (SF) | "Are you currently authorized to work in the United States? Retell AI DOES assist with visa sponsorship..." (checkbox) | unchecked | The note after the question was read as the sponsorship question; the person is a US citizen |
| SharkNinja | "receive recruitment marketing communications..." | Yes | A marketing opt-in read as a privacy notice; the person opted out of marketing |
| Momentum | "I consent to have my personal data disclosed to other Momentum Group entities" | Yes | Sharing beyond this employer is not the standing privacy consent |
| K2 Space (Seattle) | "in-office presence 3 days per week with periodic travel..." | Yes | Office days read as a travel question; Seattle is not a Chicago person's office |
| Pogo | "open to working fully remote, with occasional travel?" | yes | Read as travel; remote work is not stated |
| iCapital ×2 | "desired bonus expectation / total compensation with equity: the amount and currency" | USD ($) | Read as the currency question |
| iCapital | "If 'Employee Referral'... type the full name of the referring employee. If not, N/A" | Company website | Read as how-heard |
| Mastery Charter | "Which state granted your certification(s)?" | Illinois | Read as the person's state; they have no certifications |
| Rhombus Power | "If you've previously served in the U.S. Armed Forces: ... authorize the release...?" | No | Read as government employment, because "U.S." ended a sentence and hid the question |
| Rhombus Power | "a conflict of interest ... if you were to work for a DoD contractor?" | No | Read as the non-compete fact |
| Niural (Nepal) | "Expected Salary" | 95000 | Nepal was not a known country, so this was not seen as a job abroad |
| Pogo | "Have you worked at a startup or quant firm?" | no | A kind of company, not this employer |
| K2 Space | "Active Security Clearance(s)" (list with "Expired clearance") | Never held a clearance | "No clearance now" does not say none was ever held |

## What changed
- `question_map.ts`:
  - **Marketing:** a recruitment-marketing opt-in is the marketing opt-in.
  - **Consent:** a consent to share data with other entities, or to be considered for other roles, is never the standing
    privacy consent.
  - **Travel:** a question naming office days, hybrid, on-site or fully remote work is not the travel question.
  - **Currency:** "the amount and currency", a bonus, equity or total compensation is not the currency question.
  - **How heard:** the referring employee's name is not how they heard.
  - **City:** "current location: city?" is the city.
  - **State:** the state that granted a certification or license is not the person's state.
  - **Authorization:** a question asking only whether they are authorized to work is authorization, whatever note
    about sponsorship follows it.
  - **Conflict of interest** is no longer the non-compete fact.
- `career_apply.ts`:
  - **`askedPart`:** an abbreviation ("U.S.", "e.g.", "i.e.") no longer ends a sentence. This was a WO-055 defect: it read
    the wrong part of any question containing "U.S.".
  - **`classifyField`:** the same sponsorship and referral reads on the direct path.
  - **`beyondFact`:**
    - a question for those who served in the armed forces;
    - "at a startup or firm";
    - a clearance list that tells "Expired" from "Never held".
  - **The us_person clearance rule** now applies only when the question asks to obtain or hold a clearance. "U.S. Person
    status and/or clearance eligibility" (Anduril) is met by being a U.S. person.
- `posting_place.ts`:
  - **Countries:** 72 more countries and territories by name, Nepal among them.
  - **"United States/Canada"** is two places.
  - **A country's name before a US state is a US town** ("Peru, IL", "Mexico, MO"). This was a defect already on trunk,
    found by this order's test.
- `tests/fixtures/extension/answer-key.json`: three corrections, with reasons:
  - SpaceX's clearance list (a held-out form; the change comes from E's review);
  - Anduril's conflict of interest;
  - "a WPP agency".

## Every fill on A–E before and after (the rule for keeping any change)

| | |
|---|---|
| Added | 0 |
| Changed | 4, all now right: SharkNinja No, Scout Motors "Chicago", Mastery "Not Applicable", Retell AI Yes |
| Removed (now asked) | 15 |

The 15 removals:
- 11 are E's flagged fills.
- 4 are on A:
  - SpaceX's and CesiumAstro's clearance lists (both offer "Expired Clearance");
  - Anduril's "CONFLICT OF INTEREST";
  - WPP's "a WPP agency".

The first version also removed Anduril's U.S. person question, a right answer. The diff caught it and the narrowed
clearance rule keeps it.

## Numbers (VERIFIED-S offline; synthetic persona; a real person's rate is NOT_RUN)
| | Before (trunk f23d3d81) | After |
|---|---|---|
| A: required filled | 761 / 1,011 (75.3%), ready 21 | 757 / 1,011 (74.9%), ready 21 |
| B | 654 / 847 (77.2%), ready 38 | unchanged |
| E (spent, tuned on: not a measure) | 619 / 858 (72.1%), ready 31 | 608 / 858 (70.9%), ready 30 |
| 17 live forms, corrected key (browser suite) | 0 wrong | 0 wrong; Greenhouse 38/38, Lever 71/74, Ashby 62/63 outside widgets |

## Gates
- **Architect tests:** 575 passed, 0 failed.
- **Browser, Workday, schema, location and picker suites:** 86 passed, 0 failed, on this branch and on trunk.
  - One earlier combined run failed one Workday test ("a step's card ... the tap saves exactly that step").
  - It passed in three runs after that, two of them alone.
  - Not reproduced, and recorded here rather than dismissed.
- **Bundle `--check`:** fresh.
- **`deno check scripts/apply.ts`:** clean.

## Not done (blunt)
- **E is spent.** The next honest number needs sample F, sealed and scored once.
- **Wrong is not zero on a fresh sample yet.** The rate went from at least 3.9% (D) to 1.6% (E). Each sample has found new
  wordings: rules learned from samples converge, but not to zero. The rest is caught at review: every answer is shown on
  the card before the one tap, and none is sent without it (D-007).
- **"Remote" is not a stated preference.** "Open to fully remote?" is asked of everyone.
