# LazyApply: teardown and Trainee targets (build standard, 2026-10-19)

Follows `docs/product/BUILD-STANDARD-TSENTA.md`: labels, capability inventory, parity and better targets per feature,
cost notes, what the competitor lacks, a scoreboard, a ground-truth test plan and what Trainee must change.

---

## 0. Labels and method

**Labels (the standard's three, used exactly):**
- **VERIFIED** = read on a live page or measured in our own runs, source given.
- **REPORTED** = a third party, a search extract, or an earlier internal doc says it; not checked by us.
- **ASSUMED** = an inference. A hypothesis to test, never a fact to build on.

**What could be opened (accessed 2026-10-19):** nothing live. `WebFetch` on lazyapply.com returned `ENOTFOUND`; `curl`
through the agent proxy returned `403` on CONNECT for lazyapply.com, trustpilot.com, chromewebstore.google.com,
reddit.com, bbb.org, apps.apple.com and every review site tried. Every external fact below therefore comes from a
**search-engine extract of the cited URL**, and is labelled REPORTED, never VERIFIED, even when the cited URL is the
vendor's own page or the review platform itself. A source tag follows each label:
- `[vendor]` the vendor's own page, as quoted in a search extract (the strongest grade available here; a vendor
  claim is a claim about marketing, not about performance);
- `[store]` Trustpilot, Chrome Web Store, App Store, AppSumo or reseller listing, as quoted in a search extract;
- `[3P]` an independent-looking review or press piece;
- `[rival]` written by a company that sells a competing tool (FastApply, Scoutify, Scale.jobs, JobCopilot, LoopCV,
  Wobo, Resumly, JobHire, 6figr/JobGPT, Remote Job Assistant and similar). These have a motive to make LazyApply look
  bad. They are kept because they are most of what exists, and every one is marked.

Facts about Trainee come from `docs/product/REQUIREMENTS.md` (audited 2026-10-19 against `origin/trunk`) and
`docs/product/cost-model-applying.md`, and carry the label those documents give.

**What we could not check:** LazyApply's own pricing, refund and terms pages; the live Trustpilot and Chrome Web Store
numbers; who owns or funds the company; whether it fills company-ATS forms (Greenhouse, Lever, Ashby, Workday) at all;
how "Job GPT" writes answers; whether "referral emails" auto-send. The session's shared web-search budget (200 calls,
shared across agents) ran out before follow-ups on answer fabrication and the support-outage reports could be run.
These are open questions, listed in section 8 as the first things to check from an unrestricted network.

**Sources (each cited below by id):**
- [L1] dreamworkhq.com/blog/lazyapply-review (pricing page "checked August 26, 2026", annual tiers) `[3P]`
- [L2] aichief.com/ai-productivity-tools/lazyapply/ ; siteefy.com/tools/lazyapply ; navi.tools/tools/lazyapply ; navtools.ai/tool/lazyapply `[3P directories]`
- [L3] scoutify.com/blog/lazyapply-review/ and scoutify.com/blog/scoutify-vs-lazyapply/ `[rival]`
- [L4] blog.fastapply.co/is-lazyapply-legit-2026-review `[rival, author discloses he runs FastApply]`
- [L5] trustpilot.com/review/lazyapply.com (and au., nz., uk., ie., nl., no., dk. mirrors) `[store]`
- [L6] chromewebstore.google.com/detail/lazyapply/nhghkiolfannfjefpkolikipfhepceof `[store]`
- [L7] appsumo.com/products/lazyapply/reviews/ `[store]`
- [L8] store.entrepreneur.com, stacksocial.com, deals.newatlas.com "lazyapply job application lifetime subscription" `[store, reseller]`
- [L9] dev.to/elyasian_57e0befd2a586e37/why-lazyapply-got-me-linkedin-banned-and-what-i-use-instead-jjh `[3P, single anecdote, promotes an alternative]`
- [L10] scale.jobs/blog/lazyapply-risk-profile-banned-linkedin ; scale.jobs/blog/lazyapply-cost-per-interview-vs-scale-jobs `[rival]`
- [L11] remotejobassistant.com/blog/lazyapply-review `[rival]`
- [L12] wobo.ai/blog/lazyapply-review/ ; resumeup.ai/blog/lazyapply-review ; jobhire.ai/blog/lazyapply-review ; noxjobs.com/compare/lazyapply-review-2-3-trustpilot-rating `[rival]`
- [L13] loopcv.pro/directory/lazyapply/ and blog.loopcv.pro/lazyapply-review/ `[rival]`
- [L14] blackenterprise.com/this-software-is-your-personal-employment-finder/ ; jpost.com/deals/article-746284 `[3P, undated, promotional]`
- [L15] aitoolsatlas.ai/tools/lazyapply/changelog `[3P]`
- [L16] techloy.com/jobcopilot-alternatives-ai-job-search-engines-edit-before-submit/ `[3P]`
- [L17] jobcopilot.com/lazyapply-best-alternative/ ; jobcopilot.com/jobcopilot-vs-lazyapply/ `[rival]`
- [L18] 6figr.com/blog/lazyapply-review-is-it-worth-your-money-in-2026-620 `[rival]`

