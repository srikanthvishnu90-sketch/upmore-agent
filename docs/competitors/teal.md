# Teal (tealhq.com: resume builder, job tracker, Chrome extension, Teal+): teardown and Trainee targets

Follows `docs/product/BUILD-STANDARD-TSENTA.md` section by section. When this document and the standard disagree,
the stricter requirement wins. Teal does not submit applications for anyone, so its bar for Trainee is the **work
around the application**: the resume, the tracker, the match explanation, the contacts and prep. It also sets the
**do-it-yourself baseline** that Trainee's submission engine has to beat on time and accuracy.

## 0. Labels and method

**Labels (the standard's, section 0):**
- **VERIFIED**: read on a live page, or measured in our own runs. Nothing here reaches that bar.
- **VERIFIED-S**: Teal's own page (tealhq.com, its blog, its press release, its LinkedIn post) states it, read
  through a WebSearch extract of the cited URL on 2026-10-19. It is a VERIFIED *claim*, never VERIFIED *performance*.
  Re-open the page live before reuse.
- **REPORTED**: a third party says it. Many Teal reviews are published by competitors (Rezi, Jobscan, Scoutify,
  Careerflow, Jobright, JobCopilot, Resumly), and I name them.
- **ASSUMED**: my inference.
- **NOT_RUN**: a Trainee measurement not yet made.

**Method, accessed 2026-10-19:**
- WebFetch on `www.tealhq.com/pricing`: `getaddrinfo ENOTFOUND`. curl through the proxy: `CONNECT tunnel failed,
  response 403`. No page was opened live.
- Every finding comes from WebSearch extracts, which a search model writes and may paraphrase.
- The shared search budget ran out before I could check: Teal's revenue and headcount, its help center on autofill
  and the AI Interview Coach, the Chrome Web Store listing itself, the iOS/Android listings (a search found none),
  its Terms on refunds, and Reddit threads directly.
- Nothing was signed up for, submitted or scraped.

## 1. What the product is

| Item | Finding | Label | Source |
|---|---|---|---|
| Company | Teal (also "Teal Labs" in a vendor listing). Founder and CEO David Fano. "The five-year-old startup" in Jan 2025, so founded about 2019-2020. Coverage by Refresh Miami. | VERIFIED-S (press release); REPORTED (age, location) | prnewswire.com/news-releases/teal-announces-series-a-funding-...-302357544.html; refreshmiami.com/news/teal-raises-7-5m-to-expand-ai-powered-career-platform/ |
| Funding | $7.5M Series A on 2025-01-22, co-led by CityLight Capital and Flybridge with Rethink Capital Partners and Lerer Hippeau. **$19M in total.** Trackers say $20.7M (Tracxn) and $23.8M (Caplight). | VERIFIED-S ($19M, their release); REPORTED (trackers) | prnewswire.com (as above); tracxn.com; caplight.com/company/tealhq |
| Team | CTO Sumit Gupta appointed with the round. Headcount not checked. | VERIFIED-S | prnewswire.com |
| Users | "over two million members across its free and paid offerings"; "7+ million jobs saved"; "nearly 400,000 interviews" landed (Jan 2025). Later "roughly 4 million members" and "100,000+ paying Teal+ subscribers" (uncorroborated). | VERIFIED-S (Jan 2025 claims); REPORTED (later) | prnewswire.com; tooldirectory.ai/tools/teal; justainews.com |
| Chrome extension | 4.9 from about 3.2K ratings (one review); 4.3 in another table; a "Favorites of 2023" Chrome badge; "15 months without an update" flagged by one review. | REPORTED (listing not seen) | wobo.ai/blog/teal-review/; jobpilotapp.com/blog/best-chrome-extensions-job-seekers; resumeoptimizerpro.com/blog/teal-chrome-extension-alternative |
| Trustpilot | 4.0 "Great" from 108 reviews (July 2026, one guide); older 4.2/94 and 4.3/93. 11 one-star of 93 in one count. Teal "replies to 100% of negative reviews in an average of 1.4 days". | REPORTED | trustpilot.com/review/tealhq.com (regional pages); resumly.ai/answers/teal-review |
| Mobile | No iOS or Android app found by search. Autofill is "desktop-only". | REPORTED absent | jobcopilot.com/teal-review/ |
| Surfaces | Web app and Chrome extension | VERIFIED-S | tealhq.com/tools/... pages |
| How it makes money | Teal+ subscriptions (section 6) | VERIFIED-S | tealhq.com/post/teal-vs-resume-worded |

**What it is (ASSUMED synthesis).** Teal is a job-search organizer. Its centre is a tracker (save any posting with
one click from LinkedIn, Indeed or a career site) and a resume builder that scores a resume against a posting by
keywords. Teal+ adds AI writing, full keyword analysis, cover letters, an AI Interview Coach, and offer and
negotiation tools. It has a paywalled autofill beta, but it does not submit applications. Reviewers' phrase is
"Strong Organizer, Zero Auto-Apply" (resumly.ai). Its incentive is engagement with the organizer, not application
volume.

## 2. Capability inventory

### 2.1 Discovery
- Job search "pulls listings from external job boards" with search by company, title or location; an "AI Job Search"
  that suggests roles. REPORTED. jobright.ai/blog/teal-review-2026-... (Jobright is a competitor); rezi.ai/posts/teal-review
- The main discovery path is the person's own browsing: the extension adds a Teal icon on LinkedIn, Indeed or "any
  career site" and saves the job "with the title, company, and description filled in automatically". REPORTED.
  owlapply.com; rezi.ai
- Freshness, alerts and a job count: not found. Absent.

### 2.2 Prep (resume builder, tailoring, letters)
- Free: "unlimited resumes", a basic builder, a limited number of AI credits, "top-five keyword insights per job".
  REPORTED. owlapply.com/en/blog/teal-resume-builder-review
- Teal+: more templates, extra AI rewrites, the full match-score breakdown, a cover letter generator. REPORTED.
  lastroundai.com/compare/teal
- **Match score:** a keyword-overlap percentage against one posting. "80% or higher is generally considered strong."
  Called "Teal's own measure ... not an applicant tracking system's score" by one reviewer. REPORTED.
  hirecarta.com/blog/teal-review; atsresumechecker.ai/blog/teal-review
- **Score inconsistency:** the same job and resume showed **29%** in the Job Search list view and **17%** in the Resume
  Builder's Job Matcher. REPORTED (one reviewer, in a search summary; a second search could not reproduce the source's
  details). scoutify.com/blog/teal-review (a competitor; headline "The Match Score Lies")
