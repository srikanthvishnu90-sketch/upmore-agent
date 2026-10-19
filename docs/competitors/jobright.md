# Jobright.ai (Turbo, Jobright Agent, Autofill, Insider Connections, Orion): teardown and Trainee targets

Follows `docs/product/BUILD-STANDARD-TSENTA.md` section by section. When this document and the standard disagree,
the stricter requirement wins.

## 0. Labels and method

**Labels (the standard's, section 0):**
- **VERIFIED**: read on a live page, or measured in our own runs. Nothing here reaches that bar. No page was opened
  live and no run was made.
- **VERIFIED-S**: Jobright's own page (site, blog, press release, App Store listing) or a store listing states it,
  read through a WebSearch extract of the cited URL on 2026-10-19. It is a VERIFIED *claim*, never VERIFIED
  *performance*. Re-open the page live before reuse.
- **REPORTED**: a third party says it (press, a review blog, an aggregator, a Trustpilot summary). Many review blogs
  here sell a competing product. Where I know that, I say so.
- **ASSUMED**: my inference.
- **NOT_RUN**: a Trainee measurement not yet made.

**Method, accessed 2026-10-19:**
- WebFetch on `jobright.ai/pricing`: `getaddrinfo ENOTFOUND`. curl through the proxy: `CONNECT tunnel failed, response
  403`. No page was opened live.
- Every finding comes from WebSearch extracts, which a search model writes and may paraphrase.
- The shared search budget ran out before I could check: Jobright's help center, its Terms (refunds, automation
  consent), its privacy policy, the App Store and Google Play ratings, primary Reddit threads, and a verified ATS list
  for the agent. Those are marked "not checked".
- Jobright publishes no public pricing page, per several reviews (REPORTED). Prices are therefore all third-party.
- Nothing was signed up for, submitted or scraped.

## 1. What the product is

| Item | Finding | Label | Source |
|---|---|---|---|
| Company | Jobright.ai, founded 2023, Santa Clara, CA | REPORTED | vcbacked.co/company/jobright; theregister.com/2025/06/24/ai_may_take_jobs_but/ |
| Founders | Eric (Yuan) Cheng, CEO; Ethan (Yudian) Zheng, CTO | VERIFIED-S (Jobright blog); REPORTED (The Register) | jobright.ai/blog/is-jobright-legit/ |
| Funding | $7.7M in total ("raised $7.7 million to date"). About $4.5M seed in 2023 led by Lanchi Ventures with UpHonest; $3.2M in June 2025 led by Translink Capital with **HR Tech Investments, Indeed's venture arm**. Source Code Capital and Creator Ventures are also listed. Latka's "bootstrapped" contradicts all of this. | VERIFIED-S (total, their blog); REPORTED (rounds) | jobright.ai/blog/is-jobright-legit/; finsmes.com/2025/06/jobright-raises-3-2m-in-funding.html; theregister.com; pitchbook.com |
| Users | "trusted by 2M+ tech professionals" (Bounce Watch, quoting marketing); "50K users in two months" (Starter Story, early) | REPORTED | bouncewatch.com/company/jobrightai; starterstory.com/jobright-ai-breakdown |
| Trustpilot | 4.8, about 3,630 reviews, 84% five stars, 1% one star (main page). 3,588 on the AU page. A comparison cites 4.8 from 3,617 on 2026-10-16. Earlier snapshots: about 2,600, and **4.6 from about 230 in March 2026**. | VERIFIED-S (the Trustpilot page extract); REPORTED (older snapshots) | trustpilot.com/review/jobright.ai; au.trustpilot.com/review/jobright.ai |
| Review velocity | About 230 to about 3,630 reviews in roughly 7 months. ASSUMED: in-product review solicitation. Trustpilot says it screens reviews automatically. The rating is not evidence of apply quality. | ASSUMED | (derived from the rows above) |
| Chrome extension "Jobright Autofill" | About 200K users, 4.7 from 152 reviews (ExtScope tracker); version 1.15.0 dated 2026-06-29 (Chromeboard). Other reviews say 100K+ and 4.6. | REPORTED | extscope.org/extension/odcnpipkhjegpefkfplmedhmkmmhmoko; chromeboard.com |
| iOS app | "Jobright - AI Job Search" (id6738236788). Free basic features, US roles only, match score 0-100. Rating not found. | VERIFIED-S (listing text) | apps.apple.com/app/id6738236788 |
| G2 | 1 review, 5.0 | REPORTED | g2.com/sellers/jobright |
| Employer side | A page titled "Jobright: AI Recruiting for Growing Tech Companies" exists. The security page lists employer protections, including "Bot protection". | VERIFIED-S (page titles) | jobright.ai/employers; jobright.ai/security |
| Surfaces | Web app, Chrome extension, iOS app, Orion in-app copilot. Android not checked. | VERIFIED-S / REPORTED | as above |
| How it makes money | Turbo subscription (section 6); free daily credits as the funnel. ASSUMED: also employer-side recruiting (the page exists; revenue not checked). | REPORTED / ASSUMED | |

