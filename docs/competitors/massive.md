# Massive (usemassive.com): teardown against the Trainee build standard

Template: `docs/product/BUILD-STANDARD-TSENTA.md` (sections 0-12). Trainee state: `docs/product/REQUIREMENTS.md` (audit of
2026-10-19) and `docs/product/cost-model-applying.md`. Written 2026-10-19.

## 0. Labels and method

Labels (the standard's section 0, with one sub-label made explicit because no page could be opened):
- **VERIFIED**: read on a live page or measured in our own runs. *Nothing in this document reaches this bar*: no page
  could be opened from this environment.
- **VERIFIED-S**: the claim appears in a search-engine extract of the cited URL, which belongs to the company itself (its
  own site, its App Store listing, its own reply on Trustpilot). It proves the company *says* it, not that it is
  true. Search extracts are produced by the search tool and can paraphrase; a strict reader should treat VERIFIED-S
  as REPORTED until the page is opened by a person.
- **REPORTED**: a third party says it (review sites, many of which sell a competing product; Trustpilot reviewers as
  quoted in extracts; aggregators; press). Not checked.
- **ASSUMED**: our inference. A hypothesis to test, never a fact to build on.

Method and limits (accessed 2026-10-19):
- WebFetch failed on every host (`getaddrinfo ENOTFOUND usemassive.com`, `trustpilot.com`), and curl through the agent
  proxy got `CONNECT tunnel failed, response 403`. Everything below comes from WebSearch extracts.
- Sources reached through extracts: app.usemassive.com, experts.usemassive.com/verify, apps.apple.com/us/app/-/id6642717648,
  trustpilot.com/review/usemassive.com (several country mirrors), linkedin.com/company/wowitsmassive,
  usemassive.notion.site (named in an extract, never shown directly), loopcv.pro/directory/massive, scoutify.com/blog/massive-review,
  scale.jobs (two posts), sorce.jobs/reviews/massive, jobara.ai/blog/use-massive-review, jobcopilot.com/use-massive-review,
  adzuna.com/blog/usemassive-review-alternatives, woshipm.com/operate/6418152.html, metz.substack.com/p/massive-wages-war-on-the-job-application,
  caplight.com/company/usemassive, crunchbase.com/organization/hoodle, ratingfacts.com, scam-detector.com.
- Not checked: the pricing page (reviews say there is none), terms of service, privacy policy, the ATS list, the
  Notion help pages, Android availability, the actual App Store reviews' text, Reddit threads (all Reddit claims below
  are secondhand through review blogs), and any first-hand run. The WebSearch budget for this session (200 calls,
  shared by all agents) ran out during this research.
- **Conflict of interest warning.** Most third-party write-ups (Scoutify, Scale.jobs, Sorce, Jobara, JobCopilot, LoopCV,
  Adzuna) sell a competing product. Their claims are REPORTED with that bias, and Scoutify's author discloses the
  conflict.
- **Name collision.** "Massive" (joinmassive / proxyway reviews) is an unrelated residential-proxy vendor. Nothing here
  is about it. The same usemassive.com domain also hosts `experts.usemassive.com`, an "Expert Sourcing for AI" business
  recruiting domain experts for AI labs (VERIFIED-S, experts.usemassive.com/verify). Whether it is the same company
  pivoting or adding a business line is ASSUMED unknown.

## 1. What the product is