- **Invented content:** "Teal's AI bullet writer has the tendency to hallucinate results for you, JUST to match the
  job description more closely" (Careerflow, a competitor). AI bullets were "generic and often just reworded
  job-description keywords"; "The AI-generated content isn't always accurate" (ResumeGenius). REPORTED.
  careerflow.ai/blog/teal-vs-jobscan-vs-careerflow; resumegenius.com/reviews/teal-resume-builder-reviews
- Export: "you can only export your resume as a PDF". Teal's page says its PDF "Preserves your formatting exactly
  and is universally accepted by ATS systems". REPORTED (PDF only); VERIFIED-S (Teal's claim, which no one has tested).
  resumegenius.com; tealhq.com/tools/resume-builder
- Diff of AI changes or a truth guarantee: not found. Absent.

### 2.3 Apply and submission mechanics
- Teal announced "Teal Autofill: Apply for a Job in Under 60 Seconds" as a beta in the Chrome extension, "on select job
  applications". The LinkedIn post is about 1,287 days old (about April 2023). VERIFIED-S (Teal's post).
  linkedin.com/posts/tealhq_teal-autofill-apply-for-a-job-in-under-60-activity-7051564968353169409-jGdx
- Teal's page describes the extension as a way to "populate and submit applications", with AI that drafts answers to
  open-ended questions "from job descriptions and career history"; "users can review and change them before
  submitting". VERIFIED-S (claim). tealhq.com/post/tips-for-online-job-applications; tealhq.com/tools/autofill-job-applications