---

## 1. What the product is

| Item | Finding | Label |
|---|---|---|
| Company | A "real company (based in India)" that "has been mass-applying to jobs for users since 2022" [L4]. No founder name, legal entity, funding round or headcount was found in any source. | REPORTED `[rival]`; founder, funding, team: unknown |
| Funding | None found. Sold through lifetime-deal marketplaces (AppSumo [L7]; Entrepreneur, StackSocial, New Atlas reseller listings [L8]; a Mashable partner promo at $59.97 lifetime Basic "down from $149" [L1 extract]). Lifetime-deal distribution is typical of a self-funded tool. | REPORTED `[store]`; "self-funded" ASSUMED |
| Users | No user count found. Chrome Web Store ratings count (150 to 215) is the only scale signal. | REPORTED `[store]` |
| Trustpilot | 2.1 from 110 reviews, "Poor", 58% one-star and 37% five-star (review dated mid-August 2026) [L1/L12 extract]; 2.4 from 105 reviews ("March 2026 snapshot") [L4]; 2.2 from 108 and 2.3 from 106 in other snapshots [L12]; 2.5 outlier. "Only 13 reviews in the last twelve months" and "the company has not been inviting customers to review recently" [L12 extract]. | REPORTED `[store, via 3P/rival]` |
| Chrome Web Store | 3.3 from 215 ratings [L12 extract]; 3.6 from about 150 [L3]; 3.4 to 3.7 from about 150 [L11]; 4.5 in older undated promotional pieces [L14]. Reviews "highly polarized: 56% 1-star, 39% 5-star" (store not named) [L11]. | REPORTED `[store, via 3P/rival]` |
| App stores (iOS, Android) | No LazyApply mobile app found. | REPORTED (absence in search) |
| BBB | No BBB profile found in search. | REPORTED (absence in search; not proof) |
| Surfaces | Chrome extension plus a web dashboard. "Because it is a browser extension, the tab has to stay open" [L12]. A reviewer says it "doesn't clearly disclose that it's only a Chrome extension" [L5]. | REPORTED `[rival]`, `[store]` |
| How it makes money | Annual prepaid plans only, no monthly, no free tier, no trial: Basic $99/yr (15 applications/day, 1 resume profile, basic analytics, email support); Premium $149/yr (150/day, 5 profiles); Ultimate $999/yr (1,500/day, 20 profiles, advanced analytics, priority support); "30-day money-back guarantee" [L1, pricing page "checked August 26, 2026"; L2]. Earlier in 2026 it sold one-time lifetime tiers at $99, $149 and $249 [L1, L15]; one directory lists Premium at $129 with 750/day (does not match the others) [L1 extract]. | REPORTED `[3P]` (vendor page not opened) |

**Pricing change, worth noticing:** between January and August 2026 the same headline prices moved from one-time to
yearly, the entry cap fell from 150/day to 15/day, and the top tier went from $249 once to $999 a year [L1]. An AppSumo
buyer says lifetime-deal customers were "relegated to the Basic plan which only allows for 150 applications per day"
and that "the deal does not mention any restrictions"; the founder's reply "disputed the framing without addressing the
cap" [L7]. REPORTED `[store]`. Lesson for Trainee: changing what a paid plan delivers after purchase is the fastest way
to the category's 2-star rating.

---

## 2. Capability inventory, feature by feature

