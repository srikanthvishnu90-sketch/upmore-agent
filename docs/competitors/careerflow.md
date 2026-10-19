# Careerflow (careerflow.ai): teardown against the Trainee build standard

Template: `docs/product/BUILD-STANDARD-TSENTA.md`. Trainee state: `docs/product/REQUIREMENTS.md` (audit 2026-10-19) and
`docs/product/cost-model-applying.md`. Written 2026-10-19.

## 0. Labels and method

- **VERIFIED**: read on a live page or measured in our own runs. *Nothing here reaches it*; no page could be opened.
- **VERIFIED-S**: the claim appears in a search-engine extract of Careerflow's own URL (careerflow.ai pages, or its
  own replies on Trustpilot). It proves Careerflow *says* it, not that it works. Extracts can paraphrase. A strict
  reader treats VERIFIED-S as REPORTED until a person opens the page.
- **REPORTED**: a third party says it (reviews, most from competitors; aggregators; an investor newsletter).
- **ASSUMED**: our inference.

Method (accessed 2026-10-19): WebFetch failed (`getaddrinfo ENOTFOUND www.careerflow.ai`), and curl through the proxy got
403. Sources come from WebSearch extracts of careerflow.ai, careerflow.ai/pricing-page, careerflow.ai/faq,
careerflow.ai/autofill, careerflow.ai/job-autofill, careerflow.ai/networking-tracker, trustpilot.com/review/careerflow.ai
(several mirrors), caplight.com/company/careerflow, cbinsights.com, getlatka.com, prospeo.io, lolitataub.substack.com
(Ganas Ventures newsletter), trysignalbase.com, capterra.com/.ca, and review sites named inline (jobsaicopilot.com,
resumehog.com, toolchase.com, jobcopilot.com, remotejobassistant.com, resumejudge.com, 6figr.com, scale.jobs,
scoutify.com, finalroundai.com, loopcv.pro).

Not checked: the terms of service and privacy policy (which matter for the LinkedIn optimizer and for deletion), the
extension's permissions, the autofill ATS list beyond the three named, the Reddit thread one review cites, any
first-hand run, and the "users" number on the homepage. The session's WebSearch budget (200 calls, shared) ran out
before the last two Careerflow searches (user count, Reddit), so they were not run.

## 1. What the product is

| Item | Finding | Label | Source |
|---|---|---|---|
| Product | "Your Career Copilot": LinkedIn Profile Optimizer, AI resume builder with ATS score and keyword analyzer, cover letters, elevator pitch, job tracker (Kanban), networking tracker, application autofill (Chrome), AI mock interview (top tier) | VERIFIED-S | careerflow.ai; careerflow.ai/pricing-page |
| Leadership | Puneet Kohli, CEO; Nikita Gupta, co-founder and COO | REPORTED | caplight.com; cbinsights.com |
| Funding | Pre-seed $800K, 2023-11-20, investors Techstars, Ganas Ventures, Oasis Ventures (Caplight); Rise Ventures and the Greylock Scout Fund (Ganas newsletter). CB Insights reports $120K in March 2023 instead | REPORTED, conflicting | caplight.com/company/careerflow; lolitataub.substack.com; cbinsights.com |
| Valuation | Estimated $12M | REPORTED (Caplight estimate) | caplight.com |
| Revenue | $4M in 2023 (Latka); about $5.3M a year (Prospeo estimate). The investor newsletter (undated in the extract) gives >1,200 subscribers, $38.5K revenue and a 200K+ community | REPORTED, conflicting, unaudited | getlatka.com; prospeo.io; lolitataub.substack.com |
| Team | 38 employees, or a 51-100 band | REPORTED | prospeo.io / aggregators |
| Founded | 2020 (Latka) or 2022 (Prospeo) | REPORTED, conflicting | as above |
| Traffic | Monthly visitors up 42% month over month as of June 2026 | REPORTED | caplight.com |
| Chrome extension | 4.4 from 266 ratings; another review says 4.4 from 288 | REPORTED | stork.ai / loopcv.pro; finalroundai.com or jobsaicopilot.com |
| Trustpilot | 4/5 from 20 reviews; 3.5 from 12; 3.8 from 19 (October 2026 review) | REPORTED, small samples | trustpilot.com/review/careerflow.ai; jobsaicopilot.com |
| Surfaces | Web app and Chrome extension; "integrates with over 50 career websites" | VERIFIED-S (web, extension); REPORTED (50+) | careerflow.ai; prospeo.io |
| Revenue model | Freemium subscription, billed weekly, monthly, quarterly or yearly, with two paid tiers | VERIFIED-S | careerflow.ai/pricing-page |