**What it is (ASSUMED synthesis).** A job-matching product for US tech jobs. It claims a large daily feed and a strong
match score, plus an H1B filter. Around that sit an autofill extension (the person submits), a resume tailor, insider
emails for referrals, and Orion, a chat copilot. The "Agent" that submits for you has been marketed since June 2025,
but independent testers describe it as a waitlist, a beta, or assisted applying. It is backed by Indeed's venture arm
and has an employer-side product, so it sits on both sides of the market.

## 2. Capability inventory

### 2.1 Discovery
- The agent "scans over 400,000 job posts daily" (CTO to The Register, June 2025). A third party says Jobright's
  site cites "over 8 million total jobs and more than 400,000 new listings added daily". WebCatalog says "over 100,000
  ... updated daily". REPORTED (conflicting; the company's own page not opened). theregister.com;
  jobgether.com/blog/jobright-vs-jobgether-...; webcatalog.io/apps/jobright
- **US-only** roles. VERIFIED-S. App Store listing.
- Match score 0-100 "from comparing resume skills, experience, and salary range against job requirements".
  VERIFIED-S. App Store listing. Reviewer estimate: right "roughly 70-80% of the time". REPORTED.
- H1B filter: filters for roles that "explicitly provide H1B visa sponsorship" and uses "companies' sponsorship
  history and reputation". VERIFIED-S. jobright.ai/blog (H1B post, cited via zplatform.ai and others). A public GitHub
  list "Daily-H1B-Jobs-In-Tech" by jobright-ai also exists. REPORTED. sourcepulse.org
- Freshness: no published time-to-alert number. Free tier: "1 instant job alert" a day; Turbo: instant alerts.
  REPORTED. Complaints about **expired listings** in the database. REPORTED (a Reddit thread cited by a review blog).
- The agent "will send up to 50 listings each week" after a resume upload and preferences (Bloomberg Law, July 2025).
  REPORTED. news.bloomberglaw.com/artificial-intelligence/new-ai-startup-will-suggest-jobs-and-even-fill-out-applications

### 2.2 Prep (tailoring, letters)
- AI-tailored resumes and AI cover letters. Free: 2 tailored resumes and 2 cover letters a day. Turbo: unlimited, but
  "five saved resume slots even on Turbo". REPORTED. adzuna.co.uk/blog/jobright-review...; favtutor.com/jobright-ai-review/
- **Fabrication:** "multiple independent reviewers report the tailoring engine inserting skills that were never on
  the original resume and fabricating metrics". One review counts "18+ Reddit users" in its sample reporting "false
  skills, fabricated metrics, or credentials". REPORTED. wobo.ai/blog/jobright-review/; resumly.ai/answers/jobright-review
- Diff view or a truth guarantee: not found. Absent.

### 2.3 Apply and submission mechanics

**Autofill extension (the working part):**
- "Every job card carries an APPLY WITH AUTOFILL button. You land on the employer's real form with fields populated,
  and submit it yourself." REPORTED (a hands-on review). jobity.io/blog/jobright-review
