# Simplify (Copilot, Simplify+, Autopilot): teardown and Trainee targets

Follows `docs/product/BUILD-STANDARD-TSENTA.md` section by section. When this document and the standard disagree,
the stricter requirement wins.

## 0. Labels and method

**Labels (the standard's, section 0):**
- **VERIFIED**: read on a live page, or measured in our own runs. Nothing in this document reaches that bar. No
  competitor page could be opened live, and no test run was made.
- **VERIFIED-S**: the competitor's own page (its site, help center, store listing or company profile) states the
  claim, read through a WebSearch extract of the cited URL on 2026-10-19. It counts as a VERIFIED *claim* (their
  words), never as VERIFIED *performance*. Re-open the page live before the claim goes into a PR, a message or launch
  copy.
- **REPORTED**: a third party says it: a review blog, an aggregator, the press, a Trustpilot summary or a forum. Many
  review blogs in this category are run by competing products. Where I know that, I say so.
- **ASSUMED**: my inference. A hypothesis to test, never a fact to build on.
- **NOT_RUN**: a Trainee measurement that has not been made.

**Method, accessed 2026-10-19:**
- WebFetch on `simplify.jobs/copilot`: `getaddrinfo ENOTFOUND`. curl through the agent proxy to `simplify.jobs`:
  `CONNECT tunnel failed, response 403`. No official page was opened live.
- Everything below comes from WebSearch result extracts. A search model writes those extracts. They can paraphrase, and
  text in quotation marks may not be verbatim.
- The session's shared search budget (200 calls) ran out before I could check: Simplify's employer-side revenue,
  its iOS App Store rating, the Autopilot list of supported application systems, its privacy policy and data
  retention, and Reddit threads directly. Those items are marked "not checked".
- Nothing was signed up for, submitted or scraped.

**Could not check:** live pages; the Autopilot ATS list; the current refund-policy page; the App Store and Google Play
listings; any primary Reddit thread; real fill accuracy (only third-party numbers exist, and they conflict).

## 1. What the product is

| Item | Finding | Label | Source |
|---|---|---|---|
| Company | Simplify, founded 2020, Y Combinator W21, San Francisco | REPORTED | ycombinator.com/companies/simplify |
| Founders | Michael Yan (CEO per CB Insights), Ethan Horoschak, Rushil Srivastava | REPORTED | ycombinator.com/companies/simplify; cbinsights.com/company/simplify-jobs/people |
| Funding | Seed only. About $4.0M to $4.35M in total. The latest round was a $3.0M seed in Feb 2024, led by Craft Ventures, with Global Founders Capital, Hyphen Capital, Y Combinator, Soma Capital, Rebel Fund and angels. No Series A found. | REPORTED (aggregators disagree) | extruct.ai/hub/simplify-jobs-funding; crunchbase.com/organization/simplify-d633; tracxn.com; vcbacked.co/company/simplify |
| Team | "a tight-knit team of just 7 people" (the company's own YC profile). Built In says 10, Employbl 32, Prospeo 101-200. | VERIFIED-S (7, their words); REPORTED (the others) | ycombinator.com/companies/simplify/jobs; builtin.com/company/simplify; employbl.com; prospeo.io/c/simplify |
| Users | "nearly half a million job seekers have used Simplify to apply to over 25 million roles" (the company's LinkedIn page). Extruct says 1,500,000. | VERIFIED-S (claim); REPORTED (1.5M) | linkedin.com/company/simplifyjobs; extruct.ai/hub/simplify-jobs |
| Chrome Web Store | 4.9 from about 3.8K ratings, 600,000 users. The listing says ratings are "updated daily and may not reflect the most recent reviews". An older capture showed 4.8 from 3.9K. | VERIFIED-S (snapshot date unknown; seen 2026-10-19) | chromewebstore.google.com/detail/simplify-copilot-autofill/pbanhockgagggenencehbnadejlgchfc |
| Firefox | An add-on exists. Its one-star reviews report lag, a frozen computer and a login loop. The Mozilla listing recommends Chrome instead, citing performance. | REPORTED | addons.mozilla.org/en-US/firefox/addon/simplify-jobs/reviews/ |
| iOS | An app exists ("Getting started with the Simplify iOS app"). Rating not checked. | VERIFIED-S (exists) | help.simplify.jobs/articles/3745882-getting-started-with-the-simplify-ios-app |
| Android | Not found | absent (not checked deeply) | |
| Trustpilot | About 3.0 from about 9 reviews. Another review blog says 3.6. Most one-star reviews are about Simplify+ billing. | REPORTED | trustpilot.com/review/simplify.jobs (regional pages); wobo.ai/blog/simplify-review |
| Distribution | Public GitHub lists: `SimplifyJobs/Summer2026-Internships` (about 47k stars, read from a garbled org listing) and `New-Grad-Positions` (about 17-18k stars). | REPORTED (counts inferred) | github.com/SimplifyJobs/Summer2026-Internships; gittrend.io/repo/SimplifyJobs/New-Grad-Positions |
| Surfaces | Chrome extension (Copilot), Firefox add-on, web app (Job Matches, Job Board, Tracker, Resume Builder, Networking, Autopilot tab), iOS app | VERIFIED-S | help.simplify.jobs collections |
| How it makes money | Simplify+ subscriptions (section 6). Whether employers pay (sponsored jobs or sourcing) was not checked. | VERIFIED-S (Simplify+); not checked (employer side) | help.simplify.jobs/articles/5623502 |

**What it is, in one paragraph (ASSUMED synthesis).** Simplify is mainly a free autofill extension that runs in the
person's own browser and fills the form. The person presses Submit. Around it sit a job board, a tracker and a free
resume builder. On top is a paid AI bundle, Simplify+: tailoring, cover letters, answers, networking and email. Since
2026 it also has a small, beta, credit-capped submit-for-you agent, Autopilot. Its distribution moat is students: the
GitHub internship and new-grad lists feed the extension.

## 2. Capability inventory

### 2.1 Discovery
- Job Matches, a Job Board and search on simplify.jobs. You open a job "from Job Matches, the Job Board, or search".
  VERIFIED-S. help.simplify.jobs/articles/1784339-getting-started-with-autopilot
- Public GitHub lists of internships and new-grad roles, with tens of thousands of stars. REPORTED (counts).
  github.com/SimplifyJobs/Summer2026-Internships
- Freshness: no published time-to-alert number found. Absent; a strong indication, not proof.
- Job count and the source of listings: not found.
- Network insight on job cards ("how you're connected") with Simplify+. VERIFIED-S.
  help.simplify.jobs/articles/4158996-networking-on-simplify

### 2.2 Prep (tailoring, cover letters, answers)
- The free tier has a basic resume builder. Simplify+ adds AI resume tailoring, cover letters, application-question
  answers, networking, outreach and "job search insights". "All Simplify+ plans include the same full suite."
  VERIFIED-S. help.simplify.jobs/articles/5623502-whats-included-in-simplify-features-and-pricing
- Autopilot asks how to prepare the application: "a resume tailored for this role, or your default resume to move
  faster". VERIFIED-S. help.simplify.jobs/articles/1784339
- Diff view, a truth guarantee, or "facts only" language: not found. Absent.
- Quality: "needs substantial editing" (several reviews); "a mediocre AI writing bundle" (one review). No independent
  measurement exists. REPORTED. noxjobs.com/compare/simplify-jobs-review...; resumeoptimizerpro.com/blog/simplify-alternative

### 2.3 Apply and submission mechanics

**Copilot (free, in the person's browser):**
- "Able to autofill job applications on over 100 job boards and application portals including Workday, Greenhouse,
  iCIMS, Taleo, Avature, Lever, and SmartRecruiters." VERIFIED-S (claim). simplify.jobs/copilot (FAQ). A third party
  says "more than 20,000 career pages". REPORTED. resumehog.com
- The person submits: "You still review the completed application and click the final Submit button yourself."
  VERIFIED-S. help.simplify.jobs/articles/8686025-manage-autofill-settings-in-the-simplify-extension
- "Autofill all fields with AI" toggle: "let Copilot answer unique questions using information from your profile".
  VERIFIED-S. Same article.
- "Continuously autofill multipage forms": when enabled, "Simplify will continue filling each page automatically
  until the application is submitted." VERIFIED-S. Same article. ASSUMED: "until submitted" means it fills up to the
  final page and the person still presses Submit, as the same article says. The wording is ambiguous, and nobody
  outside has tested it.
- Per-field toggles for phone, salary and work authorization. VERIFIED-S. Same article.
- Unsupported sites: a Profile tab with a copy-and-paste view, and a "request autofill support" form. VERIFIED-S.
  help.simplify.jobs/article/19-autofill-not-supported; simplifyjobs.notion.site/Request-Autofill-Support-...
- Account sign-in and creation (Workday "Create Account", passwords): no Simplify help article found. Absent.
  ASSUMED: the person signs in themselves, because the extension runs in their own browser session.
- File uploads: no help article in the extracts. On Workday, "the Resume Upload stage requires you to manually select
  the .docx". REPORTED (a third-party guide, cited in a search summary).
- Workday dropdowns (state, country, "How did you hear about this role?") still need manual selection. REPORTED.
  resumejudge.com/blog/simplify-review
- Fill accuracy, from third parties only, and they conflict:
  - One 2026 test: about 90% Greenhouse, 85% Lever, 70% Workday, 50% iCIMS, 40% Taleo. REPORTED. The extract returned
    it for a query whose results were loopcv.pro/guides/simplify-jobs-not-working, wobo.ai/blog/simplify-review,
    jobhire.ai/blog/simplify-jobs-review and remotejobassistant.com, and did not say which page. Treat it as
    unattributed.
  - A 14-day test found Workday "near-perfect" on standard fields. REPORTED. resumejudge.com/blog/simplify-review
  - Accuracy is "strongest on tech ATS and weaker on enterprise systems". REPORTED. resumly.ai/answers/simplify-jobs-review

**Autopilot (Simplify+, beta):**
- "Autopilot is an agent that applies to jobs on your behalf. Pick a job on Simplify and Autopilot opens the
  company's application portal, fills it in from your Simplify profile", and submits. VERIFIED-S.
  help.simplify.jobs/articles/1784339
- "Choosing Autopilot means submitting. There's no review step in between." VERIFIED-S. Same article.
- The option "appears only on postings Autopilot can complete" and "supports a specific set of application systems".
  The list was not in the extracts. VERIFIED-S (claim); the list was not checked.
- "Simplify+ includes 20 auto-applies a week", and a credit is used "only when an application actually goes through".
  VERIFIED-S. help.simplify.jobs/articles/1787280-applying-to-a-job-with-autopilot
- "If it isn't confident an answer is right, it fails the application rather than submit something wrong", and the
  credit is kept. VERIFIED-S. Same article.
- Missing profile details block completion: name, email, phone, location, LinkedIn URL, work authorization, default
  resume. VERIFIED-S. Same article.
- Failures are listed at simplify.jobs/autopilot, and you "finish it yourself with Copilot". VERIFIED-S. Same article.
- Beta, "available to a subset of Simplify+ members". Asking you questions mid-application is "planned but not yet
  live". VERIFIED-S. Same articles.
- Extra credits cannot be bought. REPORTED. jobsaicopilot.com/jobright-vs-simplify (and one October 2026 review)

### 2.4 Tracking
- Job Tracker. After a Copilot application, the help center says Copilot "adds the application to your Job Tracker
  automatically" (help 2415391), and also that "you'll be prompted to add the application" (help 2140179). The two
  conflict. Auto-tracking covers only "jobs you apply to that are in our database". Other jobs are added by hand or by
  CSV import. VERIFIED-S (conflicting). help.simplify.jobs/articles/2415391; /articles/2140179; /articles/9861158
- Email Integration: "public beta", **Gmail only**, access by emailing support. "Smart Matching" of recruiting emails
  to tracked applications. "Recommended status updates": recommended, not automatic. AI Email drafting needs Simplify+.
  VERIFIED-S. help.simplify.jobs/articles/0236686-email-integration
- Employer verification codes read from email: not documented. Absent.
- The tracker "sometimes creates duplicate entries or misses applications", called a known sync limitation. REPORTED.
  (search summary of loopcv.pro / wobo.ai / jobhire.ai)

### 2.5 Receipts and proof
- Copilot: the tracker entry is the only record (VERIFIED-S above). No receipt of fields, answers and documents was
  found. Absent.
- Autopilot: failures are listed with the option to finish by hand (VERIFIED-S). What a successful Autopilot record
  contains (fields sent, a confirmation capture, the employer's email) was not found. Absent.
- Refund of failed applications: the credit is used only on success (VERIFIED-S). This is the category floor
  (standard 3.5).

### 2.6 Human handoff
- Autopilot fails, then the person "finish[es] it yourself with Copilot", starting the application in their own
  browser. VERIFIED-S. ASSUMED: nothing resumes from the failed step. The person refills the form from the start.
- Mid-application questions: planned, not live. VERIFIED-S.
- Captcha and bot checks: no statement found. Absent. ASSUMED: Copilot needs none, because the person is at the
  browser. How Autopilot behaves at a challenge is unknown. The "fails rather than guess" rule suggests it fails.

### 2.7 Networking
- Simplify Networking (Simplify+): "connect LinkedIn" and Simplify "maps your network against companies that are
  hiring and surfaces employees and hiring managers you may already have a path to through first-, second-, or
  third-degree connections". It also syncs Google Contacts, imports a spreadsheet, searches for hiring managers and
  recruiters in plain language, and shows insights in Job Matches, the Job Board, Lists and Copilot. VERIFIED-S.
  help.simplify.jobs/articles/4158996-networking-on-simplify
- How the LinkedIn connection is made (OAuth, a data export, or something else) is not stated in the extract. Not
  checked. ASSUMED: a terms question worth reading in their privacy policy, because LinkedIn restricts automated
  collection (LinkedIn User Agreement 8.2, VERIFIED-S in `research-competitors.md`).
- Drafting: AI Email in the tracker (Simplify+). Reviewers describe drafted emails to hiring managers. VERIFIED-S
  (AI Email); REPORTED (outreach use).

### 2.8 Interview prep
- None found in the help-center extracts or the reviews. Absent; a strong indication, not proof.

### 2.9 Memory
- The profile is the single source for autofill (VERIFIED-S, help 1749022 "Installing and Setting up Copilot").
  AI answers are drawn "from your profile" (VERIFIED-S).
- No evidence of meaning-based reuse of answers the person gave before. Absent.
- **Leakage report:** custom fields "populated with carry-over text from a different application". REPORTED.
  remotejobassistant.com/blog/simplify-jobs-review. ASSUMED: some answer cache is reused across applications without a
  meaning check.

### 2.10 Guidance
- "Job search insights" are listed in Simplify+ (VERIFIED-S); their content is not described. No funnel or outcome
  analytics found. Absent.

### 2.11 Volume caps
- Copilot: none. It goes at the person's pace, one form at a time. VERIFIED-S (they submit each one).
- Autopilot: 20 a week, no top-ups. VERIFIED-S (20); REPORTED (no top-ups).

### 2.12 Pricing
- Free: Copilot autofill (unlimited per reviewers), tracker, basic resume builder, job matching. VERIFIED-S (features);
  REPORTED ("unlimited").
- Simplify+: **$19.99 a week, $39.99 a month, $89.99 for 3 months**, all with the same features. VERIFIED-S.
  help.simplify.jobs/articles/5623502. Some reviewers say the pricing appears only in the app. REPORTED.
- Refunds: "payments are non-refundable once a subscription is activated" (a refund page updated 2026-05-26, per a
  third party). No free trial. REPORTED. Trustpilot: a same-day cancellation was refused a $39.99 refund. REPORTED.

### 2.13 Honesty posture
- Autopilot fails rather than guess, charges only on success, is labelled beta, and says plainly that there is no
  review step. VERIFIED-S as policy. This is the best posture on unknowns found in the category. It is not
  VERIFIED performance.
- Copilot's silent blanks ("leaves blanks pretty regularly (without notification)") contradict that posture on the
  free path. REPORTED. trustpilot.com/review/simplify.jobs
- No published success, fill-accuracy or interview rate. No "undetectable" claim found.

## 3. Acceptance targets for Trainee against Simplify

Each feature has a **Baseline** (Simplify), **Parity** (measurable), **Better** (a number) and a **Cost note**. A
feature ships only when parity and better are proven VERIFIED (standard section 3).

### 3.1 Discovery
- **Baseline:** Job Matches plus public internship and new-grad lists. No freshness number.
- **Parity:** the default chat path sees real postings; today the router is handed `postings: []` (REQUIREMENTS
  "What the tally hides" 2). On a 4-week sample of 100 roles from Simplify's public GitHub lists whose apply URL is on
  a Greenhouse, Lever, Ashby or Workday board, Trainee's harvest holds at least 95 of them.
- **Better:** for those overlapping postings, Trainee's `first_seen_at` is earlier than the commit that added the role
  to Simplify's list for at least 60%, with a median lead of 30 minutes or more. The commit time is public: reading a
  public repo's history is normal use, not scraping their product.
- **Cost note:** crawl and storage only. The 564M-character storage flag (standard 3.1) applies.

### 3.2 Prep (tailored resume, letters, answers)
- **Baseline:** AI tailoring, letters and answers for $39.99 a month. No diff and no truth claim found. Reviewers say
  heavy editing is needed.
- **Parity:** a per-role tailored resume and letter, free up to the cap, with a diff before anything is sent (4e
  today: module only).
- **Better:** 0 invented facts in 100 sampled tailored resumes per release, plus a 20-resume human audit. 100% of lines
  carry provenance to a confirmed fact. 100% of links survive.
- **Cost note:** about $0.0005 for an essay on 24% of postings (cost-model-applying.md, ASSUMED arithmetic).

### 3.3 In-browser fill (the Copilot equivalent)
- **Baseline:** 100+ portals claimed. Third-party accuracy, REPORTED and conflicting: Greenhouse about 90%, Lever 85%,
  Workday 70%, iCIMS 50%, Taleo 40%. Silent blanks REPORTED.
- **Parity:** readback-verified field accuracy of at least 90% on Greenhouse and at least 85% on Lever, measured on 20
  real applications each (standard 3.3). Workday is not a parity claim until D-013.
- **Better:** **0 silent blanks.** Every required field left unfilled is named to the person before submit, and the
  share of required fields filled and verified by readback is at least 98%. Measured on the 17 captured forms in CI
  and on every real run.
- **Cost note:** about $0 of server per fill on the extension path (standard 6.2). Trainee has no extension today
  (REQUIREMENTS 8a NONE; only iMessage). This is the cheapest path and the one Simplify already owns for free.

### 3.4 Submit-for-you (the Autopilot equivalent)
- **Baseline:** 20 a week, a beta subset, no review step, fails rather than guess, charges only on success, failures
  listed, the person refills by hand.
- **Parity:** an approved batch on Greenhouse, Lever and Ashby at 15 a day, failing closed on any unknown or consent
  question (REQUIREMENTS 5e, 7e). 20 real applications per ATS with recorded outcomes.
- **Better:**
  - A per-item review card that shows the answers, destination and resume before approval. Simplify has no review
    step. Today Trainee's card shows company, role and fit only (6a PARTIAL).
  - Unknown-question resolution inside the same application: handoff message within 60 s, resume within 60 s of the
    person's answer, and at least 80% of handed-off applications completed. Simplify makes the person redo the whole
    form.
  - Capacity: 105 a week at the 15-a-day cap, against 20 a week, but only with fit above the relevance floor
    (standard 3.11).
- **Cost note:** Simplify caps at 20 a week. ASSUMED: each Autopilot run costs them real money (section 6). Trainee's
  in-browser path is about $0.004 (ASSUMED, cost-model-applying.md). A server browser costs about $0.025-0.05.

### 3.5 Tracking
- **Baseline:** tracker auto-add for jobs in their database; Gmail-only beta email matching; status updates
  recommended, not applied.
- **Parity:** one record per role with states (9a PARTIAL today). Inbox routing at least 98% correct on a labelled set
  of 200 recruiter emails (standard 3.4). Tracking works without an inbox.
- **Better:** routing for 100% of users whatever their mail provider, through a forwarding address. Simplify supports
  Gmail only. 0 duplicate tracker records per role, measured on the tracker log (duplicates REPORTED for Simplify).
- **Cost note:** parsing tokens per email. Low.

### 3.6 Receipts
- **Baseline:** a tracker entry; no receipt of what was sent was found.
- **Parity:** a receipt for every application with fields, answers, document hash, timestamps and a proof artifact
  (9b PARTIAL; 7h BUILT on tests).
- **Better:** 100% of applications marked SUBMITTED carry stored employer proof. Everything else reads UNCONFIRMED or
  FAILED with a reason. The verified-submit rate is published internally every week. Simplify publishes no rate.
- **Cost note:** storing a confirmation capture per application; set a retention policy.

### 3.7 Handoff
- **Baseline:** fail, then do it yourself. Mid-flow questions are planned.
- **Target:** the standard 3.6 numbers: message within 60 s, resume within 60 s, 0 duplicate submissions caused by a
  resume, and ask-once memory. Today 8a is NONE and 8b PARTIAL (a ticket exists; no drive resumes).

### 3.8 Networking
- **Baseline:** LinkedIn first- to third-degree mapping, Google Contacts, a spreadsheet import and AI Email
  (Simplify+).
- **Parity:** for each target application, paths from contacts the person supplies (a LinkedIn data export they
  download themselves, Google Contacts with consent). Today 11a ranks only supplied lists, and chat fills none.
- **Better:** 100% of drafts cite at least 1 sourced fact about the contact and at least 1 confirmed fact about the
  person. 100% of addresses are labelled verified or guessed (11c BUILT). 0 auto-sends.
- **Cost note:** tokens per draft. Cheap.

### 3.9 Interview prep
- **Baseline:** none found.
- **Target (beyond):** a prep plan within 10 minutes of an interview email, built from the submitted resume version
  and the posting (12a PARTIAL). Weak areas are stored and retested (12e PARTIAL).

### 3.10 Memory and answer isolation
- **Baseline:** a profile plus AI answers; cross-application carry-over REPORTED.
- **Parity:** ask once, reuse by meaning (WO-020).
- **Better:** 0 cross-application leaks in a 200-application isolation test: an answer written for employer A never
  appears in employer B's form unless the question means the same thing and the person approved reuse.

### 3.11 Surfaces
- **Baseline:** Chrome, Firefox, web, iOS.
- **Parity:** a web view and an extension beside iMessage (tsenta.md parity list). Never sell iMessage as the edge.

### 3.12 Pricing
- **Baseline:** Copilot free and unlimited; Simplify+ $39.99 a month with 20 auto-applies a week.
- **Target:** no price is set until 30 days of measured cost (standard gate 9). Directional: a monthly price below
  $39.99 that includes more submit-for-you applications than 86 a month, and only if the measured cost supports it.

### 3.13 Honesty
- **Baseline:** "fails rather than guess" (VERIFIED-S policy) is the bar, and Trainee must at least match it on every
  path, including the fill-only path where Simplify REPORTEDLY blanks silently.
- **Better:** publish the verified-submit rate and the silent-failure count. Simplify publishes neither.

## 4. What Simplify does NOT have

Absence on a page or in a help center is a strong indication, not proof. Re-check quarterly.
- No receipt of fields, answers and documents, and no stored employer confirmation (none documented).
- No review step on Autopilot, by design (VERIFIED-S).
- No mid-application questions (planned, VERIFIED-S). No resume from the failed step (ASSUMED).
- No interview prep or mock interviews (none found).
- No outcome funnel or throttle; nothing tells the person to apply less (none found).
- No inbox support beyond Gmail. No handling of employer verification codes (none documented).
- No diff and no truth guarantee on AI tailoring (none found).
- No published fill accuracy, success rate or interview rate.
- No messaging channel (iMessage, WhatsApp, SMS). No Android app found (not checked deeply).
- A documented answer for Workday account creation and sign-in was not found.

## 5. Scoreboard

"Trainee today" is taken from `REQUIREMENTS.md` (audited 2026-10-19). I did not re-run those tests. BUILT means a
test exercises it on trunk. Nothing has run live.

| Capability | Simplify (labelled) | Trainee target (measurable) | Trainee today |
|---|---|---|---|
| Job discovery | Job Matches + GitHub lists; no freshness number (VERIFIED-S / REPORTED) | Holds 95% of overlapping list roles; earlier first_seen on 60% | 2,179 boards BUILT (2a) only behind CAREER_BRAIN=agent; default chat gets `postings: []`. Live: NOT_RUN |
| Fill in the person's browser | 100+ portals claimed (VERIFIED-S); 40-90% accuracy by ATS (REPORTED) | At least 90% Greenhouse, 85% Lever readback-verified on 20 real each; 0 silent blanks | No extension. Fixture fill BUILT (7c, 7d). Real forms: NOT_RUN |
| Submit for you | Autopilot beta, 20 a week, no review step (VERIFIED-S) | 15 a day approved batch; review card with answers; 20 real per ATS | 0 submitted ever. Owner's 3 per ATS: NOT_RUN. Two apply stacks (D-014): NOT_RUN |
| Unknown questions | Fails rather than guess (VERIFIED-S); Copilot blanks silently (REPORTED) | Fail closed + ask once; at least 80% completed after handoff | 5e PARTIAL: replica forms only; real forms need a worker that is NOT_WIRED |
| Handoff and resume | Fail, then refill with Copilot (VERIFIED-S) | Message within 60 s, resume within 60 s, 0 duplicates | 8a NONE; 8b PARTIAL (ticket, no resume) |
| Duplicate prevention | Tracker duplicates (REPORTED) | 0 duplicate submissions; 0 duplicate tracker rows | 7f BUILT (tests); live NOT_RUN |
| Receipts | Tracker entry only (absent) | 100% of SUBMITTED with employer proof | 7h BUILT (tests); 9b PARTIAL; proof by email NOT_RUN (no inbox reader) |
| Tracking | Tracker + Gmail beta (VERIFIED-S) | 98% routing on 200 emails; any provider | 9a PARTIAL; 9c MODULE |
| Tailoring | Simplify+ AI, no diff (VERIFIED-S / absent) | 0 invented facts in 100; provenance 100% | 4b, 4c, 4e PARTIAL; truth audit gate in tests |
| Answer isolation | Carry-over across applications (REPORTED) | 0 leaks in 200-application test | 5d PARTIAL (regex or exact label); NOT_RUN |
| Networking | LinkedIn degree mapping + AI Email (VERIFIED-S) | Sourced drafts 100%; 0 auto-send | 11a PARTIAL; 11c, 11e BUILT; sending disabled |
| Interview prep | None found | Prep within 10 min of an interview email | 12a, 12e PARTIAL |
| Surfaces | Chrome, Firefox, web, iOS (VERIFIED-S) | Web + extension + iMessage | iMessage only, go-live pending |
| Price | Free autofill; $39.99 a month (VERIFIED-S) | Set after 30 days of measured cost | No pricing; cost model ASSUMED |

## 6. Pricing and unit economics

**Their price (VERIFIED-S):** Copilot $0. Simplify+ $19.99 a week, $39.99 a month, or $89.99 for 3 months.
Autopilot is 20 a week inside Simplify+. If a person used every credit for a month (about 86), the subscription works
out to about **$0.46 per Autopilot application** at the monthly price, or about **$0.35** on the 3-month plan. The
subscription also buys AI writing and networking, so this is an upper bound on what an Autopilot application costs
the buyer, not Simplify's cost (ASSUMED arithmetic).

**Architecture inference:**
- **Copilot: the extension in the person's browser** (architecture B). It is an installed extension, the person
  presses Submit, and it works on 100+ portals without per-site accounts. VERIFIED-S that it is an extension. ASSUMED
  that the fill runs client-side, with the server serving the profile and AI answers. Their cost per fill is then
  close to $0 of compute, plus model tokens only when "Autofill all fields with AI" is on.
- **Autopilot: probably a server browser** (architecture C), ASSUMED. Three reasons. (1) It is credit-capped at 20 a
  week with no top-ups. A client-side fill costs nothing to repeat, so a hard weekly cap points to a real
  per-application cost. (2) Failures appear in a web tab (`simplify.jobs/autopilot`), not in the extension. (3) Being
  beta for "a subset" fits capacity-limited infrastructure. Counter-hypothesis: it drives a tab in the person's own
  browser through the extension. Test 8.6 below tells them apart (does it run with Chrome closed?).
- **Implication:** Simplify's cheap path is the user-paced, user-submitted fill, given away free as the acquisition
  engine. Its expensive path is rationed. Trainee's cost-model bet (the in-browser path, about $0.004 per application,
  ASSUMED) is exactly what Simplify already gives away for free. Trainee's cost edge against Simplify therefore cannot
  be "cheaper fill". It has to be **more completed applications per minute of the person's time**: submit after
  approval, plus handoff, against Simplify's press-Submit-yourself and refill-after-failure. That is a measurable
  claim (target 3.4), not a price claim.

## 7. Failure modes and complaints

Each item gives its source and label. Primary Reddit threads could not be opened. Several items are review-blog
summaries of Reddit, and some of those blogs are run by competitors.

1. **Silent blanks:** "autocomplete worked most of the time, but leaves blanks pretty regularly (without
   notification)". REPORTED. trustpilot.com/review/simplify.jobs
2. **Answers carried over from another application:** custom fields "were either skipped entirely or populated with
   carry-over text from a different application". REPORTED. remotejobassistant.com/blog/simplify-jobs-review. In
   effect, a wrong answer sent to an employer under the person's name.
3. **Forms not filled at all:** on some forms "it did not populate any fields", and on others it filled some sections
   and left the rest empty. REPORTED. hirepilot.co/simplify-extension-review-does-it-actually-work/
4. **Weak on enterprise ATSes:** about 70% Workday, 50% iCIMS and 40% Taleo in one test (REPORTED, unattributed). One
   Blind user called it "the worst extension" on Workday (REPORTED, teamblind.com). Workday resume uploads and
   dropdowns are done by hand (REPORTED).
5. **Tracker duplicates and missed applications:** "a known sync limitation". REPORTED (search summary of review
   blogs).
6. **Refund refusals:** a same-day cancellation was refused a $39.99 refund because the service "had been activated
   and briefly used". Another reviewer was refused, then refunded, then told the ticket belonged to someone else, and
   says the site never stated a no-refund policy. REPORTED. trustpilot.com/review/simplify.jobs (ca, au, uk pages)
7. **Performance on Firefox:** severe lag, a frozen computer, a login loop. REPORTED.
   addons.mozilla.org/en-US/firefox/addon/simplify-jobs/reviews/
8. **Non-standard labels mis-filled:** blamed on "non-standard field labels that Simplify doesn't recognise".
   REPORTED. loopcv.pro/guides/simplify-jobs-not-working (a competitor)
9. **AI writing quality:** "needs substantial editing"; "a mediocre AI writing bundle". REPORTED (multiple review
   blogs, no measurement).
10. Not found: account bans, captcha failures, duplicate *submissions*, or invented facts in Simplify answers. Absence
    of evidence, not evidence.

## 8. Ground-truth test plan (plan only: nothing was run, signed up for or submitted)

Precondition: the owner reads Simplify's Terms and Privacy Policy first and runs this as a normal user with his own
real resume, on his own machine, under the owner gate (standard 3.3). No scraping and no automation of their product.

1. **Install and profile (free).** Time to a complete profile. Which fields it demands. Whether it stores
   work-authorization and demographic answers, and where (read the privacy policy on retention).
2. **Fill accuracy, 20 forms, no submit.** Open 5 live postings each on Greenhouse, Lever, Ashby and Workday. Press
   Autofill and **do not submit**. Per form, record: required fields filled correctly, wrong, blank (and whether a
   blank was flagged), the resume attached (yes/no, the right file), time to fill, and whether multi-page continued.
   This gives our own number for the REPORTED 40-90% figures.
3. **Carry-over test.** Fill employer A's form with a custom essay question, then open employer B with a different
   custom question. Does A's text appear in B? (Failure 2.)
4. **Unknown and consent questions.** A form with sponsorship, a relocation date and an odd free-text question: does
   Copilot guess, blank, or flag?
5. **Workday account.** Does Copilot touch the Create Account or Sign In page? Does it fill the password field? (A
   security observation only. Enter nothing real.)
6. **Autopilot (only if the owner chooses to buy one month of Simplify+, and only on roles he genuinely wants).**
   Which postings show the Autopilot option (record the ATS of each), whether it runs with Chrome closed (tells
   architecture B from C), what a success record contains (fields? a confirmation capture?), whether the employer's
   confirmation email arrives, how failures read, and whether the credit is kept. Up to 5 applications. The owner
   submits nothing he would not submit by hand.
7. **Tracker and email.** Does the tracker add the application automatically or prompt? Any duplicates? If Gmail beta
   access is granted: match precision on the owner's real recruiter emails.
8. **Networking.** What "connect LinkedIn" actually asks for (OAuth scopes, a password, a data export). Record it; do
   not grant anything that asks for a LinkedIn password.
9. **Cancel and refund.** Cancel the same day. Record the refund answer verbatim.
10. Write results into `docs/competitors/mass-applying.md` with VERIFIED labels, and update section 5.

## 9. What Trainee must add or change because of Simplify (ranked by launch risk)

### Kills launch
1. **The submission engine must fail closed, visibly, on every unknown, on every path.** Simplify's Autopilot sets
   the bar publicly: "fails rather than guess", credit kept (VERIFIED-S). Its free fill REPORTEDLY blanks silently,
   and that is the complaint people write. Trainee: 5e is PARTIAL (replica forms only; the real-form worker is
   NOT_WIRED), and 8d `resolveUnknownOutcomes` has no caller. One application sent with a guessed sponsorship answer
   is the "Trainee ruined my job search" story. Label: VERIFIED-S (their policy); the Trainee state comes from
   REQUIREMENTS.md.
2. **Readback before submit on real forms, including uploads.** Answers carried over from another employer's form are
   REPORTED for Simplify. Trainee's readback (7d) and resume-hash checks are BUILT on fixtures, and the post-fill
   resume check exists only on a branch (`apply.ts`). Required: readback of every field and of the uploaded file's
   name and hash against the reviewed version, on real Greenhouse, Lever and Ashby forms, before any submit. Label:
   REPORTED (theirs); NOT_RUN (ours on real forms).
3. **One real application, proven.** Simplify has hundreds of thousands of users filling forms today (VERIFIED-S
   claim). Trainee has 0 submissions (REQUIREMENTS). Nothing else in this list matters until the owner's 3 per ATS are
   confirmed by employer email. Label: NOT_RUN.

### Embarrasses at 100 users
4. **Handoff that resumes instead of restarting.** Simplify's answer to a failure is "finish it yourself with
   Copilot", a full refill (VERIFIED-S). Trainee has a single-use handoff ticket but no drive resumes from the saved
   point (8b), and server sessions expire after 10 minutes idle (8a NONE). For the **captcha or bot check**: hand the
   live page to the person and resume. Never solve or evade it. For **verification codes**: ask the person in chat
   for the code and type it into the waiting page, with no inbox required. For **account sign-in**: the person signs
   in themselves in the visible browser (D-013). Label: VERIFIED-S (theirs); NONE/PARTIAL (ours).
5. **A review card that shows the answers.** Simplify's Autopilot has no review step (VERIFIED-S), which is its trust
   weakness. Trainee's batch card shows company, role and fit only while `speakSummary` claims "the exact answers"
   (6a PARTIAL). That claim is false today and must be fixed or removed. Label: from REQUIREMENTS.md.
6. **Failure reporting per application, with a reason, the same day.** Simplify lists failures in an Autopilot tab
   (VERIFIED-S). Trainee: per-item stops exist (7e BUILT), but over-cap items "never resume" although the summary says
   they will (7g). The summary must say only what happens. Label: from REQUIREMENTS.md.
7. **Duplicate prevention across surfaces.** If the person also uses Simplify or applies by hand, Trainee must not
   apply again. 7f (BUILT) covers Trainee's own submissions only. Add: before submit, check the tracker for the same
   employer and role from any source (manual entry, forwarded confirmation), and ask if one exists. Ashby can block
   repeat applicants (VERIFIED-S, docs.ashbyhq.com/application-limits). Label: ASSUMED gap.
8. **A fill path in the person's own browser.** Simplify's free extension is the comparison every student makes.
   Without an extension or web path, Trainee's in-browser cost advantage (cost-model-applying.md) does not exist.
   Label: ASSUMED (strategy), standard 6.2.

### Matters at 10,000 users
9. **Workday.** Simplify claims Workday autofill (VERIFIED-S) at uneven quality (REPORTED). Trainee: pending D-013.
   Multi-page flows, per-tenant accounts, uploads and dropdowns all need proof at 20 real applications before any
   claim (standard gate 8). Label: VERIFIED-S / NOT_RUN.
10. **Multi-page forms at scale.** Simplify continues across pages automatically (VERIFIED-S setting). Trainee's
    multi-round logic (149) is BUILT on fixtures only.
11. **Shared per-company form knowledge.** Simplify's 100+ portals and "request support" queue amount to a
    crowd-sourced form map (ASSUMED). Trainee needs the form-knowledge store from day one (standard section 7).
12. **Inbox beyond Gmail.** Simplify is Gmail-only (VERIFIED-S). A forwarding address gives every user routing
    without OAuth.