## 2. Capability inventory

| # | Capability | What Careerflow does or claims | Label | Source |
|---|---|---|---|---|
| 2.1 | Discovery | No crawler or job feed found. Jobs enter the tracker when the person saves them (extension). Some reviewers mention a "job description tool" (analysis, not discovery) | ASSUMED from absence; VERIFIED-S (tools list) | careerflow.ai/pricing-page |
| 2.2 | Prep: resume | Resume builder with "ATS score and keyword analyzer"; free plan has basic ATS scoring and 1 resume (1 tailored resume per one review) | VERIFIED-S (Premium list) / REPORTED (free limits) | careerflow.ai/pricing-page; jobcopilot.com |
| 2.2a | Prep: truth | A 1-star review says the AI "added incorrect information to my resume". No "true facts only" statement found | REPORTED / absent | trustpilot.com (via extract) |
| 2.2b | Prep: letters | "Unlimited AI Cover Letter Writer" (Premium); elevator pitch | VERIFIED-S | careerflow.ai/pricing-page |
| 2.3 | Apply | Chrome autofill on "Greenhouse, Workday, and Lever". **It does not submit**: "you still submit every application yourself" | VERIFIED-S (ATS names) / REPORTED (no submit; several sources) | careerflow.ai/autofill; resumehog.com; 6figr.com |
| 2.3a | Apply accuracy | 60% autofill accuracy on Workday forms (n=45 applications, February-March 2026), from one reviewer whose site may compete. "Some users report integration issues with certain job boards" | REPORTED | one review site among the extract's results (URL not pinned; candidates remotejobassistant.com/blog/careerflow-review, loopcv.pro/directory/careerflow); toolsforhumans.ai |
| 2.3b | Apply labeling | Some vendor lists call the autofill "Auto-apply"; it is not | REPORTED | jobhire.ai |
| 2.4 | Tracking | Kanban job tracker; the free plan is capped at 10 saved jobs (one review) or "limited" (pricing page) | VERIFIED-S (limited) / REPORTED (10) | careerflow.ai/pricing-page; jobcopilot.com |
| 2.5 | Receipts | None; the person submits | ASSUMED (follows from 2.3) | n/a |
| 2.6 | Handoff | Not applicable: the person is present for every submit | ASSUMED | n/a |
| 2.7 | Networking | "Networking Tracker: save jobs and contacts in one place" (limited on free). No discovery of contacts or drafting of notes found | VERIFIED-S | careerflow.ai/networking-tracker; careerflow.ai/pricing-page |
| 2.7a | LinkedIn | "LinkedIn Profile Optimizer" (free); "Advanced AI LinkedIn Optimizer" (Premium). The most consistently praised feature | VERIFIED-S (feature) / REPORTED (praise) | careerflow.ai/pricing-page; jobcopilot.com ("Great for LinkedIn, But Is That Enough?") |
| 2.8 | Interview prep | "AI Mock Interview, Interview Analysis" in Premium Plus (pricing page); the FAQ places mock interviews in Premium. The two Careerflow pages disagree | VERIFIED-S, conflicting | careerflow.ai/pricing-page; careerflow.ai/faq |
| 2.9 | Memory | Resume and profile documents; no conversational memory found | ASSUMED | n/a |
| 2.10 | Guidance | "Copilot" positioning; no outcome data or funnel guidance found | Absent from sources | n/a |
| 2.11 | Volume caps | None on applying (it does not apply). AI usage is unlimited on Premium | VERIFIED-S | careerflow.ai/pricing-page |
| 2.12 | Surfaces | Web and Chrome extension. No mobile app, messaging channel or API found | VERIFIED-S / absent | careerflow.ai |
| 2.13 | Pricing | Premium: $8.99 a week, $23.99 a month, $54.99 a quarter, $172.99 a year ($14.41 a month billed yearly); one signup page showed $8.99 a week struck through from $12.99. Premium Plus "from $19.99 a week". The pricing page shows struck-through $45 figures | REPORTED (amounts); VERIFIED-S (struck-through $45) | jobsaicopilot.com; resumehog.com; toolchase.com; careerflow.ai/pricing-page |
| 2.13a | Refund and renewal | "Refund within 7 days of purchase ... no questions asked" (FAQ as quoted); renewal reminders 7 days before each renewal (company reply) | REPORTED (FAQ quote, by a review site; URL not pinned); VERIFIED-S (company reply) | review-site extract; trustpilot.com |
| 2.14 | Honesty posture | Sells an "ATS score". Employers' ATSes do not score by default (Greenhouse matching is a paid add-on that never rejects anyone on its own; Ashby's AI "never ranks or gives numerical ratings"; VERIFIED-S in our earlier research). Reportedly asked a refund requester for a review first | VERIFIED-S (score sold) / REPORTED (review request) | careerflow.ai/pricing-page; trustpilot.com |