- Directory listings titled "Jobright Autofill" claim "Workday, Greenhouse & 500+ job sites" and **automatic filling
  of LinkedIn Easy Apply**. REPORTED (two different extension IDs; may not be the same product).
  extscope.org/extension/niphbnpodnkchmifkcpoohlakeofljam; extscope.org/zh/extension/ablhkpojbaponedckeonecobjinfjfml
- Free tier: 4 one-click autofills a day. Turbo: unlimited. REPORTED.
- Accuracy: Trustpilot's AI summary says autofill "can occasionally enter random information" and needs manual edits.
  REPORTED. trustpilot.com/review/jobright.ai

**Jobright Agent (submits for you):**
- Launched 2025-06-24: "the first AI career agent that finds, customizes, and submits applications on behalf of job
  seekers". Claims job-search time cut 80% and interview rates doubled. VERIFIED-S (claims).
  prnewswire.com/news-releases/jobright-launches-first-ai-agent-to-make-job-hunting-searchless-302488544.html;
  jobright.ai/ai-agent
- Early test: "We invited around 200 people ... More than half have already landed interviews" (the CTO, by email).
  REPORTED (a company figure via the press; no control group). theregister.com
- **Bot-blocking posture:** "if an employer or job site explicitly blocks bots, the agent always respects those
  rules", and directs the person to apply manually; the founders called this "a very small portion of the job
  market". REPORTED (a founders' statement to The Register).
- Scope at launch: US jobs in tech, education and government. REPORTED. theregister.com
- Modes: "supervised" (approve each step) or fully "automated". "90% Job Search Automation" marketing. REPORTED.
  atsverification.com/blog/jobright-ai-review-2026/; jobity.io/blog/jobright-review
- **Availability:** a hands-on reviewer saw "You're on the Waitlist" above "Skip Waiting and Enable Agent Now", which
  routes to payment. Others say "only available in Beta for a small portion of users". It is "assisted applying, not
  autopilot", and "on many jobs it sends you to the company site to finish by hand". Some describe it as "often
  routed via third-party boards". REPORTED (multiple reviews, some by competitors). jobity.io; resumly.ai;
  adzuna.co.uk
- Runs "while your laptop is closed": a general description of server-side agents, not a Jobright technical
  disclosure. REPORTED (weak). resumly.ai
- Account sign-in, verification codes, file uploads and multi-page handling: no Jobright documentation found. Not
  checked (help center unreachable, search budget spent).

### 2.4 Tracking
- "Track applications" is in the App Store listing. VERIFIED-S. Status from email or an inbox connection: not found.
  Absent (not checked deeply).

### 2.5 Receipts and proof
- None found: no receipt of what was sent and no stored employer confirmation. Absent.
- Refund of failed applications: not applicable (subscription, no per-application charge found).

### 2.6 Human handoff
- When a site blocks bots, the person is sent to apply manually (REPORTED, founders). ASSUMED: a full manual
  application, with no resume of the agent's partial fill and no in-conversation question.

### 2.7 Networking ("Insider Connections")
- Finds "LinkedIn connections inside the hiring company"; "Insider Edge" locates "alumni and past colleagues now
  working at your desired companies". VERIFIED-S (Jobright LinkedIn post and blog). linkedin.com/company/jobright-ai;
  jobright.ai/blog/success-stories-...
- Gives "access to email addresses of recommended insiders" and "ready-to-use email templates". The free tier
  includes "2 LinkedIn email finder uses" a day. REPORTED. adzuna.co.uk; careerkit.me/blog/jobright-review
- A reviewer argues it surfaces colleagues, classmates and alumni, "not reliably the manager who owns the role".
  REPORTED. hiringreach.com/reviews/jobright-ai-review
- Claim: "referrals can increase interview likelihood by 4x". VERIFIED-S (claim); no source given. The academic
  figure we hold is different: referrals were 6.1% of applicants and 29.1% of hires at one firm (research-competitors.md).
- How the emails are found (a data broker, pattern guessing, LinkedIn data) is not stated. ASSUMED risk: an "email
  finder" over LinkedIn profiles is the pattern LinkedIn's terms and Apollo/Hunter-style terms restrict (standard 3.7).
  Not checked.

