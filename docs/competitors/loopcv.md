# LoopCV: teardown and Trainee targets (build standard, 2026-10-19)

Follows `docs/product/BUILD-STANDARD-TSENTA.md`: labels, capability inventory, parity and better targets per feature,
cost notes, what the competitor lacks, a scoreboard, a ground-truth test plan and what Trainee must change.

LoopCV is the oldest-looking and most "multi-channel" of the four: saved searches ("loops") over 30+ boards, three
apply methods (ATS forms, recruiter email, LinkedIn), CV A/B testing, a free tier, and a B2B side that sells to
employers and "reverse recruiter" agencies. Its signature failure is the gap between jobs matched and jobs actually
applied to.

---

## 0. Labels and method

**Labels (the standard's three, used exactly):**
- **VERIFIED** = read on a live page or measured in our own runs, source given.
- **REPORTED** = a third party, a search extract, or an earlier internal doc says it; not checked by us.
- **ASSUMED** = an inference. A hypothesis to test, never a fact to build on.

**What could be opened (accessed 2026-10-19):** nothing live. `WebFetch` on www.loopcv.pro returned `ENOTFOUND`;
`curl` through the agent proxy returned `403` on CONNECT for every host tried. Every external fact below is a
**search-engine extract of the cited URL**, labelled REPORTED. Source tags:
- `[vendor]` LoopCV's own site, blog, refund page, careers or contact page, or a Trustpilot reply, as quoted in a
  search extract (LoopCV also publishes reviews of its competitors; those are `[rival]` in the other documents);
- `[store]` Trustpilot, Techjockey user reviews, reseller listings, as quoted in a search extract;
- `[3P]` independent-looking review or press;
- `[rival]` written by a company selling a competing tool (FastApply, which discloses it; JobCopilot; AIApply's
  comparison pages; 6figr/JobGPT; Scoutify; Wobo; Resumly; JobHire; JobWizard and similar).

Facts about Trainee come from `docs/product/REQUIREMENTS.md` and `docs/product/cost-model-applying.md`.

**What we could not check:** founders, funding and user counts (none found); whether the free plan's 10 applications
are per month or in total (sources conflict); whether LoopCV fills full ATS forms or mostly sends the CV by email (a
2026 review disputes the form-filling claim); its Chrome extension listing (none found by name). The session's shared
web-search budget ran out before a search on LoopCV's "spam prevention" design page could return; its claims are
quoted from an earlier extract that summarised it.

**Sources:**
- [C1] loopcv.pro/ (title "AI Job Search Automation - Auto-Apply to 1,000+ Jobs"); loopcv.pro/job-application-autofill/ (and localized copies); loopcv.pro/ai-job-tool-discovery/ ; loopcv.pro/ai-career-coach/ ; loopcv.pro/llms.txt `[vendor]`
- [C2] blog.loopcv.pro/how-loopcv-works/ ; blog.loopcv.pro/email-recruiters-automatically/ ; blog.loopcv.pro/loopcv-spam-prevention/ ; blog.loopcv.pro/auto-apply-linkedin-and-indeed/ ; blog.loopcv.pro/ai-cover-letter-generator/ `[vendor]`
- [C3] loopcv.pro/questions/refund/ (localized: /de/, /nl/, /ko/) `[vendor]`
- [C4] loopcv.pro/contact/ ; loopcv.pro/careers ; loopcv.pro/gr/universities ; blog.loopcv.pro/gr/... `[vendor]`
- [C5] trustpilot.com/review/loopcv.pro (and ie., nz., uk., es., dk., se., pl., nl-be., ch., fr-be. mirrors), including company replies `[store]`
- [C6] blog.fastapply.co/is-loopcv-legit-2026-review ; blog.fastapply.co/fastapply-vs-loopcv-review-and-comparison-2026 ; blog.fastapply.co/cancel-loopcv-subscription-refund-2026 `[rival, author discloses he runs FastApply]`
- [C7] 6figr.com/blog/loopcv-review-is-it-worth-your-money-in-2026-631 `[rival, recommends JobGPT]`
- [C8] techjockey.com/reviews/loopcv `[store, user reviews]`
- [C9] resumly.ai/answers/loopcv-review `[rival]`
- [C10] blogs.giraffyreach.com/loopcv-review-2026-does-it-actually-auto-apply-or-just-recommend-jobs `[3P]`
- [C11] wobo.ai/blog/loopcv-review/ ; resumeup.ai/blog/loopcv-review ; jobhire.ai/blog/loopcv-best-alternative ; jobcopilot.com/loopcv-best-alternative/ ; remotejobassistant.com/blog/loopcv-review ; resumejudge.com/blog/loopcv-review/ ; techraisal.com/software/loopcv/ `[rival / 3P]`
- [C12] entrepreneur.com/living/put-your-job-search-on-autopilot-with-loopcv-premium/495503 (lifetime deal) `[store, reseller]`
- [C13] scoutify.com/blog/linkedin-auto-apply/ ; scoutify.com/blog/loopcv-review/ `[rival]`
- [C14] aiapply.co/compare/aiapply-vs-loopcv `[rival]`
- [C15] shno.co/no-code-tools/loopcv ; appliedai.tools/product/loopcv-... ; lastroundai.com/compare/loopcv ; aitools-directory.com `[3P directories]`
- [C16] jobwizard.ai/blog/loopcv-review-auto-apply-gets-wrong-safer-vet-fit `[rival]`

---

## 1. What the product is

| Item | Finding | Label |
|---|---|---|
| Company | Greek. The contact page lists an address in Thessaloniki; the careers page says team members are "based in Athens, Thessaloniki, and Crete" and shows a self-reported 5.0 Glassdoor rating. Founders not found. | REPORTED `[vendor]` [C4] |
| Funding | None found in search. | unknown |
| Users | No user count found. The site claims "a candidate database of more than 1 million candidate profiles" (on its employer-facing pages). | REPORTED `[vendor]` [C4]; marketing figure |
| B2B side | A "Company Portal (AI Recruiting Platform for Employers)" and a "Reverse Recruiting" service "used by individual job seekers and by reverse recruiter agencies operating at scale"; a universities page (Greek) offering to help graduates "and prove it with data". | REPORTED `[vendor]` [C1, C4] |
| Trustpilot | TrustScore 4 from 125 reviews (regional page) and 123 in an earlier snapshot; 3.9 from 123 with 65% five-star (6figr, FastApply). Reviews "sharply divided". | REPORTED `[store]` [C5], `[rival]` [C6, C7] |
| App stores / Chrome | No LoopCV app or Chrome Web Store listing found by name; a Trustpilot reviewer mentions "enabling auto-apply and the Chrome extension", so an extension exists. | REPORTED `[store]` [C5]; listing not found |
| BBB | Not searched (budget). | unknown |
| Surfaces | Web app; Chrome extension (used for LinkedIn Easy Apply); email (outbound recruiter messages); free browser tools (resume checker, cover-letter generator) "run entirely in the browser". | REPORTED `[vendor]` [C1, C2], `[store]` [C5] |
| How it makes money | Freemium subscriptions: **Basic Looper** free, no card, 10 applications (per month or in total: sources disagree), 1 job title, 3 job boards; **Standard** $19.99/month (or EUR 8.99-9.99) for 100 applications; **Premium** $59.99/month (or EUR 29.99) for 300; **Done For You** $89.99/month (or EUR 87.99) adding a weekly advisory call, non-refundable; no annual plan, 3-month billing "save up to 25%" [C6, C11]. A lifetime deal ($39) was sold through Entrepreneur [C12, C10 extract]. Plus B2B revenue (employer portal, agencies). | REPORTED `[rival]` [C6], `[3P]` [C11], `[vendor]` [C3]; currency and caps conflict |

---

## 2. Capability inventory, feature by feature

| Feature | What LoopCV does or claims | Label and source |
|---|---|---|
| **Discovery: loops** | A loop is a saved search (title + location + filters) that runs daily in the background; "scans 30+ job boards ... and scores them against your profile each day"; "LinkedIn, Indeed, Glassdoor and 30+ platforms"; another page cites "50,000+ listings". | REPORTED `[vendor]` [C1, C2] |
| Matching | Profile score per job. Users report "very few or zero job matches", "local openings were sometimes zero", and "a matching bug that left one Premium user with no applications until support fixed it". | REPORTED `[store]` [C5, C8] |
| **Prep / tailoring** | Free AI CV checker, CV builder, cover-letter generator, "AI Question Answering". Multiple CV versions for A/B testing. No per-job resume rewriting described. | REPORTED `[3P]` [C15], `[vendor]` [C2] |
| **Apply mechanics: three methods** | "Applies through ATS forms, direct recruiter emails, and LinkedIn" [C1]. The autofill page lists Workday, Greenhouse, Lever, Ashby, SmartRecruiters and iCIMS, and says it submits after filling [C1]. A 2026 review disputes this: LoopCV "auto-sends your CV to job listings it finds relevant, but it does not fill out and submit full application forms the way a true auto-apply tool does" [C10]. Resumly: main applying "runs through ATS forms and recruiter email rather than LinkedIn Easy Apply automation" [C9]. LoopCV's own blog says bots that drive a logged-in LinkedIn session "risk detection and restriction", while "platforms that apply through postings' own channels never touch the LinkedIn account" [C2]; yet its marketing says it "can auto-apply to hundreds of matching jobs every week on LinkedIn, Indeed, Glassdoor" [C1], and users report Easy Apply errors from the extension [C5]. | REPORTED `[vendor]` [C1, C2], `[3P]` [C10], `[rival]` [C9], `[store]` [C5]; the sources contradict each other |
| Apply: modes | "Auto-apply mode, which submits applications to matched jobs automatically, and review-first mode, which queues matches for one-click approval"; "semi-auto apply"; full auto "is opt-in". | REPORTED `[vendor]` [C2], `[3P]` [C15] |
| Apply: bot checks, codes, sign-in | Not described. Easy Apply failures reported ("Easy apply button wasn't found"). | REPORTED `[store]` [C5]; handling absent |
| **Recruiter email** | "Finds company recruiter emails and sends personalized introductory messages on your behalf"; the company says outreach "only fires for companies behind matched postings", messages are "short and role-specific", and it "blocks duplicate contacts to the same person". Users: emails "sent directly to CEOs, including for roles that weren't open"; "emails sometimes reach the wrong people". | REPORTED `[vendor]` [C2], `[store]` [C5, C8] |
| **A/B testing and analytics** | Upload multiple CV versions; "tracks which one yields the highest number of opens and replies"; email open ratios; A/B test templates. | REPORTED `[3P]` [C15], `[vendor]` [C2] |
| **Tracking** | A dashboard of the pipeline: matched, applied, status. Users report the counts disagree with reality (section 7). | REPORTED `[vendor]` [C1], `[store]` [C5] |
| **Receipts / proof** | Not described. | absent from every source |
| **Handoff** | Review-first queue only. | REPORTED `[vendor]` [C2] |
| **Networking** | The recruiter-email feature is the networking feature, and it sends on the user's behalf (in auto mode). | REPORTED `[vendor]` [C2] |
| **Interview prep** | "AI Mock Interview" with "instant feedback on answer quality, relevance, and communication". | REPORTED `[3P]` [C15], `[vendor]` [C1] |
| **Guidance** | "AI Career Coach" page; "Done For You" plan adds a weekly advisory call with a human. | REPORTED `[vendor]` [C1], `[rival]` [C6] |
| **Memory** | Profile, CV versions, loops. | REPORTED `[vendor]` |
| **Volume caps** | Monthly application allowances: 10 / 100 / 300 by plan; marketing title "Auto-Apply to 1,000+ Jobs". | REPORTED `[rival]` [C6], `[vendor]` [C1] |
| **Surfaces** | Web, Chrome extension, email. | REPORTED |
| **Refunds** | Policy page: paid plans "may be refundable under conditions"; Done For You non-refundable; requests to support@loopcv.com; can be denied if not eligible [C3]. FastApply describes a 7-day window and a "10%-of-quota" limit, not found in the policy text [C6]. Practice: "a refund was only approved after escalation"; "a refund process involving a customer service interview"; a refund "issued after a delay around Easter" [C5]. | REPORTED `[vendor]` [C3], `[rival]` [C6], `[store]` [C5] |
| **Honesty posture** | Publishes "How LoopCV Prevents Spam Applications" and warns about LinkedIn bots [C2]; claims "three times more interviews" [C15]; publishes a directory of competitor reviews (loopcv.pro/directory/...) that it ranks against. | REPORTED `[vendor]` [C2], `[3P]` [C15] |

---

## 3. Acceptance targets for Trainee against LoopCV

### 3.1 Saved searches that keep watching
- **BASELINE:** loops run daily across 30+ boards; 1 title and 3 boards on the free plan (REPORTED [C1, C6]).
- **PARITY:** the person's saved searches run continuously and alert on new matches (Trainee 2e BUILT: alerts every 5
  minutes, VERIFIED), with no repeats and closed roles dropped (10c BUILT, VERIFIED).