## 3. Acceptance targets for Trainee against Careerflow

**3.1 Profile optimization (LinkedIn), without touching LinkedIn.**
- BASELINE: a LinkedIn Profile Optimizer in the extension, read on the person's own profile page (VERIFIED-S); the
  category's best-liked feature (REPORTED).
- PARITY: the person pastes their headline, About and experience text (or uploads LinkedIn's own data export, the
  LinkedIn CSV parse in module 122 already exists, REQUIREMENTS 11a) and gets section-by-section suggestions grounded in
  their confirmed facts and target role family.
- BETTER: every suggestion cites the fact it rests on; 0 invented claims on a 20-profile sample per release. Trainee never
  logs into, reads automatically from, or posts to LinkedIn (LinkedIn User Agreement 8.2 bans bots, VERIFIED-S in our
  earlier research). The person copies the text in.
- COST NOTE: one pass is a few thousand tokens, about $0.002-0.005 at small-model prices (ASSUMED from the cost model's
  unit prices).

**3.2 Resume and letters.**
- BASELINE: AI resume builder, "ATS score", unlimited letters (VERIFIED-S); "added incorrect information" (REPORTED).
- PARITY: tailored resume and letter per role (4a-4e, 5a).
- BETTER: 0 invented facts per 100 sampled; links preserved 100%; no score presented as the employer's (standard 3.2).

**3.3 Autofill and apply.**
- BASELINE: autofill on Greenhouse, Workday and Lever (VERIFIED-S); 60% accuracy on Workday in one test of 45
  (REPORTED); no submission.
- PARITY: Trainee's in-browser fill at 95%+ field accuracy with readback on Greenhouse, Lever and Ashby.
- BETTER: a confirmed submit after the person's yes, with a receipt. Careerflow leaves the last 40% (by that one test)
  to the person.
- COST NOTE: in the person's browser, about $0.004 an application (cost model, ASSUMED).

**3.4 Tracker and networking tracker.**
- BASELINE: Kanban plus a contacts tracker, limited on free (VERIFIED-S).
- PARITY: one record per role and per contact, kept from chat.
- BETTER: the tracker fills itself from what Trainee did (prepared, approved, submitted with proof) and from the person's
  one-tap check-ins. Careerflow's tracker is typed in by hand (ASSUMED from its being a Kanban plus an extension).

**3.5 Mock interviews.**
- BASELINE: AI mock interview and interview analysis on the top tier (VERIFIED-S).
- PARITY: role-specific practice over text (12a-12d).
- BETTER: prep built from the exact resume version that was submitted and the posting; weak areas remembered and
  re-tested (12e is PARTIAL today: the mock state is deleted on completion; VERIFIED, audit). Target: a measured
  retest after 7 days on each weak area.
- COST NOTE: cents per session (standard 3.8).

**3.6 Account deletion and data honesty (Careerflow-specific).**
- BASELINE: deletion reportedly needs an email to support and a wait in a queue; data practices called "borderline
  negligent" by one reviewer (REPORTED).
- PARITY: deletion from chat ("delete my data") that completes end to end, tested (standard section 8, item 3).
- BETTER: deletion done within 24 hours, with a confirmation message listing what was deleted; export available before
  deletion (1e PARTIAL today: no downloadable export).

**3.7 Billing integrity.**
- BASELINE: a 7-day refund window and renewal reminders (VERIFIED-S/REPORTED); a reviewer reports being asked for a
  review before a refund (REPORTED).
- TARGET: refunds are never conditioned on a review or a rating, written into the policy. Renewal reminders in chat 7
  days before, with "cancel" working in one reply.

## 4. What Careerflow does not have (absence on a page is a strong indication, not proof)

- No submission (autofill only), so no receipts or proof.
- No job discovery or alerts found; the person finds the jobs.
- No outcome data, funnel or "why no replies" guidance found.
- No outreach drafting or contact discovery; networking is a tracker.
- No inbox reading found.
- No messaging channel or mobile app found.
- No statement that the AI uses only true facts.