| Feature | What LazyApply does or claims | Label and source |
|---|---|---|
| **Discovery** | The user sets job titles and locations; the extension searches LinkedIn, Indeed and ZipRecruiter and works through matching listings ("scrolls through matching listings and auto-fills each application form"). | REPORTED `[3P]` [L2], `[rival]` [L12] |
| Discovery: company career pages | One Trustpilot reviewer says it "saves me tons of time applying directly through company career pages" [L5]. A roundup says "LazyApply has the most volume, mostly through job boards" and recommends a different tool for career pages. No source names an ATS it supports. | REPORTED `[store]`; ATS coverage unknown |
| **Matching quality** | Filters by title and location only; reports of applications "sent to irrelevant positions (including internships instead of full-time roles)" and a reviewer saying "filters don't work". | REPORTED `[store]` [L5], `[rival]` [L12] |
| **Prep / tailoring** | "Does not rewrite your resume or adapt your application strategy per job" [L12]. Separate tools: "Resume GPT", a resume summary generator, a resume builder that "can build, score, and track resumes"; one hands-on review calls the resume, cover letter and referral tools "template-grade" and the builder "basic". | REPORTED `[rival]`, `[3P]` [L2] |
| **Resume profiles** | 1 / 5 / 20 stored resume profiles by plan; the user picks which profile a run uses. | REPORTED `[3P]` [L1] |
| **Apply mechanics** | "Job GPT" fills forms from the stored profile and submits; works "most consistently on LinkedIn Easy Apply"; "the Chrome add-on fills most forms fine" (one reviewer). Runs inside the user's open browser tab. | REPORTED `[3P]` [L2], `[store]` [L5], `[rival]` [L12] |
| Apply: screening answers | Answers screening questions from the profile with a model. Reported wrong answers: "silly mistakes while filling up forms like inputting wrong information sometimes" (Reddit tester); a "documented case had the tool indicating a user spoke conversational Spanish when they didn't". | REPORTED `[rival]` [L12], quoting Reddit and a test |
| Apply: bot checks | "Couldn't get past Indeed captcha and was never able to submit any jobs"; "Indeed in particular has tightened captcha enforcement; users repeatedly report being blocked partway through batches". No handoff mechanism described anywhere. | REPORTED `[rival]` [L12] quoting Reddit |
| Apply: sign-in, verification codes, Workday | No source describes how it handles employer accounts, emailed codes or Workday. | absent from every source (not proof) |
| **Approval before send** | No source describes a per-application review step; the model is "set filters, start, it applies". | ASSUMED absent (no source describes one) |
| **Tracking** | An analytics dashboard "tracks all job applications and referral emails in real-time"; Basic analytics on lower plans, advanced on Ultimate. | REPORTED `[3P]` [L2] |
| **Receipts / proof** | No source describes a per-application receipt, a stored confirmation, or a submitted-vs-failed distinction. | absent from every source (not proof) |
| **Handoff to the human** | None described. Failures mid-batch (captcha, broken session) end the batch. | REPORTED `[rival]` [L12, L13: "browser sessions breaking mid-run"] |
| **Networking** | "Referral emails": "sends personalized outreach to employees at target companies" / "customized referral emails to relevant employees at companies applied to". Whether the user approves each email, and where addresses come from, is not described. | REPORTED `[3P]` [L2]; send mode unknown |
| **Interview prep** | None found. | absent from every source |
| **Memory** | Stored profile(s) only. No conversation, no learning from corrections described. | REPORTED `[3P]` [L2] |
| **Guidance / strategy** | None. "Does not adapt your application strategy per job" [L12]. | REPORTED `[rival]` |
| **Volume caps** | 15 / 150 / 1,500 applications per day by plan (August 2026); earlier "about 1,000 applications a day" [L3]. These are allowances, not relevance gates. | REPORTED `[3P]` [L1], `[rival]` [L3] |
| **Surfaces** | Chrome extension and web dashboard; tab must stay open. | REPORTED `[rival]` [L12] |
| **Pricing** | Annual only, $99 / $149 / $999 (section 1). | REPORTED `[3P]` [L1] |
| **Refunds** | "30-day money-back guarantee" on all plans [L1]. Practice: "approx. 25% of reviewers explicitly cite refund or cancellation failures" [L4, rival]; refunds "extremely difficult, if not impossible" [review site quoted in search]; "promised a full refund, then months of unanswered emails" [L5]; "no way to cancel or request a refund in the app"; users disputing with their card issuer [L5]. | policy REPORTED `[3P]`; practice REPORTED `[store]`, `[rival]` |
| **Honesty posture** | Marketing promises volume ("apply to thousands of jobs with a single click using AI" [L2 directory title]). No source shows LazyApply publishing interview rates, failure rates, or a statement about detection or platform terms. LoopCV, a rival, calls it "a real, functioning product" with "always some account risk when you automate actions at scale" [L13]. | REPORTED `[3P]`, `[rival]` |
| **Outcomes reported by users** | "About 5,000 applications and got just 20 interviews" (the source calls it 0.5%; 20/5,000 is 0.4%) [L12]; "over 7,000 applications which resulted in roughly 10 interviews" (Reddit, 0.14%) [L12]; "didn't get one call from more than a thousand applications" (Trustpilot, 2024) [L3 extract]; a 30-day blog test found callbacks "roughly equal to manual cold-applying (2-3%)" [L12]; rival-published ranges "0.5% to 2%" and "0.5%-6%" with no method [L10]. | REPORTED, anecdotes `[store]`, `[rival]`; no controlled study exists |

---

## 3. Acceptance targets for Trainee against LazyApply

The bar is the standard's section 3: a feature ships when PARITY and BETTER are both proven with VERIFIED evidence.
Every BETTER below is a number. Targets themselves are owner-level design choices and are ASSUMED until measured.

### 3.1 Discovery and matching
- **BASELINE:** title + location search over LinkedIn, Indeed and ZipRecruiter; internships sent to people who wanted
  full-time; "filters don't work" (REPORTED [L5, L12]).