- **BETTER:** alerts **under 60 minutes** median from posting-live for watched employers (LoopCV is daily); **100%** of
  alerts carry "matched because..." and the closing date where the posting has one (10b PARTIAL today: deployed alert
  text has neither, VERIFIED); an alert becomes a prepared application in one reply (10d NONE today, VERIFIED).
- **COST NOTE:** alert matching is cheap; the deployed alerts already run every 5 minutes.

### 3.2 Matched vs applied: one honest count
- **BASELINE:** "12,000+ matches and 14 applications"; "2 applications were actually submitted out of 60+ jobs the
  system claimed to apply to"; "180 roles found, 27 matched, 22 applications after several runs" (REPORTED [C5, C7]).
- **PARITY:** the person sees, per day: found, passed the floor, prepared, submitted with proof, unknown, failed (with
  reasons), and waiting (with what each waits for). Trainee's batch summary has a ready count and per-item stops, but
  no awaiting-input count (6e PARTIAL, VERIFIED).
- **BETTER:** **0** applications reported as applied without a stored receipt (audited weekly against the submission
  log); the person's "applied" number equals SUBMITTED + UNKNOWN, each listed; **100%** of failed applications carry a
  reason the person can read.
- **COST NOTE:** none beyond rows; this is a reporting contract.

