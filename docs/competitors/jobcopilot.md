# JobCopilot: teardown and Trainee targets (build standard, 2026-10-19)

Follows `docs/product/BUILD-STANDARD-TSENTA.md`: labels, capability inventory, parity and better targets per feature,
cost notes, what the competitor lacks, a scoreboard, a ground-truth test plan and what Trainee must change.

JobCopilot is the closest of the four volume tools to Trainee's own design choice: it applies on **company career
pages**, not job boards, and offers a review-before-send mode. That makes its failures the most directly relevant.

---

## 0. Labels and method

**Labels (the standard's three, used exactly):**
- **VERIFIED** = read on a live page or measured in our own runs, source given.
- **REPORTED** = a third party, a search extract, or an earlier internal doc says it; not checked by us.
- **ASSUMED** = an inference. A hypothesis to test, never a fact to build on.

**What could be opened (accessed 2026-10-19):** nothing live. `WebFetch` on jobcopilot.com returned `ENOTFOUND`;
`curl` through the agent proxy returned `403` on CONNECT for every host tried. Every external fact below is a
**search-engine extract of the cited URL**, labelled REPORTED. Source tags:
- `[vendor]` JobCopilot's own page, FAQ, press release, partner landing page or Trustpilot reply, as quoted in a
  search extract;
- `[store]` Trustpilot, Chrome Web Store tracker, as quoted in a search extract;
- `[db]` company databases (Prospeo, YourStory company page);
- `[3P]` independent-looking review or press;
- `[rival]` written by a company selling a competing tool (FastApply, LoopCV, Scoutify, Scale.jobs, Jobscan, Wobo,
  Resumly, JobHire, Adzuna's own tools, Jobsolv, 6figr/JobGPT, The Interview Guys' affiliate pages and similar).

Facts about Trainee come from `docs/product/REQUIREMENTS.md` and `docs/product/cost-model-applying.md`.

**What we could not check:** the pricing page totals (it quotes prices per day only [J1]); the terms and refund text
(described secondhand, conflicting); how applications are submitted (cloud browser, extension, or direct HTTP); which
ATSes it fills; whether the "500,000+ career pages" figure is real (its own 2024 press release says 50,000 companies).
The session's shared web-search budget ran out before searches on JobCopilot's help center for captcha, code and
login handling.

**Sources:**
- [J1] jobcopilot.com/pricing (as described by review extracts: "from $0.93 per day", "from $1.05 per day", FAQ "Our plans start at $8.90") `[vendor via 3P]`
- [J2] accessnewswire.com/newsroom/... "JobCopilot Revolutionizes Job Hunting with Automated Job Applications" (2024-06-10) `[vendor press release]`
- [J3] Partner landing pages: 4dayweek.io/auto-apply ; weworkremotely.com/career-services/job-copilot ; remote100k.com/jobcopilot ; euremotejobs.com/for-job-seekers/ ; nodesk.co/remote-job-automation/ ; girlboss.com/pages/jobcopilot ; woodyjobs.com/automate-your-job-search-jobcopilot `[vendor, white-label/affiliate]`
- [J4] trustpilot.com/review/jobcopilot.com (and ie., au., at., dk., fi., nl., nl-be., no., se. mirrors), including company replies `[store]`
- [J5] blog.fastapply.co/jobcopilot-review-2026 ; blog.fastapply.co/set-it-and-forget-it-ai-job-application-tools-2026 `[rival]`
- [J6] dreamworkhq.com/blog/jobcopilot-review `[3P]`
- [J7] wobo.ai/blog/jobcopilot-review/ ; usesprout.com/blog/jobcopilot-review-pricing-alternatives ; jobhire.ai/blog/jobcopilot-review ; resumly.ai/answers/jobcopilot-review ; resumly.ai/alternatives/jobcopilot-alternatives `[rival]`
- [J8] careery.pro/blog/ai-job-search/jobcopilot-review (terms "checked on October 9, 2026") `[3P; affiliation unclear]`
- [J9] blog.loopcv.pro/jobcopilot-review/ ; loopcv.pro/directory/jobcopilot/ `[rival]`
- [J10] jobscan.co/blog/jobscan-vs-jobcopilot/ `[rival]`
- [J11] prospeo.io/c/jobcopilot ; yourstory.com/companies/jobcopilot ; mexc.com/news/820921 (press-style article) `[db]`, `[3P]`
- [J12] grabjobs.co interview with Emmanuel Crouy ; amp.kr-asia.com (GrabJobs raises $930K) ; e27.co GrabJobs spotlight `[3P]`
- [J13] extscope.org/extension/bnnacanndojemikeabbdejlamlecikcn ; extensionauditor.com/scan/jobcopilot-bnnacanndojemikeabbdejlamlecikcn ; chromeboard.com/extension/jobcopilot-... `[store tracker]`
- [J14] adzuna.co.uk/blog/jobcopilot-review-alternatives/ `[rival]`
- [J15] blog.theinterviewguys.com/?p=10535 ; resumejudge.com/blog/jobcopilot-review/ ; jobsolv.com/blog/jobcopilot-review-2025-legit-ai-tool-or-red-flag ; workshiftguide.com/jobcopilot-review-2026/ ; 6figr.com/blog/jobcopilot-review-is-it-worth-your-money-in-2026-632 `[3P / rival]`
- [J16] aixploria.com/en/jobcopilot-ai/ ; navtools.ai/tool/jobcopilot ; shyft.ai/tools/jobcopilot ; techloy.com/jobcopilot-alternatives-... `[3P directories]`

---

## 1. What the product is

| Item | Finding | Label |
|---|---|---|
| Company | Singapore-headquartered, founded 2024; CEO and co-founder Emmanuel Crouy, who previously founded GrabJobs (a Singapore recruitment-automation platform, founded 2016); a CTO and co-founder listed as K. M. Tin. The Chrome extension's publisher is NEXTWAVE LABS PTE. LTD. | REPORTED `[db]` [J11], `[3P]` [J12], `[store]` [J13] |
| Funding | "Has never raised funding" (Prospeo), with an "estimated valuation of $2,000,000" (aggregator estimate). GrabJobs, the founder's earlier company, raised about $930K. | REPORTED `[db]` [J11], `[3P]` [J12]; unverified |
| Launch | Press release 2024-06-10: "automates job applications for over 50,000 companies". | REPORTED `[vendor]` [J2] |
| Users | "More than 10,000 active paying users globally" (one article). No other figure. | REPORTED `[3P]` [J11], unverified |
| Trustpilot | **2.1 from 98 reviews** (early October 2026; 63 in the last twelve months; 55% one-star, 10% two, 5% three, 1% four, 29% five) [J5, rival]. Older snapshots: 4.2 from 113, 4.4 from 87, 3.0 from 106 [J7, J15]. Trustpilot's own AI summary (as quoted): "most reviewers were unhappy", "the subscription and cancellation process is extremely frustrating", the AI "frequently generat[es] irrelevant job matches, useless cover letters, and highly inaccurate resume details", and "some people mentioned that the automation features saved them considerable time every single week". | REPORTED `[store]` [J4], `[rival]` [J5]; snapshots conflict, the newest is the lowest |
| Chrome Web Store | Extension id bnnacanndojemikeabbdejlamlecikcn: 4.4 from 25 public reviews, about 10,000 users, version 1.5.26/1.5.27, last update 2026-02-11. | REPORTED `[store tracker]` [J13] |
| App stores | No iOS or Android app found. | REPORTED (absence in search) |
| BBB | Not searched (budget); none found incidentally. | unknown |
| Surfaces | Web dashboard; Chrome extension ("designed to assist when you're on an employer's application page", company reply on Trustpilot [J4]). | REPORTED `[vendor]` [J4] |
| Distribution | White-label or affiliate "auto apply" pages on remote-job boards and media: 4 Day Week, We Work Remotely, Remote100k, EU Remote Jobs, NoDesk, Girlboss, Woody Jobs [J3]. JobCopilot also publishes "best alternative" pages against LazyApply, AIApply and LoopCV [L17 in `lazyapply.md`]. | REPORTED `[vendor]` [J3] |
| How it makes money | Subscriptions, no free plan, no trial, payment details required to start [J5]: **Premium** "from $0.93 per day", 1 copilot, up to 20 applications a day; **Elite** "from $1.05 per day", 3 copilots, up to 50 a day; weekly, monthly and quarterly billing; FAQ "Our plans start at $8.90" (weekly) [J1]. Monthly estimates by reviewers: $28-39 Premium and $31-56 Elite [J6]; $39 / $59 [J7]; $38.60 / $55.90 from weekly rates of $8.90 / $12.90 [J7]; $19.90 / $24.90 (outlier) [J7]. "Up to 1,500 relevant jobs each month" [J2, J3]. Paid tier includes credits for contacting hiring managers [J16]. | REPORTED `[vendor via 3P]` [J1], `[3P]`/`[rival]`; totals conflict |

---

## 2. Capability inventory, feature by feature

| Feature | What JobCopilot does or claims | Label and source |
|---|---|---|
| **Discovery** | "Every 4 hours, your copilot scans 500,000+ career pages and ATS listings to catch the newest openings first" (partner page). The 2024 press release says 50,000 companies; Prospeo says 300,000. "Only targets verified jobs on official company websites and career pages." | REPORTED `[vendor]` [J2, J3], `[db]` [J11]; the three figures conflict |
| Freshness | Scan interval 4 hours (claim). Trainee's boards are read about every 2 hours (VERIFIED, `tsenta.md`). | REPORTED `[vendor]` [J3] |
| **Matching** | Profile + preferences; "the copilot also learns from your corrections" [J16]. Users: matching "poor"; jobs "closed or in unrelated fields"; "applied for 45 useless jobs in one month"; "very little actionable output in the US with general matching criteria"; staffing-agency roles; "fraudulent listings when filtering is weak" [J4, J7, J15]. Company reply: "a temporary sync error in our job sources" [J4]. | REPORTED `[vendor]`, `[store]`, `[rival]` |
| **Prep / tailoring** | AI resume builder and AI cover-letter builder that "tailor documents to each job posting"; tailored resume creation on a paid tier; a reviewer calls the builder "fairly basic"; Trustpilot summary: "useless cover letters, and highly inaccurate resume details". | REPORTED `[3P]` [J16], `[store]` [J4] |
| **Apply mechanics** | "Uses your uploaded resume and answers to common screening questions to automatically fill out application forms on official company career pages" [J3]. Works around the clock ("works 24/7", "including overnight") [J3]. Extension "assist[s] when you're on an employer's application page" [J4]. | REPORTED `[vendor]` [J3, J4] |
| Apply: complex forms | "The bot can mishandle multi-step applications, custom questions, or non-standard ATS formats" [J15]. No source gives JobCopilot completion rates; FastApply's own log for its own tool: Workday 44.5%, Greenhouse 59.9%, Dice 95.7% completion (FastApply says "that is our tool's data, not JobCopilot's, but any product that works those pages faces the same forms") [J5]. | REPORTED `[rival]` [J5, J15]; FastApply's numbers are not JobCopilot's |
| Apply: screening answers | Reddit users (quoted in a blog) on "AI-generated responses that misrepresented their qualifications" [J15]. | REPORTED `[rival]` quoting Reddit |
| Apply: bot checks, codes, sign-in | No source describes how JobCopilot handles captchas, emailed codes or employer accounts. | absent from every source (not proof) |
| **Approval** | "Review each one before it's sent. Switch to full auto-apply when you're ready" [J3]; "fills in applications automatically or saves them for review" [J16]. | REPORTED `[vendor]` [J3] |
| **Duplicates** | A user: "submitted their application 4 times for 3 positions, meaning 12 applications where there should have been 3"; another: duplicates and staffing agencies. Company: "duplicate submissions should not normally occur"; and, to the other user, "if your goal is purely to increase the volume of applications, it does technically accomplish that". Jobscan: "some had issues with multiple applications being submitted for the same job". | REPORTED `[store]` [J4], `[vendor reply]` [J4], `[rival]` [J10] |
| **Tracking** | A single dashboard of application status. | REPORTED `[3P]` [J16] |
| **Receipts / proof** | Not described. Company reply: "employer systems often send confirmation emails themselves, so third-party tools cannot always suppress them" [J15 quoting J4], which shows the confirmations reach the user's inbox and JobCopilot does not claim to read or store them. | REPORTED `[vendor reply]`; receipts absent from every source |
| **Handoff** | None described beyond review mode. | absent from every source |
| **Networking** | "Extracts hiring managers' emails so you can follow up"; paid-tier credits for contacting hiring managers. Whether it sends or only reveals the address is not described. | REPORTED `[3P]` [J16] |
| **Interview prep** | An "AI interview roleplay chatbot". | REPORTED `[3P]` [J16] |
| **Guidance** | A "career advisor" section with job recommendations and "personality-based guidance"; some sources mention salary-negotiation advice. | REPORTED `[3P]` [J16] |
| **Memory** | Profile + screening answers; learns from corrections (claim). | REPORTED `[3P]` [J16] |
| **Volume caps** | 20 / 50 applications a day by plan; "up to 1,500 a month". | REPORTED `[vendor via 3P]` [J1, J2] |
| **Surfaces** | Web, Chrome extension; partner-branded entry pages. | REPORTED `[vendor]` |
| **Refunds** | Conflicting: several reviews cite a 7-day money-back guarantee [J7]; the company says it "does not advertise or offer a general money-back guarantee" and that "refund terms and eligibility criteria are specific" [J4 reply via J15]; Careery (terms checked 2026-10-09): "technical issues reported within 7 days, at JobCopilot's discretion" [J8]; a refund denied because the user "had applied to a job or waited more than 24 hours" (that case may concern DailyRemote, a different product) [J15]. The cancel button must be used "inside the billing dashboard at least 24 hours before renewal"; email requests alone do not reliably stop charges [J15]. | REPORTED `[vendor reply]`, `[3P]`, `[rival]`; conflicting |
| **Honesty posture** | Claims "10x more job interviews" (partner page titles [J3]) and "a 30% increase in interview callbacks" (vendor-style page [J16]); no method published. Answers the duplicate complaint by saying volume is the goal. | REPORTED `[vendor]` [J3, J4] |

---

## 3. Acceptance targets for Trainee against JobCopilot

### 3.1 Discovery coverage and freshness on company career pages
- **BASELINE:** 50,000 to 500,000 career pages (claims conflict), scanned every 4 hours (REPORTED [J2, J3]).
- **PARITY:** the count of company boards Trainee reads and the list source are stated in `docs/coverage.md` (2,179
  boards today, VERIFIED in `tsenta.md`); for the top employers users actually target, coverage is complete.
  Freshness: median posting-live to user-alerted **under 60 minutes**, p95 **under 6 hours**, on a 100-posting weekly
  ground-truth sample (standard 3.1).
- **BETTER:** on the same 25 employers during the ground-truth test, Trainee alerts **at least as early as** JobCopilot
  on **at least 80%** of overlapping roles; **0** closed postings alerted (closed postings detected within 24 hours).
- **COST NOTE:** reading 2,179 boards every 2 hours is already running; going to every 30 minutes for watched
  employers multiplies crawl requests by four for that subset only. Storage policy is required (standard 3.1 flags
  564M characters).

### 3.2 Relevance floor
- **BASELINE:** "45 useless jobs in one month"; staffing agencies; closed and unrelated jobs; fraudulent listings
  (REPORTED [J4, J7, J15]).
- **PARITY:** hard filters for the person's stated type, seniority, location and exclusions before anything is queued.
- **BETTER:** on 500 surfaced roles for 10 test profiles: **at most 10%** judged irrelevant; **0** staffing-agency
  postings unless the person opted in; **0** postings flagged by Trainee's scam checks (142, which today run only on
  the router's empty pool, VERIFIED 2c) reaching the queue.
- **COST NOTE:** filters are code. A staffing-agency flag needs an employer classification list, built once and shared.

### 3.3 Apply on company portals
- **BASELINE:** fills company career-page forms from a resume and common screening answers; "mishandles multi-step
  applications, custom questions, or non-standard ATS formats" (REPORTED [J3, J15]); category completion on Workday
  and Greenhouse may be as low as 44.5% and 59.9% (a rival's own tool, REPORTED [J5]).
- **PARITY:** 20+ real applications per launch ATS (Greenhouse, Lever, Ashby) with success, silent failure, bot-check
  stop, wrong field and time recorded; readback-verified fill on the 17 captured forms (standard 3.3).
- **BETTER:** verified-submit rate (employer confirmation stored) reported as a number per ATS; on Greenhouse at least
  **60%** of attempted applications end SUBMITTED with proof and **100%** of the rest end UNKNOWN or FAILED with the
  reason (no silent failure). The 60% is set at FastApply's REPORTED Greenhouse completion so that "better" means
  same-or-higher completion plus proof; raise it once real numbers exist. (ASSUMED target.)
- **COST NOTE:** extension path ~$0.004 per application, server path ~$0.025-0.05 (ASSUMED, `cost-model-applying.md`).

### 3.4 Duplicates
- **BASELINE:** "4 times for 3 positions" (12 instead of 3); company: duplicates "should not normally occur" (REPORTED
  [J4]).
- **PARITY:** one application per person per role.
- **BETTER:** **0** duplicate submissions per person per role across all sources and re-runs, measured on the full
  submission log weekly; a role seen on two boards or two requisition ids for the same title at the same employer is
  flagged before queueing. Trainee today: never submits the same claimed item twice (7f BUILT, VERIFIED) but dedupes
  postings only by ATS id (2c PARTIAL, VERIFIED).
- **COST NOTE:** a normalized posting key (employer, title, location, requisition) and a lookup per queue item; negligible.

### 3.5 Proof and the confirmation email
- **BASELINE:** confirmations go to the user's inbox and JobCopilot "cannot always suppress them"; no receipt or
  stored proof described (REPORTED [J4]).
- **PARITY:** every application produces a receipt: fields, answers, documents, time, proof artifact (standard 3.5).
- **BETTER:** **100%** of SUBMITTED states backed by a stored confirmation page capture or a parsed confirmation email;
  the share of applications with employer proof computed weekly. The person's confirmation emails are a feature for
  Trainee (proof), not noise to suppress.
- **COST NOTE:** proof storage per application (a page capture or email, tens of KB) with a retention policy.

### 3.6 Approval, then opt-in automation
- **BASELINE:** review each, then "switch to full auto-apply when you're ready" (REPORTED [J3]).
- **PARITY:** the same shape: approval by default, auto as a stated opt-in (standard 6.2).
- **BETTER:** the approval card shows the exact answers, the destination and the resume file (6a PARTIAL today:
  company, role, fit only, while the summary claims "the exact answers", VERIFIED); a texted yes approves the exact
  listed batch (P1, not done, VERIFIED); **0** sends after "stop".
- **COST NOTE:** none.

### 3.7 Hiring-manager contact
- **BASELINE:** extracts hiring managers' emails; credits for contacting them (REPORTED [J16]).
- **PARITY:** for top matches, a sourced relevant person and a drafted note.
- **BETTER:** **0** auto-sent messages; **100%** of addresses labelled verified or guessed; **0** people contacted
  twice; every person found from a permitted source, never LinkedIn scraping (standard 3.7).
- **COST NOTE:** model tokens per draft; an email verifier (DNS) is cheap, not injected in production today (11c, VERIFIED).

### 3.8 Billing and cancellation
- **BASELINE:** no free tier, no trial; cancel only in the billing dashboard 24 hours before renewal; refund terms
  contradict each other (REPORTED [J4, J5, J8, J15]).
- **BETTER:** cancel in **one message**; renewal reminder before every charge; refund rule identical in the terms, the
  pricing page and support answers (one written source); **0** charges after a cancel.

### 3.9 Interview prep and guidance
- **BASELINE:** a roleplay chatbot; "personality-based guidance" and salary advice (REPORTED [J16]).
- **BETTER:** prep tied to the exact submitted resume and posting, weak areas stored and retested (12a, 12e PARTIAL,
  VERIFIED); guidance grounded in the person's own funnel: if 30 applications in a role family produce 0 replies, the
  product says so with the reasoning (standard 3.4); **0** guidance claims without a cited posting or result.

---

## 4. What JobCopilot does NOT have

Absence on a page or in search results is a strong indication, not proof.
- **No stored proof of submission;** confirmations are left in the user's inbox. REPORTED [J4]; receipts absent.
- **No duplicate guard the user can see,** and a reply that treats duplicates as volume. REPORTED [J4].
- **No handoff for captchas, codes or sign-in.** Absent from every source.
- **No outcome engine:** nothing describes reply or interview tracking driving strategy. Absent.
- **No published completion or interview rates.** Absent; claims "10x" and "30%" without method [J3, J16].
- **No messaging surface or mobile app.** Absent.
- **No stated ATS list.** Absent.

---

## 5. Scoreboard

| Capability | JobCopilot (labelled) | Trainee target (measurable) | Trainee today (from REQUIREMENTS.md) |
|---|---|---|---|
| Applications actually submitted | Up to 1,500/month claimed (REPORTED [J2]) | 20+ real per launch ATS | **0 ever** (VERIFIED) |
| Career pages watched | 50K-500K, every 4 h (REPORTED, conflicting) | Top demanded + long tail; <60 min median, <6 h p95 | 2,179 boards, about every 2 h (VERIFIED, `tsenta.md`); freshness not measured (NOT_RUN) |
| Relevance | 45 useless/month; agencies; closed jobs (REPORTED) | <=10% irrelevant; 0 agencies unless opted in | Title keywords + place; scam checks only on empty pool (2b/2c/10a PARTIAL, VERIFIED) |
| Company-portal fill | Yes; mishandles multi-step and custom questions (REPORTED) | Readback-verified; 20+ real per ATS | GH/Lever/Ashby in code; multi-page and uploads on fixtures (7c BUILT, VERIFIED); real forms NOT_RUN |
| Duplicates | 12 sent for 3 roles (REPORTED [J4]) | 0 per person per role | 7f BUILT (VERIFIED); posting dedupe by ATS id only (2c PARTIAL, VERIFIED) |
| Proof | Confirmations left in inbox (REPORTED) | Stored proof or UNKNOWN | Confirmation id/text/screenshot (9b PARTIAL); inbox reader not wired (9c MODULE) |
| Approval | Review then opt-in auto (REPORTED) | Approval default; card shows answers + file | Card shows company, role, fit only (6a PARTIAL, VERIFIED) |
| Bot checks / codes / login | Not described | Handoff <60 s, resume <60 s | Posting URL only; no resume (8a NONE, 8b PARTIAL, VERIFIED) |
| Workday | Implied by "career pages" (REPORTED) | Last, after 3 launch ATSes proven | Pending D-013 (VERIFIED) |
| HM contact | Email extraction + credits (REPORTED) | Drafts only, 0 auto-sent | Sending disabled (11e BUILT); contacts only user-supplied (11a PARTIAL, VERIFIED) |
| Interview prep | Roleplay chatbot (REPORTED) | Tied to submitted resume; weak areas retested | PARTIAL (12a-12e, VERIFIED) |
| Cancel/refund | Dashboard only, 24 h; terms conflict (REPORTED) | One message; one written rule | No pricing (gate 9, NOT_RUN) |
| Price per application | $0.021-0.047 at full use (ASSUMED arithmetic) | Measured, below price | ~$0.004 modelled in-browser (ASSUMED); unmeasured (NOT_RUN) |

---

## 6. Pricing and unit economics

**Their price per application (ASSUMED arithmetic on REPORTED per-day prices [J1]):**

| Plan | Price per day | Daily cap | Price per application at full use | 30-day cost |
|---|---|---|---|---|
| Premium | $0.93 | 20 | $0.047 | ~$27.90 for up to 600 |
| Elite | $1.05 | 50 | $0.021 | ~$31.50 for up to 1,500 |
| Weekly entry | $8.90/week | 20 | $0.064 | ~$38.60/month at weekly billing |

The cheapest per application is Elite at full use, close to Tsenta's $0.022 floor (standard 2.7). The per-day framing
on the pricing page, with no total shown [J1], is itself a complaint driver: reviewers cannot agree what a month costs.

**Architecture inference: server-side by default, extension as an assist (ASSUMED).** Reasons: it "works 24/7",
"including overnight" [J3]; the user does not need a tab open in any description; scans run "every 4 hours" [J3]; the
extension is described by the company as assisting "when you're on an employer's application page" [J4], i.e. an
on-page helper, not the engine. Company career pages have no logged-in session to borrow, so a server can submit
without the user's credentials where the form needs no account. Whether the server uses a real browser or posts
directly to ATS endpoints is unknown.

**What that implies for their cost (ASSUMED):** at a server-browser cost of ~$0.025-0.05 per application
(`cost-model-applying.md`, including a residential proxy if used), Elite at full use ($0.021) loses money per
application and Premium ($0.047) roughly breaks even. Either most users use far less than the cap (likely: users
report "very little actionable output" and "45 useless jobs in one month", REPORTED), or submission is a direct HTTP
post for some ATSes (fractions of a cent), or no proxy is used. A business priced near cost per application has a
reason to count attempts generously and little budget for proof, support or refunds, which matches the complaints.

**Against Trainee (ASSUMED):** this is where Trainee's in-browser path is a real cost edge: ~$0.004 against a
server path of ~$0.025-0.05. It is also where Trainee's cap matters least to price: a JobCopilot user pays about
$1 a day whether 0 or 50 applications go out.

---

## 7. Failure modes and complaints

| # | Failure | Report | Label |
|---|---|---|---|
| F1 | **Duplicate applications** | "Submitted their application 4 times for 3 positions, meaning 12 applications where there should have been 3"; the user adds that employers who see repeats may conclude the candidate used AI. | REPORTED `[store]` [J4] |
| F2 | **Duplicates defended as volume** | Company reply to a user complaining of duplicates and agency jobs: "if your goal is purely to increase the volume of applications, it does technically accomplish that." | REPORTED `[vendor reply]` [J4] |
| F3 | **Irrelevant and useless matches** | "Applied for 45 useless jobs in one month"; "very little actionable output in the US"; "the job they applied to wasn't particularly relevant either". | REPORTED `[store]` [J4], `[rival]` [J15] |
| F4 | **Closed jobs, ghost jobs, unrelated fields, no jobs** | Reviewers "describe the tool finding no jobs at all, and others say the jobs it found were closed or in unrelated fields"; company: "a temporary sync error in our job sources". | REPORTED `[store]` [J4], `[rival]` [J7, J9] |
| F5 | **Staffing agencies** | Applications sent to staffing-agency postings. | REPORTED `[store]` [J4] |
| F6 | **Fraudulent listings** | "Can submit you to fraudulent listings when filtering is weak." | REPORTED `[rival]` [J7] |
| F7 | **Misrepresented qualifications** | Reddit complaints "about AI-generated responses that misrepresented their qualifications"; Trustpilot summary: "highly inaccurate resume details". | REPORTED `[rival]` [J15] quoting Reddit; `[store]` [J4] |
| F8 | **Complex forms mishandled** | "Mishandle multi-step applications, custom questions, or non-standard ATS formats." | REPORTED `[rival]` [J15] |
| F9 | **Cancellation traps and charges after cancel** | "Subscription and cancellation process is extremely frustrating"; cancel only in the billing dashboard 24 hours before renewal; "the subscription kept charging after they cancelled"; "charged for a second month". | REPORTED `[store]` [J4], `[rival]` [J5, J15] |
| F10 | **Refund terms that contradict themselves** | Third-party "7-day money-back guarantee" vs the company's "does not advertise or offer a general money-back guarantee". | REPORTED `[rival]` [J7], `[vendor reply]` [J4] |
| F11 | **Rating collapse** | Trustpilot from 4.2-4.4 in earlier snapshots to 2.1 from 98 in October 2026, 55% one-star. | REPORTED `[rival]` [J5], snapshots conflict |
| F12 | **Captcha failures, account bans, data loss** | No report found for JobCopilot (it does not drive job-board accounts). | absence of evidence, not evidence |

Counterweight (REPORTED): a Reddit user reported "300+ applications and 4 final-round interviews with careful setup"
[J15]; Trustpilot: "the automation features saved them considerable time every single week" [J4]; a neutral listing
calls it "a legitimate AI auto-apply tool" whose main trade-off is "application relevance at high volume" [J9].

---

## 8. Ground-truth test plan (written only; nothing below has been run)

Rules: read the terms first; normal user; no scraping; no account from this plan without the owner's decision; the
owner's real resume; only roles he would accept. There is no free tier, so any run needs a purchase the owner
approves (weekly Premium is the smallest, about $8.90 [J1]).

**Step 0, no account, from an unrestricted network:**
1. jobcopilot.com/pricing: per-day prices and the checkout total for weekly, monthly, quarterly; record verbatim.
2. Terms and refund policy: money-back guarantee or not; how cancellation works; renewal notice.
3. One partner page (4dayweek.io/auto-apply): the claims made there (500,000+ pages, every 4 hours, 10x).
4. Trustpilot: TrustScore, count, one-star share; Chrome listing: rating, users, **permissions**, publisher.

**Step 1, one approved week of Premium:**
5. Set a narrow, written target (title, seniority, location, salary floor, full-time, no agencies). Review mode on.
6. Relevance: for every queued job, mark relevant or not, agency or not, open or closed (check the employer page).
7. Freshness: for 25 queued roles at employers Trainee also reads, record JobCopilot's discovery time against
   Trainee's `first_seen_at` for the same posting.
8. Approve 10 company-portal applications (Greenhouse, Lever, Ashby). Per application: submitted or not, time, wrong
   fields, the screening answers verbatim (mark any not stated by the owner), confirmation email arrival.
9. Duplicates: after a week, count applications per employer per role in the dashboard and in confirmation emails.
10. What the user sees when a form has a captcha, an emailed code, or requires an account.
11. Cancel in the billing dashboard; confirm no further charge; request a refund; record the reply and days.
12. Export and delete data.

Results to `docs/competitors/mass-applying.md` with VERIFIED labels; update section 5.

---

## 9. What Trainee must add or change because of JobCopilot

### Kills the launch
1. **Engine: duplicate prevention across sources, before queueing.** JobCopilot's sharpest failure is 12 applications
   for 3 roles (REPORTED F1). Trainee guards the claimed item (7f BUILT, VERIFIED) but dedupes postings only by ATS id;
   cross-board dedupe (121) runs only on the router's empty pool (2c PARTIAL, VERIFIED). A role on two boards, or
   reposted under a new requisition id, becomes two applications. Ashby lets employers cap applications per candidate
   and blocks re-applying after a rejection (REPORTED, `tsenta.md`): a duplicate can end the person's chance at that
   employer. Build the normalized posting key and check it against the person's own submission history before the
   cap is counted.
2. **Engine: proof, not attempts.** JobCopilot leaves confirmations in the inbox and stores none (REPORTED F2 context,
   section 2). Trainee completes only on accepted + confirmation id (7h BUILT, VERIFIED on fixtures) but the inbox
   reader is not wired (9c MODULE) and confirmation-email proof is NOT_RUN (Stage 8 gate 3). Until then every live
   application must be shown as UNKNOWN unless the confirmation page was captured.
3. **Engine: readback gate green on the 17 forms; complex forms proven on real portals.** F8 is JobCopilot's
   form-level failure. Trainee's multi-page and upload handling is BUILT on fixtures and skipped without Playwright
   (7c, VERIFIED); the captcha-detector fix is unmerged (VERIFIED).
4. **Engine: bot checks become a handoff that resumes.** Not described for JobCopilot; for Trainee it is the gap that
   decides whether any Greenhouse, Lever or Ashby application completes (8a NONE, 8b PARTIAL, VERIFIED; every live
   form loads an invisible bot check at submit, REPORTED standard 2.3). Handoff only; never solve or evade.

### Embarrasses at 100 users
5. **Relevance floor with agency and scam filters wired to the real pool.** F3-F6. Trainee's scam checks and
   cross-board dedupe exist but run on an empty pool in production (2c, VERIFIED). Wire them to `career_postings`.
6. **The approval card must show what will be sent.** Trainee's batch card shows company, role and fit while the
   summary says "the exact answers" (6a, VERIFIED). JobCopilot's review mode is the parity bar; a card that claims
   more than it shows is worse than none.
7. **Closed postings never queued.** F4. Trainee closes expired postings only on a full re-read (2c, VERIFIED);
   check the posting is live immediately before fill, and record "closed before submit" as its own outcome.
8. **Cancel and refund in one written rule.** F9-F10.

### Matters at 10,000 users
9. **Freshness as a measured number.** JobCopilot claims a 4-hour scan; Trainee reads boards about every 2 hours but
   has never measured posting-live to alerted (NOT_RUN). Publish the median and p95 weekly (standard 3.1).
10. **Engine: sign-in, codes and Workday.** Company career pages often require an account (Workday per tenant). D-013
    is pending (VERIFIED); codes need handoff or inbox (9c MODULE).
11. **Engine: failure reporting per application and resume of over-cap items.** Over-cap items never resume while
    the summary says they will (7g, VERIFIED). Fix before scale; at 10,000 users a false summary is thousands of
    false statements a day.
12. **Shared form knowledge.** JobCopilot's volume teaches it every form; Trainee must store per-company form
    knowledge from the first application (standard section 7), so its smaller volume still compounds.

**What JobCopilot's failures teach about relevance floors and caps (ASSUMED, from REPORTED evidence):** applying only
on company career pages does not by itself prevent bad applications: JobCopilot does exactly that and still sends
agency, closed, fraudulent and duplicate applications. The floor has to include identity of the role (dedupe across
sources and requisitions), liveness (checked just before submit), employer type (agency, flagged), and the person's
own filters. A daily cap of 20 or 50 counted before those checks fills the quota with whatever passed the weakest
filter. Trainee counts the 15-a-day cap only after the floor, and reports how many were rejected by the floor and why.