- **PARITY:** for 25 title + location queries the owner picks, Trainee's pool contains at least 80% of the open roles
  at covered employers that a manual search of those employers' own career pages finds on the same day (company
  portal, not the boards: Trainee never automates LinkedIn or Indeed). Measured by hand on the 25 queries, recorded
  in `docs/coverage.md`.
- **BETTER:** on 500 consecutively surfaced roles for 10 test profiles: **0** roles whose employment type contradicts
  the profile (internship or contract shown to someone who said full-time), **0** roles below a stated seniority, and
  **at most 10%** judged irrelevant by the profile owner (LazyApply's REPORTED complaint is the internship case;
  AIApply's is 74% irrelevant, see `aiapply.md`).
- **COST NOTE:** discovery is crawl, storage and match compute, shared by all users; it does not scale with
  applications. Today's matching is title keywords + place (Trainee 2e/10a PARTIAL, VERIFIED in REQUIREMENTS.md), so
  the BETTER target needs seniority, employment type and exclusions honoured (2b, 3d), which is code, not spend.

### 3.2 Volume and the relevance floor
- **BASELINE:** 15 / 150 / 1,500 applications per day, sold as allowances; reported interview yields 0.14% to 0.5%
  per application in user anecdotes (REPORTED [L1, L12]).
- **PARITY:** deliberately **not** matched. Trainee's cap is 15 per day, not raisable (owner, 2026-10-19; VERIFIED in
  engine tests on PR #23, which is not merged). Parity here means: a user who asks for "as many as you can" gets up
  to 15 relevance-floor-passing applications a day, and is told how many passed the floor and why the rest did not.
- **BETTER:** interview invitations per **verified** submission at least **2.5%** over the first 1,000 verified
  submissions across all users (5x the 0.5% LazyApply figure that reviewers repeat; below Huntr's self-logged 9.25%
  for people sending 11-20 applications, which is REPORTED in `tsenta.md`). Measured from stored receipts and the
  user's own reported or forwarded replies. If the measured rate is below 2.5%, the relevance floor is wrong, not the
  cap.
- **COST NOTE:** at LazyApply's Premium price a fully used plan costs the user $0.0027 per application (section 6).
  Trainee will not beat that per application. It can beat it per interview: at 2.5% and the modelled ~$0.004 per
  application (ASSUMED, `cost-model-applying.md`), cost per interview is about $0.16, against roughly $0.54 per
  interview for a LazyApply Premium user at full use and a 0.5% rate (ASSUMED arithmetic on REPORTED inputs).

### 3.3 Apply: form fill and screening answers
- **BASELINE:** fills forms in the user's tab from a stored profile; wrong information "sometimes"; the
  conversational-Spanish case (REPORTED [L12]).
- **PARITY:** readback-verified fill on the 17 captured forms in CI, then 20+ real applications per launch ATS
  (Greenhouse, Lever, Ashby) with success / silent failure / bot-check stop / wrong field / time recorded (standard
  3.3).
- **BETTER:** on an audit of every field of 100 submitted applications per release: **0** answers that state a fact
  the user never confirmed (language, years, licence, clearance, location, salary), **100%** of eligibility, legal and
  consent questions answered only from the user's own words, **0** silent failures.
- **COST NOTE:** the planner asks the model about ~2 unanswered questions per posting, cached by meaning across users
  (~$0.0016 per application falling with scale, ASSUMED, `cost-model-applying.md`). The truth audit is a deterministic
  check against the fact bank: no extra model spend.

### 3.4 Bot checks and broken sessions
- **BASELINE:** blocked at Indeed's captcha "partway through batches"; "browser sessions breaking mid-run"; no
  handoff (REPORTED [L12, L13]).
- **PARITY:** every bot check, captcha, login or code is detected and the application stops safely with the reason
  stored (Trainee has this as safe stops: 8c PARTIAL, VERIFIED in REQUIREMENTS.md).
- **BETTER:** **100%** of blocks produce one short handoff message within **60 s**; the application resumes from the
  same page within **60 s** of the user finishing; **0** duplicate submissions caused by a resume; **0** blocks that
  end a batch for the other applications in it. Bot checks are handed to the human, never defeated: no solvers, no
  proxies, no stealth.
- **COST NOTE:** the extension path costs nothing extra for a handoff (the user is at the browser); the server path
  pays browser minutes while waiting, so a waiting session must be closed and re-opened, not held.

### 3.5 Resume profiles and the exact version
- **BASELINE:** 1 / 5 / 20 stored resume profiles per plan; no per-job tailoring (REPORTED [L1, L12]).
- **PARITY:** the user can keep more than one base resume (by role family) and pick one per batch.
- **BETTER:** **100%** of receipts carry the exact file sent and its hash, retrievable by the user; **100%** of source
  hyperlinks preserved through tailoring on a 100-resume sample (standard 3.2).
- **COST NOTE:** storage per receipt (one PDF, ~100 KB) is the cost; retention policy required before launch.

### 3.6 Referral and outreach emails
- **BASELINE:** "customized referral emails to relevant employees"; send mode and address source undescribed
  (REPORTED [L2]).
- **PARITY:** a drafted note to a sourced person for the top matches, the user sends it.
- **BETTER:** **0** messages sent without the user's tap; **100%** of addresses labelled verified or guessed (11c BUILT
  in module, DNS verifier not injected in production, VERIFIED in REQUIREMENTS.md); **0** people contacted twice.
