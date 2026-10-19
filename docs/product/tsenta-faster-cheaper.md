# Tsenta's whole product, faster and cheaper (architect plan, 2026-10-19)

The owner's question: Tsenta gives 25 free applications. How do we do the same thing, and their entire product, faster and cheaper?

Labels follow `BUILD-STANDARD-TSENTA.md`: VERIFIED, VERIFIED-S (their own words, as a claim), REPORTED, ASSUMED. Competitor evidence is in `docs/competitors/`, which points to its sources.

## The honest starting point
- Tsenta has 19 named ATSes, cloud execution, every surface, and real users (VERIFIED-S).
- We have 0 real applications. The engine reaches the approval prompt only on Lever, and only against our captured forms (VERIFIED, `docs/competitors/submission-engines.md`).
- Today Tsenta beats us on everything that exists. "Faster and cheaper" is a design we can build, not something we have.

## Where we can be structurally faster and cheaper, and why they can't easily follow

### 1. Apply in the person's own browser, not in a cloud browser
- **Tsenta runs applications in its cloud.** They "continue running even after you close your browser tab" (VERIFIED-S, Chrome Web Store). So it pays for browser minutes on every application, and probably for proxies.
- **Cost per application (ASSUMED, `cost-model-applying.md`):**
  - a server browser is about $0.025-0.05;
  - ours in the person's browser is about $0.004, almost all of it model tokens.
- **The bot checks favour the person's own browser.** Every captured Greenhouse and Ashby form runs invisible reCAPTCHA Enterprise, and every Lever form runs invisible hCaptcha (VERIFIED, `tests/fixtures/forms-ci/manifest.json`). Those checks score the browser and connection they run in. The person's own browser is what they are built to pass; a datacenter browser is what they are built to catch (ASSUMED; to be measured in the owner's trials).
- **The cheap direct-API route is closed to everyone, them included.** Greenhouse's application API needs the employer's own key, and its docs say "must be proxied on your servers" (VERIFIED, `grnhse/greenhouse-api-docs`). Every candidate-side tool has to fill the real form.
- **Why they can't easily follow:**
  - If we give free applications up to the cap, a cloud competitor that matches us pays for every one. That is the "make them subsidize" lever.
  - Moving their execution into the user's browser would mean rebuilding their engine and losing "runs while your tab is closed".
- **What it costs us:** applications run only while the person's browser is open. We say that plainly, and we offer a paid cloud tier only where it is measured to work (D-003's worker pool becomes the fallback; see below).

### 2. Prepare the application before the person asks
- **One form capture per posting serves every user** (standard section 7).
- **Measured:** confirmed facts already answer 54% to 65% of required questions across two samples of real postings, and the median posting leaves 2-3 questions to ask (VERIFIED, `docs/apply/ask-once*.md`).
- **The experience:** the person answers those 2-3 questions once. After that, a matching posting is ready to approve the moment it's found.
- **Faster:** in the person's time per application. Target: under 60 seconds of their time per submitted application (NOT_RUN).

### 3. Freshness for the price of an HTTP request
- **We read employer boards through their public JSON feeds, with no browser** (2,179 live boards, VERIFIED in the harvest).
- **Polling a watched employer every 15-30 minutes costs one GET** (ASSUMED cost; conditional requests where the board supports them).
- **Tsenta claims 50,000+ pages and "inside the first 100 applicants"** (VERIFIED-S claim).
- **The race is measured, not claimed:** median minutes from going live to alert on the same employers, during the ground-truth test (standard 3.1).

### 4. One text approves a batch
- **Tsenta approves first by default** (VERIFIED-S).
- **Ours:** "yes to all 8" approves the exact payload of each application, each with its own review shown.
- **Not built:** a texted yes can't approve a batch today (REQUIREMENTS 6b).

