# LinkedIn's AI job-search features (Premium AI tools, Job Match): teardown and Trainee targets

2026-10-19. Research only. **Trainee never automates LinkedIn**: no sign-in on the user's behalf, no scraping, no
extension acting on linkedin.com, no sending. Built to `docs/product/BUILD-STANDARD-TSENTA.md` (sections 0, 2,
3.7-3.11, 4, 6, 11). Trainee's state is from `docs/product/REQUIREMENTS.md` (audit of 2026-10-19) and the repo checkout
at `44364a83`.

---

## 0. Labels and method (read this first: this document is mostly ASSUMED)

| Label | Meaning in this document |
|---|---|
| VERIFIED | Read in our own repo or measured in our own run, source given. |
| VERIFIED-S | The named primary page states it, read through a WebSearch extract (here: only facts carried from the prior notes in `audit/research-competitors.md`). |
| REPORTED | A third party or an internal doc says it, not re-checked. |
| ASSUMED | Inference, or **recalled** knowledge (training data up to mid-2026) that was **not looked up this session**. Each recalled fact names the page to re-read. Treat every ASSUMED line as a hypothesis. |

Why so much is ASSUMED, plainly:
- The session's shared web-search budget was exhausted before LinkedIn research began ("limit: 200 WebSearch calls
  per turn, shared by every agent").
- WebFetch to `www.linkedin.com` and `premium.linkedin.com` failed (`getaddrinfo ENOTFOUND`); the proxy refuses
  unlisted hosts.
- Only two LinkedIn facts carry better than ASSUMED: the User Agreement 8.2 ban on bots (VERIFIED-S, prior notes) and the
  owner's standard stating LinkedIn prohibits bots and automation via its help pages (REPORTED here: BUILD-STANDARD 3.7,
  not re-read).
- **Before any number from this file is used in a decision, a follow-up session with search budget must re-read the
  pages listed in section 10.** Nothing here was used to sign up, test, or automate anything.

---

## 1. What the product is

**One line:** the largest professional network and job marketplace, with AI features layered on job pages and search:
a fit check against a posting (Job Match), natural-language job search, AI help writing messages, resumes, cover
letters and profile text, and practice tools, several of them behind Premium. LinkedIn also sells AI to recruiters
(Hiring Assistant), so the same company builds the tool that screens the applications its job seekers send.

### 1.1 Company
| Fact | Value | Label |
|---|---|---|
| Owner | Microsoft (acquired 2016) | ASSUMED (recalled; well known) |
| Members | "1 billion+" members (2023 milestone; ~1.2B cited in 2025) | ASSUMED (recalled; re-read news.linkedin.com / about.linkedin.com) |
| Revenue | ~$17B a year (Microsoft FY2025 reporting) | ASSUMED (recalled; re-read Microsoft 10-K FY2025) |
| Revenue mix | Talent Solutions (recruiters), Marketing Solutions, Premium Subscriptions, Sales Solutions | ASSUMED (recalled) |
| Model provider | Generative features built on OpenAI models through Microsoft | ASSUMED (recalled; LinkedIn engineering blog posts 2023-2024) |

### 1.2 Users and ratings
| Metric | Value | Label |
|---|---|---|
| App ratings | Not collected (search budget exhausted) | Unknown |
| Premium subscribers | Not collected; LinkedIn has said Premium revenue grew strongly through 2024-2025 | ASSUMED (recalled, no number used) |

### 1.3 Pricing (Premium Career, the job-seeker tier)
| Plan | Price | Label |
|---|---|---|
| Premium Career, monthly (US) | ~$29.99/month | ASSUMED (recalled; re-read premium.linkedin.com and linkedin.com/premium/products) |
| Premium Career, annual (US) | ~$239.88/year (~$19.99/month) | ASSUMED (recalled) |
| Free trial | Typically one month for eligible members | ASSUMED (recalled) |
| Free tier | Job search, Easy Apply, job alerts, basic Job Match (see L1) | ASSUMED (recalled) |

---

## 2. Capability inventory

Every row is ASSUMED (recalled) unless labeled; the "re-read" column names where to confirm.

