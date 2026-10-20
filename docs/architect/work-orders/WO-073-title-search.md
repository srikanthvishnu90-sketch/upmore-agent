# WO-073: a search for a role finds that role

## Why: found by prompting Trainee (live task battery, CI run 39476278743, T03)
"Apply me to 25 Product Manager jobs" queued a Risk Analyst Program Manager, a Lead Technical Recruiter and a Software
Engineer II. The brain did its job: it called search_jobs with "Product Manager" and queued what came back. The search was
wrong:
- the memory store and `searchPostings` matched every query word **anywhere** in a posting, its description included;
- the database search (`websearch` over the `search` column) did the same: the column weights the title A and the
  description D, but nothing ranked by the weight;
- both ordered newest first, so the store's limit (150) cut the actual product manager roles in favour of newer postings
  that mention "product" and "manager" in their descriptions.

Every queued application costs the person a review, and an off-target one is worse than none.

## What changed
- `career_ingest.ts`:
  - `titleTier(posting, words)` is 0 when the title carries every query word (stem-aware, as `matchesWords`), 1 when it
    carries some, and 2 when it carries none.
  - The memory store's `search` orders by tier, then newest.
  - The Supabase store's `search`:
    - first asks for postings whose **title** carries every word (`to_tsquery('english', 'w1:A & w2:A')` on the
      existing `search` column, newest first, up to the limit);
    - then fills to the limit with the old `websearch` query;
    - each posting appears once.
    - No migration: the column already weights the title A (`20261019000001_career_postings.sql`).
- `career_search.ts` `searchPostings`:
  - While any posting's title carries a query word, a posting that only mentions the words elsewhere is not offered.
  - Postings rank by tier, then fit, then newest.
  - It reports `title_matches`: how many postings carry every word in their title.
  - With no title match at all, description matches are still offered, and `title_matches` is 0.

## Acceptance tests (written first; `tests/architect/wo-073-title-search.test.ts`; all 4 failed before the change)
1. "Product Manager jobs" over a shelf that holds a backend engineer and a recruiter who mention product managers:
   - the full title matches come first, then the partial ones;
   - neither description-only posting is offered;
   - `title_matches` is 2.
2. "roadmap", which no title carries: the description matches are offered, and `title_matches` is 0.
3. The memory store: 200 newer "Account Executive" postings that mention the words, plus two older product manager roles,
   at a limit of 150. The two roles come first.
4. The database store's first query restricts every word to the title (`product:A & manager:A`). Its results come
   first, and the rest are filled in once each.

The `:A` query was also run against Postgres 16 with the migration's own column definition (VERIFIED, local throwaway
cluster):
- "product:A & manager:A" returns "Senior Product Manager, Payments" and "Product Managers";
- it does not return "Lead Technical Recruiter", whose description says "hire product managers";
- "nurse:A" returns "Nursing Lead".

## Demo (owner)
In chat: "apply me to 10 product manager jobs". Every queued posting's title names a product manager role. The reply's
search result carries `title_matches`.

## Not covered
- Synonyms ("PM", "product owner"). The model can search again with other words; the search does not guess.
- Seniority filtering ("senior"): already a query word, so it is matched in the title like any other word.

## Size cap
About 150 lines of code and tests.