### 2.8 Interview prep
- Orion, the in-app AI copilot: "find relevant roles, explain why a job matches your background, or help you prepare
  for interviews". Answers can feel "generic for niche technical roles". REPORTED. vmeg.ai/blog/jobright-ai-review;
  g2.com
- A dedicated mock-interview product: not found. The one directory mention appears to describe a different product.
  REPORTED absent.
- "Live career coach": inconsistent. Listed in Turbo by one table; per-session charges seen by another. REPORTED.

### 2.9 Memory
- A resume plus preferences drives matching (VERIFIED-S, App Store listing). Answer memory across applications: not
  documented. Absent.
- **Invented answer:** a December 2025 Reddit post by a paying user says the Agent's application answer described a
  team project and a conference the user never had. REPORTED. careery.pro/blog/ai-job-search/jobright-ai-review (the
  publisher sells a competing service; a second search could not re-find the thread).

### 2.10 Guidance
- Orion coaching and application strategy (REPORTED). Funnel or outcome analytics: not found. Absent.

### 2.11 Volume caps
- Agent: "up to 50 listings each week" (Bloomberg Law, 2025, REPORTED). Free daily credits: 2 resumes, 4 autofills, 2
  letters, 2 email-finder uses, 1 alert, 1 saved filter; reset at midnight, no rollover. REPORTED.
  careerkit.me / jobity.io. A heavy user hit the daily cap "by mid-morning on day one". REPORTED.

### 2.12 Pricing
- No public pricing page; prices appear after sign-up. REPORTED (several reviews).
- Turbo **$39.99 a month** (raised from $29.99 earlier in 2026), **$17.99 a week**, **$89.99 a quarter**. REPORTED
  (consistent across zplatform.ai, careerkit.me, outapply.com, careery.pro "August 2026").
- Conflicting tiers: "Unlimited $34.99/mo, Autopilot $44.99/mo, 5-day free trial (Autopilot)". REPORTED (one source).
- "No free trial and no refund policy". The terms allow refunds only at Jobright's discretion. REPORTED.
  zplatform.ai; applyall.com/guides/jobright-review

### 2.13 Honesty posture
- Marketing says the agent "submits applications on their behalf", "90% automation", "interview rates double"
  (VERIFIED-S claims). Independent testers find a waitlist, a beta, or a paywall to skip the waitlist (REPORTED). That
  gap between marketing and product is the main honesty finding.
- Positive: the stated rule to respect sites that block bots (REPORTED, founders).
- No published success rate, verified-submit rate or controlled interview-rate data. The "200 testers, more than
  half landed interviews" figure has no baseline.

## 3. Acceptance targets for Trainee against Jobright

### 3.1 Discovery and matching
- **Baseline:** "400,000+ posts daily" claimed; US-only; 0-100 match score; H1B filter; expired listings REPORTED.
- **Parity:** chat sees real postings (today `postings: []` on the default path). A sponsorship filter that uses the
  person's stated need: 1b PARTIAL (sponsorship correction exists); 2b filters are keyword-only.
- **Better:**
  - 0 expired postings shown: dead postings detected and removed within 24 h (standard 3.1), measured on a weekly
    100-posting sample.
  - Every match carries "matched because" plus a correction path that changes the queue within 7 days.
  - **The score is never a chance of being hired** (3e). Jobright shows a 0-100 score; Trainee's agent path today
    passes a raw fit score and its prompt says "Tell them their real odds" (3e PARTIAL). That must be fixed before
    any comparison.
- **Cost note:** crawl, storage and match compute; the storage flag applies.

### 3.2 Tailoring
- **Baseline:** unlimited AI tailoring on Turbo; **REPORTED fabrication of skills, metrics and credentials**.
- **Parity:** a per-role tailored resume with a diff.
- **Better:** 0 invented skills, metrics or credentials in 100 sampled resumes per release (automated check against
  the fact bank plus a 20-resume human audit). 100% line provenance. This is the single clearest "better" against
  Jobright, and it is a launch-blocking defect class for us (standard 3.2).

