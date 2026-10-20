# WO-041: Source freshness for the firm guide and the interview patterns

Status: built · Branch `wo/041-source-freshness` · No migration · Depends on: WO-036 (`firm-guide.json`, branch
`wo/036-guidance-offer`, not yet on `trunk` when this was cut, so this branch is based on it with `trunk` merged in) and
WO-035 (`interview-patterns.json`, merged).

## Why
Trainee answers "how do I get into X" from `packages/career-data/firm-guide.json` and runs mock interviews from
`packages/career-data/interview-patterns.json`. Reviews found two problems:
- Many firm-guide deadlines have passed, and nothing re-checks the data.
- The 26 pattern sources were read only through search excerpts. Their pages should be opened before a pattern is
  quoted.

Owner rule: make no claim the system cannot back, label every number, never invent.

## What was built

### 1. The checker: `scripts/career/check-sources.cjs`
Plain Node 22 with no dependencies. The only `require` outside `node:` is `packages/domain/134-career-paths.js`, which
reads the dates.

**What it checks.** Every `source_url` in both files: programs, requirements, base rates and `not_required` in the
guide, patterns and questions in the patterns file. That is 53 URLs in the guide and 25 in the patterns file (26 uses).

**What it records per URL:**
- the HTTP status;
- the final URL after redirects, with each hop;
- `fetched_at`;
- one status:
  - `live`;
  - `redirected` (ended somewhere else, ignoring a trailing slash);
  - `gone` (404 or 410);
  - `blocked` (401, 403, 429, or a bot-check page such as Cloudflare's "Just a moment", PerimeterX, Incapsula or
    DataDome);
  - `error` (5xx, DNS failure, timeout, more than 5 redirects);
  - `skipped` (LinkedIn or Indeed).

**Politeness.**
- One request per host at a time, through a per-host gate.
- At least 1 s from the end of one request to a host to the start of the next.
- A few hosts are worked in parallel (4 by default).
- The User-Agent is `UpmoreTrainee-source-check/1.0 (+https://github.com/<repo>)`.
- Each request is a GET with a 20 s timeout, no cookies and no auth header.
- At most 256 KB of the body is read, only to spot a bot check.

**Never.**
- No proxy, no browser, no stealth, no captcha solving.
- LinkedIn and Indeed hosts (`linkedin.com`, `lnkd.in`, `indeed.*`) are never fetched. This holds even when a
  redirect points there, because redirects are followed by hand and every hop is checked against the list.

**Dates.** For the firm guide, every full date that a timeline or requirement states is read by 134 `statedDates`
("the deadline was August 11, 2026", "open 31 August to 11 October 2026", "a March 29, 2026 deadline"). Each date
gets a kind (deadline, opens or date) and `past`, which is true when the date is before the run date (UTC). The day
itself is not past. A month and year alone ("graduating December 2026") is a window, not a date.

**Output.** A JSON report: `summary` counts, `urls[]`, `firm_dates[]` and `dates_past`. Optionally:
- `--checks-out` writes the small checks file;
- `--summary` appends plain lines to the job summary.

**It never edits data.**
`--from-report report.json --write-checks packages/career-data/source-checks.json` is the step a person runs to adopt
a report.

### 2. The workflow: `.github/workflows/source-freshness.yml`
- **When it runs:** weekly (Mondays 06:17 UTC), by `workflow_dispatch`, and on a pull request that touches the
  checker, either data file or the workflow.
- **What it does:** runs the checker, uploads `source-check-report.json` and `source-checks.json` as the artifact
  `source-check-report` (kept 30 days), and prints a summary to the log and the job summary.
- **What it cannot do:** it has `permissions: contents: read`. It has no commit or push step. Its last line fails the
  job if anything under `packages/` changed. Staleness is reported, never "fixed".

### 3. Honesty in the chat
**`packages/career-data/source-checks.json`** is the last check adopted by a person.
- As committed it says `ran: false` with no results (NOT_RUN, see Measured).
- It is compressed into the career bundle as `CAREER_SOURCE_CHECKS_JSON` (`scripts/build-router-core.py` `CAREER_DATA`,
  plus the plain line in the full bundle) and listed in `tests/career-bundle-data.test.cjs`.
- 134 `sourceChecks()` reads it, and `sourceStatus(url)` gives:
  - `live` or `redirected`: verified;
  - `gone`;
  - otherwise `unverified`, carrying blocked, error or skipped as the reason.

