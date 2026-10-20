# WO-037: Discovery at scale, a 6-hour refresh, alert latency and alert quality

Status: in review · Depends on: WO-006, WO-007, WO-013, WO-017 (done) · Assignee: Claude (builder) · Branch: `wo/037-discovery`

## Targets (owner, verbatim)
- "Watch 50,000+ company career pages directly, refreshed at least every 6 hours."
- "Matching role detected to alert in the user's iMessage in under 15 minutes."
- "Alert precision 90%+ on a 200-role labeled set before launch; zero alerts below the user's match threshold; zero spam weeks."
- "20%+ of alerts are roles not yet on LinkedIn/Indeed that day."

## Where each target stands (every number labeled)

| Target | Status | Number |
|---|---|---|
| 50,000+ boards | NOT MET (count PENDING) | Verified today: 2,179 live boards (WO-017). The first discovery run (CI run 39345730265, job `discover`) was still running when this was committed; its VERIFIED count lands on branch `discovery/boards-39345730265` and in the run's `VERIFIED` annotation. Not counted until then. |
| Every board within 6 h | BUILT, simulated | Sharded scheduler: the oldest read is under 6 h at every run of a simulated 30 h, at 2,179 boards (1 lane) and at 50,000 (8 lanes), with 10% of runs lost and 10% cut short (VERIFIED, `wo-037-refresh.test.ts` R1, R2). Live: NOT_RUN. CPU is the blocker at scale, below. |
| Detected to delivered < 15 min | MET for one alert, with a race; NOT MET under load | Worst case 201 s (3.4 min) with today's cron offsets, but about 4-5% of matches are never alerted (simulated, inputs ASSUMED). The schedule change plus the code fix: 261 s, none lost; the schedule change alone holds only while ingest runs finish within 180 s. Delivery is 20 rows a minute, so more than ~240 alerts from one alerts run (or a sustained 100+ every 5 minutes) passes 15 minutes. Live p50/p95: NOT_RUN (`career_alert_latency`). |
| Precision 90%+ on 200 roles | NOT_RUN on human labels | The 200 real rows exist; human labels: 0 of 200. On the architect's proposed labels (ASSUMED): precision 73.3% (95% CI 62.4-82.0%), recall 91.7%. |
| Zero alerts below threshold | BUILT, tested | The run re-checks every alert against the person's own gate before queuing it (A1, planted P6). |
| Zero spam weeks | BUILT, tested | Rolling 7-day cap (default 15, the person's own 0-25) on top of the daily cap, quiet hours, once per posting, one report a day; a store that cannot count sends nothing (A2, A3, planted P7, P8). |
| 20%+ hidden market | NOT_RUN | The sampler and sheet are built; a person runs it. |

## 1. Board discovery at scale

**What.** `scripts/career/board_discovery.ts` (library) and `scripts/career/discover-boards.ts` (CLI), run by
`.github/workflows/board-discovery.yml` (manual dispatch and Mondays 06:17 UTC). The build sandbox has no route to these
hosts (`curl https://boards-api.greenhouse.io/...` -> `CONNECT tunnel failed, response 403`), so CI runs it.

- **Sources** (each re-runnable): the directory (2,435 entries), the WO-017 candidates (3,683), Common Crawl's URL index
  (`index.commoncrawl.org`, the latest 2 crawls, up to 60 pages per query per crawl, queries `boards.greenhouse.io/*`,
  `job-boards.greenhouse.io/*`, `jobs.lever.co/*`, `jobs.ashbyhq.com/*`, `jobs.smartrecruiters.com/*`,
  `careers.smartrecruiters.com/*`, `apply.workable.com/*`, domain `recruitee.com`), and the Tranco top-1M domain list
  (tranco-list.eu, the top 3,000 domains as slug guesses on every provider).
- **Verified means** 200 and the provider's own JSON shape (`classify`): Greenhouse/Ashby `{jobs: [...]}`, Lever `[...]`,
  SmartRecruiters `{content, totalFound}` with totalFound > 0 (it answers 200 for any name; the gibberish calibration
  probe proves it each run), Workable `{name, jobs}`, Recruitee `{offers}`. A 404, a redirect, an HTML 200, a wrong shape,
  a timeout or a 5xx is never a board.
- **APIs and their docs:** Greenhouse Job Board API (developers.greenhouse.io/job-board.html); Lever Postings API
  (github.com/lever/postings-api); Ashby public job posting API (developers.ashbyhq.com/docs/public-job-posting-api);
  SmartRecruiters Posting API (developers.smartrecruiters.com/docs/posting-api); Recruitee Careers Site API
  `https://<slug>.recruitee.com/api/offers/`, public, no authorization (support.recruitee.com/en/articles/1066282);
  Workable: `https://apply.workable.com/api/v1/widget/accounts/<slug>` is the endpoint behind Workable's job widget
  (help.workable.com/hc/en-us/articles/115012801727), but **Workable publishes no reference for it**; it is described only
  by third parties (dev.to/zsevic/integration-with-workable-public-jobs-api-3nk4), so it may change without notice.
  Workable and Recruitee boards are recorded `discovered_unsupported`: ingest has no normalizer for them (Not built).
- **Politeness:** robots.txt is read first on every host and obeyed (RFC 9309: longest match, our token's group before
  `*`, a 5xx robots file means disallow for now, `Crawl-delay` raises the gap); one request start per 200 ms per API host
  (5/s), 1.5 s between Common Crawl index requests, one at a time; a 429/503 doubles that host's gap (Retry-After
  honored) and retries once. User-Agent: `UpmoreTrainee-BoardDiscovery/1.0
  (+https://github.com/srikanthvishnu90-sketch/upmore-agent; job alerts for job seekers)`.