| Item | Finding | Label | Source |
|---|---|---|---|
| Product | "Automated job search" that finds jobs and applies to them for the member; job matching and a custom resume per job | VERIFIED-S | app.usemassive.com |
| Members | "Over 10,000 members" | VERIFIED-S (claim) | app.usemassive.com |
| Company | "Do a Huddle, Inc.", a small New York City startup | REPORTED | jobara.ai/blog/use-massive-review |
| Founder | Dan Vykhopen (woshipm) / Dan Vykopen (Substack); the spelling differs between sources. Contact dan@usemassive.com | REPORTED (name), VERIFIED-S (contact on the LinkedIn page and App Store listing) | woshipm.com/operate/6418152.html; metz.substack.com; linkedin.com/company/wowitsmassive |
| Team | Founder, one full-time engineer, a few virtual assistants and operations staff | REPORTED | woshipm.com/operate/6418152.html |
| Revenue | About $200K a month, more than $2M ARR. Early months were about $20K a month, with tight funds | REPORTED (unaudited; secondhand) | woshipm.com/operate/6418152.html |
| Funding | Caplight lists a seed round in November 2021 and $12.5M total. Crunchbase files the organization under the slug "hoodle". Neither confirms that the money went to the job product, and $12.5M sits badly with "funds were tight, one engineer" | REPORTED, conflicting | caplight.com/company/usemassive; crunchbase.com/organization/hoodle |
| Growth story | A LinkedIn test post about the idea reportedly reached about 8M impressions; waitlist leads were mostly dead; the first paying users came from the founder's one-to-one DMs, then UGC, creators and paid ads | REPORTED | woshipm.com |
| Ratings: App Store | "Massive: Swipe & Apply", 4.7 from about 1.2K ratings, free with in-app purchases | VERIFIED-S | apps.apple.com/us/app/-/id6642717648 |
| Ratings: Trustpilot | Snapshots disagree: 2/5 from 41 reviews; 2.3 from 30; 1.8 "Poor"; 1.7 from 43 as of 2026-09-30 (Scoutify); the mirror page titles show 39 reviews; ratingfacts lists 2.1 | REPORTED | trustpilot.com/review/usemassive.com; scoutify.com/blog/massive-review; ratingfacts.com |
| Surfaces | iOS swipe app; web app (app.usemassive.com); email (confirmations and invites "arrive in your inbox"). No Chrome extension, Android app, iMessage, WhatsApp or API was found | VERIFIED-S (iOS, web); absence not proven | apps.apple.com; app.usemassive.com |
| How it makes money | Subscription tiers sized by application volume, with a free trial that bills automatically | VERIFIED-S (tiers on the App Store; trial from the company's own Trustpilot reply) | apps.apple.com; trustpilot.com |

Reading the gap between ratings: 4.7 on 1.2K App Store ratings against about 2 on roughly 40 Trustpilot reviews. App
Store ratings are often prompted in-app at a happy moment (swiping), while Trustpilot collects people who were billed
or got no interviews. That reading is ASSUMED. Neither number measures interviews.

## 2. Capability inventory

| # | Capability | What Massive does or claims | Label | Source |
|---|---|---|---|---|
| 2.1 | Discovery | Scans "hundreds of job boards, company career pages, and VC websites"; finds roles daily; matches on the person's criteria | VERIFIED-S (Notion page, through an extract) / REPORTED (daily) | usemassive.notion.site (named in an extract); jobara.ai |
| 2.1a | Discovery quality | Applied to hybrid and in-person roles "NOWHERE near where I lived"; applications to roles outside the person's preferences; expired postings; "applications sent weeks after a role was posted" | REPORTED (users) | trustpilot.com/review/usemassive.com; adzuna.com (quoting Scoutify) |
| 2.2 | Prep: resume | "Customizes your resume and cover letter for every job" | VERIFIED-S | apps.apple.com/us/app/-/id6642717648 |
| 2.2a | Prep: truthfulness | Users report "invented skills" and "invented expertise" | REPORTED | scoutify.com (competitor); adzuna.com |
| 2.2b | Prep: profile | The person builds a structured profile because "the bots need structured text to inject into the various fields of an ATS" | REPORTED | scale.jobs (competitor) |
| 2.3 | Apply: mode | A cloud "Apply as a Service" platform that runs on remote servers and submits without the person present. Sorce says the flow is "more guided than fully automated" | REPORTED, conflicting | scale.jobs; sorce.jobs/reviews/massive (both competitors) |
| 2.3a | Apply: approval | The iOS app is "Swipe & Apply". A swipe looks like a per-job yes, but the trial reportedly "queues" applications, and whether a swipe approves the exact resume and answers sent is unknown | VERIFIED-S (name); ASSUMED (what a swipe approves) | apps.apple.com |
| 2.3b | Apply: ATS coverage | Lever- and Greenhouse-style forms "go through fine". One Reddit tester saw it fail on 9 of 19 sites. Workday "inconsistent". No ATS list found | REPORTED (secondhand Reddit) | jobara.ai |
| 2.3c | Apply: manual fallback | "It couldn't apply and I need to apply manually for some jobs" | REPORTED (user) | trustpilot.com |
| 2.3d | Apply: duplicates | "Applied to the same job multiple times". Trustpilot's AI summary flags duplicate applications | REPORTED (users) | trustpilot.com |
| 2.4 | Tracking | Confirmations and interview invites "arrive in your inbox". Users say the emails carry a generic subject and cannot be told apart by job | VERIFIED-S (claim) / REPORTED (complaint) | apps.apple.com; jobcopilot.com |
| 2.4a | Email identity | "Employer replies routed through an email address that Massive controls" (a "forced proxy email") | REPORTED (Scoutify, through Adzuna's extract) | adzuna.com/blog/usemassive-review-alternatives; scoutify.com |
| 2.5 | Receipts | No receipt, proof or per-application record was found in any source | Absent from sources | n/a |
| 2.6 | Handoff | Nothing found on how captchas, logins or verification codes are handled. The founder talks about CAPTCHAs as part of the "war" on the process | REPORTED (topic only) | metz.substack.com |
| 2.7 | Networking | None found | Absent from sources | n/a |
| 2.8 | Interview prep | None found | Absent from sources | n/a |
| 2.9 | Memory | A structured profile only | REPORTED | scale.jobs |
| 2.10 | Guidance | When users complain, the company replies "most folks land a lot of interviews but some don't and it usually boils down to resume and the jobs you're applying to", and offers a resume review and free months | VERIFIED-S (company replies on Trustpilot) | trustpilot.com |
| 2.11 | Volume caps | App Store tiers: Pro 150 jobs, Ultra 600 jobs. Reviews: 50 (Passive) and 200 (Massive+) a month; "up to 200 a month" | VERIFIED-S (App Store) / REPORTED (others), conflicting | apps.apple.com; jobara.ai; scale.jobs |
| 2.12 | Surfaces | iOS, web, email | VERIFIED-S | as above |
| 2.13 | Pricing | Not published on the site. About $59 a month or about $117 a quarter. A 4-day free trial that bills unless cancelled. A 30-day money-back guarantee that is "voided once the bot has applied to too many jobs" | REPORTED (prices, guarantee); VERIFIED-S (trial, company reply) | scale.jobs; scoutify.com; jobara.ai; trustpilot.com |
| 2.14 | Honesty posture | No published interview rate, no failure rate, no definition of "applied". The founder frames it as restoring "dignity to hiring" and quotes the unsourced "over 75% of applications screened by AI" | REPORTED | metz.substack.com |

## 3. Acceptance targets for Trainee against Massive

The standard's targets in section 3 still hold. These are the Massive-specific additions and the bars Massive sets.

**3.1 Discovery: relevance, not reach.**
- BASELINE: "hundreds of boards, career pages, VC sites", daily (VERIFIED-S claim). Users report wrong location, expired
  postings and applications weeks late (REPORTED).
- PARITY: daily matching across Trainee's 2,179 boards *reaching the default chat* (today the default router gets
  `postings: []`, REQUIREMENTS "What the tally hides" 2). Location and arrangement are hard filters: 0 applications
  outside the person's stated location or arrangement on a 200-posting audited sample.
- BETTER: (a) posting age at application: median under 72 hours and 0 applications to postings closed at submit time,
  measured from `first_seen_at` and the submit result; (b) location mismatches 0 per 1,000 applications (Massive's most
  specific complaint). Each needs a measured number before it is claimed.
- COST NOTE: hard filters cost nothing. Freshness costs crawl cadence (boards are read about every 2 hours today).

**3.2 Prep: truthfulness.**
- BASELINE: custom resume and cover letter per job (VERIFIED-S); "invented skills/expertise" complaints (REPORTED).
- PARITY: a tailored resume and letter per role, after the person approves.
- BETTER: invented-fact rate 0 on 100 sampled tailored documents per release, with an automated check against the fact
  bank and a 20-document human audit (standard 3.2). Every added skill traces to a confirmed fact (4b and 4c are
  PARTIAL today).
- COST NOTE: one tailoring pass is about $0.002-0.004 in model tokens (cost model, ASSUMED). The truth audit is a second
  pass of similar size.

**3.3 Apply: proof and duplicates.**
- BASELINE: cloud submission with no receipts found; duplicates and "couldn't apply" reported; 9 of 19 sites failed for
  one tester (REPORTED).
- PARITY: Greenhouse, Lever and Ashby at 20+ real applications each, with readback-verified fill (standard 3.3).
- BETTER: 0 duplicate submissions per person per role across sources (the same role on a career page, on Greenhouse
  and on an aggregator counts as one), measured on the application log over the first 1,000 applications. A published
  verified-submit rate.
- COST NOTE: dedupe is a key on (employer, normalized title, location, ATS job id) at queue time. Cheap.

**3.4 Track: the person keeps their own inbox.**
- BASELINE: confirmations to the person's inbox (VERIFIED-S); employer replies reportedly routed through a
  Massive-controlled address (REPORTED); emails indistinguishable by job (REPORTED).
- PARITY: status per application without inbox access (standard 3.4).
- BETTER: 100% of applications submitted with the person's own email address (never an address Trainee controls), so
  every employer reply reaches them even if Trainee disappears. Each Trainee message names the employer and the role.
- COST NOTE: zero. This is a policy choice, not a cost.

**3.5 Receipts.**
- BASELINE: none found.
- PARITY and BETTER: standard 3.5 unchanged. Massive sets a low bar here. Do not take credit for beating it until our
  own receipts carry employer proof.

**3.6 Handoff.**
- BASELINE: unknown. The proxy email suggests that verification codes are read by Massive and not by the person (ASSUMED).
- TARGET: standard 3.6 (handoff within 60 seconds, resume within 60 seconds, no duplicate caused by a resume). Codes
  are entered by the person or forwarded by them. Trainee never takes over the address.

**3.7 Billing and trial honesty (Massive-specific).**
- BASELINE: a trial that bills automatically after 4 days (VERIFIED-S); "queued but none submitted during the trial"
  (REPORTED); a voided guarantee; cancellation and refund failures (REPORTED).
- PARITY: self-serve cancellation in one step, from chat ("cancel my plan") and from the web.
- BETTER: no trial auto-converts without an explicit yes in chat 24 hours before the charge; every free-tier
  application is submitted (or reported FAILED with a reason) inside the trial window; refund disputes = 0 in the
  first 1,000 paying users.
- COST NOTE: an unwanted charge that turns into a chargeback costs the dispute fee plus the user. It is not cheaper to
  keep.

**3.8 Outcome guidance.**
- BASELINE: blames the resume and the targets after the fact (VERIFIED-S replies).
- TARGET: standard 3.4 throttle rule. After 30 applications in a role family with 0 replies, the product says so
  before the person complains, with the reasoning. The reviewers' "340+ applications, 0 interviews" case must be
  impossible to reach silently.

## 4. What Massive does not have (absence on a page is a strong indication, not proof)

From every extract read on 2026-10-19:
- No published ATS list, success rate, failure rate or interview rate.
- No receipts or proof of submission mentioned anywhere.
- No networking, referral or outreach feature.
- No interview prep, mock interviews or offer help.
- No career guidance beyond reactive resume reviews offered in complaint replies.
- No Chrome extension, Android app, messaging channel or API found.
- No published price on its own site (REPORTED by two reviews).
- No statement that the resume uses only true facts.
- No statement on captcha or bot-check handling, and no "undetectable" claim either way.

## 5. Scoreboard

| Capability | Massive (labeled) | Trainee target (measurable) | Trainee today (from REQUIREMENTS.md) |
|---|---|---|---|
| Applications actually submitted | Yes, at volume; >10,000 members (VERIFIED-S claim) | 20+ real per launch ATS, owner gate of 3 first | 0 submitted, ever (VERIFIED, audit 2026-10-19); owner's 3 per ATS NOT_RUN |
| Discovery reaching the user | Daily matches (REPORTED) | Default chat sees real postings | 2a BUILT only behind `CAREER_BRAIN=agent`; default router gets `postings: []` (VERIFIED, audit) |
| Location/arrangement filter | Fails per users (REPORTED) | 0 mismatches per 1,000 applications | 2b PARTIAL: remote stored but not filtered (VERIFIED, audit) |
| Tailored resume | Every job (VERIFIED-S); invented skills (REPORTED) | 0 invented facts per 100 sampled | 4b/4c PARTIAL; truth-audit gate exists (VERIFIED, audit); live NOT_RUN |
| Cover letter | Every job (VERIFIED-S) | Fact-cited, company-specific | 5a PARTIAL: router cover-letter route always refuses (VERIFIED, audit) |
| ATS coverage | Lever/Greenhouse fine; 9/19 sites failed for one tester; Workday inconsistent (REPORTED) | GH, Lever, Ashby at 20+ each; Workday later | GH/Lever/Ashby in code; Workday pending D-013 (VERIFIED, audit); live NOT_RUN |
| Duplicate prevention | Duplicates reported (REPORTED) | 0 per person per role across sources | 7f BUILT for the same posting; cross-board dedupe 2c only on the router's empty pool (VERIFIED, audit) |
| Email identity | Proxy address reportedly controlled by Massive (REPORTED) | 100% of applications use the person's own address | ASSUMED own address (the planner fills the person's facts); not audited |
| Receipts | None found | Receipt + employer proof; UNCONFIRMED when unproven | 7h, 9e BUILT; 9b PARTIAL (documents only as sha256) (VERIFIED, audit) |
| Handoff | Unknown | Handoff <60 s, resume <60 s | 8a NONE, 8b PARTIAL (VERIFIED, audit); same-page resume on a fixture only |
| Trial/billing | Auto-bill after 4 days; refund failures (REPORTED) | Explicit yes before any charge; 0 disputes in first 1,000 | No billing exists (ASSUMED from the audit: no billing row) |
| Volume | 150/600 a month (VERIFIED-S) | Cap of 15 a day, not raisable (owner, 2026-10-19) | Cap 15 on an unmerged branch, PR #23; trunk paths disagree, 25 vs 15 (VERIFIED, audit) |
| Interview prep | None | Role-specific, tied to the submitted resume | 12a-12e PARTIAL/BUILT (VERIFIED, audit) |
| Networking | None | Sourced drafts; the person sends | 11a-11e PARTIAL/BUILT, sending disabled (VERIFIED, audit) |
| History export | Unknown | Downloadable export | 1e PARTIAL: no downloadable export (VERIFIED, audit) |

