# WO-044: Discovery toward 50,000 boards

Status: in review · Depends on: WO-037 (merged) · Assignee: Claude (architect, building) · Branch: `wo/044-discovery-scale`

## Target (owner, verbatim)
"Watch 50,000+ company career pages directly, refreshed at least every 6 hours."

## Where it stands (every number labeled)

| | Number | Label |
|---|---|---|
| Boards verified before this order | 2,288 (2,140 on providers then read, 2,020 with ≥1 posting) of 20,031 candidates | VERIFIED, run 39345730265 |
| Boards verified, run 1 of this order | **11,052** (8,534 with ≥1 posting) of 47,707 candidates; 3,141 not probed (Workable) | VERIFIED, run 39380185627, branch `discovery/boards-39380185627` |
| Boards verified, run 2 (resumed from run 1) | 25,527 on ten providers' finished jobs; Workable's job and the merge were still running when this was written | VERIFIED per provider job (the `SHARD` lines), run 39433413503; the merged total is in that run's `VERIFIED` line and on `discovery/boards-39433413503` (NOT_RUN here) |
| Candidates, run 2 | 91,005 unique | VERIFIED, run 39433413503 (`SOURCES`) |
| Target | 50,000 | NOT MET |

Labels: **VERIFIED** = measured by a named CI run (the run id is given); **ASSUMED** = an input we chose, not measured;
**NOT_RUN** = not measured. A board counts as VERIFIED only when its public job API or feed answered 200 with that
provider's own shape in that run (the WO-037 rule, unchanged).

## Why the first run stopped at 2,288 (run 39345730265, read from its log and summary)

1. **Common Crawl gave nothing.** Every index query was "blocked by robots" (pages 0, errors 0). This order printed the
   robots files (run 39376329842, `ROBOTS` lines): `index.commoncrawl.org` is `User-agent: * Disallow: / Allow: /$ ...
   Allow: /collinfo.json$` (queries disallowed), and `data.commoncrawl.org` (the index files) is `User-Agent: *
   Disallow: /`. Under our rule, Common Crawl is closed to us. WO-037 also read `collinfo.json` before checking robots
   (it happens to be allowed); fixed: robots first for every path (test S8).
