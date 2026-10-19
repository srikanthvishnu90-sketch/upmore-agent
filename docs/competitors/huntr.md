# Huntr (huntr.co): teardown against the Trainee build standard, with its published outcome data

Template: `docs/product/BUILD-STANDARD-TSENTA.md`. Trainee state: `docs/product/REQUIREMENTS.md` (audit 2026-10-19) and
`docs/product/cost-model-applying.md`. Written 2026-10-19.

Why Huntr matters more than its size: it does not apply for anyone, but **its published research is the evidence base
for Trainee's guidance rules** (the cost model's "fewer, better applications" and the tailoring claim both cite it). This
document therefore puts every number Huntr publishes in one place, with its sample, definition and caveat, and states
what the numbers do and do not support.

## 0. Labels and method

- **VERIFIED**: read on a live page or measured in our own runs. *Nothing here reaches it*; no page could be opened.
- **VERIFIED-S**: the claim appears in a search-engine extract of Huntr's own URL (huntr.co, api.huntr.co, help.huntr.co).
  It proves Huntr *publishes* it. Extracts are written by the search tool and may paraphrase, so a strict reader treats
  VERIFIED-S as REPORTED until a person opens the page. The figures that drive Trainee's rules must be re-read from the
  page before they appear in any user-facing message (section 9, item 1).