### 3.3 Apply: forms, not just a CV in an email
- **BASELINE:** claims fills on Workday, Greenhouse, Lever, Ashby, SmartRecruiters, iCIMS; a review says it mostly
  emails the CV; Easy Apply errors (REPORTED [C1, C5, C10]).
- **PARITY:** readback-verified fill on the 17 captured forms; 20+ real applications per launch ATS (standard 3.3).
  Trainee never applies by emailing a CV to an address it guessed: an application goes through the employer's own form
  or not at all.
- **BETTER:** per launch ATS, the verified-submit rate published internally weekly; **0** applications counted where
  the employer's form was not submitted.
- **COST NOTE:** emailing a CV costs a fraction of a cent; a real form fill costs ~$0.004 in-browser or ~$0.025-0.05 on
  a server (ASSUMED, `cost-model-applying.md`). The cheap path is cheap because it is not the employer's process.

### 3.4 Recruiter and hiring-manager outreach
- **BASELINE:** finds recruiter emails and sends "personalized introductory messages on your behalf"; emails to CEOs
  for roles not open; wrong recipients; a user reports more spam and phishing afterwards (REPORTED [C2, C5, C8]).
- **PARITY:** for top matches, a sourced person and a drafted note (standard 3.7; Trainee 11b-11e BUILT on supplied
  records, VERIFIED).
