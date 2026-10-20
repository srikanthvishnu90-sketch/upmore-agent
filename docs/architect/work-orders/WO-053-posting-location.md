# WO-053: where the job is, read from the posting

## Why
Two kinds of question depend on where the job is, and nothing about the person settles them without it:
- work rights "in the country where this job is located" (or "...in which you are applying", "...the location you are
  applying for"): the person's US authorization is their answer only for a job in the US;
- an office question that names no place ("Are you able to work from our US office three days per week?", "4 days in
  office expectation"): the person's yes to working on site is for where they live (`fact_schema` onsite_ok: "a
  posting's city makes a screen").
The planner never knew the posting's location, so both were answered as if every job were in the person's own city.
Sample C's review flagged it as "not settled"; the reviewers of A and B, who were not told the location either, judged
most of these fills right.

## What changed
- `supabase/functions/_shared/posting_place.ts` (new): the employer's location text as places (city, US state, US or
  abroad, remote), read only from what the text says: a state by code or name, a country by name or posting code, a city
  by its words. A short list of US cities whose names are not shared abroad ("San Francisco" alone is in the US; "London",
  "Cambridge", "Dublin" are not on it). Nothing looked up, nothing guessed.
- `career_apply.ts`: `PlanPosting.location`. Work rights in the job's country: the person's answer only when every place
  the posting names is in the US; abroad, mixed or unknown, asked. An office question with no place on the form: the
  person's yes only when one of the posting's places is their own city; elsewhere, remote, state- or country-wide or
  unknown, asked. A place the question or the form names still decides first (WO-052).
- `scripts/career/page-functions.cjs` `fnPostingLocation`: the location as the page shows it beside the job (Greenhouse
  `.job__location`, Lever's posting categories, Ashby's Location section, Workday's locations, a schema.org JobPosting,
  else a Workday job URL's place). Shared by the extension (`content.js` -> `planForm`, `chooseWidgetOption`) and the
  cloud worker (`scripts/apply.ts`).
- Data: `scripts/career/posting-location.cjs` and `posting-locations.yml` fetched each captured posting's location from
  its ATS's public API (CI, GETs only): 297 of 300 (`evals/apply/posting-locations.json`; 3 no longer listed). The picker
  and the question-set builder now record the location with every new capture (`question-capture-d.yml`, sample D).

## Tests
- `tests/architect/wo-053-posting-location.test.ts`: the country read from real location strings; work rights at London,
  Tokyo and US postings; office questions at San Francisco, Chicago, multi-office, remote, state-wide and unknown
  postings.
- `tests/career-posting-location.test.cjs`: the in-page reader on all 17 captured real pages (each expectation is what
  the page shows), Workday's locations, JSON-LD, a Workday job URL, and a page that shows none.
- Every one of the 300 real location strings was put through the parser and read by eye; the misreads found ("HQ" as a
  country code, "Melbourne, FL" as Australia, "Olathe KS", a comma list of cities) were fixed before any number below.

## Numbers
| | Before (no location) | After (each posting's own location) |
|---|---|---|
| A: required questions filled | 798 / 1,011 (78.9%) | 775 / 1,011 (76.7%) |
| B | 665 / 847 (78.5%) | 662 / 847 (78.2%) |
| 17 live forms (browser suite, corrected key) | | Lever 71/74, Ashby 63/64, Greenhouse 39/39 outside widgets; 0 wrong |
| Workday dev-a / dev-b | 95.7% / 100% | 95.7% / 100% (their URLs carry the job's place) |

The 26 fills removed on A and B, each now asked: 13 work-rights answers for jobs abroad (London, Tokyo, Canberra,
Munich, Singapore, Shanghai, Dubai, Stockholm: a US-only person "authorized to work" there, or "no sponsorship needed"
there) and 13 yeses to office days in another city (Los Angeles, Boston, San Francisco, Austin, Dallas, New York, King of
Prussia) for a Chicago person who will not relocate. **They were wrong answers that WO-052's review could not see**: the
reviewers were not told where the job was. WO-052's "none judged wrong on A and B" is corrected here: 26 were wrong.

Sample C (spent, not re-scored, not tuned on): the same rule removes 5 of its 607 fills (Hyderabad and London work
rights, two offices in Santa Clara and Los Angeles). Its precision on the record becomes **9 wrong of 607 (1.5%)**, not
4: Yext's Hyderabad work-rights answer had been judged right, and four "not settled" fills are wrong once the location is
known.

The live-form key (`answer-key.json`, corrections) was corrected in four entries for the same reason (WPP Media and
Snowflake in London; OpenAI's office in San Francisco).

## Also here: two of sealed-wd3's misses (WO-048 round 3; that set is spent, not re-scored)
- "What is your notice period with your current employer?" was read as the current employer (and asked): now the
  stated notice period ("2 weeks" on a list that has it).
- "In which U.S. state do you currently reside?" had no rule: now the person's state, on the employer's list.
Neither wording is in samples A or B: their 2,217 fills are unchanged. The other three misses (a field of study in a
category tree, "Corporate Website" in a prompt tree, "Are you currently employed?" on its radio) answer correctly in the
planner on their own; they are lost in Workday's widgets and need the page to reproduce.

## Not done (blunt)
- Sample D (100 more postings, seed 4, no employer from A, B or C, locations captured) is sealed for the next measure:
  coverage and an independent review whose reviewers are told each posting's location.
- A posting that names its city only in its description ("This role is based in San Francisco") is read from the header
  only; a header without a place leaves both questions asked.
- Nearby cities are not home: an office in Evanston is asked of a Chicago person. Distance is not computed.
- The live fill (17 real pages, CI) is re-measured by this PR's own apply-bench-live run.