- **REPORTED**: a third party says it (reviews, many from competitors; aggregators; secondary write-ups of Huntr's data).
- **ASSUMED**: our inference or arithmetic.

Method (accessed 2026-10-19): WebFetch failed (`getaddrinfo ENOTFOUND huntr.co` and `api.huntr.co`), and curl through
the proxy got 403. All content comes from WebSearch extracts of: huntr.co/research/job-search-trends-q1-2026,
.../job-search-trends-q2-2026, .../2025-annual-job-search-trends-report, .../job-search-trends-q2-2025,
.../job-search-trends-q3-2025, .../best-job-boards, .../best-time-of-year-to-look-for-a-job, huntr.co/blog/job-search-tips,
huntr.co/product/resume-tailor (and its api.huntr.co mirror), huntr.co/product/job-tracker, huntr.co/pricing,
huntr.co/career-centers, huntr.co/advisors, huntr.co/bootcamps, help.huntr.co articles 11385377 and 11030569; plus
third parties named inline. Not checked: the full report tables (only extracts were seen), the terms of service and
privacy policy, the autofill ATS list, the mobile apps (if any), and any first-hand run. The session's WebSearch budget
(200 calls, shared) ran out during this research.

## 1. What the product is

| Item | Finding | Label | Source |
|---|---|---|---|
| Product | Job-search tracker (Kanban CRM), Job Clipper and autofill Chrome extension, AI resume builder and tailor, cover letters, contacts; a B2B "Huntr Advisor" for coaches, career centers and bootcamps | VERIFIED-S | huntr.co/product/job-tracker; huntr.co/advisors; huntr.co/career-centers |
| Founder | Rennie Haylock began the tracker in 2017 and later expanded it into an AI resume platform | REPORTED | mongodb.com community "Startup of the Month is Huntr" |
| Funding | "Without a single dollar of venture funding"; "self-funded with a small team" | REPORTED | mongodb.com; G2-hosted case study (images.g2crowd.com) |
| Base and age | Seattle, founded 2016 (CB Insights); began 2017 (MongoDB). Latka lists 5 employees in 2024 and a founding year of 2005, which conflicts | REPORTED, conflicting | cbinsights.com; getlatka.com |
| Users | "More than 500,000 job seekers"; the extension listing says "over 250k people"; students from "1,000+ universities" | REPORTED (first two); VERIFIED-S (universities) | loopcv.pro / gptprompts.ai; huntr.co/career-centers |
| Chrome extension | 4.8 from 1,326 reviews, about 90K current users (extscope); 4.9 from 1,100+ (another review site); one extscope page shows 44 reviews (stale) | REPORTED, conflicting | extscope.org/extension/mihdfbecejheednfigjpdacgeilhlmnf; gptprompts.ai |
| Trustpilot | About 4.5 from 19 reviews (thin) | REPORTED | wobo.ai / resumejudge.com summaries |
| Surfaces | Web app, Chrome extension, organization dashboard with an organizational API ("only for organizations on Huntr Advisor with API access enabled") | VERIFIED-S (web, extension, advisor); REPORTED (API) | huntr.co; docs.nexla.com/user-guides/connectors/huntr_api |
| Revenue model | Freemium consumer subscription (Pro) plus B2B seats for career centers, bootcamps and coaches ("each student receives a premium Huntr account") | VERIFIED-S | huntr.co/pricing; huntr.co/career-centers |
| Research arm | Quarterly "Job Search Trends" reports since Q1 2025, an annual 2025 report, a job-board ranking and a seasonality study, all built from its users' tracker data | VERIFIED-S | huntr.co/research |

## 2. Capability inventory

| # | Capability | What Huntr does or claims | Label | Source |
|---|---|---|---|---|
| 2.1 | Discovery | Job Clipper saves a posting from any site into the tracker. "Advanced matching" is listed under Pro. No crawler of career pages was found | VERIFIED-S (clipper); REPORTED (Pro matching) | huntr.co/product/job-tracker; scale.jobs |
| 2.1a | Discovery gaps | Clipper coverage on smaller job sites has gaps | REPORTED | scored.tools |
| 2.2 | Prep: tailoring | Match score "not only based on keywords, but also on how well your resume matches the job's requirements", graded poor, fair or great coverage. "Adds skills and relevant job-specific keywords ... pulled directly from each job posting" | VERIFIED-S | huntr.co/product/resume-tailor; help.huntr.co/en/articles/11030569 |
| 2.2a | Prep: rewriting | "The AI rewrites your summaries and bullet points to match, weaving in the right keywords and metrics." The main page says instead that it helps "communicate how your skills and achievements match". "Every suggestion includes clear rationales" | VERIFIED-S (two Huntr pages that differ) | api.huntr.co/product/resume-tailor; huntr.co/product/resume-tailor |
| 2.2b | Prep: truth guard | No page found that says it never invents experience or metrics. "Weaving in ... metrics" invites invention | Absent from sources; ASSUMED risk | as above |
| 2.2c | Prep: positioning tension | Huntr's own podcast guest episode is titled "ATS score is a myth" (Sam Wright, Huntr), while the product sells a match score | REPORTED (podcast listing) | castfox.net episode listing |
| 2.3 | Apply | Autofill fills application forms. **It does not submit.** The person submits every application | VERIFIED-S (autofill on the free plan) / REPORTED (no submit) | huntr.co/pricing; scored.tools; jobsolv.com |
| 2.3a | Apply quality | Greenhouse works well; Workday "hit-or-miss"; custom company portals "often fail"; "occasionally ... a bit inaccurate, requiring some manual adjustments" | REPORTED | resumejudge.com; scored.tools |
| 2.4 | Tracking | Kanban tracker of saved, applied, interview and offer stages; activity logging for applications, interviews and resume prep. Updated by the person; no inbox reading found | VERIFIED-S | huntr.co/product/job-tracker; huntr.co/advisors |
| 2.4a | Tracking honesty | Huntr itself says recorded interview rates are probably underreported "because many users stop updating their trackers" | VERIFIED-S | huntr.co/research/job-search-trends-q2-2026 |
| 2.5 | Receipts | None. The person submits, so the employer's confirmation is in the person's own inbox | ASSUMED (follows from 2.3) | n/a |
| 2.6 | Handoff | Not applicable: the person is at the keyboard for every submission | ASSUMED | n/a |
| 2.7 | Networking | Contacts CRM: "keep contact information for anyone they interact with ... from interviewers to recruiters". No outreach drafting or contact discovery found | VERIFIED-S | huntr.co/advisors |
| 2.8 | Interview prep | None found in any extract | Absent from sources | n/a |
| 2.9 | Memory | Resume base documents, job records, contacts. No conversational assistant found | ASSUMED from the features listed | n/a |
| 2.10 | Guidance | Research reports and data-led blog posts. "Job Search Tips for 2026: 6 Data-Backed Strategies Ranked by Impact" (2026-05-14) ranks a referral first. Coaches see each client's tracker (B2B) | VERIFIED-S | huntr.co/blog/job-search-tips; huntr.co/bootcamps |
| 2.11 | Volume caps | Free plan tracks up to 100 jobs and 2 tailored resumes; Pro is unlimited. No application cap, because it does not apply | REPORTED (third-party pricing summaries, dated 2026-10-14) | applyarc.com/compare/huntr-pricing; jobsolv.com |
| 2.12 | Surfaces | Web, Chrome extension, B2B dashboard and API | VERIFIED-S / REPORTED | as section 1 |
| 2.13 | Pricing | Pro $40 a month, $90 a quarter, $160 for six months; one Huntr product page shows $30 a month. Free: 100 jobs, unlimited base resumes, 2 tailored resumes, unlimited contacts, autofill, a few AI credits | REPORTED (pricing summaries); VERIFIED-S (the $30 page) | applyarc.com; jobsolv.com; huntr.co product page |
| 2.13a | Cancel and refund | Cancel in "Plan & Usage" without contacting support; access lasts to the end of the period. Refunds not automatic, reviewed by timing and usage, none after 14 days from the last invoice | VERIFIED-S (cancel, FAQ on the pricing page); REPORTED (refund rule) | huntr.co/pricing; jobsolv.com |
| 2.14 | Honesty posture | The research states its own limits in writing: association, not effect; self-reported and underreported; trends within the Huntr user base; per application, not per person; "does not measure the effect of any single strategy" | VERIFIED-S | huntr.co/research (Q1 and Q2 2026) |

## 2A. Every outcome statistic Huntr publishes (the evidence base for Trainee's guidance)

Definitions that apply throughout (VERIFIED-S, Q2 2026 and best-job-boards pages): **interview rate = applications the
user marked "interviewed" (or a later stage) / all applications**, per application, not per person or per vacancy.
Data are Huntr users' own tracker entries; outcomes are logged by the users and "almost certainly underreported" (Q1
2026). Each report uses its own window, so rates are not comparable across reports. Huntr users are self-selected.