## 6. Pricing and unit economics

**Price.** Not published on its site (REPORTED). About $59 a month or $117 a quarter (REPORTED). App Store tiers of 150
and 600 jobs (VERIFIED-S). At $59 for 150 to 600 applications, the price per application is **$0.10-0.39**
(ASSUMED arithmetic on REPORTED prices). That is 3 to 18 times Tsenta's $0.022-0.032 (VERIFIED-S in our cost model).

**Architecture (ASSUMED, with the reasoning).** Server-side browser automation (architecture C):
1. Third parties describe it as cloud "Apply as a Service" that "runs on remote servers" and works without the person
   present (REPORTED).
2. Its main client is an iOS swipe app. An iPhone app cannot run a desktop-browser form filler in the background, so
   the filling must happen on Massive's servers (ASSUMED, strong).
3. A Massive-controlled email address in the applications (REPORTED) fits a server that creates ATS accounts and reads
   verification codes on its own. A person's own inbox would need OAuth access, and nothing mentions an inbox
   connection (ASSUMED).
4. No extension was found, so architecture B is unlikely. Direct API submission (A) cannot be ruled out for Greenhouse
   and Lever, whose public boards accept posts, but nothing points to it (ASSUMED).

**What that implies for its cost (ASSUMED, using our cost model's unit prices):** browser time is about $0.008 per
application; a residential proxy, if used, $0.012-0.04; resume and letter generation per job about $0.003-0.006. That
totals about **$0.02-0.06 per application**, under a price of $0.10-0.39. The margin is healthy at that price, so the
weak point is not unit cost. It is churn and refunds: a single chargeback (typically $15-25 in fees, ASSUMED) erases
the margin on hundreds of applications. Our edge is not "cheaper than Massive" (never claim it before 30 days of
measured cost, standard 5). It is being right about *which* applications are worth sending.

## 7. Failure modes and complaints

Each item is a user report as quoted in an extract (REPORTED unless stated). None was checked first-hand.

1. **Paid for volume, got nothing.** "$240 or so to not get a single interview after 340+ applications in a field where I
   have seven years of experience is wild. My interview rate applying manually via LinkedIn is way higher."
   (trustpilot.com, via search extract.)
2. **Wrong jobs.** "It applied me to a bunch of jobs that were hybrid or in-person, but NOWHERE near where I lived. For
   $300, I got 107 applications and a single interview." (trustpilot.com.) A 0.9% interview rate, under Huntr's lowest
   volume bucket (2.58-2.86%).
3. **Duplicates.** "Applied to the same job multiple times" (trustpilot.com). Against Ashby's employer setting that caps
   applications per candidate and shows a blocked list (VERIFIED-S, docs.ashbyhq.com/application-limits), duplicates can
   get the person blocked at that employer. That consequence is ASSUMED.
4. **Invented content.** "Invented skills", "invented expertise" (scoutify.com, a competitor, quoted by adzuna.com).
5. **Late and dead postings.** "Applications sent weeks after a role was posted", "expired postings" (scoutify.com;
   adzuna.com).
6. **Email taken over.** "Employer replies routed through an email address that Massive controls" (scoutify.com via
   adzuna.com). If true, the person's correspondence with employers depends on Massive's uptime and on its staying in
   business. That is the Sonara lesson (see `sonara.md`).
7. **The trial queues and then bills.** "In the trial plan all applications are queued but none gets submitted ... the
   platform waits for the trial period to end before charging" (trustpilot.com). A "$150 charge out of nowhere" after a
   trial believed free (trustpilot.com). The company's reply: "a completely standard 4-day free trial ... if you don't
   cancel during the trial, you get billed" (VERIFIED-S, company reply).
8. **Cancel and refund.** "It does not cancel down and I have been charged". An $89 refund request went unprocessed and
   the card dispute was "resolved in favor of the merchant" (trustpilot.com). The company says it "canceled and
   refunded your account within 1 business day" after the reviewer reached out (VERIFIED-S, company reply). The
   guarantee is "voided once the bot has applied to too many jobs" (jobara.ai).
9. **Coverage holes.** "Couldn't apply and I need to apply manually for some jobs" (trustpilot.com); 9 of 19 sites
   failed for one Reddit tester; Workday inconsistent (jobara.ai, secondhand).
10. **Unreadable tracking.** Generic email subjects that cannot be told apart by job (jobcopilot.com).

Counter-evidence, for balance: a Reddit user reportedly had "two solid interviews three weeks in" (jobara.ai,
secondhand); the App Store rating is 4.7 on 1.2K ratings (VERIFIED-S); the UI is praised even in 1-star reviews (one
is titled "Nice UI") (REPORTED).

## 8. Ground-truth test plan (plan only; nothing was run, no account was created)

To be run by the owner as a normal user, after reading Massive's terms of service and privacy policy. No scraping, no
automation of their app, no LinkedIn or Indeed involvement.
1. **Before sign-up.** Record the pricing shown at checkout, the trial length, the renewal terms, the refund terms and
   whether the "too many jobs" guarantee exclusion is written down.
2. **Email identity.** Note which email address the profile setup requires, and whether it offers or forces an address
   on a Massive domain. For each application, record which address the employer's confirmation email went to.
3. **Trial behaviour.** Count the applications actually submitted (employer confirmation received) during the trial
   against those "queued". This tests the "queued until billed" report.
4. **Relevance.** Set a narrow location (one metro, on-site or hybrid only) and one role family. Count matches outside
   either.
5. **Freshness.** For 25 matched roles, record the posting's first-seen time in Trainee's harvest against the time Massive
   applied.
6. **Truth.** Diff 10 tailored resumes against the uploaded one and count added skills, metrics or titles not in the
   source.
7. **Duplicates.** Watch for the same employer and role applied to twice (two sources, or a repost).
8. **Coverage.** Record the ATS for each application and whether it ended confirmed, failed with a reason, or silent.
   Include Workday and at least one iCIMS or Taleo posting.
9. **Cancellation.** Cancel inside the trial and confirm that no charge follows. Then test a refund request on a paid
   month and time the response.
10. **Write-up.** Record every result in `docs/competitors/mass-applying.md` with VERIFIED labels and the date.

## 9. What Trainee must add or change because of Massive

Ranked by launch risk. Each line carries its evidence label.

**Kills launch**
1. **Never take over the person's email.** Every application uses the person's own address. No Trainee-controlled alias
   is ever written into an employer form, and verification codes come from the person (handoff) or from an inbox they
   connected themselves. *Submission engine:* verification codes have no path today: 9c inbox reader MODULE, no code
   handoff (VERIFIED, audit). Massive's reported proxy email (REPORTED) is the shortcut to avoid. Greenhouse Real
   Talent flags email signals (VERIFIED-S, greenhouse.com/real-talent-terms), so an unfamiliar domain may also be read
   as fraud (ASSUMED).
2. **Duplicate prevention across sources and stacks.** 7f covers the same posting (BUILT, VERIFIED audit), but
   cross-board dedupe (2c) runs only on the router's empty pool, and two apply stacks exist (D-014 NOT_RUN). One person
   applied twice by two stacks to the same Ashby employer is the Massive complaint plus a possible employer block
   (ASSUMED). *Submission engine:* one stack (D-014) and an idempotency key on (person, employer, normalized role)
   before any submit.
3. **Location and arrangement as hard filters before anything is queued.** 2b PARTIAL: remote stored but not filtered
   (VERIFIED, audit). Massive's "NOWHERE near where I lived" is the most concrete complaint in the category (REPORTED).
4. **No honesty defects in our own summaries.** The audit found `speakSummary` claiming over-cap items will resume
   (they never do, 7g) and claiming the card shows "the exact answers" (it shows company, role and fit, 6a) (VERIFIED,
   audit). Massive's reputation is built on billing and claims not matching reality. Fix both before any user sees them.

**Embarrasses at 100 users**
5. **Posting age and closed-posting check at submit.** Reject or flag postings past a freshness limit, and re-check that
   the posting is open just before submitting (2d has no deadline column, PARTIAL). Massive's "weeks late / expired"
   reports (REPORTED) are the failure.
6. **Failure reporting the person can read.** Every application ends SUBMITTED, UNKNOWN or FAILED with a reason the
   person sees (standard 3.3). *Submission engine:* 8c only safe-stops and never recovers; 8d `resolveUnknownOutcomes`
   has no caller (VERIFIED, audit). Massive's "couldn't apply, do it manually" is better than silence, but it arrives
   as a surprise.
7. **Messages that name the job.** Every status message names employer and role (Massive's generic subjects, REPORTED).
8. **Billing honesty when billing exists.** An explicit yes before any trial converts, one-message cancellation, and a
   refund rule that is never voided by our own volume.

**Matters at 10,000 users**
9. **Funnel throttle.** The 30-applications-0-replies rule (standard 3.4) fires before a person reaches Massive's
   340-to-0 story.
10. **Coverage parity on Workday.** Massive reportedly reaches some Workday sites (REPORTED, inconsistent). *Submission
    engine:* Workday and account sign-in wait on D-013. Multi-page forms are BUILT in code (7c), but those tests skip
    without Playwright (VERIFIED, audit), so CI may not be exercising them (ASSUMED).
11. **Receipts that outlive us.** Since the employer's confirmation goes to the person's own inbox (item 1), the
    person keeps the real receipt even if Trainee is gone. Our stored copy (9b PARTIAL) is the convenience, not the
    only record.
