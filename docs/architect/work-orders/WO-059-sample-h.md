# WO-059: sealed sample H scored once; its wrong readings, three Workday misses and the brain eval in CI

## Why: sample H, scored once
Sample H has 100 more real postings:
- 40 Greenhouse, 30 Lever and 30 Ashby;
- seed 8, with no employer from samples A–G;
- each with its own location.

H was captured by CI (run 39444762225, `question-capture-h.yml`), sealed, and scored once on trunk 14803c01, after WO-058.
The two independent reviewers read only the persona brief, each posting's location and the fills.

| Sample H on trunk 14803c01 (scored once, VERIFIED-S) | |
|---|---|
| Required questions filled | 632 / 864 (73.1%) |
| Postings fully ready | 27 / 100 |
| Fills judged right | **595 / 632 (94.1%)** |
| Judged wrong | **31 (4.9%)** |
| Not settled by the persona | 6 (0.9%) |

**H is the worst sample since D.** 26 of the 31 wrong fills are one wording on one employer's forms: Upvest's "Name" beside
its own "Last name" box, given the full name. Without it, H would be 5 wrong (0.8%). One employer's form can move the rate
by four points, so a single sample's rate is a noisy measure. The trend on fresh samples, each scored once:

| Sample | Wrong |
|---|---|
| D (before WO-055) | at least 3.9% |
| E (before WO-056) | 1.6% |
| F (before WO-057) | 1.2% |
| G (before WO-058) | 1.9% |
| H (before WO-059) | 4.9% (0.8% without one Upvest wording) |

The 12 distinct fills:

| Posting | Question | Was | Why it was wrong |
|---|---|---|---|
| Viget (Boulder) | "Do you have the permanent, legal right to work in the U.S.? (... We do not offer visa sponsorship ...)" | No | The note after the question won the reading; WO-058's rule knew "authorized to work", not "right to work" |
| Upvest (×26) | "Name", beside "Last name" | Test Person | The first name is asked |
| Latitude AI | "Title Held at Most Recent Employer" | Example Analytics | A title, not the employer |
| Mechanical Licensing Collective | "Academic Program or Department Website" | the person's website | Not the person's site |
| Spry Methods | "worked or attended school under another name, please state the name" | the school | A name, not a school |
| Anthelion Capital | "Are you currently enrolled ...? ... expected graduation ...?" | 05/2022 | The person is not enrolled |
| Meridian Partners, Inversion Space (not settled) | "able to obtain a clearance", "meet the requirements to obtain and maintain a clearance" | "able to obtain" / No | Holding none does not say one could be obtained |
| NJ Innovation Authority (not settled) | authorization bundled with an at-will statement | Yes | An at-will agreement is beyond the standing consents |
| Lightcast (not settled) | "referred by, or do you personally know, a current employee?" | No | Knowing someone is not stated |
| Perr&Knight (not settled) | "Have you previously worked with Microsoft SQL Server?" | No | A tool, read as this employer |
| Coupa (not settled) | "currently employed by a Coupa partner?" | No | A partner is not on the employer list |

## What changed
- `question_map.ts`:
  - **Authorization:** the asked sentence counts "right to work" and "work authorization", as WO-058 did for "authorized to work".
  - **Title:** a title held at the current or most recent employer is the title.
  - **Website:** an academic program's, a department's, a school's or a company's website is never the person's.
  - **Another name, enrollment, at-will:** each is asked.
  - **Clearance eligibility:** "able to obtain", "the ability to obtain", "the requirements to obtain" a clearance is the
    person's to say.
  - **Referral:** "do you personally know" an employee is not the referral.
  - **Employer list:** partners, resellers and customers are not on it (as agencies and vendors in WO-058).
- `career_apply.ts`:
  - **"Name"** beside the form's own "Last name" box is the first name.
  - **A permanent right to work** in the US is answered only from a stated US citizenship. A stated authorization does not
    say it is permanent: anyone else is asked.
  - **"Worked with"** is about this employer only when the question names it or speaks as it ("us", "our").
  - **The same employer by name, never by letters inside another name.** This was found by this order's test. Before, a
    company named "Meta" read a former "Metabase" employer as "worked here before". A name that is the other with more words
    ("Example", "Example Analytics") is asked.
  - Three Workday misses from sealed-wd3 (spent):
    - "Are you currently employed?" is answered yes from a stated current employer, on a yes/no question only;
    - a field of study is found as its leaf under a category ("Mathematics & Statistics > Statistics");
    - "Corporate Website" is the company website.