2. **Most candidates were guesses.** 19,068 of 20,031 candidates were Tranco slug guesses; 356 of 14,987 probed guesses
   were live (2.4%) (VERIFIED, run 39345730265's verdicts).
3. **Throughput stalled on one host.** Workable answered a few 429s; the pacer doubled its gap to 60 s and never eased
   back: 371 of ~3,180 Workable slugs probed, and those 2,596 were the run's "not probed before the deadline". Fixed:
   every non-429 answer eases the gap 5% toward its floor (test S5), and one more pass retries transient errors (S6).
4. **SmartRecruiters is closed.** `api.smartrecruiters.com/robots.txt` allows only `LinkedInBot`
   (`User-agent: * Disallow: /`, run 39376329842). All 3,261 SmartRecruiters probes were `blocked_by_robots`.

## What this order built

### Candidate supply (each source robots-checked, paced, re-runnable; `scripts/career/board_discovery.ts`)
- **Wayback Machine CDX** (`web.archive.org/cdx/search/cdx`; its robots.txt answers 404, so no rules): per provider a
  prefix (path providers) or domain (subdomain providers) query, `collapse=urlkey`, a server-side filter keeping only
  URLs that can name a board's own page (one path segment, no query string), paged with the server's resumption key,
  round-robin across queries so a deadline thins every provider alike; one request per 2 s, 429/503 backoff (S14).
- **Hacker News search** (HN Search by Algolia, `hn.algolia.com/api`): comments linking each provider's board host,
  newest first, 1,000 a page, paged back in time; one request per second (S15).
- **Workday sites from robots**: each known Workday tenant's robots.txt lists its career sites (`Allow: /<Site>/`); only
  allowed sites become candidates (S16).
- **Common Crawl index files** (`data.commoncrawl.org`: cluster.idx, then byte ranges of only the blocks that cross a
  board boundary) and **board sitemaps** (from each board host's robots `Sitemap:` lines): built and tested (S9-S11),
  but they find nothing today: Common Crawl's robots.txt disallows us, Greenhouse's and Lever's advertised sitemaps
  answer 404, Ashby's and Workable's are empty url sets (run 39376329842). Kept: each costs one or two requests a run
  and says why it found nothing.
- The useful sources are probed first and slug guesses last (S7), so a deadline cuts guesses.

### Providers (seven new readers, wired into ingest like the first four)
`supabase/functions/_shared/career_ingest_feeds.ts`: one spec per provider (request, body reader, the board shape,
raw jobs, the ATS's own id, each job rewritten into the Greenhouse job shape so `CareerJobs.normalizeGreenhouse` runs on
every provider alike). `career_ingest.ts` reads them (`INGEST_PROVIDERS`, `directoryBoards`), discovery verifies with
the same shape test, and `20261026060006_career_more_providers.sql` widens the postings and board-state provider checks.

| Provider | Endpoint (public, keyless) | Documented by the provider? |
|---|---|---|
| Workable | GET `apply.workable.com/api/v1/widget/accounts/<slug>` | No (the job widget's endpoint; described by third parties) |
| Recruitee | GET `<slug>.recruitee.com/api/offers/` | Yes (Careers Site API) |
| BambooHR | GET `<slug>.bamboohr.com/careers/list` | No (the careers page's own JSON) |
| Teamtailor | GET `<slug>.teamtailor.com/jobs.rss` | Yes (career site RSS feed) |
| Breezy HR | GET `<slug>.breezy.hr/json` | Yes (JSON feed of published positions) |
| Personio | GET `<slug>.jobs.personio.de/xml` | Yes (XML feed of open positions) |
| Workday | **POST** `<tenant>.<wdN>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs` | No (the career site's own search) |

**The one POST.** Workday's job search is a POST that only reads: the body is
`{"appliedFacets":{},"limit":N,"offset":K,"searchText":""}` and nothing else (S4, I2 check the body's keys). Discovery
asks for one posting; ingest pages 20 at a time up to 50 pages (1,000 postings) and calls a larger board a partial read
(closes nothing); a board whose pages run past the per-board time is a partial read too, not a failure (I2). Workday's
`postedOn` ("Posted 3 Days Ago", "Posted 30+ Days Ago") becomes the latest date that wording allows. Every other request
in discovery and ingest is a GET (HEAD for a Common Crawl crawl name, never sent today since robots stops it first).
**The fixtures are hand-written** from each provider's public shape (`tests/architect/wo-044-fixtures.ts`), not recorded.

### Throughput (`.github/workflows/board-discovery.yml`)
Three stages: **gather** (one job, 150 min budget), **verify** (one job per provider, 11 in parallel, 270 min each),
**merge** (verdicts, summary, directory, ingest list). Splitting by provider adds no load to any host: each provider's
hosts keep one pace (200 ms between request starts per platform, a robots Crawl-delay raises it, 429/503 back off and
recover). A verify job writes every verdict as it goes (`verdicts.partial.jsonl`), so a job cut off still counts what it
probed. With `resume_branch` set to an earlier discovery branch, the run skips the slugs it found dead and probes the
ones it found live again (a board counts only from this run's own answer). The Wayback queries also continue from that
branch's saved resumption keys. The discovery branch is now trunk plus the four data files: the workflow token may not
push a branch carrying a workflow change (run 39375781988's merge was refused for that).

## The runs (all on `wo/044-discovery-scale`, started by a temporary `push` trigger because the integration's token
cannot dispatch workflows: `403 Resource not accessible by integration`; the trigger is gone in the final commit)

| Run | What | Result |
|---|---|---|
| 39375781988 | smoke (12-min verify) | pipeline end to end: VERIFIED 2,250 of 3,027; merge refused (the workflow-token branch rule; fixed) |
| 39376329842 | smoke + robots diagnostics | the robots facts above |
| 39377124463 | smoke, Wayback (2 pages), HN, Workday robots | VERIFIED 6,320 of 12,041 (1,385 unprobed): the sources work |
| 39397971621 | Wayback alone, anchored filter (`wayback-smoke.yml`, temporary) | 25,627 slugs from 15 pages in 25 min (the unanchored filter: 13,343 from 37 pages in 150 min) |
| **39380185627** | full run 1 | **VERIFIED 11,052** (below) |
| **39433413503** | full run 2, resumed from run 1 | 91,005 candidates; 25,527 verified on ten providers; Workable pending (below) |

**Run 1 (39380185627), per provider** (VERIFIED; postings = the count each board's API answered at probe time; for
Workday it is the board's own `total`, not postings read):

| Provider | Live | With ≥1 posting | Postings | Dead (404) | Other |
|---|---|---|---|---|---|
| Greenhouse | 1,876 | 1,675 | 88,493 | 4,235 | |
| Ashby | 2,064 | 1,876 | 40,000 | 3,522 | |
| Lever | 533 | 447 | 23,450 | 3,174 | |
| Personio | 2,061 | 1,756 | 15,782 | 964 | 3,958 robots-blocked (unknown subdomains) |
| Workday | 1,229 | 949 | 296,809 | 217 | 147 errors |
| Breezy | 997 | 540 | 10,820 | 3,857 | |
| Recruitee | 903 | 749 | 13,628 | 3,856 | 102 errors |
| Workable | 897 | 228 | 6,013 | 121 | 3,141 not probed (429s) |
| Teamtailor | 287 | 220 | 3,700 | 3,098 | |
| BambooHR | 205 | 94 | 381 | 0 | 2,949 redirects (unknown subdomains answer 302) |
| SmartRecruiters | 0 | 0 | 0 | 0 | 3,257 robots-blocked |
| **Total** | **11,052** | **8,534** | **499,076** | | |

Verified by source (run 1): directory 2,173 · Wayback 6,601 · HN 1,140 · Workday robots 651 · domain guesses 430 (of
26,451 probed, 1.6%) · WO-017 candidates 57.

**Run 2 (39433413503), per provider job** (VERIFIED, `SHARD` lines; run 1's dead slugs skipped, its live ones probed
again): Greenhouse 4,621 · Breezy 4,593 · Personio 4,229 · BambooHR 3,447 · Ashby 3,433 · Recruitee 1,688 · Lever 1,543 ·
Workday 1,232 · Teamtailor 741 · SmartRecruiters 0 · Workable pending. Sum of the ten: 25,527. Candidates 91,005:
Wayback 57,939 (Ashby, Workable, Breezy, both Personio queries read to the end; Greenhouse, Lever, Recruitee, BambooHR,
Teamtailor stopped at the deadline with their keys saved; Workday's query failed every page), prior live 11,052,
domain guesses 31,740, Workday robots 1,163.

## The 6-hour refresh at the new size

- **Finding:** WO-037's per-run capacity assumed the 64 buckets split evenly across lanes. They do not: at 12,000 boards
  and 4 lanes the heaviest lane held 3,710 (24% over a quarter), and the simulated oldest read reached 6.25 h
  (WO-044/R1 reproduces it). Fixed in `career-ingest/handler.ts`: a lane takes at least its own share
  (`capacityPer` of the lane's boards); WO-037/R5 still passes. With it, every board on all eleven providers is read
  within 6 h at 12,000 boards over 4 lanes with a tenth of runs lost and a tenth cut short (WO-044/R1, simulated).
- **Sizing at run 1's directory** (`deno run -A scripts/career/size-ingest.ts --directory <run 1's board-directory.json>`;
  CPU per board measured on this sandbox, latency 600 ms ASSUMED, limits from supabase.com/docs/guides/functions/limits):
  11,352 live boards, mean 57 postings (median 5), 1.84 requests per read (Workday pages). No 304s: 13 lanes, 3,474
  requests/hour, 1.96 s CPU per run. 70% 304s (ASSUMED): 4 lanes. At 50,000 boards: 55 lanes without 304s, 17 with 70%.
  Workable, Recruitee, BambooHR and Workday send no validators (run 1 `CONDITIONAL`), so the 304 share will be lower
  than for Greenhouse/Lever/Ashby. Live: NOT_RUN.
- A Workday board larger than 1,000 postings, or one whose pages run past the per-board time, is a partial read
  (closes nothing).

## What stands between the count and 50,000

1. **Candidate supply.** Common Crawl, the source WO-037 counted on, is closed by robots.txt. The Wayback Machine is
   the source that works, but slowly (about 1-4 min a page, frequent 503s). In run 2 it had not finished Greenhouse
   (job-boards), Lever, Recruitee, BambooHR or Teamtailor. Its keys are saved (`discovery-wayback-state.json`), so the
   weekly run continues where the last one stopped.
2. **Workable throughput.** Its widget API answers 429 with long Retry-After values. Run 1 probed 1,064 Workable slugs in
   5 h (84% live), and run 2 has ~16,000 Workable candidates. At that pace that is weeks of weekly runs.
3. **Workday supply.** 1,229-1,232 verified (95% hit rate) but only from known tenants. Wayback's `myworkdayjobs.com`
   query failed every page in run 2.
4. **SmartRecruiters:** robots.txt closed (0 of 3,257).
5. **Hit rate of the remaining candidates.** Domain guesses verify at 1.6%; Wayback slugs at roughly half
   (archived boards close).
6. **Projection (ASSUMED, not measured):** each weekly run that resumes adds the next Wayback pages and the next
   Workable slugs. Reaching 50,000 needs both the Wayback backlog read through and Workable's ~16,000 candidates
   probed, which at today's pace is several weeks of weekly runs. It is not reachable in one run under these rules.

## Tests (written with the code; all offline)
- `tests/architect/wo-044-discovery-scale.test.ts` S1-S16: slugs for the new providers; every new shape; XML feeds;
  Workday's read-only POST and its calibration; pacer recovery and pacing; the transient-error pass and unreadable
  robots; source order under a deadline; the index server's robots (collinfo.json); Common Crawl's index files (SURT
  keys, board roots, block selection and skipping, byte ranges only, a 200 never read, robots stop); sitemaps; merging
  and tallies; the merge phase end to end (including a cut-off shard's partial file); Wayback; Hacker News; Workday
  sites from robots.
- `tests/architect/wo-044-ingest-readers.test.ts` I1-I6: each GET reader's postings (id, link, place, date, company,
  text); Workday paging, page cap and the out-of-time partial read; a body that is not the board's shape fails the
  board and closes nothing; conditional requests on one-request feeds; the directory, shipped list, migration and
  go-live all take every provider; the XML reader.
- `tests/architect/wo-044-refresh.test.ts` R1-R3: 6-hour coverage at the new size on all eleven providers (and the
  even-split finding reproduced); sizing charges Workday's pages; the ingest function sizes a lane by its own boards.
- Changed to fit (each because the behavior changed on purpose): `tests/career-board-directory.test.cjs` (live boards on
  any provider ingest reads; 151's feeds still cover the bundle's four), `tests/edge/career-ingest.test.ts` B4 (an
  unknown provider, since Workday is now read) and B8 (the shipped list grows: at least 2,179),
  `tests/db/career_board_state.test.sql` (an unknown provider is refused; the new ones are taken).

**Run here:** architect suite `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`: 427 passed,
0 failed before the last additions; the WO-044 files after them: discovery 16/16, ingest readers 6/6, refresh 3/3, WO-037
discovery and refresh 15/15. Gate edge tests: 129 passed, 0 failed. Node: `tests/career-board-directory.test.cjs`,
`career-board-harvest`, `trainee-go-live`, `career-jobs`, `no-secrets`: 55/55. `build-router-core.py --career-only
--check`: verified (no bundled file changed). DB tests cannot run here (initdb refuses root); in CI (`ci` workflow,
`database` job) green at c53baf41. Run 1's directory passes `career-board-directory.test.cjs` and the ingest edge test.

## Owner steps (nothing here deploys or spends)
- Apply `20261026060006_career_more_providers.sql` (it is in `trainee-go-live.sh`) and deploy `career-ingest` **before**
  merging a discovery branch made by this order's workflow: that branch's `boards.json` lists all eleven providers, and
  the deployed function and table take only four until then.
- Merge `wo/044-discovery-scale`, then open the run's `discovery/boards-<run>` branch as a PR.
- Lanes: the sizing above says how many `?lane=k` schedule entries the directory needs.

## Not built (and why)
- SmartRecruiters discovery: its API's robots.txt allows only LinkedInBot. **Finding for the owner:** the 300
  SmartRecruiters boards already `live` in the directory are read by ingest from the same API; whether ingest (a reader
  of known boards, not a crawler) should honor that robots.txt is the owner's call. Not changed here.
- A paid or keyed source (Common Crawl on S3 with AWS credentials, a commercial ATS list): no credentials or spend.
- Workday descriptions (one more request per posting): titles, places and dates only for now.