### 3.3 In-browser fill (the Autofill equivalent)
- **Baseline:** autofill on "Workday, Greenhouse & 500+" claimed; "random information" REPORTED; 4 a day free.
- **Parity:** readback-verified fill at 90% on Greenhouse and 85% on Lever on 20 real applications each.
- **Better:** 0 silent wrong values: every field that readback cannot confirm is shown to the person before submit.
- **Must never:** fill LinkedIn Easy Apply or Indeed forms (Trainee 8e `AGGREGATOR_APPLY_FORBIDDEN` is BUILT; keep it).

### 3.4 Submit for you (the Agent equivalent)
- **Baseline:** marketed as submitting for you; in practice a waitlist or beta for a "small portion" (REPORTED); bot
  blocks handed back as manual applications; up to 50 a week (2025).
- **Parity:** an approved batch on Greenhouse, Lever and Ashby with 20 real applications per ATS and recorded
  outcomes, available to every user who passes the owner gate, with no waitlist.
- **Better:**
  - Published verified-submit rate (Jobright publishes none).
  - Handoff on a block resumes the same application. Target: at least 80% of blocked applications completed after
    handoff, against Jobright's "apply manually".
  - Capacity of 105 a week at the 15-a-day cap, above the relevance floor.
- **Cost note:** see section 6. If Jobright runs the agent in its cloud (ASSUMED), each submission costs it browser
  minutes. Trainee's in-person-browser path is about $0.004 (ASSUMED).

### 3.5 Answers and memory
- **Baseline:** an invented team project and conference in an agent answer (REPORTED).
- **Parity:** every open-ended answer cites stored facts; unknowns are asked, never invented (5c BUILT for letters;
  5e PARTIAL for real forms).
- **Better:** 0 unsupported claims in 100 sampled open-ended answers per release. Every specific (project, metric,
  event, employer) traces to a confirmed fact, or the answer is not sent.

### 3.6 Receipts and tracking
- **Baseline:** application tracking in the app; no receipts or confirmations found.
- **Parity and Better:** as standard 3.4 and 3.5. 100% of SUBMITTED have employer proof. Inbox routing at 98% on 200
  emails. Tracking works without an inbox.

### 3.7 Networking
- **Baseline:** insider discovery (alumni, past colleagues), insider email addresses from an "email finder",
  templates, metered credits; the 4x claim is unsourced.
- **Parity:** paths from the person's own connections (their LinkedIn data export, contacts they supply) plus public
  pages. No LinkedIn scraping, no Apollo or Hunter product use.
- **Better:** 100% of addresses labelled verified or guessed (11c BUILT), with the source of each named. 0 auto-sends.
  Drafts cite at least 1 sourced fact about the contact. Reply rate is measured per draft, so the effect of referrals
  is our own number, not a borrowed 4x.
- **Cost note:** no paid email-data vendor in the default path; verification by DNS lookup (the verifier exists but
  nothing is injected in prod, per REQUIREMENTS 11c).

### 3.8 Interview prep
- **Baseline:** Orion chat help; generic for niche roles (REPORTED); no structured mock found.
- **Better:** role-specific prep from the posting and the submitted resume version within 10 minutes of an interview
  email. A rubric-graded mock. 0 hallucinated company facts in a 20-session review sample (standard 3.8).

### 3.9 Pricing and billing trust
- **Baseline:** no public price; $39.99 a month REPORTED; no trial; refunds discretionary; billing makes up a large
  share of one-star reviews (REPORTED).
- **Target:** a public price page, cancellation in one message, a confirmation of cancellation by message, and a
  pro-rata or failed-application refund rule written down before launch. 0 charges after a confirmed cancel,
  measured on the billing log.

## 4. What Jobright does NOT have

Absence is a strong indication, not proof.
- No receipts or stored employer confirmations (none found).
- No in-application handoff: blocked sites go back to the person as manual applications (REPORTED).
- No truth guarantee or diff on tailoring; fabrication REPORTED.
- No published success rate or controlled interview-rate data.
- No outcome funnel that tells a person to apply less (none found).
- No public pricing page and no stated refund rule (REPORTED).
- No coverage outside the US (VERIFIED-S).
- No messaging channel (iMessage, WhatsApp, SMS) found.
- No documented handling of verification codes, account sign-in or Workday tenants for the agent (not checked).

