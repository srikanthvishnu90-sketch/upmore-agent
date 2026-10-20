# WO-044: Discovery toward 50,000 boards

Status: in review · Depends on: WO-037 (merged) · Assignee: Claude (architect, building) · Branch: `wo/044-discovery-scale`

## Target (owner, verbatim)
"Watch 50,000+ company career pages directly, refreshed at least every 6 hours."

## Where it stands (every number labeled)

__RESULT_TABLE__

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
the same shape test, and `20261022090000_career_more_providers.sql` widens the postings and board-state provider checks.

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
probed; `resume_branch` skips the slugs an earlier discovery branch found dead (only dead ones: a board counts only
from this run's own answer). The discovery branch is now trunk plus the four data files: the workflow token may not
push a branch carrying a workflow change (run 39375781988's merge was refused for that).

__RUN_SECTION__

## The 6-hour refresh at the new size

__REFRESH_SECTION__

## What stands between the count and 50,000

__GAP_SECTION__

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

__TESTS_RUN__

## Owner steps (nothing here deploys or spends)
- Apply `20261022090000_career_more_providers.sql` (it is in `trainee-go-live.sh`) and deploy `career-ingest` **before**
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