### 5. Proof as the product
- **Every application ends SUBMITTED** (with the employer's confirmation stored), **UNKNOWN**, or **FAILED** (with the reason).
- **We publish the verified-submit rate. No competitor does** (`docs/competitors/README.md`).
- **Cost:** storage only.

## Where we cannot be cheaper (say it, never claim it)
- **Volume extensions are cheaper per application:** LazyApply at full use is about $0.0027 (ASSUMED from REPORTED prices). We beat them on relevance and proof, not price.
- **Our per-user cost is dominated by the iMessage line, not the applications:** about $1.45 per user per month at 100 users, falling to about $0.34 at 100,000 (ASSUMED, `cost-model-applying.md`). A web or extension surface costs almost nothing per user.
- **"Cheaper" stays out of all copy** until 30 days of measured cost (standard section 5).

## Their entire product, capability by capability
| Tsenta (labeled) | Our faster path | Our cheaper path | What it takes | Today |
|---|---|---|---|---|
| Watches 50K+ career pages (VERIFIED-S claim) | Watched employers polled every 15-30 min; alert when the application is already prepared | JSON feeds, no browser | Polling per watched employer; freshness measured weekly | Harvest of 2,179 boards; freshness not measured |
| Tailored resume with a diff, approve first (VERIFIED-S) | Tailoring done while the posting is new; the diff shown in the approval | One model call per posting, cached | Tailored file returned in chat (4d/4e) | Partial |
| Applies on 19 ATSes (VERIFIED) | Greenhouse, Lever and Ashby first: 1,879 of our 2,179 boards (878 / 675 / 326), open forms with no accounts. The other 300 are SmartRecruiters, behind a DataDome wall | In the person's browser | Engine binding by `name \|\| id`, per-ATS submit descriptor, upload requests | Lever reaches review; Greenhouse and Ashby do not |
| Workday and other account systems (VERIFIED-S) | The person signs in themselves in their own browser, with their own password manager; Trainee fills the rest | Same | D-013 (b), settled below | Refused at the host gate |
| Answers "in your voice" (claim) | Ask-once memory; every claim traces to a confirmed fact | Cached question mapping by meaning (WO-020) | Untraced-claim block on real forms (5e) | Replica forms only |
| Enters verification codes from the inbox (VERIFIED-S) | The person is at the browser: the code goes into the waiting page, or they text it once, never stored | No restricted Gmail scope needed | Code hand-off in the same session (gap 4) | Captcha hand-off only (PR #23) |
| Routes recruiter replies from the inbox (VERIFIED-S) | Confirmation and reply parsing from the person's own inbox, or forwarded mail | Parsing only | Inbox reader wired (9b/9c) | Module only |
| Receipt per application, failures refunded (VERIFIED-S) | Receipt with the employer's confirmation, or marked UNCONFIRMED; failures never count | Storage | Gate 5 | Receipt module; none real |
| Web, iOS, Android, extension, iMessage, WhatsApp, MCP, CLI (VERIFIED-S) | iMessage plus extension plus web; CLI exists | Extension and web cost almost nothing per user | Extension (spike below) | CLI only |
| Free: 25 applications total (VERIFIED) | See below | 25 of ours cost about $0.10 in the person's browser (ASSUMED) | Pricing gate 9 | n/a |

## The free tier we can offer (a proposal; pricing waits for gate 9)
- **Proposal:** 25 free *verified* applications, meaning the employer's confirmation is stored. Failures, UNKNOWN outcomes and hand-offs never count.
- **Also unlimited, because they cost us cents:** discovery, matching reasons and preparation.
- **Why it's stricter than Tsenta's:** their free tier counts their own "successful submissions" (VERIFIED-S); ours counts only what the employer confirmed.

## The one architecture question to settle first: can an extension keep our guarantee?
- **What the engine guarantees today:** at most one POST per application, carrying exactly the approved body. It does this by intercepting the browser's requests (Playwright). The standard makes the extension the default path (6.2).
- **The risk:** a Manifest V3 Chrome extension can't block a request by its body through `webRequest` (ASSUMED from Chrome's docs; to confirm).
- **The likely way through:** `chrome.debugger` with the DevTools Fetch domain can pause a request and read its body before it leaves (ASSUMED). The cost is a visible "debugging this browser" banner while it runs.
- **One-day spike:** an extension that pauses the submit POST on the local fixtures, compares it with the approved payload, and lets exactly one through. If it holds, the extension is the default path. If not, the desktop runner (`scripts/apply.ts --headed`, on the person's own machine and connection) is the default, and the extension fills and reads back while the person presses submit.
- **Reuse:** the helper's in-page functions are self-contained by design ("serialized by Playwright"; VERIFIED in `portal-browser-helper.cjs`), so they port to content scripts. The port itself is NOT_RUN.

## Order of work (the fastest honest path)
1. **Engine** (days): Greenhouse and Ashby binding by `name || id`, a per-ATS submission descriptor and body reader, upload requests checked by hash, and a CI dry run of every captured form.
2. **The owner's 3 real submissions per ATS** with `--headed` (gate 4 starts).
3. **Extension spike** (above). Then the extension as the default path, or the desktop runner.
4. **Muse and Dots test all of it end to end** (owner, 2026-10-19: once the architect judges the submission capabilities complete).
5. **Tsenta free-tier ground truth**, in parallel; the owner runs it (sheet below).
6. **Workday** under D-013 (b).

## Decisions taken (the owner delegated them, 2026-10-19: "whatever u believe is best")
- **D-013 settled as (b):** on account systems, the person signs in themselves in their own browser, and nothing stores a password. Option (c) still needs the owner's written amendment.
- **D-015, live interviews:** prep before, nothing during, debrief after. The live-assist guard must refuse 100% and wrongly block 0% on a 60/60 prompt set, on both brains (it scored 5/10, VERIFIED).
- **D-016, ground truth:**
  - The owner runs Tsenta's free tier himself, on roles he would genuinely take (each one is a real application to a real employer).
  - No paid tests of other competitors now.
  - The unidentified "Flint" claim is dropped from our evidence until its source is found.
- **D-003 amended:** the owner's standard makes the person's browser the default path. The self-hosted worker pool becomes the fallback, for paid tiers where it is measured to work.

## Tsenta free-tier test sheet (owner; standard section 11)
- **Before starting:** read their terms, and use the product as a normal user. No scraping.
- **The 25 applications:** about 8 Greenhouse, 6 Lever, 6 Ashby and 5 Workday, at employers our harvest also watches.

**Record for each application:**
- the role URL;
- when the posting went live, if known, and when Tsenta matched it;
- our alert time on the same posting;
- the result (submitted, failed, or stopped at a check);
- the seconds it took;
- any wrong field;
- whether the confirmation email arrived, and when;
- what the receipt contains, and whether it includes the employer's confirmation.

**Also try:**
- one role that needs sponsorship;
- one form with an odd question;
- one role that sends a verification code, with the inbox NOT connected;
- cancelling and asking for a refund.

**Then:** write the results into `docs/competitors/mass-applying.md` with VERIFIED labels and update the scoreboard.