- `answer_options.ts`: a single leaf under categories is the person's own words. How-heard keeps its own nested reading:
  "LinkedIn" beside "LinkedIn Jobs" stays the person's pick (WO-048/14 caught the first version).
- `evals/apply/workday-fill.cjs` (harness): schema-2 keys' radios named by their group, "checkbox-group" and "multiselect"
  are read from the page. Before, correct fills read as empty and graded wrong.
  - sealed-wd2 (spent) re-run: t2 92.5% with 0 wrong (was 77.5%, "5 wrong"); t4 93.9% with 0 wrong (was "1 wrong").
- `.github/workflows/brain-eval.yml`: D-008's brain-versus-router eval in CI, with the repository secret
  `OPENAI_API_KEY`. It writes the owner's bar into the verdict: the agent switches on only at 95% or more AND at least 40
  points above the router.

- `evals/career/heldout-live.json` (new, 38 items) and `run.ts --set heldout`:
  - real sentences from the deployed line's battery and live gauntlet ("what's the batch status?", "ok thanks", "keep
    going — next question", "which day is my interview?" after a correction);
  - the router answered most of them "I didn't catch that";
  - the brain's builder never saw them, and `tests/architect/wo-059-heldout.test.ts` keeps them out of the brain's files;
  - the eval workflow reports this set beside the official one. The owner's bar stays on the official set.

## Every fill on A–H before and after
| | |
|---|---|
| Added | 1, right: Dark Wolf's CC-305 disability form "I don't wish to answer" (trunk read it as the website fact) |
| Changed | 3, all right: Viget "Yes", Latitude "Data Analyst", Upvest "Test" |
| Removed (now asked) | 12 |

The 12 removals:
- 9 are H's flagged fills.
- MLC's "Link to your bio on your institution website" is no longer the person's website.
- Rapp's certification bundled with an at-will statement (C).
- InterSystems' history list, which offers "worked at an InterSystems Customer or Partner" (C).

The exact-name employer match changes no fill on A–H.

## Numbers (VERIFIED-S offline; synthetic persona; a real person's rate is NOT_RUN)
| | Before (trunk 14803c01) | After |
|---|---|---|
| A: required filled | 755 / 1,011 (74.7%), ready 21 | unchanged |
| B | 653 / 847 (77.1%), ready 37 | unchanged |
| H (spent, tuned on: not a measure) | 632 / 864 (73.1%), ready 27 | 623 / 864 (72.1%), ready 25 |
| Workday TEST tenants, sealed-wd3 (spent) | t2 91.9%, t3 92.3%, t4 92.1% | t2 94.6%, t3 94.9%, t4 97.4%; 0 wrong |

## Gates
- **Architect tests:** 585 passed, 0 failed.
- **Browser, Workday, schema, location and picker suites:** 86 passed, 0 failed.
  - The queue-timing test ("card to confirmed is measured") failed once locally, once in WO-057 and once in this PR's CI.
  - Root cause: the test read the queue right after clicking "Add links". A click resolves when it is dispatched, before
    the panel's handler has the background store the queue, so a slow runner read nothing.
  - Fixed in the test: it now waits for the panel's own "N postings added." first. That ran 3 times alone and once with
    the whole file (53/53). The product was never wrong here.
- **Bundle `--check`:** fresh.
- **`deno check`:** clean on `scripts/apply.ts` and `evals/career/run.ts`.

## Not done (blunt)
- **The brain eval has not run.** This session's network refuses `api.openai.com`, and the repository has no
  `OPENAI_API_KEY` secret yet. The workflow is in place; the first run needs the secret.
- **The production line is not trunk** (the owner ruled 2026-10-20: trunk is the only line). The port of the deployed
  line's real pieces is the next order.
- **Wrong is not converging on fresh samples** (D at least 3.9%, then 1.6, 1.2, 1.9, 4.9). Rules learned from samples
  generalize slowly. The next step for the saved answers is the same as for chat: a model proposes the reading and these rules
  veto. It is measured on a sealed sample, like these.