| # | Capability | What it does (as recalled) | Free or Premium | Re-read |
|---|---|---|---|---|
| L1 | **Job Match** | On a job page, shows how your profile matches the posting's qualifications ("you match N of M qualifications"), with which ones match and which are missing | Shown broadly (launched for all members in English, 2024); deeper detail with Premium | linkedin.com/help (Job Match), news.linkedin.com 2024 |
| L2 | **AI fit assessment on a posting** | "Am I a good fit for this job?" style prompts on the job page; strengths and gaps against the posting | Premium (announced Nov 2023 as the AI-powered job-seeker experience) | news.linkedin.com Nov 2023 Premium AI announcement |
| L3 | **AI job search** | Natural-language search ("remote product marketing roles at climate startups") instead of keywords and filters | Rolled out 2025, Premium first, then broadly in the US | news.linkedin.com 2025 job search announcement |
| L4 | AI message drafting | Drafts a message to the recruiter or hiring manager from the job page | Premium | Premium Career product page |
| L5 | AI resume and cover letter help | Resume review/suggestions and cover-letter drafts tailored to a posting | Premium (2024) | Premium Career product page; LinkedIn help |
| L6 | AI profile writing | Headline and About suggestions | Premium | LinkedIn help |
| L7 | Interview prep | Practice questions with AI feedback on answers | Premium | linkedin.com/interview-prep (verify current state) |
| L8 | Applicant insights | Applicant count and how you compare; "Top applicant" job list | Premium | Premium Career product page |
| L9 | InMail credits | ~5 a month on Career | Premium | Premium Career product page |
| L10 | Easy Apply | Apply on LinkedIn with profile, resume and saved screening answers | Free | LinkedIn help (Easy Apply) |
| L11 | Network at the company | "People you know" and alumni at the hiring company on the job page; referral asks are the member's own messages | Free | Job page UI (verify) |
| L12 | Job alerts and saved jobs | Alerts by search; "My Jobs" tracks saved and applied (LinkedIn applies; external applies only if the member marks them) | Free | LinkedIn help (My Jobs) |
| L13 | Salary insights | Estimated pay ranges where available | Premium for detail | Premium Career product page |
| L14 | **Hiring Assistant (recruiter side)** | An AI agent for recruiters that sources and screens candidates (announced Oct 2024; wider rollout 2025) | Recruiter product | news.linkedin.com Oct 2024; LinkedIn Talent blog |
| L15 | AI training on member data | A "Data for Generative AI Improvement" setting, on by default in the US from Sept 2024; extended to EU/EEA/UK/Switzerland from Nov 2025 | All members (opt-out) | linkedin.com/legal/privacy-policy; LinkedIn help on the setting |
| L16 | **Automation ban** | User Agreement 8.2 bans bots (VERIFIED-S, prior notes). The fuller wording (bots or other automated methods to access the services, add or download contacts, send or redirect messages) is ASSUMED (recalled) | Rule | Prior notes; the owner's standard 3.7 says the help pages also ban it (REPORTED); re-read the agreement |

---

## 3. Acceptance targets for Trainee, per feature

Unit prices: gpt-5-mini $0.25 / $0.025 cached / $2.00 per 1M tokens; gpt-5-nano $0.05 / $0.005 / $0.40 (VERIFIED (indexed),
`docs/product/cost-model-applying.md`). Embedding price ~$0.02 per 1M tokens for a small embedding model (ASSUMED,
recalled; re-read platform.openai.com/docs/pricing). All totals ASSUMED arithmetic.

### 3.1 Fit explanation (L1, L2)
- BASELINE: qualification match list on the job page; AI fit commentary on Premium (ASSUMED).
- PARITY: every recommended posting carries "matched because..." and "missing..." lines from the posting's own text and
  the user's stored facts (3a BUILT on the router path).
- BETTER:
  - **Knockouts first:** sponsorship, clearance, location, required license surfaced before any score in 100% of
    postings that carry one (3b PARTIAL today).
  - **Measured agreement:** on 100 postings, Trainee's fit verdict (apply / stretch / skip) agrees with two human
    reviewers' verdict on ≥ 85%. LinkedIn publishes no agreement number (ASSUMED).
  - **Corrections stick:** a user correction ("I do have Kubernetes") changes the next 7 days of matches (standard 3.1).
  - **Never a hire chance:** no percentage presented as odds on any path (3e). TODAY: the agent path passes a raw fit
    score with no guard and its prompt says "Tell them their real odds" (REQUIREMENTS 3e, VERIFIED by the audit).