- **COST NOTE:** model tokens per draft (cents); no sending infrastructure because Trainee does not send.

### 3.7 Tracking and honest counts
- **BASELINE:** a dashboard of applications and referral emails sent; no proof described (REPORTED [L2]).
- **PARITY:** one record per application with states, visible to the user.
- **BETTER:** **0** discrepancy between the count the user is told and the count of stored receipts (audited weekly);
  every application ends SUBMITTED (employer confirmation stored), UNKNOWN or FAILED (reason stored).
- **COST NOTE:** cheap (database rows); the confirmation-email proof needs an inbox reader or forwarding (9c MODULE).

### 3.8 Billing, refunds, cancellation
- **BASELINE:** annual prepaid only; a 30-day guarantee that reviewers say is not honoured; about a quarter of reviews
  about refunds; no in-app cancel (REPORTED [L1, L4, L5]).
- **PARITY:** a written refund rule and a cancel path (Trainee has no pricing yet: gate 9).
- **BETTER:** cancel in **one message** (STOP exists today for messaging; VERIFIED in REQUIREMENTS 14d as exact phrases
  only), refund requests answered within **2 business days**, **0** charges for applications that failed, **0**
  changes to what a paid plan includes during its term.
- **COST NOTE:** monthly billing costs more in payment fees than annual prepay; accept it.

### 3.9 Account safety on platforms
- **BASELINE:** a reported LinkedIn warning for "excessive applying" then a 30-day ban [L9]; rival claims of
  restrictions with unsourced rates [L10, L16].
- **PARITY / BETTER:** Trainee never drives a logged-in LinkedIn or Indeed session: **0** applications through job-board
  accounts. Aggregator apply links are refused today (8e AGGREGATOR_APPLY_FORBIDDEN, BUILT, VERIFIED in
  REQUIREMENTS.md). Company portals only.
- **COST NOTE:** none; this is a rule.

### 3.10 Availability
- **BASELINE:** Trustpilot complaints of "extended service outages lasting weeks to over a month" in January-February
  2026 (REPORTED [L11]; not confirmed elsewhere).
- **BETTER:** when the apply path is down, every user with queued work is told within **1 hour** what is waiting and
  that nothing will send; kill switch and rollback runbook exercised once before launch (Stage 8 gate 5, NOT_RUN).

---

## 4. What LazyApply does NOT have

Absence on a page or in search results is a strong indication, not proof. Re-check from an unrestricted network.
- **No per-application approval.** No source describes reviewing an application before it goes. ASSUMED absent.
- **No per-job tailoring.** "Does not rewrite your resume or adapt your application strategy per job." REPORTED [L12].
- **No receipts or employer confirmation.** Nothing describes stored proof or an UNKNOWN state. Absent from every source.
- **No handoff.** Captchas and broken sessions stop the batch. REPORTED [L12, L13].
- **No interview prep, no career guidance, no memory beyond profiles.** Absent from every source.
- **No relevance floor.** Caps are allowances; filtering is title and location. REPORTED [L1, L2].
- **No published outcome data.** No interview or failure rate from the company. Absent from every source.
- **No mobile app, no messaging surface.** Absent from every source.
- **No stated ATS coverage.** No source names a company ATS it fills. Absent from every source.

---

## 5. Scoreboard