### A1. Interview rate by application volume (the "apply less" numbers)

| Report | Who | 11-20 apps | 21-50 | 51-100 | 100+ | Ratio 11-20 vs 100+ | Label | Source |
|---|---|---|---|---|---|---|---|---|
| Q1 2026 | Users with at least 11 applications in Q1 2026 | 9.25% | 6.96% | 4.65% | 2.58% | 3.6x | VERIFIED-S | huntr.co/research/job-search-trends-q1-2026 |
| Q2 2026 | Users with at least 11 applications in Q2 2026 | 8.12% | 6.48% | 4.83% | 2.86% | 2.8x | VERIFIED-S | huntr.co/research/job-search-trends-q2-2026 |

Sample. Q1 2026: 139,927 applications by 25,635 active job seekers (REPORTED through secondary write-ups); the report's
intro gives 240k tracked jobs, 39k tailored resumes and a 593-respondent survey (VERIFIED-S). Q2 2026: about 103k
applications, 179,363 saved jobs and 32,082 tailored resumes, with no survey that quarter (VERIFIED-S). Per-bucket counts
were not visible in any extract.

Huntr's own caveat (VERIFIED-S, Q2 2026): "the 2.8x ratio does not show the effect of sending fewer applications."

**What these numbers support and what they do not (ASSUMED analysis).**
1. *Per application*, each extra application converts worse. That is all the table shows.
2. *Per person*, more applications still mean more interviews in this data. Bucket midpoints times rates (ASSUMED
   arithmetic, 150 for the open 100+ bucket): Q1, 15 x 9.25% = 1.4; 35 x 6.96% = 2.4; 75 x 4.65% = 3.5;
   150 x 2.58% = 3.9 interviews in the quarter. Q2: 1.2, 2.3, 3.6, 4.3. **The data does not say "apply less and you will
   get more interviews."** It says the marginal application is worth less: about 5% for the 16th-35th application, about
   2.6-3.4% for the 36th-75th, and about 0.5-0.9% past 75 in a quarter (ASSUMED arithmetic on the same midpoints).
3. Selection effects run in both directions. People who send 100+ may be laid off, junior, in a hard market or less
   targeted. People who send 11-20 may already be well placed. People who send more may log outcomes less carefully,
   which lowers their recorded rate. None of this is adjusted for (ASSUMED).
4. **Trainee's own cap sits outside the high-rate buckets.** Fifteen a day is up to about 1,350 applications a quarter.
   A Trainee user at the cap is in Huntr's lowest-rate bucket. The cost model's line "a 3-4x higher interview rate is a
   3-4x lower cost per interview" (`cost-model-applying.md`, "Fewer, better applications") treats a correlational bucket
   ratio as an effect Trainee can capture. That is ASSUMED, and nothing user-facing may say it.