- COST NOTE: an LLM fit check per posting-user pair (~4,000 in / 300 out on mini ≈ $0.0016) is too costly at 100
  postings a day per user ($0.16/day). Pre-filter with embeddings (a 1,000-token posting ≈ $0.00002, shared by all
  users) and rules, then run the LLM on the top 10 only: ≈ **$0.016 per user per day**.

### 3.2 Natural-language job search (L3)
- BASELINE: conversational search (ASSUMED, 2025).
- PARITY: "remote senior data roles over $150k in fintech, no sponsorship needed" turns into filters on role, level,
  pay, arrangement, location and knockouts.
- BETTER: precision@20 ≥ 0.8 on a 50-query labeled set over our 2,179-board pool, with every result's source board and
  first-seen time shown (2d); freshness under 60 minutes median for watched employers (standard 3.1).
- TODAY: keyword match only; no pay data; seniority and remote stored but not filtered (2b PARTIAL). The default chat
  brain is handed `postings: []` (REQUIREMENTS "What the tally hides" 2).
- COST NOTE: query parse ~500 in / 150 out on nano ≈ $0.0001 per search.

### 3.3 Job inventory (L10, L12)
- BASELINE: LinkedIn's inventory includes Easy Apply-only postings and reposts of company-site jobs (ASSUMED).
- PARITY: company career-page coverage for the employers our users target (standard 3.1), deduplicated.
- BETTER: postings straight from the employer's ATS, with the first-seen time on the employer's own board; dead
  postings removed within 24 hours (standard 3.1). Honest limit: **LinkedIn-only roles are out of reach** (we never read
  LinkedIn). Measure the share of users' target roles that exist on a company board; if it is low for a segment, say so.
- TODAY: 2,179 boards ingested, reachable only behind `CAREER_BRAIN=agent` (2a BUILT with that caveat); duplicates only
  by ATS id (2c PARTIAL).

### 3.4 Messages to recruiters and hiring managers (L4)
- BASELINE: AI drafts on the job page, sent by the member on LinkedIn (ASSUMED).
- PARITY: a draft per contact that references the person's real role and the user's real background; the user copies
  it into LinkedIn (or email) themselves. **Trainee never sends on LinkedIn.**
- BETTER: "would send unedited" on ≥ 70% of a 30-draft reviewed sample per release (standard 3.7); 0 invented facts
  about the contact (every personal detail cites its public source); follow-up timing tracked and never a
  double-contact.
- TODAY: drafts use `personalization_facts: []` and `user {name}` on the router path (11d PARTIAL); send disabled at the
  sink (11e BUILT).
- COST NOTE: ~2,500 in / 300 out ≈ $0.0012 per draft on mini.

### 3.5 Who you know at the company (L11)
- BASELINE: connections and alumni shown on the job page, live (ASSUMED).
- PARITY: from the user's own LinkedIn **data export** (Connections.csv: First Name, Last Name, URL, Email Address,
  Company, Position, Connected On; VERIFIED parser headers in `packages/domain/122-career-profile.js`), surface every
  connection at the hiring company on the application's card.
- BETTER: a connection is shown with **why** (role relevance, recency of connection) and **how stale** the export is
  ("your export is 41 days old"), and the referral ask draft is ready (11b BUILT on supplied records). Measured: for
  100% of tracked applications at a company present in the export, the connection appears on the card.
- TODAY: the CSV parse exists (122), but nothing over text fills `ctx.contacts` (11a PARTIAL). The export is the only
  sanctioned LinkedIn route and never asks for credentials (FR-133, FR-294 ENFORCED in `docs/career/forbidden-rules.md`,
  VERIFIED by read).
- COST NOTE: parsing and matching ≈ $0; company-name normalization may need the model on ambiguous names (≈ $0.0001 each).

