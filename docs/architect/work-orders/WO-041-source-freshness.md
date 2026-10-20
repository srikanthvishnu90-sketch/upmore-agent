# WO-041: Source freshness for the firm guide and the interview patterns

Status: built, review round 2 · Branch `wo/041-source-freshness` · No migration · Depends on WO-036 (`firm-guide.json`)
and WO-035 (`interview-patterns.json`). Both are merged into `trunk`, and `trunk` is merged into this branch.

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
guide, patterns and questions in the patterns file. That is 78 unique URLs: 53 in the guide and 25 in the patterns
file (26 uses).

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
  - `skipped` (LinkedIn or Indeed, or disallowed by robots.txt).

**Politeness.**
- **One request per site at a time.** A site is a registrable domain, so `jobs.x.com` and `www.x.com` share one
  queue. Two-part suffixes such as `co.uk` and `edu.au` are handled.
- **Spacing.** At least 1 s from the end of one request to a site to the start of the next.
- **Parallel sites.** 4 by default, never more than 8 (`--hosts-at-once` is capped).
- **robots.txt is honored.** It is read once per origin, through the same gate.
  - The group for `UpmoreTrainee-source-check` applies, else `*`.
  - The longest matching rule wins, and Allow wins a tie. `*` and `$` follow RFC 9309.
  - A disallowed page is `skipped` and never fetched.
  - A 4xx robots.txt means no rules. A 5xx or unreadable one means nothing on that host is fetched.
- **Each request.** The User-Agent is `UpmoreTrainee-source-check/1.0 (+https://github.com/<repo>)`. It is a GET with
  a 20 s timeout, no cookies and no auth header. At most 256 KB of the body is read, only to spot a bot check.

**Never.**
- No proxy, no browser, no stealth, no captcha solving.
- LinkedIn and Indeed are never fetched.
  - **Hosts covered:** `linkedin.<any TLD>` and its subdomains, `licdn.com`, `lnkd.in`, `indeed.<any TLD>` (including
    `indeed.jobs`, `indeed.co.uk` and `indeed.com.au`) and its subdomains, and `indeedjobs.com`.
  - **Normalization first:** the host is lower-cased, percent-decoded and stripped of trailing dots, so
    `www.linkedin.com.` and `www.linkedin.com%2e` count as LinkedIn.
  - **Redirects too:** every redirect hop is checked against the list, because redirects are followed by hand.

**Dates.** Every date a timeline or requirement states is read by 134 (`statedDates`, `undatedDates`, `programDates`).
- **Forms read:**
  - "the deadline was August 11, 2026";
  - "open 31 August to 11 October 2026";
  - "Sept. 1–Oct. 11, 2026" (an unspaced dash);
  - "October 1–11, 2026";
  - "from August 31, 2025 to October 11, 2025";
  - "11th of October 2026" and "11 Oct. 2026";
  - `2026-10-11` (ISO);
  - `10/11/2026` (US order, month first);
  - "Deadline: September 2026" (a month-only deadline, past once its last day is).
- **Kinds.** Each date is a deadline, an opening or a plain date. "to", "until" or "by" before a date ends a window;
  "from" opens one.
- **What is not a date.** "graduating December 2026" is a window. A month and year count only in deadline words, and
  never next to "graduating".
- **No year.** A date said without a year ("close October 1") is kept apart as undated and is never given a year.
- **Past.** A day is past only once it is over everywhere (UTC-12). So "October 20, 2026 at 11:59 PM ET" has not
  passed at 2026-10-21T00:30Z, while hours remain in ET.
- **Closed.** A program is closed when it states at least one dated date, every dated date is past, one of them is not
  just an opening, and it states no undated date. An old opening date alone ("opened July 1, 2022") closes nothing.

**Output.** A JSON report: `summary`, `urls[]`, `firm_dates[]` (undated ones carry `date: null`) and `dates_past`.
- `--checks-out` writes the small checks file.
- `--summary` appends plain lines, including past and yearless dates.

**It never edits data.** Adopting a report is done by a person:
`--from-report report.json --write-checks packages/career-data/source-checks.json`.

### 2. The workflow: `.github/workflows/source-freshness.yml`
- **When it runs:** weekly (Mondays 06:17 UTC), by `workflow_dispatch`, and on a pull request that touches the checker,
  either data file or the workflow.
- **What it does:** runs the checker, uploads `source-check-report.json` and `source-checks.json` as the artifact
  `source-check-report` (kept 30 days), and prints a summary.
- **Pinned actions:** every action is pinned by commit SHA:
  - checkout v4.2.2 `11bd7190`;
  - setup-node v4.4.0 `49933ea5`;
  - upload-artifact v4.6.2 `ea165f8d`.
- **What it cannot do:** it has `permissions: contents: read` and no commit or push step. Its last line fails the job
  if anything under `packages/` changed.