**Firm guide** (`career_path.ts`, `pathAnswer` now takes `now`; `career_tools.ts` passes the turn's clock `c.now`):
- **A shown program with a past stated date** gets a line right after its own line, for example: "As of 2026-10-20,
  the opening date 31 August 2026 and the deadline 11 October 2026 have passed. The next cycle's date is not published
  yet in my sources; I won't guess it."
  - Only dates the timeline states are named, plus today's date.
  - A past opening date is left out while the stated deadline is still ahead, because the window is open.
- **The "Apply to P inside its window" move** is never given for a program whose stated deadline has passed. If that
  program is the only one with a timeline, the move says instead: "The P deadline (August 11, 2026) has passed, and the
  next cycle's date is not published yet: watch its page and apply when it opens."
- **A program page the last check found gone** gets "That page answered 404 at the <date> source check, so this program
  may no longer be listed there."
- `programs[]` in the result carries `past_dates` and `source_status`.

**Interview patterns** (`career_mock.ts`, `career_voice.ts`):
- **Gone.** A pattern or firm question whose page the last check found gone is never quoted, in the text mock or in
  the voice interviewer's instructions. If every pattern of a firm is gone, the mock says "No record for X on file, so
  nothing here is about how they interview."
- **Not opened.** A pattern whose page no check has opened is quoted with "Unverified: a search summary of that page;
  no source check has opened the page yet." This label goes on the company question and on the start line.
- **Refused.** A pattern whose page refused or failed the check is quoted with "Unverified: the page could not be opened
  at the <date> source check (blocked)."
- **Voice.** The voice instructions tag each unopened note: "[unverified: page not opened by a source check; do not
  present it as the firm's words]".
- **Choice.** Within a source rank, a page the check opened is picked before one it did not.

## Demo (owner)
```
node scripts/career/check-sources.cjs --out /tmp/report.json --checks-out /tmp/checks.json   # needs network (CI has it)
node scripts/career/check-sources.cjs --from-report /tmp/report.json --write-checks packages/career-data/source-checks.json
python3 scripts/build-router-core.py --career-only && python3 scripts/build-router-core.py
deno run -A scripts/career/wo036-demo.ts path McKinsey "business analyst" "BS Economics at Rutgers, graduating May 2027"
```
Or run the `source-freshness` workflow by hand in Actions and download the `source-check-report` artifact.

## Tests
- **`tests/career-source-check.test.cjs`** (8 tests, Node, fake fetch and a virtual clock, no network). It runs in the
  gate through `tests/career-*.test.cjs`.
  - C1: every status (live, redirected with the final URL and hops, trailing slash, gone 404/410, blocked
    403/429/bot-check page, a form's reCAPTCHA is not a block, 500, DNS, timeout, redirect loop).
  - C2: LinkedIn and Indeed are never fetched, including through a redirect.
  - C3: politeness (no overlap per host, at least 1 s gaps, UA, GET, manual redirects, no cookie, a timeout signal,
    hosts in parallel).
  - C4: past-date detection on the real guide with a fixed clock (the day itself is not past).
  - C5: every URL in both files, 26 pattern uses.
  - C6: `--from-report` to the checks file, read back by `sourceStatus`.
  - C7: the workflow's triggers, read-only permission and no commit.
  - C8: the committed checks file.
- **`tests/architect/wo-041-source-freshness.test.ts`** (8 tests, Deno).
  - R1: the past-deadline phrasing for Evercore, McKinsey and Bain, and nothing said before the deadline or on its day.
  - R2: over 22 firms x 3 roles x 6 clocks, every date in an answer is stated in the guide or is today, and a passed
    line has no year of its own. This is the "never guess the next date" test.
  - R3: "apply inside its window" never goes to a closed program, and McKinsey's closed move.
  - R4: the brain tool uses the turn's clock.
  - R5: a gone program page.
  - R6: a gone pattern is not quoted, by text or voice.
  - R7: the unverified labels for all 17 pattern-only firms.
  - R8: the bundle carries the checks.

### Planted defects
Each one-line change was applied, the two WO-041 test files were run, and the change was reverted. Both bundles were
rebuilt around the changes to 134. All 12 were caught. After reverting: 8 of 8 (Node) and 8 of 8 (Deno) passed, and
both bundles verified.

| # | Defect (one line) | File | Failing test |
|---|---|---|---|
| D1 | Indeed dropped from the never-fetch list | check-sources.cjs | WO-041/C2 |
| D2 | `if (false) await sleep(wait)`: no 1 s gap between requests to a host | check-sources.cjs | WO-041/C3 |
| D3 | 404/410 classed `error`, not `gone` | check-sources.cjs | WO-041/C1, C6 |
| D4 | `d.date <= today`: the deadline day itself called past | 134-career-paths.js | WO-041/C4, R1 |
| D5 | `if (false) head.push(past)`: the passed-deadline line left out | career_path.ts | WO-041/R1, R2, R4 |
| D6 | `closedDeadline` returns null: "apply inside its window" for a closed program | career_path.ts | WO-041/R3 |
| D7 | "The next cycle likely opens in <year+1>": a guessed date | career_path.ts | WO-041/R1, R2, R4 |
| D8 | gone patterns not filtered in `firmPrompt` | career_mock.ts | WO-041/R6 |
| D9 | `unverifiedNote` returns null: no unverified label | career_mock.ts | WO-041/R7 |
| D10 | the voice prompt's `if (gone) continue` removed | career_voice.ts | WO-041/R6 |
| D11 | `sourceStatus` ignores `ran`: a check that never ran counts | 134-career-paths.js | WO-041/C6 |
| D12 | `redirect: "follow"`: hops (to LinkedIn) unchecked | check-sources.cjs | WO-041/C3 |

## Measured
- Live source check from the build sandbox: **NOT_RUN**.
  - Every firm host is refused here: `curl https://jobs.lever.co/palantir` and `curl https://www.mckinsey.com/careers`
    gave `CONNECT tunnel failed, response 403` from the egress proxy, and Node `fetch` gave `ENOTFOUND` for all 5 hosts
    tried.
  - The checker itself was run here (`node scripts/career/check-sources.cjs --out <file> --timeout-ms 8000`). It gave
    78 URLs, 78 `error` (ENOTFOUND) and 0 reached, so it says nothing about the pages.
  - The first real check is the `source-freshness` workflow on this branch's pull request.
- URLs covered: VERIFIED, 78 unique: 53 in the guide and 25 in the patterns file (26 uses), by `collectUrls`
  (C5, `node --test tests/career-source-check.test.cjs`).
- Firm-guide dates past on 2026-10-20: VERIFIED, 7 of 7 stated full dates. They are Goldman's July 1, 2022 (already
  labeled a past pattern), McKinsey's July 1, August 11 and March 29, 2026, Bain's August 31, 2026, and Evercore's
  31 August and 11 October 2026 (C4).
- Career bundle: VERIFIED, 2,498,161 B (was 2,492,598). The staged career artifact is 3,249,461 B against the
  4,200,000 B budget (raw upper bound, esbuild unavailable here):
  `node scripts/career/stage-career.cjs <dir> --json`.

- **Suites (VERIFIED here):**
  - architect: 320 passed, 0 failed;
  - gate edge list: 129 passed, 0 failed;
  - staged suites: 3/3;
  - go-live, export coverage and no-secrets: 20/20;
  - bundle data and outbox kinds: pass.
- **`bash scripts/gate.sh` locally:** three local-only failures, none from this order.
  - browser-runtime and 81 Playwright-driven apply tests: Chromium refuses to run sandboxed as root.
  - career-typecheck: deno.land and esm.sh downloads are refused by the proxy.
  - All other tests in the career and shared step passed.

## Not built, and why
- **Adopting a real check into `source-checks.json`.** No check could run here (NOT_RUN above). After the PR's
  workflow run, a person downloads the artifact, runs `--from-report ... --write-checks ...`, rebuilds both bundles and
  commits. CI deliberately cannot do this (the owner's "report, not fix").
- **Re-collecting the data.** Gone or redirected pages and passed dates are reported, not replaced. New cycle dates
  come only from a person re-reading the firm's page.
- **Content verification.** `live` means the page answered, not that it still says what the search summary said. The
  pattern text stays a search summary until someone reads the page and updates `basis`.
- **Requirements from a gone page** are still used as moves (only programs get the "gone" line), because the move
  block's format is pinned by WO-036/T7.
- **The `/indeed\.[a-z]{2,3}(\.[a-z]{2})?$/` never-fetch list** covers `indeed.com`, the country subdomains and the
  country domains. Other aliases (e.g. `indeedjobs.com`) are not in the data and are not listed.