### A2. Tailored vs untailored resumes

| Report | Tailored | Untailored | Ratio | Scope and sample | Label | Source |
|---|---|---|---|---|---|---|
| Q1 2026 | 4.23% | 2.07% | 2.04x | "Across every job application Huntr users have logged" (cumulative, not just Q1) | VERIFIED-S (in the report extract); also REPORTED by lumyhired.com | huntr.co/research/job-search-trends-q1-2026 |
| Q2 2026 | 5.71% | 3.09% | 1.85x | Section heading "Applications With a Tailored Resume Had a 1.85x Higher Recorded Interview Rate". Outcome charts use the 13,037 tailored resumes linked to an application. A third party cites 102,777 applications from 5,388 users for this comparison | VERIFIED-S (heading, 13,037); REPORTED (102,777 / 5,388, blog.fastapply.co; rates also in forbes.com 2026-09-18) | huntr.co/research/job-search-trends-q2-2026 |
| 2025 annual | 5.8% | ~3.6% implied ("1.6x") | 1.6x | Interviews, offers and hires counted *together*; 1.7M applications, 1M postings, 243k resumes, 1,049 survey respondents, Jan-Dec 2025 | VERIFIED-S | huntr.co/research/2025-annual-job-search-trends-report |
| Huntr blog (2025 data) | 5.8% | 3.73% | 1.55x | 1.7M applications, 225,000+ resumes | REPORTED (search extract attributed it to a Huntr post; page not identified) | huntr.co blog |
| Mid-2025 (Forbes) | 5.75% | 2.68% | 2.15x ("+115%") | 1.39M applications tracked since late 2024 | REPORTED | forbes.com/sites/rachelwells/2025/09/03 |
| Q2 2025 | "~6 interviews per 100" | "fewer than 3" | ~2x | Q2 2025 users | VERIFIED-S | huntr.co/research/job-search-trends-q2-2025 |
| Huntr LinkedIn post | 5.7% | 3.0% | 1.9x | "Across 1.9M applications" | REPORTED | linkedin.com/company/getHuntr (through an extract) |

Huntr's own caveat (VERIFIED-S Q2 2026, quoted by Forbes): the comparison is an association, not a measured causal
effect; the report "does not measure the effect of any single strategy".

