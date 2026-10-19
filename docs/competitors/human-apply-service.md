# Human-assisted application service: Scale.jobs teardown and Trainee targets

2026-10-19. Built to `docs/product/BUILD-STANDARD-TSENTA.md` (sections 0, 2, 3.3, 3.5, 3.6, 3.7-3.11, 4, 6, 11). Trainee's
state is from `docs/product/REQUIREMENTS.md` (audit of 2026-10-19), `docs/product/cost-model-applying.md` and the repo
checkout at `44364a83`.

---

## 0. Labels and method

| Label | Meaning in this document |
|---|---|
| VERIFIED | Read in our own repo or measured in our own run, source given. |
| VERIFIED-S | The named primary page (scale.jobs and its blog, Trustpilot's own score panel, the company's own reply on Trustpilot, Workday's own documentation) states it, read through a WebSearch extract on 2026-10-19. The live page was **not** opened. A verified *claim*, never verified *performance*. |
| REPORTED | A third party says it, through a search extract. "REPORTED (competitor)" marks a source that sells a rival product (Scoutify, LoopCV, Jobright). |
| ASSUMED | Inference, arithmetic, or recalled knowledge not looked up this session. |

Method and limits:
- No vendor page could be opened (WebFetch `ENOTFOUND`, proxy `403 connect_rejected`). Search extracts only.
- **Almost every detailed claim about Scale.jobs comes from Scale.jobs' own blog.** The blog is large and comparative
  ("Scale.jobs vs every other auto-apply tool", "Tsenta vs Scale.jobs"); it is marketing. Independent evidence is
  limited to Trustpilot reviews and competitor write-ups.
- The shared web-search budget ran out before two planned checks: how Scale.jobs handles one-time codes sent to the
  candidate's own inbox, and whether assistants log into candidates' LinkedIn accounts. Both stay **unknown** below.
- No account, no purchase, no WhatsApp contact. Section 8 is a written plan only.

### 0.1 Why Scale.jobs
Candidates considered (all labeled):
| Service | Model | Evidence footprint | Label |
|---|---|---|---|
| **Scale.jobs** | Human assistants ("trained associates and interns in India") apply manually in company portals; one-time packages of 250-1,000 applications | **Trustpilot 4.5 from 187 reviews**; Techstars-backed; published prices; explicit proof-of-submission claim (time-stamped screenshots) | VERIFIED-S |
| ApplyPass | "People guided and AI assisted"; $99/mo for up to 100 applications a week, $199/mo up to 400 a week; free 7 a week | 16 Trustpilot reviews, all five stars; reviews describe human *interview coaching*, not humans reviewing each application | REPORTED (competitor: scoutify.com/blog/applypass-review) |
| Careerify | ~$150-720/mo for ~50-300 applications ($2.40-3.00 each) | Only in a competitor's cost guide | REPORTED (competitor: scoutify.com) |
| Freelance VAs (Upwork) | $2.50-7 per application, or $6-15/hour, $400-800/mo at volume | Rate estimates only | REPORTED (competitor: scoutify.com, blog.loopcv.pro) |
| Reverse recruiters | $1,500-3,000+/mo (or $15-40 per application) | Estimates only | REPORTED (competitor: blog.loopcv.pro) |

Scale.jobs is the pick because it is the **most prominent service whose humans demonstrably do the applying** (its own
replies say so, and reviewers describe the assistants), with the largest public review base of the human-first options,
published per-application pricing, and a proof-of-submission claim that maps one-to-one onto Trainee's receipts.
ApplyPass has a smaller review base and its human role is unconfirmed.

---

## 1. What the product is

**One line:** you buy a package of N applications; a human assistant (in practice, associates and interns in India)
logs into each employer's career portal, fills the form, writes a cover letter on higher tiers, submits, and sends
you a time-stamped screenshot over WhatsApp within 12-24 hours.

### 1.1 Company
| Fact | Value | Label and source |
|---|---|---|
| Founded | 2023, San Francisco | REPORTED: thecompanycheck.com |
| Founders | Leela Yanamaddi (co-founder), Balaji Kummari (co-founder, CTO) | REPORTED: thecompanycheck.com, yourstory.com author page |
| Origin story | Co-founder hired a college student from India and trained them to apply on his behalf | VERIFIED-S: scale.jobs blog (how-scale-jobs-virtual-assistant-hires-job-seekers-3x-faster, per extract) |
| Funding | Seed, March 2024, **Techstars Atlanta powered by J.P. Morgan**; amount $20K or $120K (sources conflict) | REPORTED: cbinsights.com/company/scalejobs/financials vs thecompanycheck.com |
| Description | "Human EA marketplace" building "a multimodal AI agent for job seekers to take care of clerical work" | REPORTED: directory profile |
| Workforce | "Trained associates and interns in India" | VERIFIED-S: the company's own reply on Trustpilot (per extract) |

### 1.2 Users and ratings
| Metric | Value | Label and source |
|---|---|---|
| Users | **No reliable figure found** | Search; a "40,000 users" hit belonged to a different company |
| Trustpilot | **4.5 / 5 (4.6 displayed) from 187 reviews**; replied to 100% of negative reviews, typically within a week (snapshot 2026-10-19) | VERIFIED-S: trustpilot.com/review/scale.jobs and regional mirrors |
| Callback rate claim | "Significantly higher callback rates (25-47%)" for human assistants | VERIFIED-S as claim (scale.jobs blog); **no source, no method** |

### 1.3 Pricing (one-time packages, not subscriptions)
| Package | Price | Contents | Per application | Label |
|---|---|---|---|---|
| Basic | $199 | 250 applications, 1 assistant | $0.80 | VERIFIED-S (scale.jobs blog) |
| Mid | $299 | 500 applications, custom cover letters; 1 or 2 assistants (posts conflict) | $0.60 | VERIFIED-S, conflicting |
| Large | $399 | 1,000 applications, 2 assistants, cover letters | $0.40 | VERIFIED-S |
| Ultimate Bundle | $1,099 | 1,000 applications + "AI customizations", personal recruiter support, resume review, LinkedIn makeover | $1.10 | VERIFIED-S |
| Onboarding fee | $100, "non-refundable" in one post; "deducted from the unused portion" in another | adds $0.10-0.40 per application | VERIFIED-S, conflicting |
| Refund | Pro-rata refund of unused credits (for example on landing a job early) minus the $100; another post: "70% refund within 30 days if not satisfied"; "terms can vary depending on the plan" | | VERIFIED-S, conflicting |
- SaaSWorthy lists the start price as $299 (REPORTED, conflicts with $199).

---

## 2. Capability inventory

| # | Capability | What is claimed | Label and source |
|---|---|---|---|
| H1 | Human applies in company portals | "VAs log into each company's career portal, fill out forms, and upload tailored documents" | VERIFIED-S: scale.jobs blog |
| H2 | **Walls a bot hits** | Assistants get past "multi-step forms, custom screener questions, login loops, and email verification steps"; CAPTCHAs: "human solves it" vs a bot that "halts the run" | VERIFIED-S: scale.jobs homepage and comparison pages |
| H3 | Workday | "A Scale.jobs assistant logs in, moves through the portal, fills in each field, answers screener questions, and uploads a resume for each role"; Workday and Greenhouse "a common failure point for bots" in its own 30-day test | VERIFIED-S as claim (scale.jobs/blog/auto-apply-tools-30-day-test-results and others) |
| H4 | Bot-detection posture | Bots from data-center IPs trip detection; assistants "work from residential connections and browse like actual users" | VERIFIED-S as claim |
| H5 | **Proof of submission** | "Time-stamped screenshots of submissions via WhatsApp, confirming that your applications have been successfully sent" | VERIFIED-S: scale.jobs blog |
| H6 | Turnaround | 12-24 hours per submission | VERIFIED-S |
| H7 | Updates channel | WhatsApp, "replacing opaque dashboards with direct human communication"; a third party says there is a dashboard | VERIFIED-S vs REPORTED (aitoolly.com), conflicting |
| H8 | Resume review before applying | "As part of its standard process, it waits for client feedback on resume review before submitting applications" | VERIFIED-S: company reply on Trustpilot |
| H9 | Tailored documents | Custom cover letters with human review on $299+ tiers; "custom resumes and cover letters designed to pass automated filters" | VERIFIED-S |
| H10 | Extras (Ultimate) | Recruiter support, resume review, LinkedIn makeover | VERIFIED-S |
| H11 | Sponsorship filtering | Positions itself against LazyApply as asking about sponsorship ("$149/Year Won't Ask About Sponsorship") | VERIFIED-S (blog title) |
| H12 | Credentials and codes | **Unknown.** No source says how assistants receive codes sent to the candidate's inbox, whose email creates Workday accounts, who holds those passwords, or whether they log into LinkedIn | Search found nothing (budget ran out before a targeted check) |

---

## 3. Acceptance targets for Trainee, per feature

Cost unit prices: gpt-5-mini and gpt-5-nano as in `docs/product/cost-model-applying.md` (VERIFIED (indexed)); Trainee's
cost per application there is **~$0.004 in the person's own browser, ~$0.025-0.05 on a server browser** (ASSUMED
arithmetic, not yet measured).