- Reality per reviewers: autofill is paywalled ($13 a week, no free trial), desktop-only, "more limited compared to
  JobWizard or Simplify", and "does not autofill Workday forms". "Every 'applied' status still requires you to leave
  Teal, go to the company site or job board, and click submit yourself." REPORTED. jobcopilot.com/teal-review/
  (competitor); jobwizard.ai (competitor); resumeoptimizerpro.com; rezi.ai (competitor)
- Account sign-in, verification codes, captcha, multi-page and uploads: not documented. Absent. The person does all of
  it themselves.

### 2.4 Tracking
- The most-praised feature: stages Saved, Applied, Interview, Offer, Rejected; notes and contacts on one board; free and
  unlimited. REPORTED (consistent across reviews). lastroundai.com; rezi.ai; owlapply.com
- Status changes are manual. No inbox connection found. Absent. ASSUMED: the person moves every card by hand.

### 2.5 Receipts and proof
- None. The tracker records what the person says they did. Absent (by design: Teal does not submit).

### 2.6 Human handoff
- Not applicable. The human does every step. This is the baseline Trainee's automation must beat on time without
  losing accuracy.

### 2.7 Networking
- Contacts tracker: "save LinkedIn contacts, set goals, organize contacts by company, and schedule follow-ups"; the
  extension can capture contacts while browsing. REPORTED. unite.ai/tealhq-review
- "40+ pre-written templates for follow-ups and interviews". REPORTED. unite.ai
- LinkedIn Profile Reviewer and LinkedIn Headline Generator. REPORTED. tooldirectory.ai; mybesh.com
- Finding contacts or email addresses: not found. Absent. Contacts are the ones the person saves.

### 2.8 Interview prep
- **AI Interview Coach**, launched with the Jan 2025 round: "simulates a two-way conversation with an AI agent" with
  "role-specific question prompts and real-time feedback". Questions come from the job description and the resume;
  answers are by voice. VERIFIED-S (press release); REPORTED (the voice detail, via a summary). prnewswire.com
- Reviewers disagree on depth: one says Teal offers interview practice; another lists Career Hub articles. REPORTED.

### 2.9 Offers
- "AI-based Offer Evaluation and Negotiation Support Tools" launched Jan 2025. VERIFIED-S. prnewswire.com

### 2.10 Memory
- A profile and a "career history" that drives resumes and drafted answers (VERIFIED-S, autofill page). Stored work
  styles or answers reused by meaning: not found.

### 2.11 Guidance
- Career Hub articles (negotiation, resume formatting, search strategy). REPORTED. Funnel analytics: "nearly 400,000
  interviews" is a company-wide count (VERIFIED-S claim); a per-user funnel was not found.

### 2.12 Volume caps
- None relevant: Teal does not apply. AI credits are limited on the free plan (REPORTED; numbers not found).

### 2.13 Pricing
- Free: unlimited resumes, unlimited job tracking, the extension, limited AI credits. REPORTED (consistent).
- **Teal+: $13 every 7 days, $29 every 30 days, $79 every 90 days; an annual $179 "appears at checkout".** VERIFIED-S
  (Teal's own blog). tealhq.com/post/teal-vs-resume-worded
- The weekly price rose from $9 (April 2025) to $13 (by October 2025). REPORTED. wobo.ai/blog/teal-review/
- No free trial; payment starts at once; cancel in account settings, effective at period end. REPORTED. resumly.ai

### 2.14 Honesty posture
- The "match score" is presented as resume-to-job alignment, and Teal's resume page claims its PDF is "universally
  accepted by ATS systems" (VERIFIED-S claim). Evidence on what ATSes do (Greenhouse Talent Matching is a paid add-on
  that never advances or rejects anyone on its own; Ashby's AI "never ranks or gives numerical ratings"; 92% of 25
  recruiters say their ATS does not auto-reject on keywords; VERIFIED-S in `tsenta.md`) means a keyword score is a
  writing aid, not a measure employers use.