## 5. Scoreboard

| Capability | Careerflow (labeled) | Trainee target (measurable) | Trainee today (from REQUIREMENTS.md) |
|---|---|---|---|
| LinkedIn profile help | Optimizer, best-liked (VERIFIED-S / REPORTED) | Paste-in review, fact-cited, 0 invented on 20 | ASSUMED none: no profile-review row in the audit; LinkedIn CSV parse exists in module 122 (VERIFIED, audit 11a) |
| Resume builder | ATS score + keywords (VERIFIED-S) | 0 invented facts per 100, parse-checked files | 4d PARTIAL: PDF/DOCX with a parse check, files never returned in chat (VERIFIED, audit) |
| Cover letters | Unlimited (VERIFIED-S) | Fact-cited, company-specific | 5a PARTIAL: the router route always refuses; 5c BUILT (VERIFIED, audit) |
| Autofill | GH, Workday, Lever (VERIFIED-S); 60% on Workday, n=45 (REPORTED) | 95%+ fields with readback | 7c/7d BUILT in code (VERIFIED, audit); live NOT_RUN |
| Submit + receipt | Never (REPORTED) | Confirmed submit + stored proof | 0 submitted (VERIFIED); 7h BUILT, 9b PARTIAL |
| Job tracker | Kanban, 10 free (REPORTED) | Self-filling from actions + check-ins | 9a PARTIAL, 9d BUILT (VERIFIED, audit) |
| Networking | Contacts tracker (VERIFIED-S) | Sourced notes, the person sends | 11a PARTIAL; 11b/11c/11e BUILT on supplied records (VERIFIED, audit) |
| Mock interview | Top tier (VERIFIED-S) | Tied to the submitted resume; retest of weak areas | 12a, 12e PARTIAL (VERIFIED, audit) |
| Deletion | Support email and queue (REPORTED) | From chat, end to end in 24 h | Host erase exists; export missing (1e PARTIAL, VERIFIED, audit); end-to-end deletion test NOT_RUN |
| Price | $23.99 a month (REPORTED) | Set after measured cost | No pricing (standard gate 9) |

## 6. Pricing and unit economics

**Price.** Premium $8.99 a week, $23.99 a month, $54.99 a quarter, $172.99 a year; Premium Plus from $19.99 a week
(REPORTED). Struck-through $45 figures on the pricing page (VERIFIED-S) suggest permanent "discount" framing (ASSUMED).
Weekly billing next to monthly is a pattern that earns more from short, urgent searches (ASSUMED: $8.99 a week is
about $39 a month, against $23.99 monthly).

**Architecture (ASSUMED, with the reasoning).** User-side Chrome extension plus a web app (architecture B), with model
calls per AI action:
1. The autofill is in the extension and the person submits (REPORTED). No server browser.
2. The LinkedIn optimizer works from the extension on the person's own profile page (VERIFIED-S that it is an extension
   feature; ASSUMED that it reads the page the person has open rather than fetching LinkedIn server-side).
3. Mock interviews are model sessions, priced as the top tier.

**What that implies for its cost (ASSUMED).** Close to zero per application. Model cost is per AI action (cents at most).
Premium at $23.99 carries a large margin, and the revenue estimates ($4-5M a year, REPORTED) on an $800K raise
(REPORTED) imply a business that pays for itself. The risk to it is not cost. It is that the person still does the
submitting, and an agent that does it for them makes the copilot feel like homework.

## 7. Failure modes and complaints

REPORTED unless stated; none checked first-hand. The Trustpilot sample is small (12-20 reviews).
1. **Refund conditioned on a review.** A 2-star reviewer charged on an unexpected renewal said the initial response
   "included a request to leave a review before processing the refund"; the company replied that it "processed your
   refund shortly after" and sends renewal reminders 7 days ahead (trustpilot.com; company reply VERIFIED-S).
2. **Cancel and refund delays.** "If you want a refund or need to cancel, you're stuck waiting forever"
   (resumejudge.com).
3. **Account deletion.** You must email support and wait to be removed from a queue to delete an account
   (resumejudge.com). A 1-star reviewer called the data practices and deletion process "unacceptable and borderline
   negligent in terms of data protection" (trustpilot.com). Another called it a scam (an opinion, not a finding).