- **Output:** each run commits to a new branch `discovery/boards-<run id>` (never trunk or main; the job refuses any
  other name) the refreshed `board-directory.json`, the regenerated `career-ingest/boards.json`, the gzipped verdicts and a
  summary; and uploads them as an artifact. No secrets: only the workflow's own token, with `contents: write`.

**Measured (CI run 39345730265, job `discover`).** PENDING: the run was in progress when this was committed (started
2026-10-20 00:07 UTC, budget 300 minutes). Read it with
`gh api repos/srikanthvishnu90-sketch/upmore-agent/check-runs/118377726855/annotations` or by fetching
`discovery/boards-39345730265`. No candidate or verified count is reported here until it finishes.

That run was started once from this branch by a temporary `push` trigger on the workflow file, removed in the final
commit; from trunk the workflow runs only on dispatch and on its weekly schedule.

## 2. The 6-hour refresh at scale

**Sharded scheduling** (`supabase/functions/_shared/career_shards.ts`, wired into `career-ingest`): every board has a
fixed bucket (0..63, FNV-1a of `provider:board`); lane k of `INGEST_LANES` owns buckets b with b % lanes == k, so lanes
run in parallel without overlap (one pg_cron call per lane per tick, `?lane=k`). Each run takes its lane's boards that
have waited longest (never-read first) up to `ceil(N / 72 runs / lanes x 1.5)`; the 1.5 headroom absorbs lost and
cut-short runs. Every attempt is recorded in `career_board_state` (migration `20261021110000_career_board_state.sql`):
last attempt, last success, status, fail count, and the board's ETag / Last-Modified.

**Conditional requests:** the board's last validators go back as If-None-Match / If-Modified-Since on the one-request
providers (Greenhouse, Lever, Ashby; SmartRecruiters pages, so it reads in full). A 304 writes and closes nothing. Which
providers answer with validators is recorded per run (`CONDITIONAL` line); whether they then answer 304 is NOT_RUN.

**Sizing** (`deno run -A scripts/career/size-ingest.ts`; limits from supabase.com/docs/guides/functions/limits: 2 s CPU
per request, wall clock 150 s free / 400 s paid, 256 MB):