- Teal does not claim to apply for you, so it makes no submission claims it could fail. This is an honest posture by
  construction.

## 3. Acceptance targets for Trainee against Teal

### 3.1 The resume itself (builder and export)
- **Baseline:** unlimited free resumes; PDF-only export (REPORTED); a claim of ATS-safe formatting (VERIFIED-S claim).
- **Parity:** the person can see, edit and download their master resume and every tailored version, as PDF and DOCX,
  in chat. Today 4d is PARTIAL: files are not returned in chat, the original formatting is replaced, and the phone
  number is never rendered (148:47).
- **Better:**
  - 100% of rendered resumes pass a parse check (sections, dates, links, contact fields extracted) on a generic
    parser and the launch ATSes (standard 3.2 BETTER).
  - 100% of source hyperlinks survive.
  - DOCX and PDF both (Teal: PDF only, REPORTED).
- **Cost note:** rendering is local compute. Near zero.

### 3.2 Tailoring and AI writing
- **Baseline:** AI bullets on Teal+; "hallucinate results ... to match the job description" (REPORTED by a
  competitor); generic keyword rewording (REPORTED).
- **Parity:** per-role tailoring with a diff the person approves (4e: module only today).
- **Better:** 0 invented results or metrics in 100 sampled tailored resumes per release. 100% line provenance. Every
  JD keyword added only where a confirmed fact supports it (4c today: JD skills only when evidenced; bullets not
  rephrased).

### 3.3 Match explanation (the anti-"match score")
- **Baseline:** a keyword-overlap percentage; the same pair scored 29% and 17% in two views (REPORTED).
- **Parity:** every role shows "fits because" and "gaps" in words (3a BUILT on the agent path).
- **Better:**
  - The same resume and posting produce the same explanation and score on every surface: 0 discrepancies across 50
    re-scorings.
  - The score is never presented as an ATS score or a hiring chance on any path (3e PARTIAL today: the agent prompt
    says "Tell them their real odds"; fix before launch).
- **Cost note:** one posting read per posting (about $0.002, shared across users, ASSUMED cost model).

### 3.4 Tracker
- **Baseline:** free, unlimited; stages Saved, Applied, Interview, Offer, Rejected; notes and contacts; manual moves;
  one-click save from any site.
- **Parity:**
  - One record per role holding the whole state (preparing, needs input, approved, submitted, interview, rejected,
    offer). Today 9a is PARTIAL: preparing, needs-input and approved live in separate records.
  - The person can add a job they found elsewhere by pasting its link in chat. Title, company and description are
    filled correctly for at least 95% of 100 sampled links across Greenhouse, Lever, Ashby, Workday and generic career
    pages. NOT_RUN; ASSUMED gap: no tested route exists in REQUIREMENTS.md.
- **Better:** status moves without manual work: from Trainee's own receipts (submitted) and from forwarded or connected
  email (interview, rejection), with at least 98% correct routing on 200 labelled emails (standard 3.4). Teal is
  manual (absent).

### 3.5 Contacts and follow-ups
- **Baseline:** a contacts tracker with follow-up scheduling and 40+ templates (REPORTED).
- **Parity:** contacts stored per company and role, with follow-ups at an interval (11e BUILT; replies only when
  pasted).
- **Better:** drafts written from the contact's sourced facts and the person's confirmed facts (11d PARTIAL today:
  the router passes `personalization_facts []`). 0 double-contacts. 0 auto-sends.

### 3.6 Interview prep
- **Baseline:** the AI Interview Coach: voice, two-way, questions from the JD and the resume (VERIFIED-S).
- **Parity:** text mock interviews built from the posting and the person's stories (12a, 12b PARTIAL).
- **Better:**
  - Prep is tied to the exact resume version submitted to that employer (12a today: not tied).
  - Weak areas are stored and retested, with an improvement measured per skill across sessions (12e today: mock state
    deleted on completion).
  - 0 hallucinated company facts in a 20-session review sample.
  - Voice is a later parity item. Do not claim it.