- **BETTER:** **0** messages sent without the person's tap (11e BUILT, sending disabled at the sink, VERIFIED); **0**
  notes about a role that is not open on the employer's site at draft time; **100%** of addresses labelled verified or
  guessed with the source shown; **0** people contacted twice; the person's address never used as the sender by
  Trainee.
- **COST NOTE:** tokens per draft; no sending infrastructure, no domain reputation to burn.

### 3.5 Which resume works (A/B)
- **BASELINE:** CV versions compared by email opens and replies (REPORTED [C2, C15]).
- **PARITY:** the exact resume version per application is stored (4f PARTIAL, VERIFIED: hash on replica forms; persisted
  only on a branch).
- **BETTER:** per role family, interview invitations per verified submission compared across resume versions, shown to
  the person once **at least 20** verified submissions per version exist, with the sample size stated (no claim from
  fewer). Opens are not outcomes; Trainee counts replies and interviews.
- **COST NOTE:** rows and a weekly computation.

### 3.6 Free tier
- **BASELINE:** 10 free applications, no card (REPORTED [C6]).
- **PARITY:** a free way to see Trainee work on real roles.
- **BETTER:** free applications up to the cap once the in-browser path's measured cost supports it (`tsenta.md`
  parity list); never before the cost is measured (standard gate 9).

