# How Tsenta and Simplify submit one job application, and what Trainee copies

Research for the owner's question (2026-10-20): "do deep research on exactly how tsenta and simplify submit
applications from top to bottom, and copy them... entirely focus on the exact process of submitting an application".
Read-only. Nothing was installed, signed up for, paid for or submitted.

## 0. Labels, method, limits

- **VERIFIED**: I read the primary source myself. Sources: this repo's code and docs, GitHub pages and the npm
  registry (the only external hosts this session could open).
- **REPORTED**: secondhand. That covers third parties. It also covers a vendor's own page that I saw only through a
  WebSearch extract, written "REPORTED (own page)". tsenta.com, simplify.jobs, ycombinator.com, the Chrome Web Store
  and support.greenhouse.io all failed with ENOTFOUND or a proxy 403. An extract is a search model's paraphrase.
  Quoted words may not be verbatim.
- **ASSUMED**: my inference.
- Extends `docs/competitors/tsenta.md`, `simplify.md` and `submission-engines.md`. It does not repeat them. Section 6
  lists their statements that are now wrong or stale.

---

## 1. The short answer to the owner's question

1. **No hidden API exists.** Greenhouse, Lever and Ashby each publish an application-submit API, and every one needs
   the employer's secret key (VERIFIED, §4). So a third party (Tsenta, Simplify or Trainee) has two ways in: drive the
   employer's hosted form in a browser, or don't apply at all.
2. **There are two ways to drive that form:**
   - (a) **The person's own browser.** Simplify Copilot, Trainee's extension, and Tsenta's first, desktop version.
   - (b) **A browser on the company's servers.** Tsenta now, Simplify Autopilot (ASSUMED), Massive, JobCopilot.
   (b) runs into bot checks (reCAPTCHA Enterprise, hCaptcha, DataDome) and per-employer accounts. Tsenta's own earlier
   pitch said cloud tools mean "captchas, detection, latency, and cost" (REPORTED, zerogtalent.com extract). It then
   moved to the cloud anyway.
3. **Copying Tsenta in its entirety is not possible under the owner's rules.** Its cloud path needs three things the
   rules forbid:
   - creating employer accounts with passwords it holds (D-013(c), not allowed);
   - reading codes from the person's Gmail with no human at the browser (D-021 allows only a 15-minute window);
   - some way past the bot check: an undisclosed method or vendor (D-003 forbids solvers, stealth and proxies).

   What can be copied: Simplify Copilot's mechanics, plus Tsenta's queue, receipts, inbox tracking and emailed-code
   handling. Trainee has most of this built already (§5).
4. **The fastest legitimate mass path is the person's browser, with the next applications prepared ahead.** Measured
   offline, the machine needs about 1.3 s per application (WO-031/042, VERIFIED offline). The limit is the person's
   reading time, not the browser.

---

## 2(i). The exact top-to-bottom process

### 2.1 Tsenta (YC S26; founders Agnay Srivastava and Pulkit Gupta)

**History first: Tsenta has run on two architectures.**

*Generation 1: a desktop app on the person's machine (through about January 2026).*
- The npm package `@tsenta/electron-vite-obfuscator` was published on 2025-12-12 by the maintainer "agnay"
 . It is a fork that compiles an Electron app to V8 bytecode and obfuscates it (VERIFIED,
  registry.npmjs.org). So Tsenta shipped a closed-source Electron app.
- YC's company page: a "desktop app... runs on your device, so you have granular control over every application being
  submitted in real-time" (REPORTED, own page).
- Microsoft Store: "applies to jobs right on your device" (REPORTED).
- A GitHub repo `tsenta/tsenta-desktop-windows` listed v3.3.0 on 2026-01-24 (REPORTED). It now returns 404 (VERIFIED,
  WebFetch 404).
- A talent-site profile: "We run everything locally on the user's machine", built on Electron and Playwright, because
  cloud tools mean "captchas, detection, latency, and cost" (REPORTED, zerogtalent.com extract, single source).

*Generation 2: the cloud (by the 2026 launch).*
- The mobile page: "The agent runs in the cloud, so your laptop stays closed" (REPORTED, own page).
- The Chrome Web Store listing (v3.1.10, 2026-08-25, about 10k users): applications "continue running even after you
  close your browser tab" (REPORTED, store).

**Generation 2, one application, step by step:**

1. **Posting.** One of two sources:
   - Tsenta's own database: "2M+ jobs, refreshed every couple of hours" (Launch YC), or "50,000+ career pages" (site)
     (REPORTED, own pages, conflicting).
   - The extension "detects job postings on LinkedIn, Indeed, Glassdoor, HiringCafe and company career pages and adds
     them to an application queue" (REPORTED, store).

   The extension is a clipper that feeds the cloud queue, not the filler (REPORTED). One Tsenta page says the
   extension "logs in to the ATS... queues an application in 2-3 seconds" (REPORTED, own page). That conflicts with
   the store listing.
2. **Match and prepare.** A tailored resume and cover letter, and open-ended answers "in your voice". The privacy
   policy names its model providers as Anthropic and OpenAI (REPORTED, own page).