## 5. Scoreboard

"Trainee today" is taken from `REQUIREMENTS.md` (2026-10-19). I did not re-run those tests. Nothing has run live.

| Capability | Jobright (labelled) | Trainee target (measurable) | Trainee today |
|---|---|---|---|
| Job feed | 400K+ a day claimed (REPORTED); US-only (VERIFIED-S) | Dead postings out within 24 h; match reasons on every alert | 2,179 boards BUILT behind a flag; default chat `postings: []`; freshness every ~2 h; live NOT_RUN |
| Match score | 0-100 (VERIFIED-S) | Never presented as odds on any path | 3e PARTIAL (agent path says "real odds") |
| Sponsorship filter | H1B filter (VERIFIED-S) | Filter by the person's stated need | 1b PARTIAL; 2b keyword-only |
| Tailoring | Unlimited on Turbo; fabrication REPORTED | 0 invented facts in 100 a release | 4b truth gate in tests; 4c, 4e PARTIAL |
| Fill in the person's browser | Autofill extension, "random information" (REPORTED) | Readback 90% Greenhouse, 85% Lever; 0 silent wrong values | No extension; fixture fill BUILT (7c, 7d); real NOT_RUN |
| Submit for you | Agent: waitlist or beta (REPORTED) | 20 real per ATS, open to all after the owner gate | 0 submitted; owner gate NOT_RUN |
| Open-ended answers | Invented project (REPORTED) | 0 unsupported claims in 100 | 5c BUILT (letters); 5e PARTIAL |
| Bot block | Hand back, apply manually (REPORTED) | Same-session handoff; at least 80% completed | 8a NONE; 8b PARTIAL |
| Receipts | None found | 100% of SUBMITTED with employer proof | 7h BUILT (tests); 9b PARTIAL; no inbox reader |
| Networking | Insider emails via email finder (REPORTED) | Verified/guessed labelled 100%; 0 auto-send | 11a PARTIAL; 11c, 11e BUILT |
| Interview prep | Orion chat (REPORTED) | Prep within 10 min, rubric-graded | 12a-12e PARTIAL; 12d BUILT |
| Billing trust | Billing-heavy one-star reviews (REPORTED) | 0 charges after confirmed cancel | No billing yet: NOT_RUN |

## 6. Pricing and unit economics

**Their price (REPORTED; no public page):** Turbo $39.99 a month, $17.99 a week, $89.99 a quarter. The agent was
reported at "up to 50 listings each week" (2025). If a Turbo user received and applied to 50 a week (about 215 a
month), the price per agent application is about **$0.19** at the monthly price, or about **$0.14** on the quarterly
plan. This is an upper bound on the buyer's cost per application, not Jobright's cost (ASSUMED arithmetic).

**Architecture inference (ASSUMED):**
- **Autofill: the extension in the person's browser** (architecture B). The person lands on the real form and submits
  (REPORTED). The near-zero cost per fill would explain why 4 autofills a day can be free (ASSUMED).
- **Agent: a server browser or a third-party route** (architecture C), ASSUMED for three reasons. (1) "Respects sites
  that block bots": only a server-side agent meets bot blocks as a routine category. An extension in a real person's
  browser mostly does not. (2) "Often routed via third-party boards" (REPORTED) suggests it applies where a board's
  own flow is simple, not on the employer's ATS. (3) A waitlist and a paywall to "skip waiting" fit rationed,
  per-run compute. Counter-hypothesis: a tab driven in the person's browser. Test 8.5 distinguishes them.
- **Cost implication:** at about $0.025-0.05 per server-browser application (cost-model-applying.md, ASSUMED), 215
  applications a month cost about $5-11 against $39.99 of revenue. That is viable but rationed, which matches the
  waitlist. Their free funnel (daily credits on cheap paths) and the Indeed-backed employer side (ASSUMED revenue)
  subsidize it.
- **Trainee implication:** competing on volume against a funded, Indeed-backed matcher loses. The measurable edges
  are the truth guarantee (fabrication is their REPORTED failure), handoff completion and published proof.

## 7. Failure modes and complaints