### 3. Honesty in the chat
**`packages/career-data/source-checks.json`** is the last check adopted by a person.
- As committed it says `ran: false` with no results (NOT_RUN).
- It is compressed into the career bundle as `CAREER_SOURCE_CHECKS_JSON` and listed in
  `tests/career-bundle-data.test.cjs`.
- 134 `sourceStatus(url)` gives:
  - `live` or `redirected`: verified;
  - `gone`;
  - otherwise `unverified`, carrying blocked, error or skipped as the reason.

**Firm guide** (`career_path.ts`; `career_tools.ts` passes the turn's clock `c.now`):
- **Unverified label.** Statements from a page no check has opened carry one line under the heading, for example:
  "Unverified: the statements from mckinsey.com are search summaries of the cited pages; no source check has opened
  those pages yet." A page that refused the check gets "... could not be opened at the <date> source check." The cited
  pages are the programs shown, the move requirements and the base rate's press page.
- **Past dates.** A past stated date is said: "As of 2026-10-20, the opening date 31 August 2026 and the deadline
  11 October 2026 have passed. The next cycle's date is not published yet in my sources; I won't guess it."
- **No year.** A yearless date is said: "October 1 is stated without a year, so I can't tell whether it has passed;
  check the page."
- **The apply move.** "Apply to P inside its window" is never given for a closed program, nor for one with a yearless
  date. When such a program is the only timed one, the move says one of:
  - its deadline (or its last date) has passed, and the next cycle's date is not published yet;
  - its date has no year, so check the page.
- **Gone pages.** A gone program page is said to be gone.
- **The model.** The tool's description tells it to add no odds, hiring stories, or dates the messages don't state.

**Interview patterns** (`career_mock.ts`, `career_voice.ts`):
- **Gone.** A pattern or firm question whose page the last check found gone is never quoted, by text or by voice.
- **Not opened.** A pattern no check has opened gets "Unverified: a search summary of that page; no source check has
  opened the page yet."
- **Refused or failed.** A pattern whose check was blocked or errored gets "Unverified: the page could not be opened at
  the <date> source check (blocked)".
- **Voice.** The voice tag carries the same reason: "[unverified: the page could not be opened at the <date> source
  check (error); do not present it as the firm's words]".

## Demo (owner)
```
node scripts/career/check-sources.cjs --out /tmp/report.json --checks-out /tmp/checks.json   # needs network (CI has it)
node scripts/career/check-sources.cjs --from-report /tmp/report.json --write-checks packages/career-data/source-checks.json
python3 scripts/build-router-core.py --career-only && python3 scripts/build-router-core.py
deno run -A scripts/career/wo036-demo.ts path McKinsey "business analyst" "BS Economics at Rutgers, graduating May 2027"
```

## Tests
**`tests/career-source-check.test.cjs`** (11 tests, Node, a fake fetch and a virtual clock, no network; it runs in the
gate):
- C1: every status.
- C2: LinkedIn and Indeed skipped.
- C3: politeness (robots.txt first, no overlap, at least 1 s gaps, UA, GET, manual redirects, no cookie, a timeout).
- C3b: the per-site gate across subdomains and `co.uk`, and at most 8 at once even with `--hosts-at-once 100`.
- C4: the date reader on the real guide and on every form above, the UTC-12 rule and the ET case, and `closed`.
- C5: every URL in both files.
- C6: `--from-report` and `sourceStatus`.
- C7: the workflow, including SHA pins.
- C8: the committed checks file.
- C9: each review host reached through a redirect, each skipped with only robots.txt and the first page fetched. The
  hosts are `www.linkedin.com.`, `%2e`, mixed case, `media.licdn.com`, `linkedin.cn`, `linkedin.co.uk`, `lnkd.in`,
  `indeed.jobs`, `indeedjobs.com`, `secure.indeed.com`, `indeed.com.au` and `de.indeed.com.`.
- C10: robots.txt (disallow with Allow override, an agent-specific group, a 503 robots.txt, a 404 robots.txt, read
  once per origin).

**`tests/architect/wo-041-source-freshness.test.ts`** (10 tests, Deno):
- R1: past-deadline phrasing; nothing said on the day or the next UTC morning; the ET case.
- R2: no guessed date anywhere, over 22 firms x 3 roles x 6 clocks.
- R3: no "apply" move for a closed program.
- R4: the tool uses the turn's clock, and its description tells the model to add no dates.
- R5: gone program page.
- R6: gone pattern, by text and voice.
- R7: unverified labels, including the voice tag for blocked and error pages.
- R8: the bundle carries the checks.
- R9: every date form in a timeline: closed means no "apply"; still open means "apply"; a yearless date is said to have
  no year and is never given one.
- R10: the firm-guide unverified label (none run, all live, blocked, a base-rate page, once per firm for all 22).

### Planted defects
Each one-line change was applied, the two WO-041 test files were run, and the change was reverted. Both bundles were
rebuilt around the changes to 134. All 22 were caught. After reverting: 11 of 11 (Node) and 10 of 10 (Deno) passed,
and both bundles verified.

| # | Defect (one line) | File | Failing test |
|---|---|---|---|
| D1 | Indeed dropped from the never-fetch list | check-sources.cjs | C2, C9 |
| D2 | `if (false) await sleep(wait)`: no 1 s gap | check-sources.cjs | C3, C3b |
| D3 | 404/410 classed `error` | check-sources.cjs | C1, C6 |
| D4 | `<= cutoff`: the deadline day itself past | 134-career-paths.js | C4, R1 |
| D5 | the passed-deadline line left out | career_path.ts | R1, R2, R4, R9 |
| D6 | `if (false)` for closed: "apply inside its window" for a closed program | career_path.ts | R3, R9 |
| D7 | "The next cycle likely opens in <year+1>" | career_path.ts | R1, R2, R4, R9 |
| D8 | gone patterns not filtered in `firmPrompt` | career_mock.ts | R6 |
| D9 | `unverifiedNote` returns null | career_mock.ts | R7 |
| D10 | the voice prompt's gone filter removed | career_voice.ts | R6 |
| D11 | `sourceStatus` ignores `ran` | 134-career-paths.js | C6 |
| D12 | `redirect: "follow"` | check-sources.cjs | C3 |
| D13 | `licdn.com` dropped from the never-fetch list | check-sources.cjs | C9 |
| D14 | trailing dots not stripped from the host | check-sources.cjs | C9 |
| D15 | robots.txt ignored | check-sources.cjs | C3, C3b, C9, C10 |
| D16 | cutoff without the 12 h (UTC-12) margin | 134-career-paths.js | C4, R1 |
| D17 | the range separator needs spaces (`Sept. 1–Oct. 11` misread) | 134-career-paths.js | C4, R9 |
| D18 | a yearless date does not stop "closed" | 134-career-paths.js | C4 |
| D19 | `unverifiedSources` returns null | career_path.ts | R10 |
| D20 | the voice tag always says "not opened" | career_voice.ts | R7 |
| D21 | gate keyed on the host, not the site | check-sources.cjs | C3b |
| D22 | `--hosts-at-once` uncapped | check-sources.cjs | C3b |

## Measured
- **Live source check from the build sandbox: NOT_RUN.**
  - The egress proxy refuses every firm host (`CONNECT tunnel failed, response 403`), and Node `fetch` gets
    `ENOTFOUND`.
  - The checker run here (`node scripts/career/check-sources.cjs --out <file> --timeout-ms 8000`, round 1) gave 78
    URLs, all `error`, 0 reached.
  - The first real check is the `source-freshness` workflow on the pull request.
- **URLs covered:** VERIFIED, 78 unique (C5).
- **Firm-guide dates past on 2026-10-20:** VERIFIED, 7 of 7 stated dates (C4).
  - Programs closed under the new rule: McKinsey's 2 programs, Bain ACI and Evercore Europe/Asia.
  - Goldman's July 1, 2022 is past but is an opening only, so that program is not closed.
  - No yearless date is in today's data.
- **Career bundle:** VERIFIED, 2,501,167 B. The staged career artifact is 3,255,338 B against the 4,200,000 B budget
  (raw upper bound): `node scripts/career/stage-career.cjs <dir> --json`.
- **Suites (VERIFIED here, round 2):**
  - architect: 322 passed, 0 failed;
  - gate edge list: 129 passed, 0 failed;
  - staged suites: 3/3;
  - go-live, export coverage and no-secrets: 20/20;
  - bundle data, outbox kinds and the checker: 15/15.
- **`bash scripts/gate.sh` locally (round 1):** two local-only kinds of failure, none from this order.
  - Chromium refuses to run sandboxed as root: browser-runtime and 81 Playwright apply tests.
  - deno.land downloads are refused for career-typecheck.

## Not built, and why
- **Adopting a real check into `source-checks.json`.** No check could run here. After the PR's workflow run, a person
  downloads the artifact, runs `--from-report ... --write-checks ...`, rebuilds both bundles and commits. CI cannot do
  this, by design.
- **Re-collecting the data.** Gone pages and passed dates are reported, not replaced.
- **Content verification.** `live` means the page answered, not that it still says what the search summary said.
- **Requirements from a gone page** are still used as moves (only programs get the "gone" line), because WO-036/T7
  pins the move block's format. They do carry the unverified label line.
- **Day-first numeric dates (`11/10/2026` meaning 11 October).** They are read in US order. The data has none.
- **A redirect to a raw IP owned by LinkedIn or Indeed** cannot be recognized by host. No such link is in the data.
