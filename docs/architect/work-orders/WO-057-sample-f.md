# WO-057: sealed sample F scored once, and each wrong reading fixed

## Why: sample F, scored once
Sample F has 100 more real postings:
- 40 Greenhouse, 30 Lever and 30 Ashby;
- seed 6, with no employer from samples A–E;
- each with its own location.

It was captured by CI (run 39436937169, `question-capture-f.yml`), sealed, and scored once on trunk 7bdeaa63, after
WO-056. The two independent reviewers read only the persona brief, each posting's location and the fills. Pay and
work-rights rows were kept apart by location.

| Sample F on trunk 7bdeaa63 (scored once, VERIFIED-S) | |
|---|---|
| Required questions filled | 604 / 854 (70.7%) |
| Postings fully ready | 30 / 100 |
| Fills judged right | **595 / 604 (98.5%)** |
| Judged wrong | 7 (1.2%) |
| Not settled by the persona | 2 (0.3%) |

The trend on fresh samples, each scored once:

| Sample | Wrong |
|---|---|
| D (before WO-055) | at least 3.9% |
| E (before WO-056) | 1.6% |
| F (before WO-057) | 1.2% |

The 9 fills:

| Posting | Question | Was | Why it was wrong |
|---|---|---|---|
| Tenet3 (Dayton) | "...current U. S. citizenship in order to achieve and maintain a security clearance. Are you currently a U. S. citizen?" | No | The clearance won the reading (the person holds none); the question asked is citizenship, and the person is a US citizen |
| Tenet3 | "HYBRID in Dayton, Ohio. Are you willing to travel to Dayton at least 2 days per week?" | Yes | Office days in another city read as willingness to travel |
| Magnet Forensics | "Work authorization": by nationality / by a work permit... | by a valid work permit | A US citizen is authorized by nationality |
| Calm | "years of professional experience ... working in UX/UI design?" | 1–3 years | Total relevant years are not years in a named field |
| Cohere Health (Hyderabad) | "Where are you staying in Hyderabad? Mention full address." | the Chicago address | Not where the person lives |
| Belvedere Trading | "What date are you available to begin employment (Month and Year)" | 2 weeks | A span of time is not a month and year |
| Da Vinci | "Source" | University Career Page | A university's career page is not the company's website |
| Eikon (not settled) | "relatives or contacts with whom you have personal or social relationships" | No | Contacts are not relatives |
| Stand Together (not settled) | "employed by, or act as a representative of a political party" | No | Representing a party is not on the employer list |

## What changed
- `question_map.ts`:
  - **Clearance:** a question asking "are you currently a U. S. citizen" is the citizenship question, whatever clearance
    it explains.
  - **Travel:** office days, hybrid or on-site in a named place are not willingness to travel, for `travel_ok` (as
    WO-056 did for `job_travel`).
  - **Years:** years of experience "in", "with" or "working in" a named field are not total relevant years.
  - **Address:** "Where are you staying / living / located in <a place>" is not the home address.
  - **Relatives:** contacts and social relationships are not relatives.
- `answer_options.ts`:
  - **Citizenship:** "U. S." with a space is the US.
  - **How heard:** a university, college, school or campus career page is never "the company website".
- `career_apply.ts`:
  - **Nationality lists:** a list that tells authorization by nationality from a work permit (Magnet, Exegy, Rivian
    VW) is answered by nationality for a US citizen at a job in the US or with no place named. Anyone else, or a job
    abroad, is asked.
  - **`beyondFact`:** a political party's representative.
  - **`fitsField`:** a date field asking for a month and year takes only a value with a year.

## Every fill on A–F before and after (the rule for keeping any change)

| | |
|---|---|
| Added | 2, both right: MongoDB "MongoDB Careers Page" (no longer tied with "College Careers Page / Event"); Rivian VW "authorized as a Citizen or Permanent Resident" |
| Changed | 2, both right: Tenet3 citizenship "Yes"; Magnet "due to my nationality" |
| Removed (now asked) | 7, all F's flagged fills |

The first version asked every nationality list. The diff showed it lost Exegy's correct answer, so the rule now answers
those lists for a US citizen.

## Numbers (VERIFIED-S offline; synthetic persona; a real person's rate is NOT_RUN)
- A and B required-question coverage is unchanged (74.9% / 77.2%). The two added fills are on optional questions.
- 17 live forms (browser suite, corrected key): 0 wrong.
  - Greenhouse 38/38, Lever 71/74 and Ashby 62/63 outside widgets.

## Gates
- **Architect tests:** 578 passed, 0 failed.
- **Bundle `--check`:** fresh.
- **`deno check scripts/apply.ts`:** clean.
- **Browser, Workday, schema, location and picker suites:** 85/86 in one combined run. The one failure was a
  queue-timing test, "card to confirmed is measured".
  - Re-run alone: 53/53 on this branch and 53/53 on trunk.
  - As in WO-056 (a different timing test), this is recorded, not dismissed.

## Not done (blunt)
- **F is spent.** The next measure is sample G.
- **Wrong is falling, but not zero** on a fresh sample: 3.9%, then 1.6%, then 1.2%. Each sample still finds wordings the
  rules have not seen. The card shows every answer before the one tap (D-007), and that is the backstop.
- **Two browser tests have each failed once across many runs**, both on timing. Neither reproduced. They need a look of
  their own if they recur.