3. **Gate.** "Review and edit before submission or choose more automated behavior in your settings". A diff view with
   an approve/edit gate (REPORTED, own pages). Auto mode exists.
4. **Open the form in Tsenta's cloud.**
   - Hosting is "Fly.io, Cloudflare" (REPORTED, privacy policy extract).
   - **No cloud-browser vendor is named.** Browserbase, Steel, Hyperbrowser and Anchor are all absent from the policy's
     list, and the policy says the list may be incomplete (REPORTED).
   - ASSUMED: their own Playwright fleet on Fly.io machines, carried over from the Electron + Playwright codebase.
   - Display modes: "Live application overlay or fully headless (replay later)" (REPORTED, AI-disclosure page).
5. **Account and login.** "Account creation, email verification & filling in OTPs on 30+ ATSs" (REPORTED, Launch YC),
   and "we even create your Workday accounts!" (REPORTED, own page).
   - How the password is generated, stored or shown to the person is **not published anywhere I could find**.
6. **Fill and upload.** "Every field, open-ended questions, the upload" (REPORTED). The mechanism is not published.
   - ASSUMED: per-ATS drivers plus an LLM for free text. Reasons: separate per-ATS landing pages (tsenta.com/
     workday-api, /teamtailor-api, /jazzhr-api, /ultipro-api), a fixed count of 28 or 29 ATSes, and a job ad asking for
     "queue-driven" backend and LLM tool-use experience.
7. **Emailed codes.** Gmail access is optional.
   - Scopes: `gmail.readonly` (read job mail and the "one-time verification codes some employers email during an
     application") and `gmail.compose` (save reply drafts) (REPORTED, privacy policy, effective 2026-08-24).
   - Gmail goes through Tsenta's own OAuth app. Older Gmail connections and all Outlook connections go through
     **Composio** (REPORTED).
   - So the "automated OTP filling" mechanism is: the person's own mailbox, read through the API. **Not** a forwarding
     address, and not a Tsenta-owned mailbox per user.
   - Not published: what happens with no inbox connected. ASSUMED: those applications fail and are refunded.
8. **Bot checks.** Not disclosed. The site says "Tsenta does not promise that automated assistance is undetectable"
   (REPORTED). No mention of solvers, proxies or stealth either way.
   - ASSUMED, strongly: on Greenhouse a cloud browser often scores low, and Greenhouse then **emails a security code**
     (§3.1). Reading that code from Gmail is how a cloud agent gets through Greenhouse without solving anything. This
     is probably why the Gmail connection matters so much to Tsenta's coverage.
9. **Submit.** Tsenta's browser clicks Submit (auto mode) or does so after the person approves (review mode)
   (REPORTED).
10. **Receipt.** "Submitted fields, open-ended answers, résumé, any cover letter used, and confirmation details"
    (REPORTED, own page). Not published: what counts as "confirmation details" (a page, an email or an id).
11. **Billing.** Only for submitted applications.
    - "Skipped matches, unapproved drafts, employer-side failures" go back to the cycle (REPORTED, pricing page).
    - API: $0.09 per submitted application, failures free, states `submitted | failed`, an optional "review before
      submit" hold (REPORTED, tsenta.com/developers).
12. **Tracking.** Inbox mail is classified (confirmations, replies, interviews, rejections). Reply drafts go into the
    person's Gmail drafts folder (REPORTED, privacy policy).

### 2.2 Simplify

**Copilot (free): the person's own browser. 600k+ users, extension v2.2.24, 8.35 MB, updated 2026-02-02 (REPORTED,
extensionauditor.com).**

1. **Posting.** Any page. Simplify's own job board and matches. The public GitHub internship and new-grad lists link
   straight to the ATS URL.
2. **Open.** The person opens the employer's application in their own Chrome. On Workday or iCIMS the person signs in
   or creates the account themselves.
   - No help article covers account creation or password fields (REPORTED, search found none). ASSUMED: Copilot
     leaves them alone.
3. **Detect.** "When you open a supported job application, Copilot detects the form automatically" (REPORTED, help
   1749022). Support is per site: "100+ portals", plus a "request autofill support" form for unsupported ones
   (REPORTED, help).
   - ASSUMED: a **hybrid**. Hard-coded per-ATS adapters for the known systems. An LLM ("Autofill all fields with AI",
     Simplify+) for "unique questions using information from your profile".
4. **Learn.** The privacy policy collects "field labels, answer options, and the values you enter or that we fill",
   plus the page URL (REPORTED, simplify.jobs/privacy).
   - ASSUMED: this is how the per-ATS field map gets trained across 600k users. It is a crowd-sourced form map.
5. **Fill.** From the profile. "Profile, resume and recent answers" are kept on the device (REPORTED, privacy).
   - Per-field toggles for phone, salary and work authorization.
   - "Continuously autofill multipage forms": it fills each page and moves on (REPORTED, help 8686025).
   - Value-setting internals are unpublished. ASSUMED: the standard native setter plus events, and DataTransfer for
     files (§3.3).
   - Reported weak spots: Workday resume upload and dropdowns done by hand; silent blanks (REPORTED, reviews).