### 3.1 Submitting in the employer's own portal (H1, H3)
- BASELINE: a human fills every field in any portal, Workday included (VERIFIED-S claim).
- PARITY: Greenhouse, Lever, Ashby first at **20+ real applications each** with recorded success, silent failure,
  bot-check stop, wrong field and time taken (standard 3.3); the owner's 3 confirmed submissions per site first.
  Workday is gate 8 (multi-month).
- BETTER: **readback-verified** fill: every field read back before submit, **0** mismatches at submit across the 20-run
  sets. A human has no readback step (ASSUMED); at an illustrative 1% per-field keying error (ASSUMED rate, to be
  measured), a 40-field Workday application has a 1 - 0.99^40 ≈ **33%** chance of at least one wrong field.
- TODAY: no real submission yet (P0). Multi-page and dropdown fill BUILT on replica forms (7c), readback BUILT (7d),
  never-submit-twice BUILT (7f), submitted-only-on-confirmation BUILT (7h). Login portals pending (D-013).
- COST NOTE: ~$0.004 per application in the browser vs **$0.40-0.80** of price at Scale.jobs (plus up to $0.40 of
  onboarding fee). A two-order-of-magnitude cost gap; it does not become a price claim until measured (standard 5).

### 3.2 Walls: captcha, verification code, account, login (H2, H4, H12)
- BASELINE: "the human solves it" (VERIFIED-S claim), with no disclosed method for codes sent to the candidate.
- PARITY: **100%** of walls end in a handoff or a stated stop, never a silent failure and never a guess.
- BETTER: handoff message within **60 s** of the block, resume within **60 s** of the answer, **zero** duplicate
  submissions from resume (standard 3.6); **zero** candidate passwords or codes held by any person other than the
  candidate. See 9.2 for the wall-by-wall comparison.