| Capability | LazyApply (labelled) | Trainee target (measurable) | Trainee today (from REQUIREMENTS.md) |
|---|---|---|---|
| Applications actually submitted | Claims thousands; users report thousands sent (REPORTED [L12]) | 20+ real per launch ATS, numbers as numbers | **0 ever** (VERIFIED: "no application has been submitted") |
| Where it applies | LinkedIn, Indeed, ZipRecruiter; career pages unclear (REPORTED) | Company portals only; never LinkedIn/Indeed | Greenhouse, Lever, Ashby in code; aggregators refused (8e BUILT, VERIFIED) |
| Volume | 15/150/1,500 per day (REPORTED [L1]) | Max 15/day, relevance floor first | 15/day in tests on unmerged PR #23; trunk has 15 and 25 in two stacks (VERIFIED, 7g PARTIAL) |
| Relevance | Title + location; internships to full-time seekers (REPORTED) | 0 type/seniority contradictions in 500; <=10% irrelevant | Title keywords + place only; seniority stored not filtered (VERIFIED, 2b/10a PARTIAL) |
| Screening answers | Wrong info "sometimes"; invented Spanish (REPORTED) | 0 unconfirmed facts in 100-app field audit | Unknowns become questions on replica forms only (5e PARTIAL, VERIFIED); real forms NOT_RUN |
| Bot checks | Stops at Indeed captcha (REPORTED) | Handoff <60 s, resume <60 s, 0 dupes | Hands off the posting URL; no resume from saved point (8a NONE, 8b PARTIAL, VERIFIED) |
| Readback | Not described | Every field read back before submit | BUILT on fixtures (7d, VERIFIED); 17-form CI gate not green (captcha-detector fix unmerged, VERIFIED) |
| Proof / receipts | None described | Employer confirmation stored or UNKNOWN | Confirmation id/text/screenshot stored (9b PARTIAL, VERIFIED); no inbox reader (9c MODULE) |
| Duplicate prevention | Not described | 0 duplicate submissions | Never-submit-twice BUILT (7f, VERIFIED); posting dedupe only by ATS id (2c PARTIAL, VERIFIED) |
| Tailoring | None per job (REPORTED) | Per-role, 0 invented facts, links 100% | Truth-audit gate, bullets mostly verbatim (4b/4c PARTIAL, VERIFIED) |
| Referral email | Sends; mode unknown (REPORTED) | Drafts only; 0 auto-sent | Sending disabled (11e BUILT, VERIFIED); contacts only if user supplies them (11a PARTIAL) |
| Interview prep | None | Role-specific, rubric-graded | PARTIAL (12a-12e; regex STAR rubric, VERIFIED) |
| Refunds and cancel | 30-day guarantee, ~25% of reviews say not honoured (REPORTED) | One-message cancel; 0 charges for failures | No pricing yet (gate 9, NOT_RUN); STOP exact phrase only (14d PARTIAL) |
| Surfaces | Chrome extension, web (REPORTED) | iMessage + extension + web | iMessage, go-live pending (VERIFIED, tsenta.md) |
| Price per application | $0.0018-0.018 at full use (ASSUMED arithmetic, section 6) | Measured cost below price with margin | Modelled ~$0.004 in-browser (ASSUMED, cost-model-applying.md); nothing measured (NOT_RUN) |

---

## 6. Pricing and unit economics

**Their price per application (ASSUMED arithmetic on REPORTED prices [L1]):**

| Plan | Price | Max applications a year (cap x 365) | Price per application at full use | At a realistic 3-month search, 20 a day |
|---|---|---|---|---|
| Basic | $99/yr | 5,475 (15/day) | $0.018 | 1,350 capped at 15/day: $0.073 |
| Premium | $149/yr | 54,750 (150/day) | $0.0027 | 1,800: $0.083 |
| Ultimate | $999/yr | 547,500 (1,500/day) | $0.0018 | 1,800: $0.555 |

Nobody uses a year of cap; the right comparison is price per application actually sent. Prepaid annual billing makes
the effective price per application rise as the user stops using it, which is the business model.

**Architecture inference: extension in the user's browser (ASSUMED, strongly supported).** Reasons: it is sold and
reviewed as a Chrome extension; "the tab has to stay open" [L12]; failures are browser-local (captcha mid-batch,
"browser sessions breaking mid-run" [L13]); it drives LinkedIn and Indeed through the user's own logged-in session,
which a server could only do with the user's credentials. No source describes a server-side apply path.

**What that implies for their cost (ASSUMED):** server cost per application is near zero (no browser hours, no
proxies). Their marginal cost is model tokens for screening answers and any generated text, plausibly well under one
cent per application with a small model (Trainee's own model estimate is ~$0.002-0.004, `cost-model-applying.md`,
ASSUMED). With near-zero marginal cost and prepaid annual revenue, LazyApply's economics reward selling volume and
spending little on support, which matches the support complaints (inference, ASSUMED).

**What it means for Trainee (ASSUMED):** the extension path is LazyApply's architecture too. Running in the person's
browser is therefore **not** a cost edge against LazyApply; it is cost parity at best. LazyApply's Premium plan at full
use ($0.0027) is already below Trainee's modelled cost (~$0.004). Trainee must never claim "cheaper" against this
competitor (standard section 5). The edge is cost per interview and proof, not cost per application.

---

## 7. Failure modes and complaints

Each item is a real user report or a review-site finding, with its source and label. None is independently confirmed.