6. **Bot checks.** These happen in the person's real browser, so invisible checks score as a person. Simplify needs no
   policy (ASSUMED).
7. **Submit.** "You still review the completed application and click the final Submit button yourself" (REPORTED, help
   8686025).
8. **Track.** Added to the tracker automatically, or the person is prompted (help articles conflict). Gmail matching is
   a beta (REPORTED). No receipt of fields sent (absent).

**Autopilot (Simplify+, beta, 20 a week, no top-ups):**
1. Pick a job on Simplify. "Autopilot opens the company's application portal, fills it in from your Simplify profile",
   can tailor the resume, and submits (REPORTED, help 1784339).
2. "Choosing Autopilot means submitting. There's no review step in between" (REPORTED, help).
   - A newer marketing page says it "queu[es] them for your review or send[s] them automatically" (REPORTED,
     simplify.jobs/ai-talent-agent). The two conflict.
3. If it is not confident, it "fails the application rather than submit something wrong", and the credit is kept. The
   person then finishes with Copilot (REPORTED, help 1787280).
4. Where the browser runs is not stated. ASSUMED: the cloud. Reasons: a hard credit cap, failures listed in a web tab,
   and beta capacity.

### 2.3 Others, briefly (only where it adds signal)
- **AIHawk** (Jobs_Applier_AI_Agent_AIHawk, 32.2k stars): now built on "invisible_playwright_mcp... Firefox patched in
  C++, the fingerprint set inside the engine" and "Built to be undetectable by anti-bot systems" (VERIFIED, GitHub).
  The best-known open-source applier went to stealth. Trainee must not.
- **OSApplyTrack** (open source, Playwright):
  - "The browser never creates accounts"; "Workday stays manual, permanently".
  - Greenhouse's emailed security code ("Greenhouse's captcha fallback") is read from an IMAP mailbox, or asked of the
    person in Telegram.
  - "CAPTCHA boxes are never answered at all".
  - Board passwords are sealed with AES-256-GCM.

  (VERIFIED, GitHub README.) This is the closest public twin of Trainee's rules.
- **workday-apply** (open source): the person completes any CAPTCHA; Workday's verification email is read with
  `gmail.readonly` or pasted in; the person clicks Submit (VERIFIED, GitHub README).
- **LazyApply**: extension in the person's tab, LinkedIn and Indeed, blocked by Indeed's captcha; LinkedIn bans
  reported (REPORTED, `lazyapply.md`).
- **Massive**: cloud; employer replies routed through an address Massive controls (REPORTED, `massive.md`).
- **JobCopilot**: server-side on company career pages, 24/7 (REPORTED, `jobcopilot.md`).
- **Cloud browser vendors** sell the bypass as a feature. Browserbase Developer is $20/month, with "Auto Captcha
  Solving" and proxies included ($12/GB after 1 GB) (REPORTED, Browserbase docs via capterra and tinyfish extracts).
  ASSUMED: a cloud applier on such a vendor is solving captchas whether it says so or not.

---

## 2(ii). Per-ATS table