### 3.7 Offers
- **Baseline:** offer evaluation and negotiation tools (VERIFIED-S).
- **Parity:** offer comparison wired into chat (13a MODULE: the router never calls compareOffers).
- **Better:** comparison across comp, responsibilities, location and the person's stated priorities, with every
  missing detail named (13b PARTIAL). Negotiation drafts exist (13c BUILT). The person sends (13d BUILT).

### 3.8 Applying, against the do-it-yourself baseline
- **Baseline:** a Teal user applies by hand, with optional paywalled autofill on select forms (REPORTED). Teal's own
  headline promises "Apply for a Job in Under 60 Seconds" (VERIFIED-S claim).
- **Parity:** an application prepared by Trainee needs the person's time only for the approval and any handoff.
- **Better:** the person's median active time per submitted application is **under 60 seconds**, counting approval and
  handoffs, measured from message timestamps on the first 100 real applications. This matches Teal's own claim with
  the submission included. NOT_RUN.
- **Cost note:** about $0.004 per application on the in-browser path (ASSUMED). A Teal user pays $29 a month and does
  the work.

### 3.9 Pricing
- **Baseline:** a free organizer; Teal+ $29 per 30 days (VERIFIED-S).
- **Target:** whatever Trainee charges must buy more than an organizer, namely applications that are submitted with
  proof. The free tier must at least include what Teal gives free (unlimited tracking and resumes), or Trainee loses
  every student on the first comparison (ASSUMED).

## 4. What Teal does NOT have

Absence is a strong indication, not proof.
- No submission for the person; autofill is a limited, paywalled beta that does not cover Workday (REPORTED).
- No receipts, confirmations or verified outcomes (by design).
- No inbox connection; status moves are manual (none found).
- No job alerts or freshness data (none found).
- No finding of contacts or addresses (none found).
- No mobile app (none found) and no messaging channel.
- No truth guarantee on AI writing; hallucinated results REPORTED by a competitor.
- No DOCX export (REPORTED).
- No per-user funnel or throttle (none found).

## 5. Scoreboard

"Trainee today" is taken from `REQUIREMENTS.md` (2026-10-19). I did not re-run those tests. Nothing has run live.

| Capability | Teal (labelled) | Trainee target (measurable) | Trainee today |
|---|---|---|---|
| Resume builder and export | Unlimited free, PDF only (REPORTED) | PDF + DOCX in chat; 100% parse pass; 100% links kept | 4d PARTIAL: files not returned in chat; phone never rendered |
| Tailoring truth | Hallucinated results (REPORTED, competitor) | 0 invented in 100 a release | 4b truth gate (tests); 4c, 4e PARTIAL |
| Match explanation | Keyword %, 29% vs 17% (REPORTED) | Same score everywhere; never odds | 3a BUILT; 3e PARTIAL |
| Tracker | Free, 5 stages, manual (REPORTED) | One record per role; auto moves; 98% email routing | 9a PARTIAL; 9c MODULE; 9d BUILT |
| Save a job from anywhere | One-click extension (REPORTED) | Pasted link saved correctly for 95% of 100 | ASSUMED gap; NOT_RUN |
| Contacts and follow-ups | Contacts tracker, templates (REPORTED) | Sourced drafts; 0 double-contact; 0 auto-send | 11e BUILT; 11d PARTIAL |
| Interview prep | AI Interview Coach, voice (VERIFIED-S) | Tied to submitted resume; weak areas retested | 12a, 12e PARTIAL; 12d BUILT |
| Offers | Evaluation + negotiation (VERIFIED-S) | Comparison wired; missing details named | 13a MODULE; 13b PARTIAL; 13c, 13d BUILT |
| Applying | By hand; paywalled autofill beta (REPORTED) | Under 60 s of the person's time per submitted application | 0 submitted; NOT_RUN |
| Surfaces | Web + Chrome (VERIFIED-S) | Web + extension + iMessage | iMessage only, go-live pending |
| Price | Free organizer; $29 per 30 days (VERIFIED-S) | Free tier at least equal to Teal's free | No pricing; NOT_RUN |

