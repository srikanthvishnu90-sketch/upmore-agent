# WO-036: Offer benchmark and guidance from real data

Status: built · Branch `wo/036-guidance-offer` · Migration `20261021030000_career_hired_backgrounds.sql` · Depends on:
128 (negotiation), the LCA aggregate and BLS file in `packages/career-data/datasets/`, the agent brain (WO-002).

Owner targets:
- "Offer received to comp benchmark + negotiation script in under 30 minutes."
- "Every guidance answer cites real data (actual hires, backgrounds, timelines); zero generic listicles, zero sugarcoating."
- "'How do I get into Palantir'-class questions answered with real hired-candidate backgrounds, an honest probability
  for the user's profile, and the 3 highest-leverage moves."

Owner decision, 2026-10-20 (relayed by the coordinator mid-order): hired-candidate data is funded. The owner signs up for
People Data Labs Pro (about $98 a month for 350 credits) and sets the secret `PDL_API_KEY`. Without the key the rail is
NOT_WIRED.

## What was built

### 1. `offer_benchmark` (brain tool, `write_own`)
Code is in `supabase/functions/_shared/career_offer.ts`.

**Reading the offer.** The tool reads the person's words in this message.
- `offer_words` must appear in this turn's message, or the call is refused. The model cannot supply a number.
- The text is read clause by clause, so "110k base, 15k signing" puts each number with its own label. It handles
  `$95,000 salary`, `110k`, `$60/hr` (counted as x 2,080 hours, and said so), a bonus, and a percentage bonus.
- The company comes from the firm guide's names and aliases. Short aliases (JPM, GS, HRT, Meta) count only when written
  as a name, and "MS" was removed. A company not in the guide is still read: "Acme Robotics offered ..." gives "Acme
  Robotics".
- The city is mapped to one of 15 metros (`pay-maps.json`), or to remote.
- The title is mapped to a 2018 SOC code. "Analyst" alone is mapped by the employer's sector: finance and trading give
  13-2051, consulting gives 13-1111. A title with no confident code is left unmapped and nothing is guessed.
- A competing offer is kept only from a clause that says so ("I also have an offer from Citi at 105k"). A deadline is
  kept in the person's own words ("Friday").

**Asking once.**
- Four pieces are required: company, base, city and title.
- If any are missing, one question names all of them, and the half-told offer is kept on the thread (`offerBenchmark`,
  a new `STATE_KEYS` entry that erase resets).
- The next message fills the gaps. Whatever is still missing is then said ("Not given: the job title") and never asked
  again.
- The kept offer expires after 24 hours. A new company with its own base starts a new offer.

**The benchmark.** Only public, citable data is used, and each number is labeled.
- **DOL H-1B LCA.** These are the employer's own filed wages for the occupation and metro, from certified cases only.
  The reply says what they are: "Employers' filed wages for H-1B workers, not offers; a floor signal (the employer must
  pay at least this)." It also gives the period and n. A cell with fewer than 5 filings is never shown, and the reply
  says "only 4 filings in ..., too few for a median."
- **BLS OEWS metro.** This is the occupation's 25th, 50th and 75th percentile pay in the metro, labeled "all levels of
  experience; not entry-level pay and not one employer's". A BLS top-coded (`#`) or unreleased value is never shown as
  a number.
- **BLS national median.** When the metro data is not loaded, the reply uses the May 2024 national median already in
  the repo (`bls-labor-data.json`), labeled "nationwide; not the New York metro, not entry level".
- **Placement.** The reply says where the offer sits against the median and the percentiles, for example "Your base is
  8% above the median."
- **Missing data.** A file not imported yet is said in one line ("not loaded yet"), never filled in.

**The script.** `factScript` is new in module 128.
- The email draft and call script use only the person's stated offer, a competing offer they named (company and number,
  as said), their actual deadline, and a benchmark already labeled by the caller.
- They never claim a competing offer, "first choice" or "ready to sign".
- The email asks one question.
- The draft is shown in full under "Nothing is sent: edit it and send it yourself", and `draft.sent` is `false`.
  Nothing is sent: no external effect exists in this tool.