| # | Failure | Report | Label |
|---|---|---|---|
| F1 | **Invented answer** | The tool "indicat[ed] a user spoke conversational Spanish when they didn't" (documented case in a review). | REPORTED `[rival]` [L12] |
| F2 | **Wrong field values** | "Makes silly mistakes while filling up forms like inputting wrong information sometimes" (Reddit tester). | REPORTED `[rival]` [L12] quoting Reddit |
| F3 | **Screening questions answered wrong; applications skipped or completed incorrectly on complex forms** | Listed as recurring. | REPORTED `[rival]` [L13] |
| F4 | **Irrelevant matches** | Applications "sent to irrelevant positions (including internships instead of full-time roles)"; "filters don't work". | REPORTED `[rival]` [L12], `[store]` [L5] |
| F5 | **Captcha wall, zero submissions** | The Indeed plugin "couldn't get past Indeed captcha and was never able to submit any jobs"; "blocked partway through batches". | REPORTED `[rival]` [L12] quoting Reddit |
| F6 | **Broken sessions mid-run** | "Browser sessions breaking mid-run." | REPORTED `[rival]` [L13] |
| F7 | **Platform account ban** | A LinkedIn warning for "excessive applying" followed by a 30-day ban (single first-hand post). Rival-cited "23% of users saw restrictions within 90 days" traces to an unnamed report. | REPORTED `[3P]` [L9]; the 23% is unsourced [L16] |
| F8 | **Near-zero yield** | 5,000 applications, 20 interviews (0.4%); 7,000 applications, about 10 interviews (0.14%); "more than a thousand applications" and "not one call". | REPORTED, anecdotes [L12, L3 extract] |
| F9 | **Refund not honoured** | "Promised a full refund, then months of unanswered emails"; 30-day window "never honored"; ~25% of reviewers cite refund or cancellation failure; chargebacks via card issuers. | REPORTED `[store]` [L5], `[rival]` [L4] |
| F10 | **No in-app cancel; vague refund policy** | "No way to cancel or request a refund in the app"; "vague refund policy"; "doesn't clearly disclose that it's only a Chrome extension". | REPORTED `[store]` [L5] |
| F11 | **Plan changed after purchase** | AppSumo lifetime buyers moved to a 150/day cap not stated in the deal. | REPORTED `[store]` [L7] |
| F12 | **Long outages** | Trustpilot complaints "about extended service outages lasting weeks to over a month" (January-February 2026). | REPORTED `[rival]` [L11]; not found elsewhere |
| F13 | **Unanswered support** | A June 2026 review: "unanswered support emails and a product the reviewer could not use". | REPORTED `[store]` [L5] |
| F14 | **Duplicates, data loss** | No report found of duplicate submissions or lost data. | absence of evidence, not evidence |

Counterweight (also REPORTED): a positive AppSumo review calls it "one of my best software purchases" [L7]; some
users report success on LinkedIn Easy Apply [L12]; a rival calls it "a legitimate Chrome extension that, when it
works, delivers ... volume submission on Indeed Easy Apply" [L12]. It is a working product, not a scam; its failures
are the failures of volume without verification.

---

## 8. Ground-truth test plan (written only; nothing below has been run)

Rules for whoever runs it: read LazyApply's terms first; test as a normal user; do not scrape; do not create accounts
from this plan without the owner's decision; **never run LazyApply against LinkedIn or Indeed** (LinkedIn's User
Agreement 8.2 bans bots, REPORTED in `research-competitors.md`; it would also risk the tester's own account). Use the
owner's real resume and only roles he would accept, so no employer receives a fake candidate.

**Step 0, from an unrestricted network, no account needed (upgrades REPORTED to VERIFIED):**
1. Open lazyapply.com/pricing: record tiers, caps, billing period, the refund text verbatim, the date.
2. Open the terms and refund policy: what counts as a refund-eligible failure; how to cancel.
3. Open the Chrome Web Store listing (id nhghkiolfannfjefpkolikipfhepceof): rating, count, users, last update,
   **requested permissions** (read/change data on all sites?), publisher name and address.
4. Open trustpilot.com/review/lazyapply.com: TrustScore, count, share of 1-star, share of reviews mentioning refunds.
5. Search the BBB and the company registry named in the terms: legal entity, country.

**Step 1, only if the owner approves a purchase (there is no free tier; Basic is $99 with a stated 30-day guarantee):**
6. Onboarding: what the profile asks for; whether it asks for any platform password (record, never enter one).
7. Screening-answer audit **before** any run: if the dashboard previews generated answers, record every answer to
   20 common questions (languages, years per skill, licence, clearance, relocation, salary) and mark each as stated
   by the owner or invented.
8. Company-portal path only, if one exists: 10 applications to Greenhouse, Lever and Ashby postings the owner would
   accept. Per application: submitted or not, time, fields wrong, documents sent, whether a confirmation email
   arrived, whether the dashboard count matches the confirmation emails.
9. Relevance: of the roles it queues for a "full-time, senior, remote, US" filter, count internships, contracts,
   wrong seniority, wrong location.
10. A role with a bot check: what the user sees. Expected (REPORTED): a stalled batch. Record whether it says why.
11. Cancel and refund: request the refund inside 30 days by the stated channel; record days to reply and outcome.
12. Data: request export and deletion; record what comes back and whether the extension keeps local data.

Write results into `docs/competitors/mass-applying.md` with VERIFIED labels and update the scoreboard (section 5).

---

## 9. What Trainee must add or change because of LazyApply