Primary Reddit threads could not be opened. Several sources are competitor-run review blogs; each is labelled.

1. **Fabricated resume content:** "inserting skills that were never on the original resume and fabricating metrics",
   "false skills, fabricated metrics, or credentials", 18+ Reddit users in one review's sample. REPORTED.
   wobo.ai/blog/jobright-review/; resumly.ai/answers/jobright-review (resumly sells a competing product)
2. **Invented experience in an agent answer:** a team project and conference the user never had (Dec 2025 Reddit, a
   paying user). REPORTED, single account. careery.pro/blog/ai-job-search/jobright-ai-review (competitor publisher)
3. **Autofill enters wrong data:** "can occasionally enter random information into application forms", plus problems
   with external job links and cover-letter integration. REPORTED (Trustpilot AI summary). trustpilot.com/review/jobright.ai
4. **Agent not delivered as sold:** a waitlist with a paid "skip"; beta for "a small portion"; it "sends you to the
   company site to finish by hand"; "beta-quality". REPORTED. jobity.io/blog/jobright-review; resumly.ai; adzuna.co.uk
5. **Billing and cancellation:** "about 72% of one-star Trustpilot reviews involve billing or cancellation" (one
   analysis, zplatform.ai, repeated by others, so not independent). Charges after cancel attempts, no confirmation
   screen, auto-renewal without warning; Reddit screenshots of charges after cancelling (cited, not seen). REPORTED.
   zplatform.ai/ai-reviews/jobright-ai/; pitchhired.com/blog/is-jobright-legit
6. **Price rise:** Turbo from $29.99 to $39.99 in 2026. REPORTED.
7. **Stale or duplicate listings:** "aggregated listings can become stale, duplicated or misclassified"; a Reddit
   complaint about expired listings. REPORTED.
8. **Aggressive upsell and mixed match relevance.** REPORTED. careery.pro
9. Not found: account bans, captcha failures, duplicate *submissions*. Absence of evidence.

## 8. Ground-truth test plan (plan only: nothing was run, signed up for or submitted)

Precondition: the owner reads Jobright's Terms (automation consent, refund wording) and Privacy Policy, then tests as
a normal user with his own resume on his own machine. No scraping, no LinkedIn automation, no Easy Apply.