## 6. Pricing and unit economics

**Their price (VERIFIED-S):** Teal+ $13 per 7 days, $29 per 30 days, $79 per 90 days; $179 a year at checkout. There
is no per-application price, because Teal does not apply.

**Architecture inference (ASSUMED):**
- **The extension in the person's browser** for clipping jobs and, on Teal+, autofill on "select" forms. Clipping
  costs Teal nothing per job. Autofill runs client-side on the person's session (ASSUMED from "desktop-only" and the
  extension delivery).
- **Server cost is model tokens** for AI writing, match analysis and the Interview Coach, plus storage. ASSUMED cost
  per active Teal+ user: low single dollars a month in tokens. That leaves wide gross margin at $29, consistent with
  limiting AI credits on the free tier to steer users to Teal+.
- **Implication for Trainee:** Teal proves people pay $29 a month for organization and AI writing alone, without a
  single submitted application. Trainee's resume, tracker, prep and offer work (most of it BUILT or PARTIAL per
  REQUIREMENTS) is the part that competes with Teal. The submission engine is what Teal lacks entirely, and it is
  also Trainee's least proven part (0 submissions). A Teal user switches only if Trainee's organizer is at parity
  **and** the engine saves them real time with no wrong submissions.

## 7. Failure modes and complaints

1. **Charged after cancelling:** "Very difficult to cancel ... Continuously charges your account even after you've
   attempted to cancel multiple times." Another: "Canceled subscription on March 5th, 2025. Ended up still charging me
   on a NON-RECURRING charge for March 10th, 2025", and deleted the account to stop it. REPORTED.
   trustpilot.com/review/tealhq.com (ca, au, global pages)
2. **Refunds only after escalation:** users email member support for refunds; Teal's replies offer to cancel and
   refund. REPORTED. trustpilot.com/review/tealhq.com
3. **AI quality:** "uses wonky AI to add keywords, and the cover letters are lacking"; AI cover letters with
   **misspelled names**. REPORTED. trustpilot.com/review/tealhq.com
4. **Invented results to match the JD:** "tendency to hallucinate results for you". REPORTED (Careerflow, a
   competitor). careerflow.ai
5. **Inconsistent match score:** 29% in one view and 17% in another for the same pair. REPORTED (Scoutify, a
   competitor). scoutify.com/blog/teal-review
6. **Export lock-in:** PDF only, "hard to edit later". REPORTED. resumegenius.com
7. **Autofill weakness:** limited coverage, no Workday, paywalled, desktop only. REPORTED (several competitor blogs).
8. **A stale extension:** "15 months without an update". REPORTED. resumeoptimizerpro.com (competitor)
9. An account-access problem appears in a Trustpilot review (REPORTED; details not in the extract).
10. Not found: data loss, bans, wrong submissions (Teal does not submit). Absence of evidence.

## 8. Ground-truth test plan (plan only: nothing was run, signed up for or submitted)

Precondition: the owner reads Teal's Terms and Privacy Policy and tests as a normal user on the free tier with his
own resume.

1. **Import and export.** Import the owner's real resume. Record: what was lost on import (links, formatting, dates),
   and whether export offers anything but PDF. Run the exported PDF through the same parse check Trainee uses (4d) and
   count extracted fields.
2. **Match score consistency.** For 10 real postings, record the score in every view where it appears. Count
   discrepancies (failure 5).
3. **AI bullet truth.** Use the free AI credits on 3 bullets for 1 posting. Count every metric, tool or result not in
   the source resume (failure 4).
4. **Tracker parity.** Save 20 postings from Greenhouse, Lever, Ashby, Workday and generic career pages with the
   extension. Record correct title, company and description per posting. Repeat the same 20 by pasting links into
   Trainee. Compare (target 3.4).