### 3.7 Interview prep and the human call
- **BASELINE:** AI mock interview with feedback; a weekly human advisory call on the top plan (REPORTED [C1, C6]).
- **BETTER:** prep from the exact submitted resume and posting the moment an interview email arrives; weak areas stored
  and retested (12a, 12e PARTIAL, VERIFIED); **0** hallucinated company facts in a 20-session sample.

### 3.8 Refunds
- **BASELINE:** case-by-case policy; refunds after escalation or "a customer service interview" (REPORTED [C3, C5]).
- **BETTER:** one written rule, cancel in one message, refund answered within **2 business days**, **0** interviews or
  calls required to get money back.

---

## 4. What LoopCV does NOT have

Absence on a page or in search results is a strong indication, not proof.
- **No stored proof of submission,** and a dashboard whose counts users say do not match what was sent. REPORTED [C5, C7].
- **No handoff for blocks** (Easy Apply failures stop silently, per users). REPORTED [C5].
- **No approval per outreach email in auto mode:** emails go "on your behalf". REPORTED [C2].
- **No outcome engine beyond opens and replies;** nothing describes the funnel changing strategy. Absent.
- **No per-job resume tailoring** described. Absent.
- **No stated founders, funding or user count.** Absent from every source found.

---

## 5. Scoreboard

