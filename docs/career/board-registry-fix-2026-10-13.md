# Board registry fix — 2026-10-13 (W-BOARDS, reply-quality pass)

Branch: `career/rq-boards` off `pivot/career` @ be88881. No deploy, no main, no router-bundle rebuild.

## Where the registry lives

There was no single registry before this pass. The board list existed in two places:

1. `packages/domain/121-career-jobs.js` — the ATS URL builders (`feeds.greenhouse/lever/ashby/smartrecruiters`)
   and `STARTER_FEEDS` (a 12-board curated subset; it already had Ramp on Ashby).
2. `scripts/career/proof-jobs.mjs` — a hardcoded 18-entry `CANDIDATES` list, which was the de-facto
   full registry for the run-1 pull (3,284 postings, 15 of 18 feeds HTTP 200, per
   `docs/career/evidence/jobs-feeds.json`, generated 2026-10-13T04:43:39Z). This is where the three
   dead feeds lived: Greenhouse `goldmansachs`, Lever `netflix`, Lever `ramp`.

`packages/domain/131-career-discover.js` had no board list (only a company-size table).

**Now canonical:** `BOARD_REGISTRY` in `packages/domain/121-career-jobs.js`. Every entry is
`{ company, provider, board, status: 'live'|'dead', checkedAt: '2026-10-13', note }` plus the feed
descriptor fields (`source`, `company_token`, `url`; `url: null` for dead boards).
`scripts/career/proof-jobs.mjs` now pulls `J.boardFeeds()` (live only) and records `dead_boards` in
its evidence; `131-career-discover.js` exposes `discoveryPlan()` / `discover()` which poll live
boards only and return `deadBoards` with reasons. Dead entries are never fetched: `fetchFeed`
short-circuits them with `skipped: true`, and `poll`/`fetchAll` surface them in `deadBoards`.

## Live verification (curl from this machine, 2026-10-13, public endpoints, no auth)

Method discriminates: healthy boards return 200 with postings; dead boards return 404 (or, for
SmartRecruiters, an empty body — see Square/Visa/Goldman note below).

### Fixed

| Board | Before | After | Live evidence |
|---|---|---|---|
| Ramp | Lever `https://api.lever.co/v0/postings/ramp?mode=json` → **HTTP 404** `{"ok":false,"error":"Document not found"}` | Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/ramp` → **HTTP 200, 165 postings**, 2,803,299 bytes |

Ramp-only proof pull through the module (`J.poll([rampEntry])`, real fetch, 2026-10-13):
`status=200 postings=165 deduped=165 new=165`. Sample titles: "Security Engineer, Cloud |
New York, NY (HQ)", "Mobile Engineer, Android", "Software Engineer, Frontend".

### Marked dead (honest dead — no endpoint invented)

**Goldman Sachs** — `provider: 'custom/no-public-api'`, status `dead`. Tried 2026-10-13:

- `boards-api.greenhouse.io/v1/boards/goldmansachs/jobs` → 404
- `boards-api.greenhouse.io/v1/boards/goldman/jobs` → 404
- `boards-api.greenhouse.io/v1/boards/goldmansachsembassy/jobs` → 404
- `boards-api.greenhouse.io/v1/boards/gs/jobs` → 404
- `boards-api.greenhouse.io/v1/boards/goldman-sachs/jobs` → 404
- `api.lever.co/v0/postings/goldmansachs` → 404
- `api.ashbyhq.com/posting-api/job-board/goldmansachs` → 404; `.../goldman-sachs` → 404
- `api.smartrecruiters.com/v1/companies/GoldmanSachs/postings` → 200 with `totalFound: 0`, `content: []`
  (not evidence of a board — see SmartRecruiters note below)
- Careers surface is custom: `goldmansachs.com/careers/students/programs-and-internships/` → 200 HTML,
  no public postings JSON found.

**Netflix** — `provider: 'custom/no-public-api'`, status `dead`. Tried 2026-10-13:

- `api.lever.co/v0/postings/netflix` → 404; `.../netflixjobs` → 404
- `api.ashbyhq.com/posting-api/job-board/netflix` → 404
- `boards-api.greenhouse.io/v1/boards/netflix/jobs` → 404
- `jobs.netflix.com` → 200 HTML and `explore.jobs.netflix.net/careers` → 200 HTML: custom surfaces,
  no public postings JSON found.

**Square (SmartRecruiters) and Visa (SmartRecruiters)** — status `dead`, additional finding beyond
the three assigned boards. Both returned HTTP 200 with `totalFound: 0` and zero postings in run 1
and again on 2026-10-13. Control check: SmartRecruiters returns the *identical* 200 /
`totalFound: 0` / `content: []` body for a gibberish company token (`ZzzNoSuchCompany123`), so a
200 from this provider evidences nothing, and no postings have ever been pulled from either board.
Variants `VisaInc`, `BlockInc`, `Block`, `SquareInc` also returned `totalFound: 0`.
If a correct SmartRecruiters identifier for either company surfaces later, flipping the entry to
`live` is a one-line change — but it must be proven by a fetch returning real postings first.

### Spot-checked healthy boards (all HTTP 200 with real postings, 2026-10-13)

| Board | Provider/board | Postings |
|---|---|---|
| Stripe | greenhouse/stripe | 722 |
| OpenAI | ashby/openai | 805 |
| Robinhood | greenhouse/robinhood | 178 |
| Airbnb | greenhouse/airbnb | 164 |
| Datadog | greenhouse/datadog | 437 |
| Coinbase | greenhouse/coinbase | 225 |
| Figma | greenhouse/figma | 148 |
| Jane Street | greenhouse/janestreet | 229 |
| Lever demo | lever/leverdemo | 10 |
| Ashby | ashby/ashby | 66 |
| Linear | ashby/linear | 31 |
| Bosch Group | smartrecruiters/BoschGroup | 100 on first page, `totalFound: 4948` |

Registry totals: 17 entries — 13 live, 4 dead (Goldman Sachs, Netflix, Square, Visa).
Run 1 tried 18 feeds because Ramp was listed twice (Lever 404 + Ashby 200); the registry holds
Ramp once, on Ashby.

## Tests

No live network in tests (structure + injected mock fetch only):

- `tests/career-jobs.test.cjs` — 24/24 pass (5 new: registry schema, Ramp=Ashby, Goldman/Netflix
  dead, boardFeeds live-only, dead never fetched + poll reports deadBoards).
- `tests/career-discover.test.cjs` — 9/9 pass (2 new: discoveryPlan skips/names dead boards,
  discover() never fetches a dead URL and returns deadBoards).
