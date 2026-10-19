# AIApply: teardown and Trainee targets (build standard, 2026-10-19)

Follows `docs/product/BUILD-STANDARD-TSENTA.md`: labels, capability inventory, parity and better targets per feature,
cost notes, what the competitor lacks, a scoreboard, a ground-truth test plan and what Trainee must change.

---

## 0. Labels and method

**Labels (the standard's three, used exactly):**
- **VERIFIED** = read on a live page or measured in our own runs, source given.
- **REPORTED** = a third party, a search extract, or an earlier internal doc says it; not checked by us.
- **ASSUMED** = an inference. A hypothesis to test, never a fact to build on.

**What could be opened (accessed 2026-10-19):** nothing live. `WebFetch` on aiapply.co returned `ENOTFOUND`; `curl`
through the agent proxy returned `403` on CONNECT for every host tried (vendor, Trustpilot, Chrome Web Store, App
Store, Reddit, BBB, review sites). Every external fact below is a **search-engine extract of the cited URL** and is
labelled REPORTED, even when the URL is AIApply's own page, its help center or the App Store. Source tags:
- `[vendor]` AIApply's own page or help-center article, as quoted in a search extract (marketing claims are claims,
  not performance);
- `[store]` Trustpilot, App Store, Chrome Web Store, as quoted in a search extract;
- `[db]` company databases (Dealroom, CB Insights, Caplight, Bouncewatch); often unclaimed, unverified;
- `[3P]` independent-looking review or press;
- `[rival]` written by a company selling a competing tool (FastApply, Scoutify, JobCopilot, Jobscan, Adzuna's own
  tools, Wobo, Resumly, JobHire, AceApp, ClickHired, Careery and similar). Kept and marked.

Facts about Trainee come from `docs/product/REQUIREMENTS.md` and `docs/product/cost-model-applying.md`.