| Capability | LoopCV (labelled) | Trainee target (measurable) | Trainee today (from REQUIREMENTS.md) |
|---|---|---|---|
| Applications actually submitted | Users: 14 of 12,000 matched; 2 of 60+ "applied" (REPORTED [C5, C7]) | 20+ real per launch ATS | **0 ever** (VERIFIED) |
| Saved searches | Daily loops, 30+ boards (REPORTED) | Alerts <60 min median; why + closing date | Alerts every 5 min, title + place, no why or date in deployed text (2e BUILT, 10a/10b PARTIAL, VERIFIED) |
| Alert to application | Auto or review queue (REPORTED) | One reply turns an alert into a prepared application | Alerts carry only "Apply: <url>" (10d NONE, VERIFIED) |
| Apply method | ATS forms, recruiter email, LinkedIn (REPORTED, disputed) | Employer form only; never CV-by-email, never LinkedIn | Company portals; aggregators refused (8e BUILT, VERIFIED) |
| Honest counts | Matched vs applied gap (REPORTED) | 0 "applied" without a receipt | Doorstep vs completed BUILT (9e, VERIFIED); over-cap summary false (7g, VERIFIED) |
| Outreach | Sends recruiter emails for you (REPORTED) | Drafts only; 0 auto-sent; 0 for closed roles | Sending disabled (11e BUILT); contacts only user-supplied (11a PARTIAL, VERIFIED) |
| A/B of resumes | Opens and replies (REPORTED) | Interviews per verified submission, n>=20 per version | Version hash on replica forms only (4f PARTIAL, VERIFIED) |
| Bot checks / Easy Apply errors | Fails silently (REPORTED) | Handoff <60 s, resume <60 s | Posting URL only; no resume (8a NONE, 8b PARTIAL, VERIFIED) |
| Proof | Not described | Stored confirmation or UNKNOWN | 9b PARTIAL; inbox reader not wired (9c MODULE, VERIFIED) |
| Interview prep | Mock interview (REPORTED) | Tied to submitted resume | PARTIAL (12a-12e, VERIFIED) |
| Free tier | 10 applications, no card (REPORTED) | Free up to cap after cost measured | None (VERIFIED, `tsenta.md`) |
| Price per application | $0.20 (USD plans) or ~$0.10 (EUR plans) (ASSUMED arithmetic) | Measured, below price | ~$0.004 modelled (ASSUMED); unmeasured (NOT_RUN) |

---

## 6. Pricing and unit economics

**Their price per application (ASSUMED arithmetic on REPORTED, conflicting prices):**

| Plan | Price | Applications | Price per application at full use |
|---|---|---|---|
| Basic Looper | free | 10 | $0 |
| Standard | $19.99/month (or EUR 8.99-9.99) | 100 | $0.20 (or ~EUR 0.09-0.10) |
| Premium | $59.99/month (or EUR 29.99) | 300 | $0.20 (or ~EUR 0.10) |
| Done For You | $89.99/month (or EUR 87.99) | 300 + weekly call | $0.30 (the call is most of the value) |

If users' reports are representative (14 applications from a month of matching, 2 of 60+, 22 after several runs), the
price per application actually sent is several dollars, not $0.20 (ASSUMED arithmetic: $19.99 / 14 = $1.43; $59.99 /
22 = $2.73).

**Architecture inference: cloud loops plus three cheap channels (ASSUMED).** Reasons: loops run daily "in the
background" without the user present [C1, C2]; recruiter emails are sent "on your behalf" (an email API, not a
browser) [C2]; LinkedIn Easy Apply goes through the user's Chrome extension (users report "enabling auto-apply and
the Chrome extension" and "Easy apply button wasn't found") [C5]; ATS form filling is claimed on an "autofill" page,
which by its name may be the extension filling forms the user opens [C1]. Resumly calls it "cloud-based applying"
[C9].

**What that implies (ASSUMED):** the cheapest channels carry the volume. An email costs a fraction of a cent; the
extension path costs nothing on LoopCV's servers; daily matching is batch compute. That supports a $0.10-0.20 price
and a free tier. It also explains the matched-vs-applied gap: when a match has no email address and no Easy Apply
button the extension can find, nothing cheap can submit it, and the match stays a match. The business sells matches
and allowances, and applications are what's left after the cheap paths fail.

**Against Trainee (ASSUMED):** Trainee's in-browser form fill (~$0.004) is cheaper per real form submission than
LoopCV's price, but LoopCV's email channel is cheaper than any form fill. Trainee does not compete with CV-by-email;
it is not an application in the employer's process, and the CEO-email complaint shows how it lands.

---

## 7. Failure modes and complaints

