# WO-078: a shelf posting can be queued, whatever its public link looks like

## Why: found by prompting Trainee (live task battery, CI run 39485162284)
- **T02:** "apply to the first two" queued nothing. Stripe and Pinterest were refused: "not in a posting format the
  extension can open".
- **T03:** "apply me to 25 Product Manager jobs" refused 3 Fivetran postings for the same reason.

All five are Greenhouse postings whose public link is the employer's own careers page:
`https://databricks.com/company/careers/open-positions/job?gh_jid=8883715002`, `www.fivetran.com/careers/job?gh_jid=…`.
The queue keys a posting by its link (`postingKey`), and an employer's domain is no form host.

**On the live shelf of run 39485162284, 224 of 592 postings had such a link: 38% of the shelf, half of all Greenhouse
postings.** None of them could be queued from chat.

The shelf knows each posting's board and id (`job_id` `greenhouse:fivetran:7918612003`). The board's form lives at a
fixed address. That is the same address the form captures use (`scripts/career/pick-form-sources.cjs`: all 320
Greenhouse postings in samples A to H) and the live fills open (WO-042).

## What changed
- `posting_key.ts` `formUrlFor(job_id)`:
  - `greenhouse:board:id` → `https://job-boards.greenhouse.io/board/jobs/id`;
  - `lever:board:id` → `https://jobs.lever.co/board/id`;
  - `ashby:board:id` → `https://jobs.ashbyhq.com/board/id`;
  - anything else → null.
- `career_apply_want.ts` `wantsFrom`: when a pick carries the shelf's `job_id`, it is queued at that form. `applyUrl` still
  adds Lever's `/apply` and Ashby's `/application`. The same posting by either link is one want.
- `queue_applications`: the schema takes `job_id`, as `search_jobs` returns it, and tells the model to always pass it.
- A link alone, with no id and no form host, is still refused, with the reason.

## Evidence
- `tests/architect/wo-078-form-links.test.ts`: 4 tests. All failed first, because `formUrlFor` did not exist.
- Architect suite: 621 passed. Edge suite: 135 passed.
- Bundles are unchanged: the extension and career bundles report fresh under `--check`.
- To measure: the next battery run, where T02 and T03 should queue the Stripe, Pinterest and Fivetran postings.

## Not covered
- Workday and SmartRecruiters ids: the queue does not take SmartRecruiters (unchanged), and Workday links are already the
  form.
- Whether every employer's Greenhouse board still serves its hosted form page. The captures and live fills say it does for
  all 320 sampled.