| | 2,179 boards (today) | 50,000 boards |
|---|---|---|
| Requests per hour (one per board per 6 h) | 363 (0.1/s) | 8,333 (2.3/s) |
| Boards per lane-run at capacity (5-min cadence, 72 runs per 6 h) | 46 (1 lane) | 53 per lane at 20 lanes |
| Wall clock per run at 8 concurrent, 600 ms per request (ASSUMED) | 3.5 s | 4 s |
| CPU per run, no 304s | 46 x 125 ms = 5.7 s: needs 3 lanes | does not fit even at 64 lanes |
| CPU per run, 70% 304s (ASSUMED share) | fits in 1 lane | fits at 20 lanes |

CPU per board is VERIFIED on this machine (`size-ingest.ts`): about 1 ms per posting, 125 ms for the directory's mean
board (119 postings, median 19); 129 ms of it is `CareerJobs.normalizeGreenhouse` for 119 postings, JSON.parse 0.7 ms.
**Finding: the current default (100 boards per run, WO-006) needs about 12 s of CPU per run against the documented 2 s**
(assuming Edge CPU is close to this machine's; NOT_RUN live). The fix is not more lanes: normalize only postings that
are new or changed (compare the ATS's own id and updated_at before normalizing), which cuts CPU by roughly the share of
unchanged postings, then use 304s. Not built here.

**Default after this order:** sharded mode, 1 lane, 5-minute cadence: capacity 46 boards per run (was 100), so every
board is read about every 4 hours, but at about 5.7 s of CPU per run that is still over the 2 s limit by the measure
above. Until the normalize fix lands the owner can run 3 lanes (three schedule entries, `?lane=0..2`, `INGEST_LANES=3`)
or set `INGEST_EVERY_MIN=1` with a one-minute schedule (10 boards per run). At 50,000 boards: the normalize fix and about
20 lanes, or ingest on the D-010 worker VM, where none of these limits apply.

## 3. Latency: first seen to delivered

- **Recorded:** each posting's `first_seen_at` (WO-006); each alert now carries `posting_first_seen_at` into
  `career_outbox`, whose `delivered_at` is when it was sent. `career_alert_latency(since)` (service role only) returns the
  count, p50/p95 to queued, p50/p95/max to delivered; alerts held for quiet hours are counted apart.
  `scripts/career/alert_latency.ts --rows export.json` gives the same numbers from an export (tests R8 and the DB test use
  the same rows).
- **Offline, from the real cron files** (`deno run -A scripts/career/alert_latency.ts`; ingest `2-59/5`, alerts `4-59/5`,
  delivery `* * * * *`; ASSUMED: an ingest run writes its last board up to 125 s after it starts (100 s deadline + 15 s
  board timeout + writes), the alerts run takes up to 20 s, 1.2 s to send a row, 20 rows a minute):

| | Worst, one alert | 15-min burst limit | Simulated 24 h, 20 alerts per ingest run |
|---|---|---|---|
| Today (alerts 2 min after ingest) | 201 s (3.4 min) | 240 alerts | p50 192 s, p95 203 s, max 204 s; **229 of 5,760 never sent** |
| Proposed: alerts 3 min after ingest (`0-59/5`) **and** the code fix (read with an overlap) | 261 s (4.4 min) | 220 alerts | p50 253 s, p95 263 s, max 264 s; 0 lost |

- **Finding (a race, not a timing detail):** `first_seen_at` is the ingest run's start, and the alerts run reads only
  postings first seen since its own last start. A board written after the alerts run read (ingest runs up to ~125 s; the
  alerts run starts 120 s after ingest) falls behind `last_checked_at` and is never alerted. Proposed: schedule the alerts
  run at `0-59/5` (3 min after ingest) and, in a later order, read with an overlap and let the outbox's once-per-key rule
  drop repeats. Not changed here: the schedule is the owner's to run.
- **Architect's correction (review, 2026-10-20):**
  - The "0 lost" row above is the schedule change **with** the code fix (`raceFixed: true` in
    `scripts/career/alert_latency.ts`).
  - The schedule change alone avoids the race only while every ingest run writes its last board within 180 s. The 125 s
    maximum is ASSUMED, so a slower run still loses alerts.
  - The code fix is the real one, and it must not let a re-read posting use up the day's alert room. Queued as its own
    order (§ Not built).
- **Under load:** delivery sends 20 rows a minute (`ROWS_PER_RUN`), 1,200 an hour. One alerts run may queue about 240
  alerts and still deliver them all inside 15 minutes; sustained above 100 per 5 minutes the queue grows without bound
  (simulated 300 per run: p50 over 22 hours). Sustained 100 per 5 minutes is 28,800 a day, about 9,600 people at the
  default 3 a day, so bursts are the nearer risk (one popular posting matching 240+ people in one run). Fix when it
  matters: more rows per delivery run or parallel delivery lanes. LoopMessage's daily contact cap (300 / 1,000, D-009)
  binds long before either.
- Not counted in the 15 minutes: posting published -> first seen, which is up to the refresh interval (6 h at scale).

## 4. The 200-role labeled set

- **Candidates** (`evals/career/alert-labels/candidates.json`): 200 real postings read with the product's own feed reader
  from 2,170 live boards (9 failed; 166,193 postings seen; VERIFIED, CI run 39345730265, job `label-pool`), 20 for each
  of 10 personas (`personas.json`, the WO-017 coverage personas written as alert settings), stratified: 8 the gate
  passes and 3 of each near miss (floor says no, wrong place, close title, another title for the same work), filled from
  the others where short (accountant: no close titles; nurse: no floor near misses). Descriptions clipped to 3,000.
- **Labeling** (`scripts/career/label-alerts.ts --by <name>`): one row at a time, m / n / s / b / q, saved after every
  answer, resumes where it stopped, takes answers from a file; it never shows the gate's answer or the stratum.
  Human labels go to `labels.human.json` (empty: 0 of 200).
- **Eval** (`deno run -A evals/career/alert-precision.ts [--assumed]`): precision and recall of `matchPosting` (the gate
  the alerts run uses) per persona and stratum, with a Wilson 95% interval; only labeled rows count; none -> NOT_RUN.
- **ASSUMED labels** (`labels.assumed.json`, kind `assumed`, with its rubric): written by the architect from each row's
  text, without the gate's answer. Against them: precision 73.3% (55 of 75), recall 91.7%. The false positives say where
  the gate is weak, for a later order (not tuned here, since tuning to my own labels would only flatter the number):
  staffing agencies the floor's list does not know (6 nurse rows from Direct Staffing, Saxon Global, BCforward);
  `remote_ok` accepting remote in any country (4 customer-success rows: Manila, Costa Rica, Canada, Poland);
  keywords matched as a set of words, not a phrase ("Product Marketing Manager" and "Manager, Product Program
  Management" pass "product manager"); "new york" matching upstate New York. **The 90% target is met only on human labels.**

## 5. Hidden-market measurement (NOT_RUN)

We never automate LinkedIn or Indeed. A person checks by hand:
1. Export the day's delivered alerts (service role, read only):
   `select o.id as alert_id, o.delivered_at, p.job_id, p.title, p.company, p.location, p.url from career_outbox o join career_postings p on p.job_id = substr(o.key, 7) where o.kind = 'alert' and o.status = 'delivered' and o.delivered_at::date = '<day>'`
   saved as JSON.
2. `deno run -A scripts/career/hidden-market.ts sample --alerts alerts.json --day <day>`: 50 distinct postings (a
   posting sent to many people counts once), drawn by a seeded hash of the day, written as a CSV sheet.
3. The same day, for each row, search the `search_phrase` (title + company) on LinkedIn Jobs and on Indeed, and fill
   `on_linkedin_same_day` and `on_indeed_same_day` (yes / no / unsure), `checked_at` (ISO time), `checked_by`.
4. `deno run -A scripts/career/hidden-market.ts score --sheet <sheet.csv>`.

**The math:** a row counts only when both sites were checked yes/no within 24 h after delivery. Hidden = no on both.
Share = hidden / counted, with a Wilson 95% interval. With 50 rows a true 20% reads as about 11-33%; the target is "met"
on the point estimate and "met with confidence" when the interval's lower bound is at or above 20%, which at n = 50
needs about 16 hidden (32%). Fewer than 50 counted is PARTIAL.

## Tests (written first; all in the architect suite)
- `tests/architect/wo-037-discovery.test.ts` D1-D7: only verified slugs; calibration, robots first, one GET per slug;
  robots obeyed; per-host pacing and 429 backoff; slug extraction; Common Crawl paced; **no LinkedIn or Indeed host in
  any fetch code** (scans scripts/career, supabase/functions/_shared, the ingest and alerts functions, evals/career,
  packages/domain and the workflows).
- `tests/architect/wo-037-refresh.test.ts` R1-R8: 6-hour coverage in a simulated day at 2,179 and 50,000 boards;
  lanes and ordering; 304 handling; the sharded ingest function; sizing; latency math from the real cron files; the
  latency report.
- `tests/architect/wo-037-alerts.test.ts` A1-A7: the threshold gate over a simulated week; zero spam weeks; the
  person's weekly cap and fail-closed counting; the candidate set; precision only on human labels; the labeling CLI
  round trip; the hidden-market sampler and scoring.
- `tests/db/career_board_state.test.sql`: board state shape and privacy, the latency function, the weekly count.

## Planted defects (each a one-line change, each made a test fail, each reverted)

| # | Defect | Failing test |
|---|---|---|
| P1 | discovery accepts a 404 (`if (status === 404) status = 200;`) | WO-037/D1 |
| P2 | robots.txt ignored | WO-037/D3 |
| P3 | a LinkedIn host added to the Common Crawl queries | WO-037/D7 |
| P4 | shard capacity without headroom (0.9) | WO-037/R1 |
| P5 | latency math drops the wait for a delivery tick | WO-037/R7 |
| P6 | the relevance floor no longer gates alerts | WO-037/A1 |
| P7 | the weekly cap ignored | WO-037/A2 |
| P8 | a store that cannot count sends anyway (fail open) | WO-037/A3 |
| P9 | unlabeled rows counted as no_match | WO-037/A5 |
| P10 | the labeler is shown the row's stratum | WO-037/A6 |
| P11 | a 304 read as a complete empty board (closes everything) | WO-037/R4 |

## Owner steps (nothing here deploys or spends)
- Apply `20261021110000_career_board_state.sql` (in `trainee-go-live.sh`), deploy `career-ingest` and `career-proactive`.
  `career-ingest` then runs sharded (1 lane); with 2,179 boards it reads every board about every 4 hours.
- Optional: move the alerts schedule to `0-59/5` (section 3).
- Label tonight: `deno run -A scripts/career/label-alerts.ts --by <name>`, then `deno run -A evals/career/alert-precision.ts`.
- Merge a `discovery/boards-<run>` branch through a PR to grow the directory (it also regenerates `boards.json`).

## Not built (and why)
- Workable and Recruitee ingest normalizers: their boards are recorded, not watched (the 121 bundle has no reader; a
  later order).
- Normalize-only-changed in ingest (the CPU fix above): it changes WO-006's write path; its own order.
- The alerts race fix in code (read with an overlap): it changes WO-007's "a posting is alerted at most once since the
  last check" semantics. Proposed, with the schedule change as the cheap partial fix.
  - Requirement from review: a posting already alerted to the person, re-read inside the overlap, is excluded before the
    day's room is counted. The outbox's once-per-key rule stops a second send, but not the room being used up.
- Delivery throughput past 20 rows a minute: not needed at today's user count.
- Gate fixes from the ASSUMED labels (staffing list, remote country, phrase match): they wait for human labels.
- Workday (254 tenants recorded): needs a reader and D-013.
