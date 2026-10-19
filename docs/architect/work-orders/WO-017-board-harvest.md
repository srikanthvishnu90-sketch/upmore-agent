# WO-017: Thousands of employer boards, harvested from public application links

Status: in review · Depends on: WO-006 (done) · Assignee: Claude (architect) · Size: scripts + data

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
For each of 10 personas in `evals/career/messages.json`'s role mix, the number of open postings matching their target
role and place, before and after the merge, from the directory's own fetches; reported in the PR.