| # | Failure | Report | Label |
|---|---|---|---|
| F1 | **Matches that never become applications** | "12,000+ matches and 14 applications"; "users consistently report a major gap between jobs matched and jobs actually applied to". | REPORTED `[rival]` [C7], `[store]` [C5] (October 2025 review: 14 of over 12,000 despite "enabling auto-apply and the Chrome extension") |
| F2 | **"Applied" that was not** | "Only 2 applications were actually submitted out of 60+ jobs the system claimed to apply to." | REPORTED `[rival]` [C7] |
| F3 | **Easy Apply automation errors** | "Easy apply button wasn't found"; 180 roles found, 27 matched, 22 applications after several runs (November 2025). Company offered its technical team. | REPORTED `[store]` [C5] |
| F4 | **Emails to the wrong people, for roles not open** | "Sent emails directly to CEOs, including for roles that weren't open"; "emails sometimes reach the wrong people". | REPORTED `[store]` [C5, C8] |
| F5 | **Spam and phishing afterwards** | The same January 2026 reviewer "reports a rise in spam and phishing afterward". The company said it had no ticket or account details to investigate. Causation unproven. | REPORTED `[store]` [C5] |
| F6 | **No matches at all** | "Very few or zero job matches"; "local openings were sometimes zero"; "a premium plan delivered zero job matches". | REPORTED `[store]` [C5] |
| F7 | **Bugs, manual work** | "Full of bugs, with users doing most of the work manually"; a matching bug left a Premium user with no applications; auto-apply "didn't trigger because of a settings problem". | REPORTED `[store]` [C5, C8] |
| F8 | **Refund friction** | Refund "only approved after escalation"; "a refund process involving a customer service interview"; a refund delayed "around Easter" with the reply suggesting the reviewer "misunderstood how the tool worked". | REPORTED `[store]` [C5] |
| F9 | **Contradictory description of how it applies** | Vendor: fills Workday, Greenhouse, Lever, Ashby forms; reviewer: "does not fill out and submit full application forms"; vendor blog: LinkedIn session bots risk restriction; vendor marketing: auto-applies on LinkedIn. | REPORTED `[vendor]` [C1, C2], `[3P]` [C10] |
| F10 | **Platform bans, invented answers, duplicates, data loss** | No report found for LoopCV specifically; its own blog acknowledges the LinkedIn restriction risk for session bots [C2]. | absence of evidence, not evidence |

Counterweight (REPORTED): "interviews and job offers within 2 weeks of setting up loops"; praise for the interface
and named support staff; "setup took about twenty minutes" [C5]; a rival calls it "a legitimate company with a working
product and a free plan" [C6].

---

## 8. Ground-truth test plan (written only; nothing below has been run)

Rules: read the terms first; normal user; no scraping; no account from this plan without the owner's decision; do not
enable its LinkedIn or Indeed automation or its outbound recruiter emails (the second sends messages in the owner's
name to people who did not ask for them); owner's real resume; only roles he would accept.

**Step 0, no account, from an unrestricted network:**
1. loopcv.pro/pricing: plans, currency, whether 10 free applications are per month or total; record verbatim.
2. loopcv.pro/questions/refund/ and the terms: eligibility, the Done For You exclusion, any 7-day or 10% rule.
3. The autofill page and "how LoopCV works": which ATSes are named; whether "apply" includes emailing a CV.
4. blog.loopcv.pro/loopcv-spam-prevention/: the stated limits (per company, per day, duplicate contacts).
5. Trustpilot: TrustScore, count, one-star share; find the Chrome extension listing: rating, users, permissions.

**Step 1, the free tier (10 applications, no card), if the owner approves an account:**
6. One loop with a narrow written target; review-first mode on; recruiter email off.
7. After 7 days: count found, matched, queued, applied, and for each "applied" whether a confirmation email arrived.
   This measures F1-F2 directly.
8. Approve up to 10 company-portal applications (Greenhouse, Lever, Ashby). Per application: did LoopCV fill the
   employer's form, or send a CV by email? Wrong fields? Confirmation? Time?