5. **Autofill (only if the owner buys one week of Teal+ at $13).** On 5 forms, press autofill and **do not submit**.
   Record fields right, wrong and blank, and whether drafted answers contain anything not in the resume.
6. **Interview Coach.** One session for one real posting. Count company facts not traceable to the posting.
7. **Cancel.** Cancel the same day and check the next two statements for any charge (failure 1).
8. Write results into `docs/competitors/mass-applying.md` with VERIFIED labels.

## 9. What Trainee must add or change because of Teal (ranked by launch risk)

### Kills launch
1. **The reviewed resume is the uploaded resume, byte for byte.** Teal users see exactly the PDF they will upload,
   because they upload it themselves. With Trainee, the person approves in chat and the engine uploads. If the uploaded
   file differs (a stale version, a re-render, a lost link), trust is gone. Today 4f binds `resume_sha256` on replica
   forms only, and the persisted queue with the resume-hash check lives only on `wo/009b-*` branches. Required in the
   submission engine: after upload, read back the file name and hash from the form and stop if they differ from the
   approved version. Label: PARTIAL (from REQUIREMENTS.md); NOT_RUN on real forms.
2. **The person must see every answer before it is sent.** Teal's own page promises that users "review and change"
   drafted answers before submitting (VERIFIED-S). Trainee's batch card shows company, role and fit only, while
   `speakSummary` claims "the exact answers" (6a PARTIAL). For anyone coming from a do-it-yourself tool, that is the
   first thing they check. Required: the approval card (or a one-tap expansion) lists every answer, the destination
   URL and the resume version. Label: from REQUIREMENTS.md.

### Embarrasses at 100 users
3. **Give the files back.** A Teal user downloads the resume anytime. Trainee cannot hand a tailored file back in
   chat, and cannot take a resume in by chat (REQUIREMENTS "What the tally hides" 3). Required: resume in by text, and
   the exact submitted version returned with every receipt. Label: from REQUIREMENTS.md.
4. **A tracker at least as complete as Teal's free one.** One record per role across all states (9a PARTIAL), with
   any externally found job addable by link (ASSUMED gap). The tracker must also be the duplicate guard: before any
   submission, the engine checks it for the same employer and role, including roles the person applied to by hand, and
   asks rather than applying twice. Label: PARTIAL / ASSUMED.
5. **Failure reporting that a do-it-yourself user would accept.** A Teal user knows when they failed to submit. A
   Trainee user only knows what Trainee tells them. Every application must end SUBMITTED (with proof), UNCONFIRMED or
   FAILED (with a reason), and over-cap items must not be promised a resume that never happens (7g: "never resume;
   speakSummary claims they do"). Label: from REQUIREMENTS.md.
6. **No keyword "ATS score".** Do not copy Teal's match percentage. Trainee's explanation must stay in words, and the
   agent prompt's "Tell them their real odds" must go (3e). Label: VERIFIED-S evidence on ATS behaviour (tsenta.md);
   PARTIAL (ours).

### Matters at 10,000 users
7. **Time per application, measured.** Teal's "under 60 seconds" headline is the do-it-yourself bar Trainee must beat
   with submission included. Log the person's active seconds per submitted application from day one (15d PARTIAL: only
   cost per turn is measured). Label: NOT_RUN.
8. **Captcha, verification codes, sign-in, uploads, multi-page and Workday.** Teal leaves all of these to the person,
   so a Teal user's expectation is "it just works because I do it". Every one that Trainee's engine cannot complete
   must become a same-session handoff, not a failure: 8a NONE, 8b PARTIAL, Workday pending D-013, uploads and
   multi-page BUILT on fixtures only. Label: from REQUIREMENTS.md.
9. **Interview prep and offers at Teal's level.** Teal ships an AI Interview Coach and offer tools (VERIFIED-S).
   Trainee's prep forgets weak areas (12e) and offer comparison is not wired (13a MODULE). These are Trainee's
   "beyond" features against Tsenta, but against Teal they are parity. Label: from REQUIREMENTS.md.