### 3.6 Resume, cover letter, profile text (L5, L6)
- BASELINE: Premium AI suggestions (ASSUMED).
- PARITY: tailored resume with a diff, cover letters from facts (see `human-apply-service.md` 3.6 and standard 3.2).
- BETTER: **0 invented facts**, 100% of links preserved, ATS-parse pass (standard 3.2). For LinkedIn profile text the
  user pastes in, suggestions from stored facts only; Trainee never edits the profile.
- TODAY: 4a-4f PARTIAL; 5c BUILT.

### 3.7 Interview prep (L7)
- Targets are in `finalround.md` section 3 and `yoodli.md` section 3. LinkedIn's practice tool has no tie to the
  application (ASSUMED); Trainee's BETTER is prep built from the posting and the exact resume sent (12a).

### 3.8 Applicant insights and salary (L8, L13)
- BASELINE: applicant counts, "Top applicant", pay estimates (ASSUMED).
- PARITY: posted-since time from our first-seen record; pay range parsed from postings that state one.
- BETTER: share of postings with a parsed pay range reported per state; pay shown only when the posting states it or
  a cited source does (standard 3.10, every market claim points to postings we read). No applicant count is claimed
  (we cannot see it).
- TODAY: no pay data (2b PARTIAL); no deadline column (2d PARTIAL).

### 3.9 Easy Apply roles (L10): the honest handoff
- BASELINE: one-click apply on LinkedIn (ASSUMED).
- TARGET: when a role exists only as Easy Apply, Trainee prepares the answers and the tailored resume, says "this one
  is on LinkedIn; apply there yourself, here is what to paste", and logs it in the tracker when the user says done.
  **Never** a bot, extension or credential on linkedin.com.
- COST NOTE: same as a prepared application (~$0.004, cost model).

### 3.10 Data use (L15)
- BASELINE: member data used for generative-AI improvement by default, with an opt-out (ASSUMED, recalled).
- BETTER: no user data used to train any model; stated on Trainee's AI disclosure page (standard 8.4).

---

## 4. What LinkedIn does NOT have (ASSUMED unless labeled)

1. **It does not apply for you** outside LinkedIn, and it does not track off-LinkedIn applications unless the member
   marks them (L12).
2. **No outcome engine.** No funnel by role family, no "30 applications and zero replies, change strategy".
3. **No ask-once memory across employers' own forms.** Easy Apply saves answers for Easy Apply; company portals start
   from scratch.
4. **No prep tied to the submitted application** (L7 is generic practice).
5. **No quality cap.** Easy Apply makes volume easy; Ashby reports applications per hire tripled since 2021 to 300+ and
   candidates ~50% less likely to interview than five years ago (VERIFIED-S, prior notes, Ashby press release); Greenhouse's
   CEO says auto-applying means "job seekers aren't getting any callbacks" (VERIFIED-S, prior notes, fortune.com
   2025-05-13).
6. **Conflict of interest.** Recruiters are LinkedIn's largest paying customers (ASSUMED); its Hiring Assistant (L14)
   screens the same applicants its Premium tools coach. A job seeker's agent should work for the job seeker only.
7. **No text-message surface.** App and web.

---

## 5. Scoreboard

| Capability | LinkedIn (labeled) | Trainee target (measurable) | Trainee today |
|---|---|---|---|
| Fit explanation | Job Match; Premium AI fit (ASSUMED) | Knockouts first 100%; ≥85% agreement with reviewers on 100 postings; corrections change 7 days of matches | 3a BUILT (router); 3b PARTIAL; 3e PARTIAL (agent prompt says "real odds") |
| Hire-chance framing | Unknown | Never on any path | Violated on agent path (3e, VERIFIED by audit) |
| NL job search | Yes, 2025 (ASSUMED) | precision@20 ≥ 0.8 on 50 queries; pay/level/remote filters | 2b PARTIAL (keywords only) |
| Inventory | Largest, incl. Easy Apply-only (ASSUMED) | Company boards users target; freshness < 60 min median | 2,179 boards, agent path only (2a) |
| Message drafts | Premium (ASSUMED) | ≥70% "send unedited"; 0 invented contact facts; user sends | 11d PARTIAL; 11e BUILT (send disabled) |
| Who you know | Live on job page (ASSUMED) | From the user's export; 100% of matching applications show the connection | 122 parser exists; 11a PARTIAL (nothing fills contacts) |
| Resume / cover letter | Premium AI (ASSUMED) | 0 invented facts; links 100%; ATS-parse pass | 4a-4f PARTIAL; 5c BUILT |
| Interview prep | Generic practice (ASSUMED) | Prep from posting + sent resume | 12a PARTIAL |
| Applicant count / salary | Premium (ASSUMED) | Posted-since time; pay only when stated or cited | 2b, 2d PARTIAL |
| Apply | Easy Apply on LinkedIn only (ASSUMED) | Company portals with proof; Easy Apply = user's own act with prepared answers | Not live (P0) |
| Off-platform tracking | Manual mark only (ASSUMED) | Every application tracked with outcome state | 9a PARTIAL |
| Outcome engine | None (ASSUMED) | Funnel per role family; throttle rule fires on real data | Not built |
| Data for AI training | Default on, opt-out (ASSUMED) | Never | No disclosure page yet |
| Automation of LinkedIn | Banned (VERIFIED-S, UA 8.2) | Never; export only | FR-133, FR-294 ENFORCED (VERIFIED by read) |