**Discrepancy to fix in our own docs (VERIFIED by reading them; fix not made here, other owners' files).**
`docs/competitors/tsenta.md` and `audit/research-competitors.md` cite the Q2 2026 tailoring result as "n 101,501 vs
1,893,054". No extract shows those counts. The ~1.99M total looks like the cumulative "1.9M applications" dataset of the
Huntr LinkedIn post, not the Q2 2026 report (~103k applications). Until a person reads the Q2 page, cite "Q2 2026:
5.71% vs 3.09%, 1.85x, association; 13,037 tailored resumes linked to applications" and nothing more.

**What these numbers support (ASSUMED analysis).** Across seven cuts, tailored applications record 1.55x to 2.15x the
interview rate of untailored ones. The direction is consistent; the size is not. People who tailor are more engaged and
may pick better-fitting roles and log more carefully, so the effect of tailoring itself is unknown. Trainee may say
"Huntr's users who tailored recorded about twice the interview rate; that is a correlation." Trainee may not say
"tailoring doubles your chances."

### A3. Sources and job boards

| Report | Finding | Sample, window, definition | Label | Source |
|---|---|---|---|---|
| Q2 2026 | Google-sourced 7.91% vs LinkedIn 3.36% (2.4x); Seek 5.24%, Wellfound 5.20%, Welcome to the Jungle 4.70%, Computrabajo 3.63% | 1,630 Google-sourced applications in the trailing twelve months; inclusion bar lowered to 200 applications | VERIFIED-S | huntr.co/research/job-search-trends-q2-2026 |
| Best job boards 2026 | GovernmentJobs 7.28% (117 of 1,607), Google Jobs 6.60%, Seek 5.16%, Magneto 4.09%, LinkedIn 1.95% | 1.24M applications, 25 sites, 2024-10-01 to 2026-07-01, at least 1,000 applications per site | VERIFIED-S | huntr.co/research/best-job-boards |
| Best job boards caveat | "An interview rate measures the board and the people on it, and a site built for one-click bulk applying will always convert worse than one where each application takes work" | n/a | VERIFIED-S | huntr.co/research/best-job-boards |
| February 2026 ranking | *Response* rate (a different metric): Google Jobs 11.29%, GovernmentJobs 8.67%, LinkedIn 3.1% | 598,627 applications | REPORTED (questromfeld.bu.edu repost) / VERIFIED-S (blog) | huntr.co/blog/best-job-search-sites-2026 |
| Q2 2025 | LinkedIn held nearly four-fifths of saves; Google Jobs had triple its callback rate | Q2 2025 users | VERIFIED-S | huntr.co/research/job-search-trends-q2-2025 |
| 2025 annual | Google Jobs 11.3%, LinkedIn 3.1% (response rate) | 2025 | REPORTED | secondary summary of the annual report |

### A4. Time, timing, resume shape and gaps

| Report | Finding | Label | Source |
|---|---|---|---|
| Q1 2026 | Median 108 days from first saved job to first recorded offer, a record (83 in Q4 2025). Waits after an interview are 12 days against 6 before | VERIFIED-S | huntr.co/research/job-search-trends-q1-2026 |
| Q2 2026 | Median 82 days, down 24% from 108; the first quarterly decline | VERIFIED-S | huntr.co/research/job-search-trends-q2-2026 |
| 2025 annual | Time to first offer 57 days in Q1 2025, 83 days by Q4 2025 | VERIFIED-S | huntr.co/research/2025-annual-job-search-trends-report |
| Q3 2025 | 375k applications, 226k job ads, 71k resumes, 527 survey respondents; time to offer 71, 55 and 65 days (July, August, September); typical seeker sent about 16 applications a week | VERIFIED-S | huntr.co/research/job-search-trends-q3-2025 |
| Q2 2026 | Among resumes with 6 or more achievement bullets, the rate peaks at 21-30 bullets (7.03%) and falls above 30 (4.59%), "the 30-Bullet Ceiling" | VERIFIED-S | huntr.co/research/job-search-trends-q2-2026 |
| Q1 2026 | Recently unemployed (under 3 months) 4.39% vs currently employed 4.19%; longer gaps carry a larger penalty | VERIFIED-S | huntr.co/research/job-search-trends-q1-2026 |
| Q1 2026 | Listings that disclosed pay 4.47% vs 6.42% for those that did not | REPORTED (one extract attributed it to Q1; not confirmed in a second) | huntr.co/research/job-search-trends-q1-2026 |
| Q2 2026 | Unemployed candidates who tailored interviewed at rates similar to employed candidates | REPORTED (secondary write-up) | thejobhopper.substack.com |
| Seasonality | Nearly 2M applications over three years: volume peaks September-October, not January. The 2025 average interview rate was 3.5%; November 4.2% (low volume); January 2.7%; Tuesday saves 3.9%; weekend applications about a third fewer interviews per application | VERIFIED-S / REPORTED (some figures from secondary write-ups; one figure, "32% of October applicants got an interview", conflicts with the 3.6% rate and is not used) | huntr.co/research/best-time-of-year-to-look-for-a-job |
| Tips post 2026-05-14 | A referral is ranked first. Example: a laid-off marketing director sent 100+ applications in three months at about a 1% interview rate. Basis: 1.7M applications, 243,000 resumes, 750+ free calls | VERIFIED-S | huntr.co/blog/job-search-tips |

### A5. The guidance rules these numbers allow (for Trainee's guidance owner)

Each rule cites the number and its limit. None may be phrased as a cause.
1. "Each additional application tends to be worth less" (A1, per application, correlational). Allowed.
2. "Huntr's users who tailored recorded roughly 1.6-2x the interview rate" (A2). Allowed with "recorded" and "users who".
3. "Google-sourced and government-board applications recorded higher rates than LinkedIn" (A3), with the board-and-people
   caveat attached. Allowed. It must never steer anyone to a channel Trainee automates; LinkedIn automation is banned
   (LinkedIn User Agreement 8.2, VERIFIED-S in our earlier research).
4. "Searches are taking about 3 months to a first offer" (A4, 82-108 days median). Allowed, dated.
5. Not allowed: "apply to fewer jobs and get more interviews"; "tailoring doubles your chances"; any per-person promise;
   any number not re-read from the live page and dated.

## 3. Acceptance targets for Trainee against Huntr

**3.1 Tracking without inbox (Huntr's core).**
- BASELINE: a manual Kanban that users stop updating (VERIFIED-S, Huntr's own underreporting caveat).
- PARITY: one record per role with states (9a), seen and changed from chat, with no inbox needed.
- BETTER: the share of applications whose outcome is known 30 days after submit, measured. Target 80%+ against Huntr's
  self-admitted decay, through a weekly one-tap check-in ("Acme: any reply? yes / no / rejected") and confirmation-email
  parsing when the person forwards mail. Cost: a few messages a week a person; the channel cost is in the cost model.

**3.2 Clipping any posting.**
- BASELINE: Job Clipper from any site (VERIFIED-S).
- PARITY: the person pastes or shares any posting URL in chat and it becomes a tracked role in under 10 seconds,
  including postings on sites Trainee does not harvest. Measured on 50 URLs across 20 sites.
- BETTER: the shared posting is parsed (title, employer, location, deadline) with 95%+ field accuracy on the same 50,
  and gets the fit explanation (3a BUILT).
- COST NOTE: one posting read is about $0.002 (cost model, ASSUMED). The fetch is a single request the person asked
  for, never a crawl of the site.

**3.3 Tailoring with a match score.**
- BASELINE: a match score with coverage levels; adds posting keywords; rewrites bullets "weaving in ... metrics"
  (VERIFIED-S). No truth guard found.
- PARITY: a tailored resume per role and a plain-language coverage view (which requirements the person's facts cover,
  which they do not).
- BETTER: (a) 0 invented facts or metrics per 100 sampled (standard 3.2); (b) no fake "ATS score". Greenhouse's matching
  is a paid add-on that never advances or rejects anyone on its own, and Ashby's AI review "never ranks or gives
  numerical ratings" (VERIFIED-S in our earlier research). Huntr's own guest calls the ATS score a myth (REPORTED). Show
  coverage of real requirements, not a number dressed up as the employer's.
- COST NOTE: same as Massive 3.2.

**3.4 Autofill parity.**
- BASELINE: fills, never submits; Greenhouse good, Workday hit-or-miss, custom portals often fail (REPORTED).
- PARITY: Trainee's in-browser path fills Greenhouse, Lever and Ashby with readback (7d BUILT) at 95%+ field accuracy
  on the 17 captured forms plus 20 real forms per ATS.
- BETTER: Trainee carries the application to a confirmed submit after the person's yes. Huntr stops at the form.
  Measured as the verified-submit rate.
- COST NOTE: in the person's browser, about $0.004 an application (cost model, ASSUMED).

**3.5 Contacts.**
- BASELINE: a contacts CRM, manual (VERIFIED-S).
- PARITY: contacts per application, recorded from chat.
- BETTER: a sourced, approval-gated note for the top roles (standard 3.7). Huntr ranks referrals first in its own tips
  (VERIFIED-S) but ships no help getting one.

**3.6 Research-grade honesty.**
- BASELINE: Huntr publishes rates with written caveats (VERIFIED-S). The honesty bar in this category is Huntr's, not
  Tsenta's.
- PARITY: Trainee states its own interview rate per application only from stored proof, with the sample and the
  caveat, once there are 1,000+ submitted applications with known outcomes.
- BETTER: per person *and* per application, with the denominator, adjusted for role family. Huntr reports per
  application only.

**3.7 Organizations (B2B).**
- BASELINE: Huntr Advisor gives coaches and career centers each client's tracker, branded, with daily updates and an
  API (VERIFIED-S / REPORTED).
- TARGET: none for launch. Note it as the channel Huntr monetizes that Trainee does not address (matters at 10,000).

## 4. What Huntr does not have (absence on a page is a strong indication, not proof)

- No submission: autofill only; the person clicks submit (REPORTED by several reviews; consistent with the pricing page).
- No receipts or proof; no outcome verification (it relies on the person's updates and says so).
- No job discovery crawler or alerts found; the clipper depends on the person finding the job.
- No interview prep or mock interviews found.
- No outreach drafting or contact discovery; contacts are a CRM.
- No inbox reading; status is manual.
- No messaging channel (iMessage, WhatsApp) or mobile app found.
- No statement that tailoring never invents facts.

## 5. Scoreboard

| Capability | Huntr (labeled) | Trainee target (measurable) | Trainee today (from REQUIREMENTS.md) |
|---|---|---|---|
| Tracking | Kanban; users stop updating (VERIFIED-S) | Outcome known on 80%+ at 30 days | 9a PARTIAL (states in separate records); 9d BUILT (VERIFIED, audit); live NOT_RUN |
| Clip any posting | Yes (VERIFIED-S) | Pasted URL becomes a tracked role in <10 s, 95% field accuracy | ASSUMED not built: the audit lists no paste-a-URL route |
| Tailoring | Score + keywords + metrics (VERIFIED-S); no truth guard found | 0 invented facts per 100 | 4b/4c PARTIAL, truth audit gate (VERIFIED, audit) |
| Diff / review | "Clear rationales" per suggestion (VERIFIED-S) | Per-line provenance | 4e PARTIAL, module only (VERIFIED, audit) |
| Autofill | Yes; Workday hit-or-miss (REPORTED) | 95%+ field accuracy, readback | 7c, 7d BUILT in code; multi-page tests skip without Playwright (VERIFIED, audit) |
| Submit | Never (REPORTED) | Confirmed submit after one yes | 0 submitted (VERIFIED); 7h BUILT |
| Contacts | CRM (VERIFIED-S) | Sourced notes, the person sends | 11b, 11c, 11e BUILT on supplied records; 11a PARTIAL (VERIFIED, audit) |
| Interview prep | None found | Role-specific, from the submitted resume | 12a-12e PARTIAL/BUILT (VERIFIED, audit) |
| Published outcomes | Yes, with caveats (VERIFIED-S) | Per person and per application, from proof, at 1,000+ | None; `evals/career/results` empty (VERIFIED, audit) |
| Export | Not checked | Downloadable export | 1e PARTIAL (VERIFIED, audit) |
| Price | Free / $40 a month (REPORTED) | Set after 30 days of measured cost | No pricing (standard gate 9) |

## 6. Pricing and unit economics

**Price.** Free (100 jobs, 2 tailored resumes, autofill). Pro $40 a month, $90 a quarter, $160 for six months
(REPORTED, 2026-10-14 summaries); one Huntr page shows $30 a month (VERIFIED-S). B2B seat pricing is not public.

**Architecture (ASSUMED, with the reasoning).** User-side Chrome extension (architecture B) plus an ordinary web app:
1. The autofill lives in a Chrome extension and the person submits (REPORTED). There is no server browser to pay for.
2. Its AI features (tailoring, cover letters) are per-request model calls, metered by "AI credits" on the free plan
   (REPORTED), which is how a team selling model calls caps cost.
3. The tracker is a database app with low cost per user.

**What that implies for its cost (ASSUMED).** Near-zero cost per application. Model cost per tailored resume is about
$0.002-0.004 at small-model prices (our cost model's unit prices), so a Pro user tailoring 100 resumes a month costs well
under $1 against $40. The business is high-margin and bootstrapped, so it has no funding cliff (contrast `sonara.md`).
Its constraint is the person's time: every application still costs the person the submit, every captcha and every
status update. That time is where Trainee competes, not price.

## 7. Failure modes and complaints

REPORTED unless stated; none checked first-hand. The Trustpilot sample is small (19), so the complaint picture is thin.
1. **Autofill accuracy.** "Occasionally, the application autofill can be a bit inaccurate, requiring some manual
   adjustments" (resumejudge.com). "Workday forms are hit-or-miss, custom company portals often fail, Greenhouse works
   well" (scored.tools).
2. **Support.** "If you want a refund or want to cancel, you end up wasting hours" (resumejudge.com). "Customer service
   isn't available to support you in real time" (Trustpilot reviewer quoted by wobo.ai).
3. **Refunds.** Not automatic; none after 14 days from the last invoice; approval not guaranteed (jobsolv.com). Unused AI
   credits do not roll over (REPORTED).
4. **Price.** "Why $40/Month for a Job Tracker Is Too Much" (resumeoptimizerpro.com, a competitor).
5. **Clipper gaps** on smaller job sites (scored.tools).
6. **Data decay is built in.** Huntr's own report says users stop updating trackers (VERIFIED-S). Every number in section
   2A inherits this, and the people who stop updating are not random (ASSUMED).
7. **Tailoring may invent.** The mirror page says the AI weaves in "metrics" (VERIFIED-S). No user report of fabrication
   by Huntr was found (absence of evidence), but the copy permits it.

## 8. Ground-truth test plan (plan only; nothing was run, no account was created)

To be run by the owner on the free plan, after reading Huntr's terms. No scraping, no automation of Huntr's site.
1. **Read the research pages directly** (Q1 2026, Q2 2026, 2025 annual, best job boards) and record: per-bucket
   application counts, the exact tailoring sample, the exact interview-rate definition, and every caveat. Replace every
   VERIFIED-S in section 2A with VERIFIED or a correction, dated. This step has the highest value, because Trainee's
   guidance rules are built on these numbers.
2. **Tailoring truth.** Tailor 2 resumes (the free limit) against 2 real postings. Diff each against the source: count
   added skills, metrics, titles or dates not in the source.
3. **Match score.** Change one irrelevant word in the resume and record whether the score moves (does it measure
   requirements or keywords?).
4. **Autofill.** On 5 public postings (2 Greenhouse, 1 Lever, 1 Ashby, 1 Workday), run autofill, do **not** submit, and
   record per field: filled correctly, filled wrongly, left empty. Close the tab without submitting.
5. **Clipper.** Clip 10 postings from 5 sites and record parse accuracy.
6. **Export and deletion.** Look for a data export and the account deletion path; record the steps.
7. **Write-up.** Record results in `docs/competitors/huntr.md` with VERIFIED labels and the date.

## 9. What Trainee must add or change because of Huntr

Ranked by launch risk. Each line carries its evidence label.

**Kills launch**
1. **Re-read the evidence before any rule speaks.** Every guidance number from Huntr (section 2A) is VERIFIED-S at best.
   The "n 101,501 vs 1,893,054" figure in our own docs is unsupported. The cost model's "3-4x lower cost per interview"
   reads a correlation as a cause. A user-facing message that misstates research is the embarrassment Trainee's honesty
   rule exists to prevent. Action: the guidance owner re-reads the four Huntr pages, records them in
   `docs/research/<area>.md` with link and date (REQUIREMENTS evidence standard), and rewrites the rules per 2A.5.
2. **Do not ship "apply less = more interviews".** The per-person arithmetic (2A, A1 item 2) shows more applications
   still produced more recorded interviews per person. The 15-a-day cap is an owner rule (REQUIREMENTS, 2026-10-19), not
   a research finding. Say it as a rule for protecting the person's name and the employers' welcome, not as a proven
   interview booster (ASSUMED framing, consistent with standard 3.11).

**Embarrasses at 100 users**
3. **Outcome capture that does not decay.** Huntr admits its users stop updating (VERIFIED-S). If Trainee's funnel (the
   standard's outcome engine, 3.4) has the same decay, the throttle rule fires on missing data. *Submission engine:*
   the inbox reader is MODULE only (9c), and confirmation-email proof is NOT_RUN (Stage 8 gate 3). Without it, Trainee's
   "submitted" depends on the confirmation page alone (7h).
4. **Paste a posting into chat.** Huntr's clipper is the habit people bring. Trainee needs "here's a job: <url>" to make a
   tracked, prepared application (10d NONE: an alert cannot even turn into an application today; VERIFIED, audit).
5. **Autofill must beat the person at the keyboard.** Huntr's users fix fields by hand (REPORTED). *Submission engine:*
   readback (7d) is BUILT, but the post-fill resume check exists only on a branch, and the multi-page tests skip without
   Playwright (VERIFIED, audit). File uploads are BUILT (7c), but chat cannot take a resume in (1a) or hand a tailored
   file back (4d) (VERIFIED, audit).

**Matters at 10,000 users**
6. **Publish our own numbers the Huntr way.** Sample, definition, window and caveat, per application and per person,
   only from stored proof (standard 3.3 BETTER). Huntr has set the honesty bar for research in this category.
7. **Workday.** Huntr users meet Workday constantly (a competitor blog reports about 65% Workday among its users,
   REPORTED, jobwizard.ai). *Submission engine:* Workday and account sign-in wait on D-013. Captcha handoff in the same
   session is NONE (8a). Until those land, a Workday posting is a handoff with the posting URL, said plainly (8e BUILT).
8. **B2B channel.** Career centers and bootcamps buy seats from Huntr (VERIFIED-S). Not a launch item. Record it as a
   distribution route a competitor already holds.