1. **Free tier, day 1.** Upload a resume and set preferences. Record: matches shown, the share that are live (open each
   apply link on the employer's own board), the share that are expired, and the share matching the stated location
   and level. Note the match score shown for each.
2. **Freshness.** For 25 matches on Greenhouse, Lever or Ashby boards, compare the posting's first appearance in
   Jobright with Trainee's `first_seen_at` for the same posting.
3. **Tailoring truth audit.** Tailor 2 resumes (the free daily cap). Diff each against the source resume and count
   every added skill, metric, credential or employer fact not in the source. Any non-zero count confirms failure 1 as
   VERIFIED.
4. **Autofill, no submit.** 4 autofills (the free cap) on Greenhouse, Lever, Ashby and Workday forms. Press autofill,
   **do not submit**. Count fields right, wrong, blank and flagged; check whether the resume attached is the right file.
5. **Agent availability.** Is the agent offered, waitlisted or paywalled? If the owner chooses one month of Turbo: run
   at most 5 agent applications on roles he genuinely wants, under supervised mode. Record which ATS each goes to (the
   employer's own or a third-party board), whether it runs with the laptop closed (architecture), what it shows before
   submit, whether the employer's confirmation email arrives, what happens at a captcha, and every free-text answer
   verbatim (failure 2).
6. **Insider connections.** For one target company: who is surfaced, and where each email address comes from (is it
   labelled verified?). Send nothing.
7. **Orion.** Ask for interview prep for one real posting. Count company facts that cannot be traced to the posting
   or a cited source.
8. **Cancel.** Cancel the same day. Record whether a confirmation is shown or emailed, then check the next statement
   for any further charge.
9. Write results into `docs/competitors/mass-applying.md` with VERIFIED labels.

## 9. What Trainee must add or change because of Jobright (ranked by launch risk)

### Kills launch
1. **A zero-fabrication gate on every outgoing word, not just on tailored resumes.** Jobright's REPORTED failures are
   invented skills and metrics, and an invented project in an agent answer. Trainee's truth audit is a hard gate in
   the tailor (career-tailor), and letters are fact-cited (5c BUILT). But open-ended answers on real forms go through
   the submission engine, whose real-form worker is NOT_WIRED (5e). Required: the submission engine refuses to submit
   any free-text answer containing a specific (project, metric, employer, event, credential) that does not trace to a
   confirmed fact, and asks the person instead. Label: REPORTED (theirs); NOT_RUN (ours on real forms).
2. **Never market what does not run.** Jobright's REPORTED gap between "submits for you" and a waitlist is a trust
   wound. Trainee has 0 submissions. No user-facing copy may say Trainee applies until the owner's 3 confirmed
   applications per ATS exist (standard sections 5 and 10). Label: NOT_RUN.
3. **Bot checks handed to the person, in the same session, never evaded.** Jobright's REPORTED answer to a block is
   "apply manually". Trainee's CAPTCHA_HANDOFF today hands over the posting URL (8a NONE), which is the same thing:
   the person starts over. Required for the submission engine: keep the filled page alive, show it to the person in a
   visible browser, let them clear the check, and resume from that page with readback of every field before submit.
   The fixture version exists; the real provider's requests are blocked after the first fill (REQUIREMENTS P0, "next
   commit"). No captcha solvers, proxies or stealth. Ever. Label: REPORTED (theirs); PARTIAL (ours).

### Embarrasses at 100 users
4. **Verification codes and account sign-in without an inbox.** Not documented for Jobright (not checked). Greenhouse
   sends email codes to some applicants (VERIFIED-S, support.greenhouse.io 115005448066). The engine must detect a
   code field, ask the person for the code in chat, type it into the waiting page within the code's validity, and
   record UNKNOWN (never retry blindly) if the page expired. Sign-in: the person signs in themselves (D-013). Label:
   ASSUMED gap (no test exists for a code step).
5. **Receipts that a person can check.** Jobright shows none (absent). Trainee's 7h completes only on accepted plus a
   confirmation id (BUILT in tests), but with no inbox reader (9c MODULE) the employer's email cannot be stored. Until
   then, receipts must read UNCONFIRMED, not "submitted". Label: from REQUIREMENTS.md.
6. **Duplicate prevention against the person's other tools.** Users of Jobright's autofill and Trainee could apply
   twice to the same role. Check the tracker and ask before submitting to any employer and role already recorded from
   any source; respect Ashby's per-candidate limits (VERIFIED-S, docs.ashbyhq.com/application-limits). Label: ASSUMED
   gap.
7. **Expired postings never reach an approval card.** Jobright's REPORTED stale listings. Trainee closes expired
   postings only on a full re-read (2c PARTIAL). Required: re-check the posting is live immediately before fill, and
   stop with "this role closed" rather than submitting into a dead form. Label: PARTIAL.
8. **Billing trust from day one.** Billing dominates Jobright's REPORTED one-star reviews. A public price, cancel by
   one message, and a written refund rule (standard 3.5, 6.3). Label: REPORTED (theirs); NOT_RUN (ours).

### Matters at 10,000 users
9. **File uploads and multi-page forms on real systems.** Not documented for Jobright's agent. Trainee: 7c BUILT on
   fixtures only (skips without Playwright). Required: 20 real uploads per ATS with a post-upload readback of the file
   name and hash (only on the `wo/009b-*` branch today). Label: NOT_RUN.
10. **Workday.** Jobright's directory listing claims Workday autofill (REPORTED). Trainee: D-013 pending; last in gate
    order (standard gate 8).
11. **A sponsorship filter as good as theirs.** H1B-history matching is a reason international students pick Jobright
    (VERIFIED-S). Trainee stores the person's sponsorship need (1b) but does not filter by employer history. Label:
    PARTIAL.
12. **Networking data without scraping.** Jobright's "email finder" (REPORTED) sets a user expectation of addresses.
    Trainee must meet it only from permitted sources and label guesses (11c), and accept the lower yield.