4. **AI errors in the resume.** "Added incorrect information to my resume" (trustpilot.com).
5. **Autofill coverage.** 60% field accuracy on Workday, n=45 (one reviewer, possibly a competitor; URL not pinned); "integration
   issues with certain job boards" (toolsforhumans.ai).
6. **Misleading category labels by others.** Lists that call it "auto-apply" set expectations it does not meet (jobhire.ai).
   Not Careerflow's own claim, as far as the extracts show.
7. **Free tier is a demo.** 10 tracked jobs, 1 resume, 1 LinkedIn review on free (capterra.ca, jobcopilot.com).

## 8. Ground-truth test plan (plan only; nothing was run, no account was created)

To be run by the owner on the free plan, after reading Careerflow's terms and privacy policy. No LinkedIn automation of
any kind: the owner uses the optimizer on his own profile in his own browser, as any user would.
1. **Extension permissions.** Before installing, record the permissions the Chrome Web Store lists (site access,
   "read and change data on all websites", and so on).
2. **LinkedIn optimizer.** Run it once on the owner's own profile. Record whether it only reads the open page or asks
   for a login or other access, and whether any suggestion invents a claim.
3. **Resume truth.** Build 1 resume from a real source and diff it: count added facts, metrics or titles.
4. **ATS score.** Change one irrelevant word and record whether the score moves.
5. **Autofill.** On 5 public postings (2 Greenhouse, 1 Lever, 2 Workday), autofill, **do not submit**, and record per
   field: correct, wrong, empty. Close the tab.
6. **Mock interview.** If reachable on free, run one; record question specificity and whether feedback names a concrete
   weakness.
7. **Deletion.** Find the deletion path and record the steps and the time to confirmation. Do not request a refund on a
   purchase never made.
8. **Write-up.** Results into this file with VERIFIED labels and the date.

## 9. What Trainee must add or change because of Careerflow

Ranked by launch risk. Each line carries its evidence label.

**Kills launch**
1. **Deletion and export that actually work.** Careerflow's worst reviews are about data and deletion (REPORTED). Trainee
   holds more sensitive material (resume, answers, employer correspondence). The standard (section 8, item 3) requires
   a tested end-to-end deletion path; 1e is PARTIAL with no downloadable export (VERIFIED, audit). Run the deletion test
   before beta.
2. **No fake ATS score anywhere.** Careerflow and Huntr both sell one (VERIFIED-S). Trainee's 3e row (score never a
   hire chance) is PARTIAL, and the agent path passes a raw fit score with a prompt that says "Tell them their real
   odds" (VERIFIED, audit). Fix 3e before any user sees a number.

**Embarrasses at 100 users**
3. **Profile review over paste.** People will ask Trainee to "fix my LinkedIn". Without it Trainee looks thinner than a
   $24 copilot. Build it on pasted text or LinkedIn's own export, never on automated LinkedIn access (VERIFIED-S ban).
4. **Resume files in and out of chat.** Careerflow's builder hands the person a file. Trainee's chat cannot take a resume
   in (1a) and never hands a tailored file back (4d) (VERIFIED, audit).
5. **Refund policy written and unconditional.** Never ask for a review before a refund (the REPORTED Careerflow pattern).
   Put it in the terms before billing exists.
6. **Autofill precision on Workday before claiming Workday.** One test put Careerflow at 60% (REPORTED). *Submission
   engine:* Workday waits on D-013 (account sign-in, multi-page flows); multi-page support is BUILT in code but its
   tests skip without Playwright (VERIFIED, audit). Trainee must say "Workday: I'll prepare it and hand it to you" until
   20 real Workday applications are proven (standard 3.3).

**Matters at 10,000 users**
7. **Interview practice with memory.** Careerflow puts mock interviews on its top tier (VERIFIED-S). Trainee's
   differentiator is practice tied to the submitted resume version and remembered weak areas (12a, 12e PARTIAL).
8. **Networking beyond a tracker.** Careerflow tracks contacts; Trainee's planned edge is sourced drafts the person sends
   (11d PARTIAL: the router passes empty personalization facts; VERIFIED, audit).
9. **Submission engine items Careerflow sidesteps by never submitting.** Captcha and bot-check handoff in the same
   session (8a NONE), verification-code handoff (no inbox reader, 9c MODULE), failure reporting with recovery (8c
   PARTIAL), receipts with employer proof (9b PARTIAL) (all VERIFIED, audit). Careerflow carries none of this risk. Trainee
   carries all of it, so each must be proven before Trainee's "we submit" is worth more than Careerflow's "you submit".