### 2. `career_path_answer` (brain tool, `read`)
Code is in `supabase/functions/_shared/career_path.ts`. It answers only from data in the repo.

**The firm guide** is `packages/career-data/firm-guide.json`.
- It covers 22 firms: Palantir, Goldman Sachs, JPMorganChase, McKinsey, Google, Jane Street, Citadel, Citadel Securities,
  Morgan Stanley, BCG, Bain, Microsoft, Amazon, Meta, Stripe, Blackstone, Two Sigma, Hudson River Trading, D. E. Shaw,
  Evercore, Deloitte and Point72.
- It holds 52 stated requirements and 3 published base rates.
- Every program, requirement and base rate has its URL and the date it was checked.
- Sources are each firm's own careers pages and postings (search restricted to the firm's own domains). Base rates are
  the firm's own counts as the press reported them.
- How it was collected: the build environment could not open any firm page, dol.gov or bls.gov (DNS refused through the
  proxy, and WebFetch could not resolve the hosts). Every statement is therefore the search index's extract of the cited
  page, kept close to its words. The file says this in `method` and `known_limits`. Nothing was written from memory.

**The answer** has these parts:
- Programs and timelines, with the source host and checked date.
- X's H-1B filings, from the existing FY2025 Q4 aggregate: case count, most-filed titles with requisition numbers
  removed, and the median across all titles when n is at least 5. These are labeled "employers' filed wages for visa
  workers, not offers".
- **Hired backgrounds.**
  - With the PDL key: aggregates (section 4).
  - Without it, exactly: "I don't have data on who X actually hired yet."