- TODAY: NONE for same-session login/CAPTCHA (8a); handoff ticket without resume (8b, PARTIAL); a visible-browser
  handoff on a fixture, blocked on a real captcha provider after the first fill (REQUIREMENTS progress, `[~]`).
- COST NOTE: a handoff is one message out and one in: on the LoopMessage line, inside the per-sender plan (VERIFIED
  (indexed) $59.99-99.99/month per sender in the cost model).

### 3.3 Proof of submission (H5)
- BASELINE: a time-stamped screenshot over WhatsApp (VERIFIED-S claim).
- PARITY: for every application, a stored receipt: fields sent, answers, documents (with sha256), timestamps, and the
  proof artifact (confirmation page capture and, when available, the employer's confirmation email).
- BETTER:
  - Outcome is one of SUBMITTED (proof stored), UNKNOWN, FAILED (reason stored); **0** applications called submitted
    without proof. A screenshot cannot distinguish "filled" from "submitted" unless it shows the confirmation page.
  - Verified-submit rate computed weekly from receipts.
  - Receipts are a tracker row, searchable ("did I apply to Stripe?"), not a WhatsApp image stream.
  - Proof stays in the encrypted store; no screenshots of personal data move through a chat app.
- TODAY: BUILT in module 149 (accepted + confirmationId, 7h); confirmation id, text, screenshot and time stored, documents
  only as sha256 (9b PARTIAL); no inbox reader (9c MODULE).
- COST NOTE: a confirmation capture is ~100-300 KB (ASSUMED); at 450 applications per user per month that is under
  ~135 MB per user before a retention policy.

### 3.4 Error rate and targeting (H8, complaints)
- BASELINE: no published error rate; REPORTED off-target applications by "undergraduate" assistants not specialized in
  the field; targeting improved after the client complained.
- PARITY: measure and publish internally: wrong-field rate, wrong-role rate (applications the user would not have
  approved), duplicate rate, per ATS.
- BETTER: **0** applications below the stated relevance floor; **100%** of applications approved by the user before
  sending (default mode); wrong-role complaints under 1 per 100 applications in the first 1,000.
- TODAY: approval of an exact batch BUILT on the structured field only (6b; a texted yes cannot approve yet).
- COST NOTE: matching is ~$0.002 per posting, shared across users (cost model).

### 3.5 Turnaround (H6)
- BASELINE: 12-24 hours (VERIFIED-S claim).
- PARITY: an approved application is submitted within 24 hours, or the user is told why not.
- BETTER: median **under 2 hours** from approval to submission on supported ATSes while the user's browser is open;
  when it is closed, one message says what is waiting (standard 6.2, no silent queue rot).
- TODAY: over-cap items never resume though the summary says they will (7g PARTIAL).

### 3.6 Tailored cover letters (H9)
- BASELINE: human-written custom letters with review on $299+ (VERIFIED-S claim).
- PARITY: a per-application letter where the posting asks for one, from the user's facts.
- BETTER: **0** invented facts (truth audit), every specific claim traceable to a stored fact; blind review of 30
  letters cannot reliably tell Trainee's from a careful human's (standard 3.2).
- TODAY: BUILT fact-cited letters (5c); the router cover-letter route passes `{}` and refuses (5a PARTIAL).
- COST NOTE: ~3,000 in / 600 out ≈ $0.002 per letter on gpt-5-mini (ASSUMED).

### 3.7 Volume (packages of 250-1,000)
- BASELINE: 250-1,000 applications per package (VERIFIED-S).
- PARITY: **not a target.** Trainee caps at 15 a day (owner, 2026-10-19), ~450 per 30 days.
- BETTER: interview rate per application, measured per user and per role family. Huntr's self-logged data: 11-20
  applications 9.25% interview rate per application vs 2.58% for 100+ (REPORTED via prior notes, huntr.co Q1 2026,
  correlational). A volume service has no reason to measure this.

### 3.8 Status updates (H7)
- BASELINE: WhatsApp messages from a human (VERIFIED-S).
- PARITY: iMessage updates per batch; tracker per application (9a).
- BETTER: replies routed to the right application at 98%+ precision on a 200-email labeled set (standard 3.4).
- TODAY: 9a PARTIAL, 9c MODULE.

### 3.9 Networking, prep, guidance (beyond)
- BASELINE: "personal recruiter support" and "LinkedIn makeover" only in the $1,099 bundle (VERIFIED-S). No interview
  prep, referral drafts or outcome guidance found (ASSUMED absent).
- TARGET: standard 3.7, 3.8, 3.10 apply unchanged; Trainee's numbers are in `finalround.md` and `yoodli.md`.

---

## 4. What Scale.jobs does NOT have

1. **No field-level receipt or verified outcome state.** A screenshot is the proof (VERIFIED-S claim); no
   SUBMITTED/UNKNOWN/FAILED record found.
2. **No published error rate or callback method.** "25-47%" is unsourced (VERIFIED-S claim, no method).
3. **No per-application approval** found; the client approves the resume up front, then assistants choose and apply
   (VERIFIED-S on resume review; per-application approval ASSUMED absent).
4. **No disclosed credential policy** (H12). Unknown who holds Workday passwords and inbox codes.
5. **No speed at volume beyond human hours**: 12-24 hours per submission (VERIFIED-S).
6. **No interview prep, networking drafts, memory or guidance** outside the bundle extras (ASSUMED absent).
7. **No relevance floor or cap**: packages sell volume (VERIFIED-S).

---

## 5. Scoreboard

| Capability | Scale.jobs (labeled) | Trainee target (measurable) | Trainee today |
|---|---|---|---|
| Applies in employer portals | Yes, by hand, any ATS incl. Workday (VERIFIED-S claim) | GH, Lever, Ashby at 20+ real apps each; Workday gate 8 | 0 real submissions (P0); replica-form fill BUILT (7c) |
| Field accuracy | Not published | 0 readback mismatches at submit | Readback BUILT (7d), unmeasured on real forms |
| Captcha | "Human solves it" (VERIFIED-S claim) | Candidate solves in own browser; handoff < 60 s, resume < 60 s | NONE (8a); fixture handoff only |
| Email verification code | Unknown | Candidate texts the code; inbox read optional; resend once on expiry | NONE live (9c MODULE) |
| Workday account | Unknown who holds the password | No third party holds a password; extension in candidate's browser | Not started (gate 8; D-013) |
| Proof of submission | Time-stamped screenshot via WhatsApp (VERIFIED-S claim) | Receipt + confirmation capture + employer email; UNCONFIRMED when unproven | BUILT in 149 (7h); 9b PARTIAL |
| Verified-submit rate | Not published | Weekly from receipts | No runs |
| Approval before send | Resume review up front (VERIFIED-S) | Every application approved (default) | BUILT via API field only (6b); not over text |
| Turnaround | 12-24 h (VERIFIED-S) | Median < 2 h after approval while browser open | Over-cap items never resume (7g) |
| Cover letters | Human-written, $299+ (VERIFIED-S) | 0 invented facts; blind-review parity | BUILT module (5c); chat route refuses (5a) |
| Volume | 250-1,000 per package (VERIFIED-S) | 15/day by design; interview rate per application measured | Cap 15 (PR #23, branch) |
| Price per application | $0.40-0.80 (+ up to $0.40 onboarding) (VERIFIED-S arithmetic) | Measured cost ≪ their price; no "cheaper" copy until 30 days measured | ~$0.004 modeled (ASSUMED) |
| Refund | Pro-rata unused minus $100; conflicting posts (VERIFIED-S) | Failed applications never counted; plain rule | No pricing (gate 9) |
| Rating | Trustpilot 4.5 from 187 (VERIFIED-S) | n/a | No public users |

---

## 6. Pricing and unit economics

### 6.1 Their price (VERIFIED-S arithmetic)
$199/250 = $0.80; $299/500 = $0.60; $399/1,000 = $0.40; $1,099/1,000 = $1.10. With a non-refundable $100 onboarding
fee on top: $1.20, $0.80, $0.50, $1.20.

### 6.2 Architecture and labor inference (ASSUMED throughout)
- Labor: associates and interns in India (VERIFIED-S statement). Assume a fully loaded cost of $1.50-4.00 per hour
  and 5-20 minutes per application (2-5 for a short form, 15-30 for a new Workday tenant with account creation).
  Labor per application ≈ **$0.15-1.30**. At the $0.40 tier, a mix heavy in Workday loses money; the economics work only
  if most applications are short forms. Expect the mix to drift toward quick forms (ASSUMED; test in section 8).
- 12-24 hour turnaround fits a queue worked during Indian daytime, which is US night (ASSUMED).
- "Residential connections" means the assistants' own home or office connections in India, not the candidate's
  (ASSUMED from H4). A US employer's fraud signals see an application for a US candidate from an Indian IP. Greenhouse
  Real Talent flags fraud by IP, email and phone (VERIFIED-S in prior notes: greenhouse.com/real-talent-terms); a
  foreign IP on a US-only role is the kind of signal those tools score (ASSUMED).
- The "multimodal AI agent" in its profile (REPORTED) suggests it is automating its own assistants; the human layer is
  the current cost floor.

### 6.3 Comparison with Trainee's engine
| | Scale.jobs | Trainee (extension-first) |
|---|---|---|
| Cost per application | $0.40-1.30 of labor (ASSUMED), priced at $0.40-1.20 | ~$0.004 model cost (ASSUMED, cost model) |
| Where the fill runs | Assistant's machine and IP | The candidate's own browser, IP and sessions |
| Who answers a wall | The assistant | The candidate, by one message |
| Proof | Screenshot | Receipt + confirmation capture + email, outcome state |
| Error control | Human attention | Readback before submit + approval |
| Throughput limit | Assistant hours | 15/day cap by design; browser open |

---

## 7. Failure modes and complaints

| Failure mode | Label and source |
|---|---|
| Slow start: "took days to start work"; waited over 14 hours after delegating jobs with nothing started and no updates; "not worth the money" | REPORTED: Trustpilot review (trustpilot.com/review/www.scale.jobs) |
| Off-target applications: assistants "not specialized in a particular field and a bit naive, because they were undergraduate students" (2024) | REPORTED: Trustpilot |
| Targeting fixed only after the client complained | REPORTED: Trustpilot (positive review describing improvement after feedback) |
| A five-star review that still says it is better to apply yourself; a one-star "Zero stars if I could" | REPORTED: Trustpilot |
| Co-founder publicly questioned a critical reviewer's motives | REPORTED: Trustpilot reply |
| Conflicting refund terms across its own posts ($100 non-refundable vs deducted; pro-rata vs 70% within 30 days) | VERIFIED-S conflict |
| Conflicting assistant counts per tier; dashboard vs no dashboard | VERIFIED-S / REPORTED conflict |
| Callback numbers without a method | VERIFIED-S claim, unsourced |
| Positive: "got a job within 120 applications"; "good platform for mass applications"; relevant roles reported by others | REPORTED: Trustpilot |

### 7.1 Structural risks (be brutal; ASSUMED unless labeled)
1. **Identity and attestation.** Application forms ask the candidate to certify the information; a stranger clicks it.
   Background-check vendors report discrepancies are common (HireRight 2025: over 3/4 of employers found one,
   VERIFIED-S in prior notes). A human assistant guessing a screener answer creates exactly that discrepancy.
2. **Credentials.** If assistants create Workday accounts with the candidate's email, someone at the service knows a
   password per employer tenant, and either sees the candidate's inbox or relays codes by hand. Workday's own flow
   sends a 6-digit one-time code to the email, which becomes the username (VERIFIED-S: doc.workday.com Workday Central
   Login); some tenants give **3 minutes** to enter it (REPORTED: das.iowa.gov guide). An asynchronous 12-24 hour
   service cannot meet a 3-minute window without inbox access or a live candidate. Which one it uses is unknown.
3. **LinkedIn.** If assistants use the candidate's LinkedIn (Easy Apply), that is account sharing; LinkedIn's User
   Agreement 8.2 bans bots (VERIFIED-S in prior notes) and its account-sharing terms (ASSUMED, recalled; re-read) put the
   candidate's account at risk. Not confirmed that Scale.jobs does this.
4. **Fraud signals.** Applications for US roles submitted from Indian IPs (6.2) may score as suspicious in tools like
   Greenhouse Real Talent (VERIFIED-S that the tool scores IP; the effect on these applications is ASSUMED).
5. **Human error at volume.** No readback, no published error rate; fatigue at 1,000 applications.

---

## 8. Ground-truth test plan (written only; nothing run, no purchase)

Needs owner approval and budget ($199 + $100 onboarding). Read scale.jobs terms, privacy and refund policy first and
record the exact refund rule in writing before paying.
1. Buy the smallest package with a test persona that is a real, consenting staff member (applications reach real
   employers; never a fictional candidate). Target 25 roles across Greenhouse, Lever, Ashby and Workday, including 2
   with sponsorship questions and 1 role the persona is not qualified for (to see if it is refused or applied).
2. Record before start: what credentials they ask for (email password? delegated inbox? LinkedIn login?), over which
   channel, and whether they ask for consent to certify on the candidate's behalf.
3. Per application: time from request to screenshot; whether the screenshot shows the confirmation page or a filled
   form; whether the employer confirmation email arrived; every field compared against the persona's facts (wrong-field
   count); sponsorship answers; duplicates.
4. Walls: for each Workday application, record whether a code was requested from the persona and how fast they needed
   it. Record every captcha they report solving.
5. Cancel mid-package; record the refund amount against the stated rule.
6. Compare with Trainee on the same 25 roles once gate 4 allows it: same metrics, plus handoff time and resume time.
7. Write results here with VERIFIED labels; ask the persona to withdraw any applications they would not want.

---

## 9. What Trainee must add, ranked by launch risk

### 9.1 Ranked gaps
| Rank | Gap | Why | Label |
|---|---|---|---|
| 1 | **First real submissions with proof** (P0: the owner's 3 per ATS, then 20+ per launch ATS). | A human service has applied for real people today; Trainee has applied for nobody. Every comparison below is hypothetical until this exists. | VERIFIED (REQUIREMENTS: LIVE 0) |
| 2 | **The wall handoff, live, in the same session** (8a NONE, 8b PARTIAL). | The human's one structural advantage is passing walls. Without a working handoff, Trainee fails exactly where Scale.jobs claims to succeed. | VERIFIED gap; VERIFIED-S competitor claim |
| 3 | **Receipts and outcome states with the employer's email** (9b, 9c). | Proof is the best edge we have over a screenshot; it is not real until a confirmation email is parsed and stored. | VERIFIED gap |
| 4 | **A texted yes approves the exact batch** (6b over text) and the card shows answers, destination, resume, attestation text (6a). | Scale.jobs asks one approval (resume) up front; we ask per batch, so it must be one tap. | VERIFIED gap |
| 5 | **Ask-once for unknown screeners over text** (5e), never a guess. | The human's REPORTED failure is guessing and mis-targeting. | VERIFIED gap |
| 6 | **Over-cap and closed-browser honesty** (7g): items resume next day; the user is told what waits. | Turnaround parity with 12-24 h depends on it. | VERIFIED gap |
| 7 | **Workday** (gate 8), with no third party holding passwords. | The human service covers it today (claim); we do not. Multi-month. | VERIFIED-S claim; ASSUMED timeline |

### 9.2 What a human does at each wall, and what our handoff must match
| Wall | What the human assistant does (labeled) | What Trainee's handoff must do (target) |
|---|---|---|
| Invisible bot check at submit (hCaptcha / reCAPTCHA scoring, Greenhouse, Lever, Ashby) | Passes as a human on a residential connection (VERIFIED-S claim) | Fill in the **candidate's own browser** (extension path), so the check scores the candidate. On a server path, never: stop and hand off. No solvers, no outsourced humans solving for us (standard 3.6, permanent). |
| Visible captcha | The assistant solves it (VERIFIED-S claim) | One message within 60 s: "Acme's form wants a puzzle solved; tap to finish it in your browser." The candidate solves it in the **same session**, the run resumes within 60 s, no duplicate submit. |
| Email verification code (Greenhouse some boards, Workday account) | Unknown: needs the candidate's inbox or a live relay (H12) | One message naming the sender and where the code went; the candidate replies with the code; it is used once and never stored (owner rule: never store OTPs). If the code window (as short as 3 minutes, REPORTED) passes, request a resend once and say so. Optional inbox read later (9c). |
| Workday account creation per tenant | Unknown who creates it and who holds the password | The candidate's own browser creates the account with their own password manager; Trainee fills profile pages, never sees or stores the password. Message: "Acme uses Workday; create your account in this tab, then I'll fill the rest." |
| Login to an existing ATS account | Assistant logs in with credentials it holds (ASSUMED) | Candidate's existing browser session; if logged out, one message to sign in themselves. |
| Screener the profile cannot answer (sponsorship, salary, start date) | Guesses or asks over WhatsApp (ASSUMED; REPORTED mis-targeting) | Ask once, store the answer, never ask again for the same meaning (5d, WO-020); negated or combined sponsorship questions always asked (VERIFIED on branch, PR #23). |
| Attestation checkbox ("I certify...") | The assistant ticks it for the candidate (ASSUMED) | The exact attestation text is in the approval card; the candidate's approval covers it; never ticked without it. |
| Ambiguous outcome (spinner, timeout, no confirmation page) | Screenshot of whatever is on screen (ASSUMED) | UNKNOWN, investigated before any retry (8d); never "submitted". |

### 9.3 The comparison the owner asked for
| | Scale.jobs | Trainee engine | Status of our number |
|---|---|---|---|
| Proof of submission | Time-stamped screenshot via WhatsApp (VERIFIED-S claim) | Receipt (fields, answers, documents with sha256, times) + confirmation capture + employer email; SUBMITTED / UNKNOWN / FAILED | Built in module 149; not yet produced by a real run (VERIFIED) |
| Error rate | Not published; off-target complaints (REPORTED) | Target 0 readback mismatches at submit; wrong-role and duplicate rates published | NOT_RUN |
| Cost per application | $0.40-1.20 of price (VERIFIED-S arithmetic); $0.15-1.30 of labor (ASSUMED) | ~$0.004 in the person's browser; ~$0.025-0.05 on a server browser (ASSUMED, cost model) | ASSUMED until 1,000 real applications measure it |

---

## Sources (search extracts, 2026-10-19; none opened live)
- Vendor: scale.jobs (homepage "Job Application Service: We Apply for You"), scale.jobs/pricing.md, scale.jobs/blog/job-application-services-pay-someone-apply-for-you, /blog/best-job-application-services-comparison, /blog/ai-apply-vs-virtual-human-assistant-job-application-comparison, /blog/how-scale-jobs-virtual-assistant-hires-job-seekers-3x-faster, /blog/auto-apply-tools-30-day-test-results, /blog/scale-jobs-vs-other-auto-apply-tools-comparison, /blog/tsenta-vs-scale-jobs-autofill-vs-real-humans-comparison, /blog/lazyapply-vs-scale-jobs-all-you-need-to-know, /blog/one-time-fee-lifetime-applications-how-it-works, /blog/jobhire-ai-vs-scale-job-a-detailed-breakdown-of-pricing-plans
- Ratings: trustpilot.com/review/www.scale.jobs and ca/uk/nz/au mirrors (187 reviews)
- Company: thecompanycheck.com/company/b/scalejobs, cbinsights.com/company/scalejobs/financials, yourstory.com/author/leelayanamaddi
- Third party and competitors: jobright.ai/blog/scale-jobs-review-2026-features-pricing-and-the-best-alternatives, scoutify.com/blog/pay-someone-to-apply-to-jobs, scoutify.com/blog/applypass-review, blog.loopcv.pro/pay-someone-to-apply-for-jobs-cost, saasworthy.com/product/scalejobs/pricing, aitoolly.com/en/product/scale-jobs
- Workday: doc.workday.com (Workday Central Login), das.iowa.gov Workday guide, cityyear.org Workday email verification PDF
- Prior notes (`audit/research-competitors.md`): Greenhouse Real Talent, LinkedIn User Agreement 8.2, HireRight 2025, Huntr Q1 2026
- Repo: `docs/product/REQUIREMENTS.md`, `docs/product/cost-model-applying.md` (checkout `44364a83`)