Ranked by launch risk. Each item names its evidence. "Engine" marks a submission-engine gap.

### Kills the launch
1. **Engine: a bot check must become a handoff that resumes, not a dead posting link.** LazyApply's most-cited
   technical failure is the captcha wall ending the batch (REPORTED F5). Trainee today hands the person the posting
   URL and cannot resume from the saved point (8a NONE, 8b PARTIAL, VERIFIED); the visible-browser handoff works on a
   fixture but "a real captcha provider's requests are still blocked after the first fill" (VERIFIED, REQUIREMENTS
   progress). Every live Greenhouse, Lever and Ashby form loads an invisible bot check at submit (REPORTED, standard
   2.3). Until a real handoff resumes on a real form, Trainee is LazyApply minus the volume. Handoff only: never a
   solver, proxy or stealth.
2. **Engine: zero invented answers, enforced by a check, not by a prompt.** The Spanish case (REPORTED F1) is the
   exact failure a recruiter catches in the first screen. Trainee's truth audit exists for resumes (4b PARTIAL) and
   unknowns become questions only on replica forms (5e PARTIAL); real forms need the worker, NOT_WIRED (VERIFIED).
   Ship the per-field audit of section 3.3 before any real submission for anyone but the owner.
3. **Engine: the counts the person is told must equal the receipts.** The summary today says over-cap applications
   will resume, and nothing resumes them (7g, VERIFIED). That is a false statement to the user, the same class as a
   dashboard that counts attempts as applications. Fix the code or the sentence before launch.
4. **Engine: readback gate green on the 17 captured forms.** The captcha-detector defect (an empty invisible hCaptcha
   container counted as a challenge, stopping 5 of 6 saved Lever applications at open) is fixed only on an unmerged
   branch (VERIFIED, REQUIREMENTS progress). LazyApply's "wrong information sometimes" is what happens without
   readback.

### Embarrasses at 100 users
5. **Relevance floor before any send.** LazyApply sends internships to full-time seekers (REPORTED F4). Trainee's
   alerts and search match title keywords and place only; seniority and remote are stored but not filtered; exclusions
   are ignored by search and alerts (2b, 3d, 10a, VERIFIED). Trainee at 100 users would reproduce F4. Floor: employment
   type, seniority, location/remote, exclusions, and a stated minimum fit, each a hard filter with the reason shown.
6. **Engine: failure reporting per application.** LazyApply ends batches silently (REPORTED F5, F6). Trainee has safe
   stops but no recovery and `resolveUnknownOutcomes` has no caller (8c, 8d, VERIFIED). Every stopped application must
   reach the person as one line: which job, what stopped it, what happens next.
7. **Cancel and refund in one message, written before pricing.** The category's reputation is refunds (REPORTED F9,
   F10, F11). Trainee's pause and stop work only on exact phrases (14d PARTIAL, VERIFIED). Rule: never change a paid
   plan's terms mid-term.
8. **Engine: duplicate prevention across sources.** Trainee never submits the same claimed application twice (7f
   BUILT, VERIFIED), but postings are deduplicated only by ATS id; cross-board dedupe runs only on the router's empty
   pool (2c PARTIAL, VERIFIED). One role posted on two boards is two queue items today. Ashby lets employers cap
   applications per candidate and shows the blocked list (REPORTED, `tsenta.md`), so a duplicate costs the person.

### Matters at 10,000 users
9. **Engine: sign-in, verification codes, Workday.** LazyApply avoids them by living on Easy Apply; Trainee cannot
   (company portals only). Login portals and Workday wait on D-013 (VERIFIED); verification codes need the inbox reader
   (9c MODULE) or a handoff. Order: handoff for codes first (no inbox access needed), Workday last (standard gate 8).
10. **Engine: file uploads and multi-page forms on real portals.** Built and tested on fixtures, skipped without
    Playwright (7c BUILT, VERIFIED); proof on real forms is NOT_RUN. Receipts store documents only as a hash (9b
    PARTIAL); store the exact file sent.
11. **Availability honesty.** If the apply path is down, say so to every user with queued work (section 3.10).
12. **Never "cheaper" against LazyApply.** Its price per application at full use is below Trainee's modelled cost
    (section 6, ASSUMED). Compete on interviews per application and proof.

**What LazyApply's failures teach about relevance floors and caps (ASSUMED, from REPORTED evidence):** a daily cap is
not a quality control. LazyApply's caps went from 150 to 15 on the cheapest plan without any report that relevance
improved; the users who sent 5,000 to 7,000 applications report yields of 0.14% to 0.4%. Volume without a floor
multiplies the person's exposure (bans, duplicates, recruiters seeing wrong answers) faster than it multiplies
interviews. Trainee's floor must be a set of hard filters checked before the cap is counted, the 15-a-day cap is the
ceiling on top of the floor, and the measure of both is interviews per verified submission, published internally
weekly.