**What we could not check:** the current price list (a review says AIApply "doesn't show prices on its public site" as
of October 2026 [A5]); the full help-center article on modes; the terms of service and refund text (search did not
return them; the refund terms below come from a review site quoting them); the BBB grade (the earlier internal note
says "BBB F", UNVERIFIED; this session's search found no BBB profile); whether auto-apply runs in AIApply's cloud or
in the user's browser. The session's shared web-search budget ran out before a search on the architecture could run.

**Sources:**
- [A1] aiapply.co/ ; aiapply.co/auto-apply ; aiapply.co/ai-resume-scanner (and /de/) `[vendor]`
- [A2] intercom.help/aiapply/en/articles/14216708-how-does-auto-apply-work `[vendor, help center]`
- [A3] aiapply.co/compare/aiapply-vs-sonara ; /compare/aiapply-vs-finalroundai ; /compare/aiapply-vs-loopcv ; aiapply.co/blog/best-ai-auto-apply-tools `[vendor, comparison pages]`
- [A4] apps.apple.com/us/app/ai-interview-buddy-aiapply/id6496372521 `[store]`
- [A5] clickhired.ai/blog/aiapply-pricing-in-2026 `[rival]`
- [A6] checkthat.ai/brands/aiapply/reviews and /pricing `[3P aggregator]`
- [A7] trustpilot.com/review/aiapply.co (and uk., au., nz., ie., ca., nl., pl., jp., dk., no. mirrors) `[store]`
- [A8] adzuna.co.uk/blog/aiapply-review-what-works-what-doesnt-a-better-alternative/ `[rival]`
- [A9] scoutify.com/blog/aiapply-review/ `[rival]`
- [A10] careery.pro/blog/ai-job-search/aiapply-review `[3P; Careery publishes job-search guides, affiliation unclear]`
- [A11] jobscan.co/blog/jobscan-vs-aiapply/ `[rival]`
- [A12] app.dealroom.co/companies/aiapply ; cbinsights.com/company/aiapply ; caplight.com/company/aiapply ; bouncewatch.com/company/aiapply `[db]`
- [A13] Amazon Music podcast "Ready for Launch ... Launching AI Apply ... with Co-Founder Aidan Kramer" (2024) `[3P]`
- [A14] chrome.google.com/webstore/detail/ai-apply/bmmijjhlpoimjbfbhnnkkkbmiibeemnf `[store]`
- [A15] wobo.ai/blog/aiapply-review/ ; aceapp.ai/blog/aiapply-review ; resumly.ai/answers/aiapply-review ; jobcopilot.com/aiapply-review/ ; remotejobassistant.com/blog/aiapply-review ; jobhire.ai/blog/aiapply-reviews ; blog.fastapply.co/aiapply-review-2026 `[rival]`
- [A16] thedailyworkflow.com/service/AI Interview Buddy - AIApply `[3P aggregator, unverified score]`
- [A17] tooldirectory.ai/tools/aiapply ; autoapplier.com/blog/ai-apply ; jobity.io/blog/aiapply-review `[3P / rival]`

---

## 1. What the product is

| Item | Finding | Label |
|---|---|---|
| Company | London-based, founded 2023 by Aidan Cramer (CEO; previously co-founded and sold PetVet.ai) and Peter Utekal (co-founder, CTO). | REPORTED `[db]` [A12], `[3P]` [A13] |
| Funding | Seed or pre-seed from Haatch, 2024-03-01. Total reported as $630,000 (Caplight) or $1.0M (Dealroom, Bouncewatch). CB Insights lists Haatch as the only investor. | REPORTED `[db]` [A12], conflicting |
| Team | 14 employees (Bouncewatch). | REPORTED `[db]`, unverified |
| Users | "Over 700,000 job seekers" (Bouncewatch); the vendor's resume-scanner page shows a "Loved by" counter of about 2.06 million; the site also claims "over 2 million users". | REPORTED `[db]` and `[vendor]` [A1]; marketing figures |
| Trustpilot | TrustScore 4.3 from 1,773 reviews, 66% five-star, 11% one-star, as of 2026-09-11 [A7 extract]; 4.0 from about 1,046 in an earlier review [A15]; another snapshot 1,137 reviews, "Excellent". CheckThat.ai says the rating is hidden for "displaying Trustpilot content in a misleading way" [A6]; this conflicts with the visible snapshots and is unconfirmed. | REPORTED `[store]`; the "hidden" claim REPORTED `[3P]`, unconfirmed |
| App Store | "AI Interview Buddy - AIApply" (iOS): 4.7 from 499 ratings. | REPORTED `[store]` [A4] |
| Chrome Web Store | "AiApply" extension: 3.9 from 84 ratings. | REPORTED `[store]` [A14] |
| Google Play | No listing found. | REPORTED (absence in search) |
| BBB | The earlier internal note cites "BBB F" (checkthat.ai, scoutify.com), labelled UNVERIFIED there. This session found no BBB profile. | REPORTED `[3P]`, unconfirmed |
| Surfaces | Web app; iOS app (Interview Buddy); Chrome extension (live-interview assistant). | REPORTED `[store]` [A4, A14] |
| How it makes money | A subscription for the toolkit (resume builder, cover letters, ATS scanner, mock interviews, Interview Buddy) **plus** auto-apply sold separately, one credit per application. Reported prices: toolkit about $29/month (about $12-16/month billed annually; AIApply's own comparison pages list Pro at $29/month or ~$12/month annually [A3]); credit packs $10/10, $39/100, $79/250 [A8, A9]; the help center describes auto-apply plans of $49/month for 100 applications, $99/month for 250, $199/quarter for 750 [A2 via A10]. iOS and web subscriptions are billed separately [A6]. | REPORTED `[vendor]` [A2, A3], `[rival]` [A8, A9]; prices conflict and are not on the public page [A5] |

---

## 2. Capability inventory, feature by feature

| Feature | What AIApply does or claims | Label and source |
|---|---|---|
| **Discovery** | Auto Apply "scans for matching roles" across LinkedIn, Indeed, Glassdoor and company career pages; each match carries a "Job Fit Score". | REPORTED `[3P]` [A17], `[rival]` [A9] |
| Match score | The terms (as quoted by Jobscan) call the Job Fit Score "an automated relevance estimate and is not a guarantee of suitability"; "Auto mode may include lower Job Fit Score jobs". | REPORTED `[rival]` quoting `[vendor]` terms [A11] |
| **Prep / tailoring** | Writes "a tailored resume and cover letter for each" application; separate AI resume builder, cover-letter generator, ATS resume scanner ("scanning against 50+ ATS systems", "can increase your interview chances by 3x"). | REPORTED `[vendor]` [A1], `[3P]` [A17] |
| Tailoring control | A user: "The cover letters that it wrote were incorrect, and there was no way to edit them." | REPORTED `[store]` [A7] |
| **Apply mechanics** | "Works with LinkedIn Easy Apply, Indeed and many company career portals"; one credit per application. No source describes how fields are filled, how files are uploaded or how sign-in is done. | REPORTED `[3P]` [A17], `[vendor]` [A2] |
| Approval modes | Three modes (help center): **Auto** applies to every matching job without asking; **Hybrid** submits automatically only above a score and holds the rest for review (the threshold is 75 in the overview and 70 in the modes article, per a reviewer); **Review / Human-in-the-Loop** asks for approval of each. Jobscan: "applies on its own by default, with review as optional". Careery: switching from Auto to Review "may not stop applications already approved". | REPORTED `[vendor]` [A2], `[3P]` [A10], `[rival]` [A11] |
| **Volume caps** | Daily limit settable from 10 to 100 ("a limit, not a promised submission count"); monthly volume set by credits (100 / 250 / 750). | REPORTED `[vendor]` [A2 via A10] |
| Bot checks, codes, sign-in, Workday | Not described in any source. | absent from every source (not proof) |
| **Tracking** | A dashboard of auto-applications. No source describes status routing from email. | REPORTED `[3P]` |
| **Receipts / proof** | Not described. | absent from every source |
| **Handoff** | Only the Review / Human-in-the-Loop approval; no handoff for blocks described. | REPORTED `[vendor]` [A2] |
| **Networking** | None found. | absent from every source |
| **Interview prep** | AI Mock Interview: "practice role-specific questions and get feedback before the interview" [A17]. | REPORTED `[3P]` |
| **Live interview assistance** | **Interview Buddy.** The iOS listing: it "listens to your interviews and gives you the perfect answers and strategies, based on your resume and the specific job you're applying for" [A4]. The Chrome extension's listing says it is "designed for practice, not to be used during an actual interview" [A14]; reviewers describe it as feeding "answer prompts during live Zoom, Google Meet, and Microsoft Teams interviews" with "a stealth mode, so the interviewer won't know it's there (in theory)", and say it "is detectable by trained interviewers" [A9, A15]. | REPORTED `[store]` [A4, A14], `[rival]` [A9, A15]; the two store listings contradict each other |
| **Memory** | Stored profile and resume. A user: "The AI didn't read my resume properly" and "showed me having key gaps that I don't actually have." | REPORTED `[store]` [A7] |
| **Guidance** | None beyond the ATS scanner score and mock-interview feedback. | REPORTED `[vendor]` [A1] |
| **Surfaces** | Web, iOS, Chrome extension. | REPORTED `[store]` |
| **Pricing** | Subscription plus credits (section 1, section 6). | REPORTED |
| **Refunds** | As quoted by a review site: fees non-refundable except verified technical issues or an accidental purchase reported **within 30 minutes**; Auto-Apply "explicitly non-refundable once applications are submitted". Subscriptions renew unless cancelled at least 24 hours before the period ends (company replies on Trustpilot). | REPORTED `[3P]` [A6], `[store]` [A7]; terms page not opened |
| **Honesty posture** | Marketing: "up to 80% higher interview rate", "3x" interview chances, "Auto Apply to 1,000s of Jobs - AI Does It for You" (page title), "2 million users". The terms hedge the fit score (not a guarantee). The live-interview assistant with a "stealth" description is the opposite of Trainee's posture. | REPORTED `[vendor]` [A1], `[rival]` [A11, A15] |

---

## 3. Acceptance targets for Trainee against AIApply

### 3.1 Match quality and the fit score
- **BASELINE:** a Job Fit Score that is "not a guarantee"; Hybrid auto-sends above 70 or 75; one user judged 200 of
  270 matches irrelevant (74%) and another got jobs "under my desired salary" (REPORTED [A6, A7, A11]).
- **PARITY:** every match carries a fit explanation and its gaps (Trainee 3a BUILT, VERIFIED) and nothing below the
  relevance floor is queued.
- **BETTER:** on 500 surfaced roles for 10 test profiles, **at most 10%** judged irrelevant by the profile owner (vs a
  REPORTED 74% case), **0** roles below the user's stated salary floor where the posting states pay, and **0**
  messages anywhere that present the fit score as a chance of being hired (standard: score is never odds; Trainee 3e
  PARTIAL, VERIFIED).
- **COST NOTE:** matching is shared compute. The salary floor needs pay parsed from postings; Trainee has no pay data
  today (2b PARTIAL, VERIFIED), so this is parsing work, not spend.

### 3.2 Approval modes
- **BASELINE:** Auto by default (per Jobscan), Hybrid, Review; switching to Review may not stop already-approved
  sends (REPORTED [A10, A11]).
- **PARITY:** an approval gate by default; an opt-in auto mode stated in plain words (standard 6.2).
- **BETTER:** **0** applications sent after the user turns approval back on or says stop (measured: a test that
  switches mode with 10 items queued; all 10 held); approval binds the exact payload (Trainee 6b/6c BUILT, VERIFIED;
  a texted "yes" cannot approve a batch today, VERIFIED).
- **COST NOTE:** none beyond the message.

### 3.3 Tailored resume and cover letter
- **BASELINE:** per-application resume and cover letter; users report misread resumes, invented gaps, incorrect
  letters "with no way to edit them" (REPORTED [A7]).
- **PARITY:** a per-role tailored resume and letter with a diff the user can inspect and edit before send.
- **BETTER:** **0** invented facts on 100 sampled tailored resumes per release (automated check + 20 human-reviewed);
  **100%** of drafts editable before send; **0** "missing skill" claims about a skill present in the user's confirmed
  facts (a regression test built from the A7 complaint).
- **COST NOTE:** AIApply generates two documents per application. Trainee's model cost is driven by tailoring tokens;
  measure tokens per application and report the distribution (standard 3.2).

### 3.4 Apply mechanics
- **BASELINE:** LinkedIn Easy Apply, Indeed, Glassdoor and "many company career portals"; mechanics undescribed; Auto
  Apply "slow and inaccurate" in one test (REPORTED [A15, A17]).
- **PARITY:** readback-verified fill on the 17 captured forms; 20+ real applications per launch ATS with recorded
  outcomes (standard 3.3).
- **BETTER:** **100%** of applications end SUBMITTED (employer confirmation stored), UNKNOWN or FAILED (reason stored);
  silent failure rate measured and **0** on the 20-per-ATS runs.
- **COST NOTE:** see section 6; AIApply charges $0.27-$1.00 per application, so Trainee's cost is not the constraint
  against this competitor; proof is.

### 3.5 Credits, failures and refunds
- **BASELINE:** credits consumed by irrelevant matches ("deplete available credits rapidly"); auto-apply
  non-refundable once submitted; a 30-minute accidental-purchase window; separate iOS and web billing; one user
  charged for eight months (REPORTED [A6, A7]).
- **PARITY:** a written refund rule; failed applications never count against any allowance (the category floor,
  Tsenta does it, standard 3.5).
- **BETTER:** **0** allowance consumed by an application that FAILED or was below the floor; **one** subscription across
  every surface; cancel in **one message**; refund requests answered within **2 business days**.
- **COST NOTE:** honest counting costs revenue on failures; it is the trust floor and must be in the price.

### 3.6 Interview preparation (and the live-assist line)
- **BASELINE:** a mock interview with feedback; Interview Buddy feeds answers during real interviews with a "stealth"
  description on one surface and a "practice only" disclaimer on another (REPORTED [A4, A9, A14]).
- **PARITY:** role-specific mock interviews over text with feedback (Trainee 12a-12e PARTIAL, VERIFIED).
- **BETTER:** prep tied to the exact resume version submitted (12a, not tied today, VERIFIED); feedback names the
  specific weakness; **0** hallucinated company facts in a 20-session sample; weak areas stored and retested (12e,
  deleted today, VERIFIED). And a line Trainee holds: **0** features that feed answers during a live interview. Trainee
  prepares the person; it does not speak for them in the room. (Owner-level product rule; ASSUMED until the owner
  states it in writing.)
- **COST NOTE:** cents per session in tokens (standard 3.8). A live-listening assistant would add streaming speech
  costs; not building it is also the cheaper choice.

### 3.7 Claims and honesty
- **BASELINE:** "up to 80% higher interview rate", "3x interview chances", "2 million users", no published method
  (REPORTED [A1]).
- **BETTER:** **0** outcome numbers in Trainee copy that were not computed from stored receipts (standard section 5);
  the verified-submit rate and interviews per verified submission computed weekly; the "ATS score" concept not used
  (Greenhouse and Ashby do not score resumes by keyword by default, REPORTED in `tsenta.md`).

---

## 4. What AIApply does NOT have

Absence on a page or in search results is a strong indication, not proof.
- **No stored proof of submission.** No receipt or employer confirmation described. Absent from every source.
- **No handoff for blocks** (captcha, code, login). Only per-application approval. Absent from every source.
- **No networking or referral help.** Absent from every source.
- **No outcome engine.** Credits reward application count; nothing describes funnel-driven throttling. Absent.
- **No career guidance grounded in the user's results.** Absent.
- **No stated ATS coverage list for the apply path** (the 50+ ATS figure is the resume scanner's). Absent.
- **No relevance floor in Auto mode:** "Auto mode may include lower Job Fit Score jobs" (REPORTED [A11]).

---

## 5. Scoreboard

| Capability | AIApply (labelled) | Trainee target (measurable) | Trainee today (from REQUIREMENTS.md) |
|---|---|---|---|
| Applications actually submitted | Sold by the credit; users report hundreds (REPORTED [A6]) | 20+ real per launch ATS | **0 ever** (VERIFIED) |
| Where it applies | LinkedIn Easy Apply, Indeed, Glassdoor, career portals (REPORTED [A17]) | Company portals only | GH, Lever, Ashby in code; aggregators refused (8e BUILT, VERIFIED) |
| Approval | Auto default; Hybrid >=70/75; Review (REPORTED [A2, A11]) | Approval default; 0 sends after stop | Exact-batch approval BUILT via API field only; texted yes cannot approve (6b, VERIFIED) |
| Relevance | 74% irrelevant in one report; below-salary jobs (REPORTED) | <=10% irrelevant; 0 below salary floor | Title keywords + place; no pay data (2b/10a PARTIAL, VERIFIED) |
| Fit score as odds | "Not a guarantee" (REPORTED terms) | 0 odds framing on any path | Router guards; agent path says "Tell them their real odds" (3e PARTIAL, VERIFIED) |
| Tailoring | Resume + letter per app; uneditable, misread (REPORTED) | 0 invented facts; 100% editable | Truth-audit gate; diff module only; files not returned in chat (4b/4e/4d PARTIAL, VERIFIED) |
| Readback | Not described | Every field before submit | BUILT on fixtures (7d); 17-form gate not green (VERIFIED) |
| Proof | Not described | Confirmation stored or UNKNOWN | Confirmation stored (9b PARTIAL); no inbox reader (9c MODULE) |
| Failed apps billed? | Auto-apply non-refundable once submitted (REPORTED) | 0 allowance used by failures | No pricing (gate 9, NOT_RUN) |
| Mock interview | Yes (REPORTED) | Tied to submitted resume; weak areas retested | PARTIAL; not tied; weak areas deleted (12a/12e, VERIFIED) |
| Live interview assist | Interview Buddy (REPORTED [A4]) | Not built, by rule | None (ASSUMED from its absence in REQUIREMENTS.md) |
| Surfaces | Web, iOS, Chrome (REPORTED) | iMessage + extension + web | iMessage, go-live pending (VERIFIED) |
| Price per application | $0.27-$1.00 plus subscription (ASSUMED arithmetic) | Measured cost below price | ~$0.004 modelled (ASSUMED); unmeasured (NOT_RUN) |

---

## 6. Pricing and unit economics

**Their price per application (ASSUMED arithmetic on REPORTED, conflicting prices):**

| Option | Price | Applications | Price per application | With the ~$29/mo toolkit added |
|---|---|---|---|---|
| Credit pack | $10 | 10 | $1.00 | n/a (one-off) |
| Credit pack | $39 | 100 | $0.39 | $0.68 if used in one month |
| Credit pack | $79 | 250 | $0.32 | $0.43 |
| Help-center plan | $49/month | 100 | $0.49 | (plan may include toolkit; unclear) |
| Help-center plan | $99/month | 250 | $0.40 | |
| Help-center plan | $199/quarter | 750 | $0.27 | |

AIApply is the most expensive per application of the four volume tools, by one to two orders of magnitude over
LazyApply ($0.0018-0.018 at full use, `lazyapply.md`).

**Architecture inference: unknown; most likely server-side (ASSUMED).** Reasons: auto-apply is sold as a cloud
credit, with a server-held daily limit (10-100) and a server-side mode switch whose effect on "already approved"
applications lags (REPORTED [A10]), which suggests a server queue; the Chrome extension found in search is the
interview assistant, not an apply extension [A14]; applications go to LinkedIn Easy Apply and Indeed, which from a
server would need the user's session or credentials. No source states which. If it is server-side, each application
pays browser minutes (~$0.008 at 5 minutes, `cost-model-applying.md`, ASSUMED) plus, if used, proxy traffic
(~$0.012-0.04), plus generation of a tailored resume and cover letter per application (a few thousand tokens; well
under $0.01 with a small model, ASSUMED).

**What that implies (ASSUMED):** even at server-browser cost (~$0.03-0.05 per application), a price of $0.27-$1.00
leaves a large margin per credit. The incentive that follows is to sell credits, and the user pays the same credit for
an irrelevant match as for a good one, which is what the complaints describe (credits "deplete rapidly" on poor
matches, REPORTED [A6]). Against AIApply, Trainee's cost is not the constraint; Trainee can charge nothing per
application up to the cap and still be cheaper to the user. The constraint is proof and relevance.

---

## 7. Failure modes and complaints

| # | Failure | Report | Label |
|---|---|---|---|
| F1 | **Irrelevant matches at scale** | "270 job matches and ... 200 of them irrelevant to their skillset, seniority, or target titles" (74%). | REPORTED `[store]` via `[3P]` [A6] |
| F2 | **Wrong level, industry, location** | "Applications to roles well above or below their level or in unrelated industries"; "applications sent to irrelevant jobs or incorrect locations". | REPORTED `[3P]` [A17], `[rival]` [A8] |
| F3 | **Below the user's salary** | "It applied for jobs that were under my desired salary." | REPORTED `[store]` [A7] |
| F4 | **Misread resume, invented gaps** | "The AI didn't read my resume properly ... it showed me having key gaps that I don't actually have." Company reply asked for examples. | REPORTED `[store]` [A7] |
| F5 | **Wrong answers and letters, uneditable** | "The cover letters that it wrote were incorrect, and there was no way to edit them. ... It gave bad application answers." | REPORTED `[store]` [A7] |
| F6 | **Zero yield** | "200+ applications producing zero interviews" (Reddit, quoted); "you must pay upfront and no interviews" (1-star theme). Counter-report: "about 10 interview invitations within two days". | REPORTED `[3P]` [A6], `[store]` [A7] |
| F7 | **Credits burned on bad matches; cannot buy credits alone** | "Send applications to poorly matched roles and deplete available credits rapidly"; a reviewer "can't buy credits, can only upgrade to a higher subscription"; the company replied it "would continue working to improve both job filtering and credit management". | REPORTED `[3P]` [A6], `[store]` [A7] |
| F8 | **Mode switch lag** | Switching from Auto to Review "may not stop applications already approved". | REPORTED `[3P]` [A10] |
| F9 | **Charged for months** | A reviewer charged for eight months; the company said it found no cancellation attempts, and charges were reversed after the reviewer raised it. | REPORTED `[store]` [A7] |
| F10 | **Refund windows that are hard to use** | A 30-minute accidental-purchase window; "support was slow and automated"; auto-apply non-refundable once submitted. | REPORTED `[store]` [A7], `[3P]` [A6] |
| F11 | **Double billing across surfaces** | iOS and web billed separately; users "told they must buy a second roughly $100 subscription". | REPORTED `[3P]` [A6] |
| F12 | **Hidden prerequisite** | "Auto-apply does not function without paid resume builder, not disclosed at checkout" (single site). | REPORTED `[rival]`, single source [A17] |
| F13 | **Slow, inaccurate Auto Apply** | A review site rates it 3.0/5: "Auto Apply feature is slow and inaccurate", while praising letters and interview prep. | REPORTED `[rival]` [A15] |
| F14 | **Live-interview assistant, contradictory positioning** | iOS: "listens to your interviews and gives you the perfect answers"; Chrome: "for practice, not ... an actual interview"; reviewers: "stealth mode" and "detectable by trained interviewers". | REPORTED `[store]` [A4, A14], `[rival]` [A9, A15] |
| F15 | **Platform bans, captcha failures, duplicates, data loss** | No report found for AIApply specifically. | absence of evidence, not evidence |

---

## 8. Ground-truth test plan (written only; nothing below has been run)

Rules: read the terms first; normal user; no scraping; no account created from this plan without the owner's
decision; never run its LinkedIn or Indeed path; owner's real resume and only roles he would accept.

**Step 0, no account, from an unrestricted network (upgrades REPORTED to VERIFIED):**
1. aiapply.co/pricing and checkout: record what is shown before payment (a review says prices are not public [A5]).
2. Terms and refund policy: the 30-minute window, the auto-apply non-refund clause, renewal notice.
3. Help center article 14216708 and the modes article: the Hybrid threshold (70 or 75), the daily-limit range.
4. Trustpilot page: TrustScore, count, any "rating hidden" banner; App Store and Chrome listings: rating, count,
   description text verbatim (Interview Buddy's "listens to your interviews" vs "practice only").
5. BBB: search for a profile; record grade and complaint count or record "none".

**Step 1, free tier or the smallest purchase the owner approves:**
6. Upload the owner's resume. Before any application: open five tailored resumes and five letters; mark every
   sentence as traceable to the source resume or not; record whether each is editable.
7. Set Review / Human-in-the-Loop mode. Queue 20 matches; judge each relevant or not against a written target
   (title, seniority, salary floor, location). Compare to F1's 74%.
8. Approve 10 company-portal applications (Greenhouse, Lever, Ashby only). Per application: submitted, time, wrong
   fields, documents, confirmation email arrival, whether the dashboard says submitted when no confirmation arrives.
9. Mode-switch test: with items queued in Hybrid, switch to Review; record whether any still send (F8).
10. One application that will hit a bot check or an emailed code: record what the user is told.
11. Credits: does a failed application consume a credit? Does a below-floor match?
12. Cancel through the web, then check the iOS app subscription status; request a refund; record days and outcome.
13. Export and delete data; record what comes back.

Results to `docs/competitors/mass-applying.md` with VERIFIED labels; update section 5.

---

## 9. What Trainee must add or change because of AIApply

### Kills the launch
1. **Engine: zero invented facts in anything sent, checked field by field.** AIApply's complaints are misread
   resumes and invented gaps (REPORTED F4, F5). Trainee's truth audit covers tailored resumes (4b PARTIAL); form
   answers on real forms are not audited because the worker is NOT_WIRED (5e, VERIFIED). Same requirement as
   `lazyapply.md` item 2.
2. **Engine: a stop means stop.** AIApply's mode switch reportedly does not stop already-approved applications
   (REPORTED F8). Trainee: pause and stop cancel queued intents account-wide (6d, 14d PARTIAL, exact phrases only,
   VERIFIED); a crash after approval must record UNKNOWN, never retry (7f BUILT, VERIFIED). Add the test of section 3.2
   (10 queued, stop, 0 sent) to the gate.
3. **Never present the fit score as a chance of being hired.** AIApply's own terms disclaim its score (REPORTED
   [A11]); Trainee's agent path is told "Tell them their real odds" in `prompt.ts` (3e, VERIFIED). Fix before any
   user sees the agent brain.
4. **Engine: readback and proof before "submitted".** Same as `lazyapply.md` items 3-4: 17-form gate green; every
   application ends SUBMITTED / UNKNOWN / FAILED from stored proof (7h, 9e BUILT on fixtures, VERIFIED; inbox
   confirmation NOT_RUN).

### Embarrasses at 100 users
5. **Relevance floor with a salary floor.** F1-F3 are the most repeated complaints. Trainee has no pay data and
   filters by title keywords and place (2b, 10a, VERIFIED). Add employment type, seniority, location, exclusions and,
   where the posting states pay, the person's minimum.
6. **One subscription, one cancel, failures free.** F9-F11. Decide the refund rule before pricing (gate 9); no
   separate billing per surface; failed and below-floor applications never consume anything.
7. **Editable drafts and the file back.** F5 "no way to edit". Trainee does not return the tailored file in chat
   (4d, VERIFIED) and has no approve/undo for diffs (4e, VERIFIED). The person must see and change what is sent.
8. **Engine: failure reporting per application.** No source shows AIApply telling a user why an application failed.
   Trainee has stop reasons per application (7e BUILT) but no recovery and no caller for unknown-outcome resolution
   (8c, 8d, VERIFIED). One line per stopped application, with what happens next.

### Matters at 10,000 users
9. **Interview prep that is clearly better, without live assistance.** AIApply's prep is a selling point (REPORTED
   [A15]). Trainee's prep is PARTIAL (regex STAR rubric, weak areas deleted, not tied to the submitted resume,
   VERIFIED). Build 12a and 12e. Do not build a live-interview answer feed (section 3.6).
10. **Engine: sign-in, verification codes, Workday, uploads, multi-page.** Not described by AIApply; Trainee: login
    portals and Workday wait on D-013 (VERIFIED); codes need a handoff or the inbox reader (9c MODULE); uploads and
    multi-page are BUILT on fixtures only (7c, VERIFIED).
11. **Engine: duplicate prevention across sources.** Same as `lazyapply.md` item 8 (2c PARTIAL, VERIFIED).
12. **No marketing number without a stored source.** AIApply's "80%", "3x" and "2 million" are the category norm;
    Trainee publishes only numbers computed from receipts (standard section 5).

**What AIApply's failures teach about relevance floors and caps (ASSUMED, from REPORTED evidence):** a score
threshold is not a floor if the default mode ignores it ("Auto mode may include lower Job Fit Score jobs") and if
the threshold itself is documented inconsistently (70 vs 75). A per-application credit makes every bad match revenue,
so the seller has no reason to tighten the floor. Trainee's floor must be hard filters the person stated (type,
seniority, location, salary, exclusions), enforced in every mode including any opt-in auto mode, and failures and
below-floor matches must never cost the person anything. The cap (15 a day) is counted only after the floor.