9. Record every block (captcha, code, account) and what the user was told.
10. If the dashboard offers recruiter contacts, record the addresses it would use and check, for 10 of them, whether
    the person exists at that company and the role is open (no email sent).
11. Delete the account; request export; record what comes back.

Results to `docs/competitors/mass-applying.md` with VERIFIED labels; update section 5.

---

## 9. What Trainee must add or change because of LoopCV

### Kills the launch
1. **Engine: one honest count, from receipts.** LoopCV's defining failure is the gap between what the dashboard says
   and what was sent (REPORTED F1, F2). Trainee has the same defect class today: the summary says over-cap
   applications will resume and nothing resumes them (7g, VERIFIED); the batch card claims "the exact answers" while
   showing company, role and fit only (6a, VERIFIED). Fix both; then the person's numbers come only from receipts
   (found / passed floor / prepared / SUBMITTED / UNKNOWN / FAILED / waiting).
2. **Engine: failure reporting per application.** F3 shows a failure ("Easy apply button wasn't found") the user
   learns about only by counting. Trainee's per-application stops exist (7e BUILT, VERIFIED) but recovery and
   unknown-outcome resolution do not (8c, 8d, VERIFIED). Every stop reaches the person with the job, the reason and
   the next step.
3. **Engine: bot-check handoff that resumes on real forms.** Same gap as the other three documents (8a NONE, 8b
   PARTIAL, VERIFIED). Handoff only; never solve or evade.
4. **Engine: readback gate green; every application through the employer's own form.** Trainee must never count a CV
   sent by email to a guessed address as an application (F4, F9). Trainee has no email-apply path today (ASSUMED from
   its absence in REQUIREMENTS.md; confirm in code); keep it that way, and say so in the AI disclosure.

### Embarrasses at 100 users
5. **Outreach never sends itself and never targets a closed role.** F4-F5. Trainee's sending is disabled at the sink
   (11e BUILT, VERIFIED) and must stay so; add a liveness check (the role is open on the employer's site) before a
   note is drafted, and show where each address came from (11b BUILT, VERIFIED on supplied records).
6. **Alerts that explain themselves and turn into applications.** LoopCV's loop is its core loop; Trainee's deployed
   alerts carry only a link (10b PARTIAL, 10d NONE, VERIFIED). An alert must say why it matched, when it closes, and
   accept "apply" as a reply.
7. **Relevance floor, including "no matches" honesty.** F6 is the inverse failure: zero matches with no explanation.
   When the floor rejects everything, Trainee says how many were found and which filter rejected them, so the person
   can loosen one deliberately.
8. **Refunds without an interview.** F8. One written rule; one message to cancel.

### Matters at 10,000 users
9. **Engine: sign-in, verification codes, Workday, uploads, multi-page.** LoopCV claims Workday and iCIMS; Trainee:
   D-013 pending for login portals and Workday (VERIFIED); codes need handoff or the inbox reader (9c MODULE);
   uploads and multi-page BUILT on fixtures only (7c, VERIFIED).
10. **Engine: duplicate prevention across sources.** LoopCV's 30+ boards are the setting where one role appears many
    times. Trainee dedupes postings only by ATS id (2c PARTIAL, VERIFIED); build the normalized key (see
    `jobcopilot.md` item 1).
11. **Resume A/B on outcomes, with sample sizes.** Section 3.5. Do it only once receipts and replies are stored.
12. **Never claim "three times more interviews".** LoopCV's claim has no published method; Trainee publishes only
    numbers computed from stored proof (standard section 5).

**What LoopCV's failures teach about relevance floors and caps (ASSUMED, from REPORTED evidence):** a cap measured in
"matches" or "applications per month" means nothing if the count is not tied to proof: LoopCV users hit neither their
cap nor their expectations, because matches were cheap and real submissions were not. The lesson for Trainee's floor
is the reverse of the volume tools': the floor must also be visible when it rejects everything, and the cap (15 a day)
must be counted in verified submissions, never in matches, queue items or emails.
