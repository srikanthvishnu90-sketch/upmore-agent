# C-04: the relevance floor (hard filters before anything is suggested, prepared or queued)

## Why (competitor evidence)
- **Irrelevant matches are the category's top complaint:**
  - AIApply: one user judged 200 of 270 matches irrelevant (REPORTED).
  - JobCopilot: "45 useless jobs in one month" (REPORTED).
  - Tsenta: irrelevant matches (REPORTED).
  - LoopCV: "12,000+ matches and 14 applications" (REPORTED).
  - Sources are in `docs/competitors/*.md`.
- **Our matching today** (`matchPosting` in `career_alerts.ts`, VERIFIED) checks only:
  - keyword words in the title;
  - places, or remote;
  - whether the posting is open.

  It ignores seniority, employment type, exclusions, staffing agencies and duplicates across boards. 25 fast applications to the wrong jobs gets every competitor's outcome.

## Base, branch, files
- Base `trunk`, branch `wo/c04-relevance-floor`.
- Touch only these files:
  - new `supabase/functions/_shared/career_floor.ts`;
  - new `packages/career-data/staffing-agencies.json`;
  - new `tests/architect/c04-relevance-floor.test.ts`;
  - `supabase/functions/_shared/career_alerts.ts`, one call in `matchPosting`;
  - `supabase/functions/_shared/agent/career_tools.ts`, one call where `search_jobs` filters.

## The rule
`relevanceFloor(posting, floor)` returns `{ pass: boolean, reasons: string[] }`. `floor` is the person's stated floor.
Every filter applies only when the person stated it, and it never guesses from silence:

| Filter | From the person | Reads on the posting | Fails when |
|---|---|---|---|
| seniority | `levels: ("intern"\|"entry"\|"mid"\|"senior"\|"lead"\|"exec")[]` | `seniority_band`, else whole words in the title ("Senior", "Sr", "Staff", "Principal", "Lead", "Director", "VP", "Head of", "Intern", "Junior", "Jr", "Associate", "Entry") | the band or title words name a level outside the list |
| employment type | `types: ("full_time"\|"part_time"\|"contract"\|"internship"\|"temporary")[]` | whole words in the title and the first 2,000 characters of the description ("contract", "contractor", "temporary", "temp", "internship", "intern", "part-time", "part time", "co-op") | a stated type outside the list is named. Nothing named passes |
| location | already in `matchPosting` | | unchanged |
| exclusions | `exclude_words: string[]`, `exclude_companies: string[]` | title, company | any whole-word match. Company matches case-insensitively after removing Inc/LLC/Ltd/Corp |
| pay floor | `min_pay: { amount, period: "year"\|"hour" }` | the description's stated range (`$120,000 - $150,000`, `$45/hr`, "USD 120k–150k") | the top of the stated range is below the floor. **No stated pay passes, with reason `pay_not_stated`** (never a guess) |
| staffing agency | `allow_staffing: boolean` (default false) | company in `staffing-agencies.json`, or the description says "our client" or "on behalf of our client" | an agency, unless allowed |
| closed | always | `closed_at` | closed |
| duplicate | always | the same normalized company and title seen on another board in 30 days | the second and later copies |

## `staffing-agencies.json`
Each row is `{ name, source_url, checked: "YYYY-MM-DD" }`. Only names whose own site or a primary listing says they are a staffing or recruiting agency. No row without a source. Start small (10 to 20); a missing agency is a pass, not a guess.

## Steps
1. **Write the tests first.** At least 40 postings, written as fixtures in the test, that state what each filter sees. Include the traps:
   - "Senior" inside a word ("Seniority Analyst");
   - "intern" inside "internal" or "international";
   - a "$1,000 signing bonus" that is not pay;
   - a range given per hour;
   - "contract" in "contract law" for a lawyer role, where the title decides;
   - two boards with the same job.

   Run the tests on trunk and paste the failing count.
2. **Implement `career_floor.ts`** until the tests pass. Whole words only; no model calls.
3. **Wire it in:**
   - `matchPosting` returns false when the floor fails;
   - `search_jobs` drops floor failures;
   - `search_jobs` adds `filtered: { reason: count }` to its result, so the agent can say "12 hidden: 7 senior roles, 5 contract".
4. **Run and paste:**
   - `deno test -A --no-check tests/architect/`;
   - `node --test tests/career-*.test.cjs`;
   - `python3 scripts/build-router-core.py --career-only --check`.
5. **Open the PR** titled `C-04 relevance floor: <N>/<N> on the labeled set`, with before and after counts.

## Done
- Every filter has its traps in the labeled set: red on trunk, green on the branch.
- `pay_not_stated` never fails a posting.
- `search_jobs` reports what it hid and why.
- Nothing else changed.

If a step is blocked, write `BLOCKED: <what>` in NOW.md and go to the next card.

## Status (architect, 2026-10-20): built on `wo/c04-relevance-floor`
- **Labeled set:** 50 postings in `tests/architect/c04-relevance-floor.test.ts`, 50/50.
  - Before wiring, the alert and search tests failed: a senior posting was alerted, and search hid nothing.
  - Four mutants, one per trap guard (lead generation, staff, contract subject, "our clients"), each break the set.
- **Where it differs from the spec above, on purpose:**
  - **Seniority is read from the title only.** The ingest's `seniority_band` comes from the router's `seniorityBand`, which returns "mid" for a title that says nothing. A floor must never fail a posting on that default.
  - **More traps than the card listed:**
    - "Staff Accountant" and "Staff Nurse" are not staff-engineer level;
    - "Lead Generation" is not a lead role;
    - "Executive Assistant" is not an executive;
    - "Contract Manager" and "Contracts Administrator" are full-time jobs about contracts;
    - a consulting firm's "our clients" is not a staffing agency;
    - pay in another currency is `pay_not_comparable`, never a fail.
  - **The floor is saved with the person's job settings** (`prefs.floor`, set through `set_job_alerts`, validated by `validFloor`). Alerts and `search_jobs` read the same floor; nothing is inferred from silence.
  - **Duplicates across boards are dropped in `search_jobs`.** Alerts still key per posting; dropping duplicates there is a follow-up.
- **The agency list lives in `supabase/functions/_shared/career_staffing_agencies.ts`**, not `packages/career-data/staffing-agencies.json`. Shared code must not import from outside `supabase/functions`: the staged-handler test refuses it, and a deployed function would not carry it.
- **BLOCKED: the agency list ships empty.**
  - No primary page could be fetched from the build container (every company site and sec.gov refused or unresolvable, 2026-10-19).
  - No row is added without a fetched source. The "our client" wording rule works without the list, and a missing agency is a pass.
  - Fill the list from a machine with web access: name, source_url, the quoted sentence, checked date.
