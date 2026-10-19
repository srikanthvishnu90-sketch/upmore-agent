# WO-017: Thousands of employer boards, harvested from public application links

Status: in review (verdicts merged) · Depends on: WO-006 (done) · Assignee: Claude (architect) · Size: scripts + data

## Why
Coverage is where competitors lead (see the Auto-Apply Field Report): we watched 305 boards. Community listing files on
GitHub (SimplifyJobs New-Grad-Positions and Summer2026-Internships, MIT-licensed, updated daily) link straight to
employers' own application pages, so each link names a real, recently hiring board. The slug-guessing discovery runs found
about 2 live boards per 100 probes; these links are real boards by construction.

## What
- `scripts/career/harvest-board-candidates.cjs`: listing files → `packages/career-data/board-candidates.json` (boards we do
  not watch yet, with listing counts and last listing date). No network.
- `scripts/career/verify-board-candidates.cjs`: each candidate's public postings feed, one gibberish-token calibration per
  provider first (the directory doctrine), polite pacing. Runs in CI (`.github/workflows/verify-boards.yml`), which has
  the internet access the build sandbox lacks.
- `scripts/career/merge-board-verdicts.cjs`: adds live boards with postings; Workday sites are recorded as
  `discovered_unsupported` (reading Workday's public job search needs a normalizer, a later order; applying there is D-013).
  Existing entries are never changed.
- `tests/career-board-harvest.test.cjs` (gated by name).

## Measure (the outcome, not the count)
`evals/career/coverage-personas.ts` (CI: `.github/workflows/coverage-personas.yml`; tests
`tests/edge/career-coverage-personas.test.ts`, gated): 10 job seekers, deliberately not all tech (software engineer,
data analyst NYC, PM Bay Area, registered nurse Texas, accountant Chicago, mechanical engineer, marketing coordinator
remote, SDR Austin/remote, customer success remote, ML engineer Seattle). For each, before and after: what search_jobs
returns in their place (the product's own `boardFetchFeed` and `searchPostings`), title matches, and title matches posted
in the last 7 days. The harvest source is new-grad and internship listings, so a gain that only helps engineers must read
as exactly that.

## Result (verify run 39206054614, 2026-10-19)
- Probed 2,320 of 3,683 candidates in 3 min 39 s. Calibration: Greenhouse, Lever, Ashby answer a gibberish token 404;
  SmartRecruiters 200 with zero (so zero reads as unverifiable); Workday 422, then rate-limited (HTTP 429 twice) after
  302 probes, so 1,363 Workday sites were not checked this run.
- Supported providers: Greenhouse 744 live / 42 dead, Ashby 621 / 26, Lever 312 / 12 / 1 error, SmartRecruiters 254 live /
  6 unverifiable. Added with at least one posting: 1,874 boards (Greenhouse and Ashby vendor boards skipped, WO-006).
- Live boards 305 → 2,179; postings seen 62,751 → 259,064 (4.1×). Workday: 254 tenants recorded, not watched.
- Ingest at the default 100 boards per 5-minute run: each board read about every 2 hours (was 15 minutes).
- Owner check before deploying (not a blocker to merge, a blocker to deploy): about 260,000 posting rows with
  descriptions up to 20,000 characters is on the order of 1-2 GB in `career_postings`. Check the database plan's
  size first; the Supabase free plan's database is 500 MB.