---

## 6. Pricing and unit economics

### 6.1 Their price (ASSUMED, recalled prices)
- Premium Career at ~$29.99/month buys AI assistance, InMail and insights; it does not buy applications or outcomes.
- Annual ~$239.88 (~$19.99/month).

### 6.2 Architecture inference (ASSUMED)
- Job Match is likely a structured comparison (skills and qualifications extracted from postings and profiles, matched
  by a taxonomy), cheap at LinkedIn's scale because extraction is done once per posting and per profile; the generative
  layer (fit prose, drafts) runs only when a Premium member asks.
- AI search maps a sentence to LinkedIn's existing structured filters plus semantic retrieval.
- LinkedIn's marginal cost per member AI call is cents or less; the economics are a subscription upsell on a network it
  already owns. It cannot be undercut on price; it can be beaten on doing the job end to end.

### 6.3 What it means for Trainee
- Fit with an embedding prefilter: ≈ $0.016 per user per day (3.1). Message drafts ≈ $0.0012 each. Both fit inside a
  monthly plan.
- The differentiator is not the AI layer (LinkedIn has one); it is acting on the employer's own site with proof, the
  outcome loop, and memory. Positioning per the standard: "the career agent that gets you interviews", never
  "LinkedIn, but better".

---

## 7. Failure modes and complaints (be brutal; labeled)

| Failure mode | Label |
|---|---|
| Easy Apply volume floods employers; per-application interview odds fall (applications per hire 300+, candidates ~50% less likely to interview) | VERIFIED-S (prior notes: Ashby press release); Huntr: 2.58% interview rate per application at 100+ applications vs 9.25% at 11-20 (VERIFIED-S, prior notes, self-logged and correlational) |
| AI-drafted messages make recruiter inboxes noisier; generic drafts are easy to spot | ASSUMED |
| Fit commentary is generic or flattering; "Top applicant" lists are not a hiring signal | ASSUMED (common member complaint, not sourced this session) |
| Fake and scam postings on large job boards | ASSUMED for LinkedIn specifically; Gartner forecasts 1 in 4 *candidate* profiles fake by 2028 (REPORTED, hrdive.com), the employer-side mirror of the same trust problem |
| Default-on use of member data for generative-AI training drew criticism in 2024 and 2025 | ASSUMED (recalled; re-read privacy policy and press) |
| Members using third-party auto-apply or automation extensions risk restriction (UA 8.2) | VERIFIED-S that the rule exists; account restrictions ASSUMED (widely reported, not sourced this session) |
| LinkedIn enforces against scrapers in court (hiQ Labs v. LinkedIn ended with a finding that hiQ breached the User Agreement, then a settlement, 2022) | ASSUMED (recalled; re-read court record) |
| Premium paywalls the AI that free users would need most | ASSUMED |

---

## 8. Ground-truth test plan (written only; nothing run; no automation ever)

Rules for this plan: read the LinkedIn User Agreement and the help page on prohibited software first; one consenting
staff member uses their **own** account manually; no extension, script, scraper, or copy-out beyond what they type by
hand into notes; no sign-up or Premium trial without the owner's approval.