Legend: P = the person, T = Tsenta's cloud, S = Simplify Copilot, Tr = Trainee's extension (the person's tap).

| ATS | Open / login | Emailed code | Bot check | File upload | Multi-page | Public submit API without the employer's key? | Who clicks Submit |
|---|---|---|---|---|---|---|---|
| **Greenhouse** (job-boards.greenhouse.io; boards.greenhouse.io embeds) | Public, no account | **Yes, as the captcha fallback.** Depending on per-board spam sensitivity and the reCAPTCHA score, an applicant "may be asked to verify their email" (REPORTED, Greenhouse support 115005448066). June 2024: "allow candidates to resubmit using a code after they fail a CAPTCHA test" (REPORTED, release notes). MyGreenhouse sign-in codes are single-use; only the newest works; a new one after 10 min (REPORTED) | reCAPTCHA Enterprise, score-based, one Greenhouse-wide sitekey (VERIFIED, our fixtures). Real Talent fraud flags: IP, email, phone; CLEAR ID (REPORTED) | Unnamed `#resume` input behind Attach / Dropbox / Drive / paste (VERIFIED). Trainee: DataTransfer (VERIFIED code) | No | **No.** `POST boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}` needs HTTP Basic with the board's API key, "should be proxied by your own servers" (VERIFIED, grnhse docs) | S: P. T: T. Tr: P's tap |
| **Lever** (jobs.lever.co) | Public | None seen (VERIFIED fixtures) | hCaptcha invisible, run at the click (VERIFIED markup). For a suspicious user, "they will not be able to use the Current Location drop down unless they solve the hCaptcha puzzle" (REPORTED, help.lever.co). Even after a human solved it, a retained automated Chromium got a "verification error" (REPORTED, JobTomatik #539). Cloudflare beacon on load (VERIFIED, WO-042) | `resume` in a native multipart POST (VERIFIED) | No | **No.** `POST /v0/postings/SITE/ID?key=APIKEY`; "a Super Admin of your account can generate" the key (VERIFIED, lever/postings-api) | S: P. T: T. Tr: P's tap. WO-039 cloud: Lever only, gated |
| **Ashby** (jobs.ashbyhq.com) | Public | None seen | reCAPTCHA Enterprise (VERIFIED). Spam protection: None, Permissive (default), Less permissive, Strict; "might cause Ashby to reject applications from actual candidates" (REPORTED, docs.ashbyhq.com). Fraud detection: device, IP, email, phone (REPORTED). Per-candidate application limits (VERIFIED fixtures) | GraphQL `ApiCreateFileUploadHandle` (VERIFIED, WO-042 live run 5) | No | **No.** `applicationForm.submit` needs a key with `candidatesWrite` over Basic auth (REPORTED, developers.ashbyhq.com extract) | S: P. T: T. Tr: P's tap |
| **Workday** (*.myworkdayjobs.com) | A Candidate Home account per employer tenant (email + password). If the employer does not require an account, Workday sends a "candidate verification email" instead (REPORTED, Workday admin guide) | Email verification link at account creation (REPORTED) | CAPTCHA at signup on some tenants (REPORTED, workday-apply). 2026R1 "fraudulent application detection" signals (REPORTED, Workday community) | Upload, then Workday parses the resume into work history (VERIFIED on TEST tenants, WO-048) | **Yes**, 5-7 steps, each "Save and Continue" sends a draft | No public candidate API. Undocumented `/wday/cxs/` JSON (REPORTED) | S: P. T: T (creates the account). Tr: P signs in, approves each page, taps Submit |
| **iCIMS** | A profile per employer. Login by the email's **one-time code**, no password, on its community and newer portals (REPORTED, community.icims.com); older portals ASSUMED to use passwords | Yes, as login | Fraud strategy, OTP "confirm a candidate controls the account" (REPORTED, icims.com) | ASSUMED standard | Yes | No | S: P (accuracy ~50%, REPORTED, unattributed). T: claimed. Tr: none (host not in the manifest) |
| **SmartRecruiters** | Public, but behind DataDome | ASSUMED | DataDome 403 on 6/6 captures (VERIFIED) | ASSUMED | Short | No | S: claimed. Tr: hand the link to the person |
| **Taleo** (*.taleo.net) | An account per employer, with a password (REPORTED) | ASSUMED at signup | ASSUMED | ASSUMED | Yes, long | No | S: P (~40%, REPORTED). T: not named on any Tsenta page found |
| **SuccessFactors** | An account per career site (REPORTED, OSApplyTrack signs in with a person-made login) | ASSUMED email verification | ASSUMED | ASSUMED | Yes | No | T: named on the dev page in one extract, absent in another (conflicting) |
| **Gusto** | Gusto's own job board: "applicants apply directly"; no account found (REPORTED, support.gusto.com). Gusto the company hires on Greenhouse | none found | not found | resume and cover letter (REPORTED) | No | No | Not named by Tsenta. Trainee: not recognised (host not in the manifest) |

**What "no captcha solving, stealth or proxies" costs Trainee in coverage:**
- **In the person's browser, close to nothing** (ASSUMED until A6 measures it). Invisible checks score a real person.
  The occasional Greenhouse code goes to the person, who is present.
- **In the cloud, most of the market is closed:**
  - Greenhouse and Ashby submit from page script, and both score the click.
  - Lever's hCaptcha challenges servers.
  - SmartRecruiters is a DataDome wall.
  - Workday, iCIMS, Taleo and SuccessFactors need accounts.

  WO-039 already concluded the cloud reaches Lever only. Unattended overnight volume like Tsenta's (600-4,500 a month)
  is therefore off the table. Volume is bounded by the person's minutes: the target is 60 per 30 minutes (WO-042),
  which is not yet measured live.

---

## 3. How it works mechanically (the parts that are not secret)

### 3.1 Greenhouse's emailed code is a captcha fallback, not a login
- Greenhouse decides per board (its spam-sensitivity setting) and per applicant (the reCAPTCHA score).
- A low score gets a visible captcha, and/or "verify their email" with a code (REPORTED, support 115005448066 and the
  2023 and June 2024 release notes).
- Consequence for Trainee:
  - In the person's browser it should be rare (ASSUMED; A6 must count it).
  - In a cloud worker it should be common (ASSUMED). Reading that code from Gmail is Greenhouse's designed path for
    humans who fail the check. Using it from a server to get past the check is circumvention in effect. That is an
    owner question (§7, Q2).
- `submission-engines.md` gap 5 had this as "REPORTED, unconfirmed". It is now confirmed as the captcha fallback.

### 3.2 Discovery and form URL
- Postings come from the ATS public board APIs:
  - Greenhouse `boards-api.../jobs?questions=true` publishes the full question schema (VERIFIED, our planner);
  - Lever postings;
  - Ashby `posting-api/job-board/{name}` (REPORTED).
- Only Greenhouse publishes the form schema. Lever, Ashby and the others must be read from the page (VERIFIED,
  OSApplyTrack; our fixtures).
- Trainee already does this: board harvest, and WO-078 queues each posting at its board's own form.

### 3.3 Setting values so React, Angular and Workday accept them (all VERIFIED in `extension/src/dom.ts` unless marked)

| Need | Technique | Trainee |
|---|---|---|
| Text in React/Angular inputs | The prototype's native `value` setter, then bubbling `input` and `change` events. React ignores a plain `el.value=` (VERIFIED, facebook/react#10135) | `dom.ts:56-59` |
| Searches that listen to `keydown` (Lever location, Greenhouse location) | Key by key: keydown, keypress, input(insertText), keyup. The setter alone does not trigger a lookup (VERIFIED, Lever's `retrieveLocations.js`, WO-042 live run 10) | `dom.ts:101-119` |
| react-select comboboxes (Greenhouse) | Open through the widget's own toggle, read the employer's options, pick only a named option. `.fill()` does not open the menu (VERIFIED, lowriskbtc README; WO-042) | `driveWidget`, live 37/42 |
| Place autocompletes | Type, wait for the employer's list, click only an exact city/state match | `drivePlace` |
| File upload | `new DataTransfer()`, `items.add(new File(...))`, `input.files = dt.files`, then a `change` event. The bytes are hashed before the click | `dom.ts:255, 943` |
| Workday | `data-automation-id` wrappers, listbox buttons, search prompts with pills, month/day/year spinbuttons, repeating rows, page-by-page Save and Continue | `readWorkday`, `workdayAddRow`; real tenant NOT_RUN. Risk: some tenants need trusted clicks |
| React re-hydration wiping values | Set once more after the rest | WO-042 run 4 |
| Trusted vs synthetic | Chrome fires *trusted* change events on a scripted radio click. Trainee ignores edits while it is filling | `content.js` `busy` guard |

### 3.4 Submit, confirm, receipt (the category floor, and Trainee's)
- **Who clicks.**
  - Simplify Copilot: the person.
  - Tsenta and Autopilot: their browser.
  - Trainee: the site's own Submit, clicked by the extension in the same task as the last re-check, only after the
    person's trusted tap on a hash-bound card (VERIFIED, WO-031).
- **How success is confirmed.**
  - Everyone reads the thank-you page.
  - Tsenta adds "confirmation details" (REPORTED).
  - Trainee: page text and URL, plus screenshots before and after; "confirmed" in the database only from the
    employer's email (WO-032 `career_apply_confirm_as`, VERIFIED code).
  - Workday employers often send no email. Candidate Home "already applied" is the proof there (REPORTED, loopcv).
- **Duplicates.**
  - Trainee: one per posting, one per company per 30 days, never a retry after the click, and `unknown_outcome`
    counted as applied (VERIFIED, WO-031 SQL).
  - Simplify: tracker duplicates (REPORTED).
  - Tsenta: nothing published.
  - Ashby and OpenAI cap applications per candidate (VERIFIED fixtures).
- **Caps.**
  - Tsenta: monthly, 600 / 1,500 / 4,500 a cycle (REPORTED, own page).
  - Simplify Autopilot: 20 a week.
  - Trainee: 25 a day by default, the person may raise it to 50 (D-011).

### 3.5 Throughput and cost per application

| | Claim | Verifiable? |
|---|---|---|
| Tsenta | "Queues an application in 2-3 seconds"; "70% of Fortune 500 roles in under 2 minutes"; Starter $19 / 600 a cycle, Pro $39 / 1,500, Power $99 / 4,500, about $0.022-0.032 each; 25 free; API $0.09 each | Prices REPORTED (own page). Speed and success rate: no independent measurement anywhere |
| Simplify | Copilot $0. Autopilot about $0.46 each at full use of $39.99 a month | Prices REPORTED (help). No published accuracy or success rate |
| Trainee extension | About 1.3 s machine time from card to employer answer; precision 100%, coverage 95.6-96.1% live on 17 real pages (never sent) | VERIFIED offline and live-fill. **0 real submissions** (ASSUMED from PLAN-2026-10-20 A6 still open; check the database) |
| Self-hosted cloud | About $0.0002 a browser run (costs.md, ASSUMED) | NOT_RUN |

**Failure modes users report:**
- **Tsenta:**
  - App Store 3.4 from 90 ratings: "only about 1% of the jobs shown actually matched"; AI mistakes "no option to
    correct".
  - Google Play 3.0 from 36: "resume... hallucinated". The developer agreed it "shouldn't invent details".
  - (REPORTED, store extracts.)
  - No reports found of bans, duplicates or captcha failures. That is an absence, not proof.
- **Simplify:**
  - silent blanks;
  - carry-over text from another application;
  - weak on Workday, iCIMS and Taleo;
  - refund refusals.
  - (REPORTED, `simplify.md` §7.)

---

## 4. Legal and ATS terms

- **Greenhouse.** The submit API needs the board's API key over Basic auth. "Any form posts should be proxied by your
  own servers"; a direct POST "would reveal your secret key" (VERIFIED, grnhse/greenhouse-api-docs). The key is the
  employer's. A third party has no lawful way to get one. The hosted form "has built-in spam protection measures"
  (VERIFIED).
- **Lever.** "To use the POST API, you need an API key, which a Super Admin of your account can generate" (VERIFIED,
  lever/postings-api). It is rate-limited to 2 POSTs per second, with 429s (VERIFIED).
- **Ashby.** `applicationForm.submit` needs a key with `candidatesWrite`. Keys start with no permissions (REPORTED,
  developers.ashbyhq.com via extracts).
- **So:** every third party, Tsenta and Simplify included, submits through the hosted form as the candidate. That is
  a candidate using a tool on a public form. It is not an API integration. The legal exposure is the ATS's site terms
  and the employer's spam settings, not an API contract (ASSUMED; counsel for the owner).
- LinkedIn's User Agreement 8.2 bans automation (REPORTED, `linkedin-ai.md`). Tsenta's extension *reads* LinkedIn,
  Indeed and Glassdoor pages to queue jobs. Trainee never touches them (CLAUDE.md).

---

## 2(iii) / 5. The copy plan: the minimum steps for one application, mapped to the repo

These are Simplify Copilot's mechanics plus Tsenta's queue, receipts and codes, under Trainee's rules. Built = on
trunk (VERIFIED by `git log`); Missing = not built.

| # | Step | Trainee file(s) | State |
|---|---|---|---|
| 1 | Posting and the form's own URL from public board APIs (no LinkedIn or Indeed) | board harvest (WO-006/017/037), `career_postings`; WO-078 queues at the board's own form | Built |
| 2 | Queue from chat or the panel | `queue_applications` (WO-066); panel "Add Trainee's picks" (`extension/panel.js`) | Built |
| 3 | Prepare ahead, read-only, in hidden tabs; ask each open question once | WO-054 (`answerOnceQuestions`, `questionsToStore`) | Built |
| 4 | Open the employer form in the person's Chrome | `extension/background.js` queue; manifest content scripts (Greenhouse, Lever, Ashby, Workday) | Built. **Missing: iCIMS, Taleo, SuccessFactors, SmartRecruiters, Gusto hosts**; they should show "open it yourself" instead of nothing |
| 5 | Account pages: the person signs in or creates the account; Trainee never reads, fills or clicks them (D-013(b)) | `dom.ts workdayAccountPage`, `emailFirstSignIn` | Built (Workday). Missing for iCIMS, Taleo, SuccessFactors |
| 6 | Read the form and plan answers from confirmed facts only (D-007) | `scripts/career/page-functions.cjs`, `form-bind.ts`, `_shared/career_apply.ts planBatch`, `question_map.ts` | Built. Fresh-sample wrong rates still 1.2-4.9% on the planner (PLAN B5) |
| 7 | Fill (native setter, key by key, widgets, places, DataTransfer) and read back | `extension/src/dom.ts fill`, `drivePlace`, `driveWidget`, `readValue` | Built. Workday on a real tenant NOT_RUN |
| 8 | Card of the exact payload; the person's trusted tap bound to its hash | `apply_core.ts reviewPayload`, `approvalHash`; `panel.js` | Built |
| 9 | Record the start (caps, once-only, cooldown) | `career_apply_extension_begin_own` (migration 20261021000000) | Built |
| 10 | Re-check and click the site's own Submit in one task | `content.js` | Built |
| 11 | **Emailed code after the click** (Greenhouse fallback, Workday or iCIMS verification) | today `cardOutcome` says "Finish it yourself on the page" and the attempt ends `needs_user` | **Missing (the main gap):** (a) the panel names the code wait and keeps observing the same tab until the confirmation shows, so the person types the code from their own inbox and the receipt still ends confirmed; (b) optional, only with the owner's yes: read the code with `gmail.readonly` under D-021's 15-minute window (`_shared/gmail_code_window.ts`, reused from `agent-exec`) and type it into the page, never into chat. (a) alone needs no vendor and no new scope |
| 12 | Outcome and proof (screenshots, confirmation text and id, times) | `outcomeAfterClick`, `evidenceRecord`, `career_apply_finish_own` | Built |
| 13 | Employer email turns "sent" into "confirmed" | WO-032 `career_apply_confirm_as`; career-proactive mail reader | Built in code; live NOT_RUN (waits on the deploy) |
| 14 | Ship it: deploy trunk, installable extension, store listing | WO-062 (owner's word), WO-063, Chrome Web Store ($5, owner) | **Missing (owner)** |
| 15 | **One real application, then 10 (PLAN A6)** | — | **Missing. Nothing above is proven until this runs** |

**After it works, speed (in this order, all already designed):**
1. Prepare N+1 and N+2 while the person reads N (WO-042 §2, steps F-I).
2. Measure the person's seconds per card live.
3. Count Greenhouse codes per 100 applications in the person's browser.
4. Only then consider the Lever-only cloud canary (PLAN A7).

**Vendor costs avoided by staying in-house:**

| Vendor | What it would cost | Trainee instead |
|---|---|---|
| Cloud browser (Browserbase) | ~$0.007-0.01 per application ($20-99/month plus $0.10-0.12 per browser-hour) | The person's Chrome: $0. Self-hosted VM (€11/month) only for the Lever canary |
| Captcha solving and proxies (bundled by such vendors; ~$10-12/GB for proxies) | Forbidden anyway | The person's browser |
| Composio (Tsenta's mail connector for Outlook) | Per-seat pricing, not checked | Own `gmail-oauth` (already built), or a forwarding address |
| Google CASA assessment for `gmail.readonly` | REPORTED $540-4,500 a year, about 4-8 weeks, yearly re-validation; unverified apps capped at 100 new users | **Unavoidable if Trainee reads Gmail beyond 100 users.** `gmail-oauth/career.ts` already requests `gmail.readonly` (VERIFIED). Avoid it by letting the person type codes (step 11a) and confirming by forwarded mail |
| Per-application LLM | Tsenta uses Anthropic and OpenAI | Rules plus `gpt-5-mini` only for essays (D-002) |

---

## 6. Where teammates' or the owner's beliefs are wrong or stale

1. **"Workday not started": wrong.**
   - WO-048 is merged (PR #81, f9ecf865). It fills Workday page by page, with a tap per Save and Continue and a
     separate tap for Submit.
   - On 4 independent sealed TEST tenants: 91.9-92.7% filled, 0 wrong, every tenant reached review.
   - Real Workday is NOT_RUN. Account creation is deliberately out of scope (D-013(b)).
2. **"Tsenta's $19 buys 600 applications": true as a claim, unproven as delivery.**
   - The pricing page (via extracts, consistent across 3 searches) says Starter is $19 for 600 per 30-day cycle; the
     JSON-LD reads "600 applications per 30-day cycle".
   - But Tsenta's own LazyApply comparison lists *credit packs* at $19 for 200, $39 for 600 and $99 for 2,000
     (REPORTED). Its API charges $0.09 each, about 3 times the consumer rate.
   - 600 a month is 20 a day, every day, from matches the person accepts. Store reviews say about 1% of matches fit.
     ASSUMED: the price works only because most users never use the allowance.
   - Not verifiable without an account (D-016: the owner's free-tier run).
3. **"Copy Tsenta entirely".** Tsenta's cloud path depends on creating accounts with stored passwords, on reading
   Gmail, and on an undisclosed way through bot checks. Each one collides with D-013, D-003 or D-021. The part worth
   copying is already the plan: the extension, with Tsenta's queue, receipts and inbox around it.
4. **"Tsenta runs in its own cloud" (tsenta.md).** True now. It began as an on-device Electron + Playwright app. Its
   own earlier pitch is the argument for D-017.
5. **`docs/competitors/README.md` "kills the launch" #2** (the engine cannot reach approval on Greenhouse or Ashby) is
   stale for the extension path. The extension binds by id, reads Ashby's GraphQL and fills Greenhouse live at 100%
   precision (WO-042 live run 13). It remains true for the old desktop engine `scripts/apply.ts`.
6. **WO-039's header says "built on `wo/039-cloud-worker` (not merged)".** It is merged (343c9815), with the kill
   switch off.
7. **`submission-engines.md` gap 5** marks Greenhouse codes "REPORTED, unconfirmed". They are Greenhouse's documented
   captcha fallback (§3.1).
8. **The idea of an "API shortcut".** None exists for third parties (§4).

---

## 7. Open questions only the owner can answer

1. **Go live.** The word on the deploy commit (WO-062). Load the extension unpacked or pay the $5 for the Chrome Web
   Store. Then run the first real application on a posting he genuinely wants, then 10 (PLAN A3-A6). Everything else
   is theory until then.
2. **Greenhouse's emailed security code.**
   - (a) In the person's browser, may the extension read it from the person's Gmail (D-021, 15 minutes, never stored,
     never in chat) and type it into the page? Or must the person always type it?
   - (b) Is a *cloud* worker allowed to take Greenhouse's code path at all? It is Greenhouse's path for humans who
     fail the bot check. Architect's view: no, because it defeats the check's purpose.
3. **Google verification.** Is Trainee's Google OAuth app verified for `gmail.readonly` (restricted, needs CASA)? If
   not, accept the 100-new-user cap, pay for CASA (~$540-4,500 a year, REPORTED), or move confirmations and codes to a
   forwarding address the person sets up.
4. **Accounts.** Stay on D-013(b), where the person creates and signs in to every Workday, iCIMS, Taleo or
   SuccessFactors account? Or write the D-013(c) amendment (a generated per-employer password in the Vault)? Tsenta's
   coverage advantage on Workday is exactly this.
   - iCIMS's code-only login (REPORTED) may fit D-021 with no password at all. Does D-021 cover sign-in codes for
     employer portals?
5. **The daily number** (PLAN A8: 15, or 25/50, or "1000").
6. **Ground truth.** Spend the Tsenta free tier (25 applications, D-016) on real roles and watch the Gmail inbox
   during each run. That alone answers how Tsenta passes Greenhouse: are security codes emailed and consumed?
   Optionally one month of Simplify+ to see whether Autopilot runs with Chrome closed.
7. **Auto mode.** Confirm the rule stands: no application without the person's approval of its exact payload. A
   batch approval of exact payloads is fine; Tsenta's and Autopilot's no-review mode is not.

---

## 8. Sources

**Fetched and read by me (VERIFIED):**
- registry.npmjs.org/@tsenta/electron-vite-obfuscator (maintainer agnay, 2025-12-12)
- github.com/tsenta/tsenta-desktop-windows (404 now)
- github.com/lever/postings-api
- github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_applications.md
- github.com/facebook/react/issues/10135
- github.com/feder-cr/Jobs_Applier_AI_Agent_AIHawk
- github.com/CryptoJones/OSApplyTrack
- github.com/amansingh-a11y/workday-apply
- github.com/lowriskbtc/job-apply-automation
- github.com/npsharma03/job-autofill-public
- This repo:
  - `extension/manifest.json`, `extension/src/dom.ts`, `extension/src/apply_core.ts`
  - `supabase/functions/_shared/career_apply.ts`, `_shared/gmail_code_window.ts`
  - `supabase/functions/gmail-oauth/career.ts`, `agent-exec/index.ts`
  - WO-031, WO-039, WO-042, WO-048
  - `DECISIONS.md`, `PLAN-2026-10-20.md`, `costs.md`
  - `git log`

**Through search extracts only (REPORTED):**
- Tsenta:
  - https://tsenta.com/pricing
  - https://tsenta.com/privacy
  - https://tsenta.com/ai-disclosure
  - https://tsenta.com/mobile
  - https://tsenta.com/developers
  - https://developers.tsenta.com/
  - https://docs.tsenta.com/product/getting-started
  - https://tsenta.com/blog/tsenta-vs-lazyapply
  - https://tsenta.com/auto-apply
  - https://tsenta.com/best-auto-apply-chrome-extensions-jobs
- Tsenta, third parties and stores:
  - https://www.ycombinator.com/companies/tsenta
  - https://www.ycombinator.com/launches/SBV-tsenta-your-ai-career-agent-that-applies-to-jobs-lands-you-interviews
  - https://www.ycombinator.com/companies/tsenta/jobs/hYAeFGp-founding-engineer
  - https://chromewebstore.google.com/detail/tsenta/momaobilceffibifldnhndcehhdjgaob
  - https://apps.apple.com/us/app/tsenta/id6760728258
  - https://play.google.com/store/apps/details?id=com.tsenta.tsenta
  - https://apps.microsoft.com/detail/xpfchl9mhtrrk4
  - https://zerogtalent.com/ai-companies/tsenta
  - https://www.loopcv.pro/directory/tsenta/
  - https://jobsaicopilot.com/tsenta-ai-review/
- Simplify:
  - https://help.simplify.jobs/articles/1784339-getting-started-with-autopilot
  - https://help.simplify.jobs/en/help/articles/1787280-applying-to-a-job-with-autopilot
  - https://help.simplify.jobs/articles/8686025-manage-autofill-settings-in-the-simplify-extension
  - https://help.simplify.jobs/articles/1749022-installing-and-setting-up-copilot
  - https://simplify.jobs/privacy
  - https://simplify.jobs/ai-talent-agent
  - https://simplify.jobs/copilot
  - https://extensionauditor.com/scan/simplify-copilot-autofill-job-applications-job-tra-pbanhockgagggenencehbnadejlgchfc
- Greenhouse:
  - https://support.greenhouse.io/hc/en-us/articles/115005448066-Invisible-reCAPTCHA
  - https://support.greenhouse.io/hc/en-us/articles/26913968581275-Release-Notes-June-2024
  - https://support.greenhouse.io/hc/en-us/articles/18529082909979-Release-Notes-2023-September-8
  - https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates
- Ashby:
  - https://developers.ashbyhq.com/reference/applicationformsubmit
  - https://docs.ashbyhq.com/job-board-application-spam-protection
  - https://www.ashbyhq.com/product-updates/introducing-fraudulent-candidate-detection-and-management-to-help-you-focus-on-legitimate-candidates
- Lever:
  - https://help.lever.co/hc/en-us/articles/20087243347741-Configuring-your-Lever-application-form
  - https://github.com/TheHighBrid/JobTomatik/issues/539
- Workday:
  - https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/career-sites/gtv1538650489786.html
  - https://community-content.workday.com/en-us/public/feature-release/workday-success-plans--feature-release-reviews/2026R1-Feature-Release-Review-Webinars/2026R1-Talent-Acquisition.html
  - https://www.loopcv.pro/guides/workday-application-submitted-no-email/
- iCIMS:
  - https://community.icims.com/s/login-page
  - https://www.icims.com/company/newsroom/frauddetection/
- Gusto: https://support.gusto.com/article/210909121602053
- Google CASA and OAuth:
  - https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/
  - https://bright-softwares.com/blog/en/google-workspace/the-50000-gmail-add-on-myth-what-google-s-casa-certification-really-costs
  - https://deepstrike.io/blog/google-casa-security-assessment-2025
  - https://support.google.com/cloud/answer/15549945
- Browserbase:
  - https://docs.browserbase.com/guides/plans-and-pricing
  - https://www.tinyfish.ai/blog/browserbase-pricing

**Unreachable from this session:** tsenta.com, simplify.jobs, ycombinator.com, chromewebstore.google.com,
support.greenhouse.io, developers.ashbyhq.com, reddit.com, news.ycombinator.com (ENOTFOUND or proxy 403). The GitHub
search API was blocked; repo pages opened.