- **Probability.**
  - When the firm published a base rate (Goldman 2025: more than 360,000 applications and about 0.7% accepted; JPMorgan:
    493,000 applications for about 4,000 roles), the reply gives it with its source, and says "That is across all
    applicants, not your odds."
  - Otherwise: "No honest probability exists here: X publishes no acceptance rate, and I won't make one up. What decides
    it: [the person's unmet or unknown requirements], and how you do in their interviews."
  - A base rate without a source is never used.
- **3 moves.** Each move is derived from a confirmed fact checked against a stated requirement.
  - Requirements are checked by kind: graduation window, degree level, field, year of study, GPA, skill (with a count:
    Google's "two or more languages"), experience and clearance. Each check gives met, unmet or unknown.
  - A program the person's own facts rule out (graduation window, degree level, year of study) appears once, through
    that fact, and its other requirements are not moves.
  - Order: unmet requirements of programs still open to the person, then the programs ruled out, then unknowns, then
    "apply to <program> inside its window" (only when the firm states a timeline and the tracker has no application
    there), then met requirements as "lead with this".
  - Every move cites the requirement's source host and checked date, and either the person's fact (quoted, with its id)
    or the gap ("no confirmed graduation date on your profile").
  - Only confirmed facts are used; draft facts are not.

**Output.** Plain text, split on purpose into messages of at most 1,500 characters, with source links bare on their own
lines.

### 3. Both tools in the brain
- Both tools are in `career_tools.ts`. Their descriptions start "Use when the person texts a job offer" and "Use for
  'how do I get into <firm>'", and tell the model to send the tools' messages as written.
- They are pinned in `tests/architect/wo-002-career-tools.test.ts`.
- The architect's system prompt is unchanged.

### 4. Hired-candidate backgrounds from People Data Labs
Code is in `supabase/functions/_shared/career_hired.ts`.

**Sources.** Checked 2026-10-20 through a search index. The pages themselves could not be opened from here.
- Endpoint and query: `POST https://api.peopledatalabs.com/v5/person/search`, header `X-Api-Key`. The body takes an
  Elasticsearch `query` or an `sql` string, plus `size` (1 to 100) and `scroll_token`.
  - https://docs.peopledatalabs.com/docs/reference-person-search-api
  - https://docs.peopledatalabs.com/docs/input-parameters-person-search-api
  - https://docs.peopledatalabs.com/docs/examples-person-search-api
- Fields: `experience.company.name`, `experience.start_date`, `experience.title.name`, `education.school.name`,
  `education.degrees` and `education.majors`. Degrees and majors are canonical enums.
  - https://docs.peopledatalabs.com/docs/fields
- Cost: one credit per record returned.
  - The search reference page.
  - https://support.peopledatalabs.com/hc/en-us/articles/25794271805211-Pricing-credits
- Pro plan: from $98 a month for 350 credits.
  - https://www.peopledatalabs.com/pricing/person

**The query.**
- It asks for people with an experience entry at firm X (`match_phrase` on `experience.company.name`) that started on
  or after January 1 three years ago (`range` on `experience.start_date`), with the role words in
  `experience.title.name` (`match`, operator `and`).
- PDL's docs did not confirm that these clauses must hold within one experience entry. Every returned record is
  therefore checked again in code, and it counts only if one entry is at the firm, started in the window and has the
  role in its title. Example: "citadel securities" is not Citadel.
- The company phrases per firm (`PDL_COMPANY`) are unverified against PDL's canonical names until the first live call.
  The re-check means a wrong phrase can only lose records, never count wrong ones.

**Credits.**
- Calls are size-capped: 25 by default, at most 100, set with `PDL_SEARCH_SIZE`.
- Each (firm, role family, since year) is cached for 30 days in `career_hired_cache`.
- Every call is logged in `career_pdl_calls` with records returned, records kept and credits. Failed calls (credits 0)
  and budget refusals are logged too.
- A call that would pass the monthly budget is refused before it is made. The budget is 300 credits by default
  (`PDL_MONTHLY_CREDITS`), which leaves 50 of the 350 for the owner.

**Aggregates only, never a named person.**
- `toSafeRecord` is the boundary. It keeps company names, titles, dates, school names, degrees and majors, and nothing
  else. Names, LinkedIn URLs, emails, phones, addresses, birth years, ids and raw strings never pass it, and nothing
  before it is stored or logged.
- The output: counts by school, prior employer (the job just before joining), major and degree, and the median years
  from finishing school to joining.
- A bucket under 5 is never shown. A sample under 5 is "too few to say".
- The reply says the sample size and "PDL's coverage, not all hires".
- As a second guard, the cache table refuses any person field anywhere in an aggregate (database check constraint).

**Wiring.** `handler-career.ts` passes `hiredSourceFromEnv(Deno.env, admin)` to the agent turn.
- Without `PDL_API_KEY`: NOT_WIRED, no call and no database read. The answer keeps "I don't have data on who X actually
  hired yet."
- An error or a used-up budget gives the same honest line, and the structured result says `unavailable`.

**Not a probability.** Hired-background frequencies are not a chance of getting hired. The code comments in
`career_hired.ts` and `career_path.ts` say so, and the answer ends its backgrounds with "These are backgrounds of people
who joined, not your chance of getting in." The probability stays "no honest probability" unless a published base rate
is cited.

**Terms check.** I could not find a term that forbids this.
- PDL licenses its data only for uses that follow its Acceptable Data Use Policy. Its website terms say a customer may
  not use, resell or make data available "for any purposes prohibited in the People Data Labs Acceptable Data Use
  Policy".
  - https://docs.peopledatalabs.com/docs/data-license
  - https://docs.peopledatalabs.com/docs/data-sources
- The prohibited uses found are:
  - employment, credit, insurance or housing **eligibility decisions**;
  - profiling or targeting on sensitive characteristics;
  - uses that could lead to unlawful discrimination.
- PDL itself publishes aggregates built from its person data (company headcount insights).
- Showing a job seeker anonymous counts of where a firm's joiners studied and worked is not an eligibility decision about
  anyone, uses no sensitive characteristic, and shows no person. No term found forbids it, so it was built.
- Not verified: the full texts of the Terms of Use and of the Acceptable Data Use Policy
  (privacy.peopledatalabs.com/policies?name=acceptable-data-use-policy) could not be opened from here, so the clause on
  showing derived data to end users was not read word for word. **The owner should read both before setting the key.**
  If either forbids showing derived aggregates to end users, leave `PDL_API_KEY` unset: the rail stays NOT_WIRED and
  nothing else changes.

### Data and importers
- `scripts/career/datasets/aggregate-lca.py --wages <LCA file> packages/career-data/datasets/dol-lca-wages.json "FYxxxx Qx"`
  builds the company x SOC x metro cells: certified cases only, n kept on every cell, median, p25 and p75, and the top
  filed titles. It adds matchers for Citadel (the fund) and Meta. Optional columns are read only if present, so the old
  per-company aggregate still works on old files.
- `scripts/career/datasets/import-oews.py <MSA_M20xx_dl.xlsx> packages/career-data/datasets/bls-oews-metro.json "May 20xx"`
  keeps only the mapped occupations and metros. Areas are matched by CBSA code, or by the area title's first city.
- Both data files ship as `status: awaiting_import` with no cells, because dol.gov and bls.gov were unreachable here.
  Test fixtures built by the real importers from invented rows are in `tests/fixtures/career-pay/`, marked
  `"fixture": true`.
- The data reaches Deno through the bundle: `CAREER_PAY_JSON` (read by 128 `payData()`) and `CAREER_FIRM_GUIDE_JSON`
  (read by 134 `firmGuide()`). Both bundles were rebuilt. The career bundle is 3,668,766 bytes, under the 4,200,000
  budget.

## Demo (owner)
```
deno run -A scripts/career/wo036-demo.ts offer "JPM offered 110k base, 15k signing, NYC, analyst"
deno run -A scripts/career/wo036-demo.ts offer "got an offer from Stripe, 150k"
deno run -A scripts/career/wo036-demo.ts path Palantir "software engineer" "BS Economics at Rutgers, graduating May 2027"
deno run -A scripts/career/wo036-demo.ts path Goldman "summer analyst"
```
Load the real data (CI or the owner, with network):
```
python3 scripts/career/datasets/aggregate-lca.py --wages LCA_Disclosure_Data_FY2025_Q4.xlsx packages/career-data/datasets/dol-lca-wages.json "FY2025 Q4"
python3 scripts/career/datasets/import-oews.py MSA_M2024_dl.xlsx packages/career-data/datasets/bls-oews-metro.json "May 2024"
python3 scripts/build-router-core.py && python3 scripts/build-router-core.py --career-only
```
Turn on hired backgrounds: `supabase secrets set PDL_API_KEY=...` (owner), and optionally `PDL_MONTHLY_CREDITS` and
`PDL_SEARCH_SIZE`. Apply `20261021030000_career_hired_backgrounds.sql` through `scripts/launch/trainee-go-live.sh`.

## Tests
- `tests/architect/wo-036-offer-guidance.test.ts` (13 tests):
  - T1: the data file has 20+ firms and a URL and checked date on everything.
  - T2: the offer is read from words.
  - T3: a missing piece is asked once.
  - T4: n<5 is never a benchmark; the caveat, period and n are said; top-coded values are not numbers; "not loaded yet".
  - T5: no competing offer, preference or deadline is invented, and the draft is shown in full and not sent.
  - T6: timing.
  - T7: every move cites a requirement and a fact or gap. This is the generic-listicle test, over 22 firms x 4 profiles
    x 3 roles.
  - T8: moves come from gaps.
  - T9: the hired-data line is always there and no backgrounds are invented.
  - T10: no probability without a cited base rate.
  - T11: plain text (the HYGIENE checks from `evals/career/compare.ts`, 1,500 characters, bare links) for every message.
  - T12: the brain tools.
  - T13: the bundle carries the data.
- `tests/architect/wo-036-hired.test.ts` (6 tests):
  - H1: a planted name, LinkedIn URL, email, phone, address or id never reaches the cache, the log or the answer.
  - H2: aggregates only, nothing under 5, the sample size and PDL coverage said, "not your chance".
  - H3: only people who started at the firm, in the role, in the window count.
  - H4: credits: request shape, size cap, credit log, 30-day cache, monthly budget, HTTP error.
  - H5: without the key, NOT_WIRED with no call and no database read.
  - H6: the brain tool uses the aggregates, falls back to the honest line on failure, and gives no odds.
- `tests/pay-importers.test.py` (9 tests): both importers on the fixtures, and the shipped files carry no numbers until
  imported.
- `tests/db/career_hired.test.sql` (14 checks): a person field is refused, the month's credits are summed per UTC month,
  and only the service role reads or writes. The migration is applied twice in `tests/db/run.sh`.

### Planted defects
Each one-line change was applied, the two WO-036 test files were run, and the change was reverted. All 11 were caught.
After reverting: 19 passed, 0 failed.

| # | Defect (one line) | File | Failing test |
|---|---|---|---|
| D1 | `MIN_N = 1` (n<5 shown as a benchmark) | career_offer.ts | WO-036/T4 |
| D2 | `factScript` invents a competing offer when none was stated | 128-career-negotiation.js (bundle rebuilt) | WO-036/T5 |
| D3 | the "I don't have data on who X actually hired yet" line replaced by "" | career_path.ts | WO-036/T9, H5, H6 |
| D4 | base rates filtered on `statement` only (no source needed) | career_path.ts | WO-036/T10 |
| D5 | `if (missing.length)`: the missing piece is asked again | career_offer.ts | WO-036/T3 |
| D6 | `**Getting into X**`: markdown in a reply | career_path.ts | WO-036/T11 |
| D7 | a move's `source_url: ""` | career_path.ts | WO-036/T7 |
| D8 | `saidIn` returns true: offer words not from the person's message accepted | career_offer.ts | WO-036/T12 |
| D9 | `toSafeRecord` passes `full_name` | career_hired.ts | WO-036/H1 |
| D10 | `if (false)`: the PDL monthly budget ignored | career_hired.ts | WO-036/H4 |
| D11 | `top(schools, 1)`: a hired bucket under 5 shown | career_hired.ts | WO-036/H2 |

## Measured
- Offer text to reply, code only, no model: VERIFIED. 0.6 ms in the test run (T6) and 17.7 ms in the demo's first call,
  which includes loading the bundle's data. Command: `deno run -A scripts/career/wo036-demo.ts offer "JPM offered 110k
  base, 15k signing, NYC, analyst"`. The <30 minute target is met by more than five orders of magnitude for the code
  path.
- The model's own time on top (one or two gpt-5-mini calls): NOT_RUN. There is no OpenAI key here.
- Real benchmark coverage today: VERIFIED.
  - BLS national median for 3 occupations: software developers, financial analysts and management analysts.
  - LCA title x metro and OEWS metro: 0 cells (awaiting import).
- Firm guide: VERIFIED. 22 firms, 52 requirements, 3 base rates (Goldman x2, JPMorgan), every one with a URL and a
  checked date (T1).
- PDL: NOT_RUN live (no key). The request shape and the parsing are tested against a fake that follows PDL's documented
  schema.

## Not built, and why
- **Real LCA title x city and OEWS metro numbers.** dol.gov and bls.gov were unreachable from the build environment. The
  importers and fixtures are in. The data comes when CI or the owner runs the two commands above and rebuilds the
  bundles.
- **Live PDL validation.** There is no key here. The first live call should confirm two things: the company phrases
  match PDL's canonical names, and the nested-clause behavior. If the phrases are wrong the result is fewer records,
  never wrong ones. Check `career_pdl_calls` (kept vs returned) after the first calls.
- **The PDL terms, word for word.** See the terms check above: the owner reads the ToS and the Acceptable Data Use
  Policy before setting the key.
- **PDL_API_KEY in `trainee-go-live.sh`.** The script's secret prompts were not changed. The owner sets the key with
  `supabase secrets set`.
- **Firm guide freshness.** Many postings are for the 2027 cycle and several deadlines have passed. Nothing re-checks
  the data on a schedule yet. Re-collect with network access, and replace search-index extracts with page fetches.
- **Probability for most firms.** Only Goldman and JPMorgan have published applicant counts. McKinsey's "about 1%" is a
  third-party estimate and is not used.
- **Router path.** Both tools are on the agent brain only (`CAREER_BRAIN=agent`, D-008). The router keeps its own
  negotiation flow.
- **Python tests in the gate.** `tests/pay-importers.test.py`, like the existing `tests/aggregate-lca.test.py`, is not
  in `scripts/gate.sh`. Run it with `python3 tests/pay-importers.test.py`.