1. **Re-read pass (no account needed):** every page in section 10 with a search-enabled session; replace each ASSUMED
   line here with VERIFIED-S or delete it.
2. **Fit agreement:** the staff member picks 30 real postings that also exist on the employer's own board. For each,
   they record LinkedIn's Job Match result by hand. Trainee produces its verdict from the employer-board copy and the
   same person's stored facts. Two reviewers give their own verdict blind. Report agreement per side.
3. **Draft quality:** for 10 contacts, the staff member records LinkedIn's AI message draft (if Premium is approved) and
   Trainee's draft from the same facts; blind review on "would send unedited".
4. **Inventory overlap:** for 50 of the staff member's target roles found on LinkedIn, check whether the same role is on
   the employer's own board in our pool, and how many hours earlier or later it appeared. Measures the honest limit in 3.3.
5. **Export path:** the staff member requests their own LinkedIn data export, uploads Connections.csv to Trainee; record
   time to arrive, parse errors, and how many tracked applications gain a connection.
6. Results here with VERIFIED labels; re-run yearly.

---

## 9. What Trainee must add, ranked by launch risk

| Rank | Gap | Why | Label |
|---|---|---|---|
| 1 | **Keep LinkedIn untouched, provably:** a CI test that no code path signs into, fetches, or automates linkedin.com, alongside FR-133/FR-294; the AI disclosure says so. | One ban or legal letter in a user's name ends trust; UA 8.2 bans bots. | VERIFIED-S rule; VERIFIED rules enforced in repo |
| 2 | **Fix the odds framing on the agent path** (3e): remove "Tell them their real odds", guard the raw score. | Presenting a fit score as a hire chance is the claim the standard forbids, and it is live on one path. | VERIFIED (REQUIREMENTS 3e) |
| 3 | **Chat sees real jobs** on the default path (`postings: []` today) and filters on pay, level, remote (2b). | Without it, LinkedIn's free search beats Trainee's default chat outright. | VERIFIED gap |
| 4 | **Connections from the export onto application cards** (11a): wire the 122 parse into contacts and the referral draft. | "Who do I know there?" is LinkedIn's best free feature; the export is our only sanctioned route. | VERIFIED gap |
| 5 | **Drafts with real personalization** (11d): pass the user's experience and the contact's sourced facts. | Generic drafts lose to LinkedIn's built-in drafting. | VERIFIED gap |
| 6 | **Easy Apply-only handoff** (3.9): prepared answers + tracker logging. | Users will ask about LinkedIn roles daily; a silent "can't" reads as broken. | ASSUMED frequency |
| 7 | **Exclusions and corrections that stick** (3d). | Parity with "not interested" on any job site. | VERIFIED gap (MODULE) |
| 8 | **The re-read pass in 8.1**, before any LinkedIn number appears in a deck or decision. | This file is mostly ASSUMED. | ASSUMED (by construction) |

---

## 10. Pages to re-read (all ASSUMED until read)
- linkedin.com/legal/user-agreement (section 8.2, and account-sharing terms)
- linkedin.com/help (prohibited software and extensions; Job Match; Easy Apply; My Jobs; Data for Generative AI Improvement setting)
- premium.linkedin.com and linkedin.com/premium/products (Premium Career price and features)
- news.linkedin.com (Nov 2023 AI job-seeker experience; 2024 Job Match; 2025 AI job search; Oct 2024 Hiring Assistant)
- linkedin.com/legal/privacy-policy (generative-AI training)
- Microsoft FY2025 Form 10-K (LinkedIn revenue)

## Sources actually used
- `audit/research-competitors.md` (LinkedIn User Agreement 8.2; Ashby applications-per-hire; Greenhouse CEO in Fortune; Huntr Q1 2026)
- `docs/product/BUILD-STANDARD-TSENTA.md` 3.7 (owner's statement on LinkedIn's automation ban)
- hrdive.com/news/fake-job-candidates-ai/757126 (Gartner forecast, search extract this session)
- Repo: `packages/domain/122-career-profile.js` (Connections.csv headers), `docs/career/forbidden-rules.md` (FR-133, FR-294), `docs/product/REQUIREMENTS.md`, `docs/product/cost-model-applying.md` (checkout `44364a83`)
