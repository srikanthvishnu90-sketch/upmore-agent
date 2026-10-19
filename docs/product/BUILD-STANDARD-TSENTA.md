# Build standard: parity, better and beyond Tsenta (owner, 2026-10-19)

The owner's text, verbatim. It is the template every competitor document in `docs/competitors/` follows: labels, a capability inventory, parity and better targets per feature, cost notes, what the competitor lacks, a scoreboard, a ground-truth test and a first assignment. When this document and another disagree, the stricter requirement wins.

```
This document is the build standard for one job: do everything Tsenta does,
the same way or better, plus the things Tsenta does not do, at a lower
measured cost per application, architected for mass from day one.

It sits on top of two documents you must also read:
- trainee-depth-and-perfection-standard.txt (the quality bar for every
  feature; applies to every builder, no role splitting)
- tsenta-teardown-and-trainee-attack-plan.txt (the competitor evidence,
  every claim labeled VERIFIED / REPORTED / ASSUMED)

When this document and those disagree, the stricter requirement wins.

================================================================
0. LABELS USED THROUGHOUT
================================================================

VERIFIED = read on a live page or measured in our own runs, source given.
REPORTED = a third party or an earlier internal doc says it; not checked.
ASSUMED  = an inference. A hypothesis to test, never a fact to build on.

Every number you put in a PR, a message, or a launch page carries one of
these labels. A claim without a label is treated as ASSUMED.

================================================================
1. THE MISSION, STATED PLAINLY
================================================================

The owner's instruction: recreate Tsenta's product, do more than it does,
and do it cheaper per application and more efficiently at mass. That is an
efficiency edge, and it is real only if it is measured.

What that means in practice, without the hype:

1. PARITY: every capability Tsenta lists, Trainee has, working, proven on
   real systems with real numbers. Not "comparable on the landing page" -
   proven in runs.
2. BETTER: on each parity capability, at least one dimension where Trainee
   is measurably stronger (proof quality, honesty of outcomes, handoff
   quality, answer quality, or trust). Better is a number, not an adjective.
3. BEYOND: the capabilities Tsenta does not have at all (outcomes,
   networking, interview prep, memory, guidance). These are where the
   product is won, because Tsenta's per-application pricing gives it no
   reason to optimize for interviews.
4. CHEAPER: measured cost per submitted application below theirs, using the
   architecture in section 6. Tsenta's price floor is about 2.2 to 3.2
   cents of PRICE per application (VERIFIED, tsenta.com/pricing). We do not
   know their cost. Our job is to make our measured cost so low that
   profitable pricing under their price is possible. Until cost is
   measured, the word "cheaper" does not appear in any user-facing copy.
5. AT MASS: every one of these holds at 100, 1,000, 10,000, and 100,000
   users, with the cost model written down per tier.

What the mission is NOT:
- It is not "make Tsenta lose efficiency." You cannot reduce another
  company's efficiency. You win customers by being better where customers
  feel it. (From the teardown, section 0.5 - keep this framing honest in
  your own head even when the pitch is aggressive.)
- It is not matching their 19-ATS coverage in the next 60 days. That is
  a launch-gate order of work, not a sprint (ASSUMED timeline in section
  10; treat their coverage as the multi-month bar).
- It is not a feature checklist race. Five half-verified features lose to
  three proven ones. The depth standard's four tests (depth, competitor,
  scale, perfection) apply to every line below.

================================================================
2. THE TSENTA BASELINE: WHAT PARITY MEANS, FEATURE BY FEATURE
================================================================

Everything in this section is what Tsenta publicly does or claims. Each
item is labeled. Parity means Trainee does the same thing, proven. Better
means the stated measurable edge. Section 3 turns each into acceptance
targets; this section is the capability inventory.

2.1 DISCOVERY (FIND)
Tsenta: watches 50,000+ company career pages directly (not job boards),
submits the moment a fitting role goes up, claims users land inside the
first 100 applicants. (VERIFIED as claims on tsenta.com; the "applicant
#4 of 312" demo line is marketing copy, not proof.)
Trainee current state (REPORTED from repo docs): harvest spans 2,179 live
employer boards and 259K+ postings; storage cost already flagged (173K
postings measured ~564M characters, over the free-plan limit on first
ingest); matching and freshness metrics are not yet a gate.

2.2 PREP
Tsenta: per-role tailored resume and cover letter from the job
description; shows a diff of every change; approve-before-send is the
default (more automated modes in settings); claims it only uses true
facts from the uploaded resume. (VERIFIED, tsenta.com.)
Known complaints (REPORTED, hiringnow.ai review): AI resume formatting
problems and lost hyperlinks.

2.3 APPLY
Tsenta: signs in, fills every field, writes open-ended answers "in your
voice," uploads documents, submits. ATSes named on the pricing page
(VERIFIED): Workday, Greenhouse, Lever, Ashby, Rippling, iCIMS, BambooHR,
Workable, JazzHR, Jobvite, BreezyHR, Oracle Cloud, SmartRecruiters,
Paylocity, UltiPro, ADP, Dover, Gem, Zoho Recruit. The homepage says
"nineteen ATSes" in one place and "30+" in another - the named list is
19; treat 30+ as an unverified claim.
Trainee current state (REPORTED): standard facts cover ~58% of required
questions weighted by posting; ~13% of postings fully ready; every live
Greenhouse, Lever, and Ashby form loads an invisible bot check at submit;
SmartRecruiters sits behind DataDome and returns 403.

2.4 TRACK
Tsenta: optional inbox connection; routes recruiter replies to the right
application, moves status, and enters employer email verification codes
mid-application. (VERIFIED, tsenta.com.)

2.5 RECEIPTS AND REFUNDS
Tsenta: every application produces a receipt with fields filled, answers
written, documents sent, and "the employer's confirmation" (VERIFIED as
a claim; not verified in practice - the free-tier test in section 11
exists to check it). Only successful submissions count against the plan;
employer-side failures are refunded to the cycle (VERIFIED,
tsenta.com/pricing). Unused allowance does not roll over (VERIFIED).

2.6 SURFACES
Tsenta: web, iOS, Android, Chrome extension, iMessage, WhatsApp, MCP
server and CLI. (VERIFIED.) iMessage-native is therefore table stakes,
not a differentiator. Never sell "we are in iMessage" as the edge.

2.7 PRICING
Tsenta (VERIFIED, tsenta.com/pricing): Free 25 applications total, no
card. Starter $19/mo for 600 applications per 30 days (~3.2c each).
Pro $39/mo for 1,500. Power $99/mo for 4,500 (~2.2c each). Quarterly
and annual billing cut the effective rate up to 36%.

2.8 HONESTY POSTURE
Tsenta does not promise automation is undetectable (VERIFIED, their
FAQ). Neither do we. Ever. See section 9.

2.9 WHAT TSENTA DOES NOT HAVE (VERIFIED absent from its site and AI
disclosure; absence on a landing page is not proof of absence in the
product - treat as strong indication, re-check quarterly):
- No networking or referral outreach.
- No interview prep or mock interviewing.
- No career guidance or strategy.
- No outcome optimization: priced per application, so it has no
  incentive to maximize interviews per application.
- No published interview-rate or offer-rate data; testimonials are
  first name and last initial only (VERIFIED).

================================================================
3. ACCEPTANCE TARGETS: PARITY AND BETTER, FEATURE BY FEATURE
================================================================

Each feature below has: the Tsenta baseline, the PARITY acceptance target
(measurable, provable), the BETTER target (the measurable edge), and the
cost note. A feature ships only when parity AND better are proven with
VERIFIED evidence. "Proven" means measured on real systems, labeled, and
written into the repo docs - never asserted in a PR body.

----------------------------------------------------------------
3.1 DISCOVERY AND FRESHNESS
----------------------------------------------------------------
Baseline: 50,000+ career pages, "first 100 applicants" claim.
PARITY TARGET:
- Coverage: every career page for the top 5,000 employers our users
  actually target (built from waitlist and beta demand data, not a
  scraped guess), plus the long tail added continuously. State the
  exact count and the list source in docs/coverage.md.
- Freshness: median minutes from posting-live to user-alerted, measured
  against a ground-truth sample of 100 postings per week where go-live
  time is independently observed. Target: under 60 minutes median,
  under 6 hours at p95, for watched employers. This number is the
  feature. Publish it internally every week.
- Deduplication: zero duplicate alerts per user per role across
  sources, measured on the alert log.
- Dead postings: detected and removed within 24 hours of going dead,
  measured on a weekly sample.
BETTER TARGET:
- Match reasons: every alert carries "matched because..." that the user
  can correct, and corrections measurably change future alerts within
  7 days (verified by re-scoring the user's queue after feedback).
- Freshness beats theirs on the same postings: during the free-tier
  test (section 11), record Tsenta's match timing on 25 roles against
  our harvest on the same employers. If we are not faster or equal on
  overlapping employers, discovery is not at parity, whatever the page
  count says.
COST NOTE: discovery cost is crawl + storage + match compute. Storage
growth policy (retention, pruning) must exist before launch, not after
the bill arrives - the 564M-character flag is the warning.

----------------------------------------------------------------
3.2 PREP (TAILORED RESUME AND COVER LETTER)
----------------------------------------------------------------
Baseline: per-role tailoring with a visible diff, approval default,
"true facts only" claim; REPORTED formatting problems and lost
hyperlinks.
PARITY TARGET:
- Every application gets a per-role tailored resume, with a diff the
  user can inspect before anything is sent.
- Truthfulness: zero invented experience, employers, dates, metrics,
  or credentials. Measured: 100 sampled tailored resumes per release
  diffed against the user's source facts by an automated checker plus
  human review of a 20-resume subsample. Any invented fact is a
  launch-blocking defect.
- Approval gate: nothing sends without explicit user approval in the
  default mode.
BETTER TARGET:
- Formatting survives real ATS parsing: run every resume template
  through actual parsers (the ATSes we support, plus a generic parser)
  and verify all sections, links, and contact fields extract correctly.
  Hyperlinks preserved: 100% of links in the source resume survive
  tailoring. (Tsenta's REPORTED weakness; make it our verified strength.)
- Voice: open-ended answers and cover letters draw from the user's
  memory bank of real stories, not generic templates. Acceptance: in a
  blind review of 30 answers, reviewers cannot reliably tell which were
  machine-drafted, and every specific claim traces to a stored user
  fact.
COST NOTE: LLM tokens per tailored application. Budget target in
section 6; measure tokens per application and report the distribution,
not the average alone.

----------------------------------------------------------------
3.3 APPLY (THE CORE PARITY FEATURE)
----------------------------------------------------------------
Baseline: 19 named ATSes, sign-in, full fill, open-ended answers,
uploads, submit.
PARITY TARGET (launch set first, in this order: Greenhouse, Lever,
Ashby):
- For each launch ATS: at least 20 real applications against different
  live employers using test accounts, with every run recorded:
  success, silent failure, bot-check stop, wrong field, time taken.
  The numbers are reported as numbers. 14/20 is 14/20.
- Fill is readback-verified: after filling, the system reads back what
  the form actually contains (including rendered readback for dynamic
  widgets) and confirms every field before submit. The 17 captured
  real forms in CI are the regression floor; the captcha-detector
  defect (empty invisible-hCaptcha container counted as a challenge,
  stopping 5 of 6 saved Lever applications at open) is fixed first.
- Sign-in and account flows handled per ATS; employer-side email
  verification codes handled by human handoff (3.6) without requiring
  inbox access.
- No submission without the owner gate: the owner personally makes the
  first 3 real submissions per job site, each confirmed by the
  employer's confirmation email, before any automated applying on that
  site. This gate does not move.
BETTER TARGET:
- Honest outcomes where the category is vague: every application ends
  SUBMITTED (employer confirmation stored), UNKNOWN, or FAILED (reason
  stored). The UI and messages never claim more than the proof shows.
  Tsenta claims receipts; we verify ours and publish the verified-submit
  rate. If we are the only ones publishing a real number, that is a
  marketing asset no one can copy without exposing themselves.
- Silent failure rate: measured and driven toward zero. Any silent
  failure found in testing is a launch-blocking defect class.
- Handoff rate and resolution time tracked (see 3.6): the competitor
  pattern is fail-or-guess (Simplify fails the application rather than
  guess - VERIFIED via their help pages; Flint REPORTS high failure and
  empty-field rates for volume tools). We resolve instead.
COST NOTE: see section 6. The extension-first architecture is the cheap
path; server browsers are the expensive exception.

----------------------------------------------------------------
3.4 TRACK AND OUTCOMES
----------------------------------------------------------------
Baseline: inbox connection routes recruiter replies, moves status,
enters verification codes.
PARITY TARGET:
- Application status tracking works WITHOUT inbox access (manual plus
  email-forwarding plus confirmation-email parsing where available),
  and works better with it. Tsenta's tracking leans on inbox access;
  many users will not connect it. Honest degradation is the parity
  bar, not a stretch goal.
- Recruiter replies routed to the right application with measured
  precision: on a labeled test set of 200 recruiter emails, 98%+ routed
  to the correct application; misroutes surface to the user for
  correction, never silently.
BETTER TARGET - THE OUTCOME ENGINE (Tsenta has nothing here):
- Every user sees their own funnel: applications, replies, interview
  invites, offers, per role family, per week.
- The funnel drives action: if 30 applications in a role family produce
  zero replies, the product says so and changes strategy (different
  roles, different resume emphasis, networking instead). Acceptance:
  this throttle rule exists, fires on real data, and is visible to the
  user with the reasoning.
- This is the structural edge: a competitor priced per application
  cannot afford to tell users to apply less. We can. Do not undersell
  it internally: it changes what we build (quality cap, guidance,
  networking) and what we say ("we count interviews, not
  submissions").
COST NOTE: outcome tracking is cheap (tracker + parsing + memory). It
is the highest leverage per dollar of anything in this document.

----------------------------------------------------------------
3.5 RECEIPTS AND PROOF
----------------------------------------------------------------
Baseline: receipt per application with fields, answers, documents,
"employer's confirmation" (VERIFIED as claim, unverified in practice).
PARITY TARGET:
- Every application produces a stored receipt: fields filled, answers
  sent, documents sent, timestamps, and the proof artifact
  (confirmation page capture or confirmation email parsed and stored).
BETTER TARGET:
- Receipts are true or they say so: anything we cannot confirm is
  marked UNCONFIRMED, never "submitted." The verified-submit rate is
  computed from receipts and reported internally weekly.
- Refund rule matches the trust bar: failed applications never count
  against any plan allowance. Tsenta does this (VERIFIED); it is the
  category trust floor, not a differentiator. Our edge is proof
  quality and published rates.
COST NOTE: storage of proof artifacts per application; include in the
cost model with retention policy.

----------------------------------------------------------------
3.6 HUMAN HANDOFF (OUR CATEGORY-DEFINING FEATURE)
----------------------------------------------------------------
Baseline: Simplify fails the application rather than guess (VERIFIED,
their help pages) and says it will ask mid-flow later; Tsenta reads
email for verification codes. Nobody ships a clean in-conversation
handoff today.
ACCEPTANCE TARGET:
- When a bot check, captcha, login, verification code, or unknown
  question blocks an application, the user gets one short message
  naming exactly what is needed; they resolve it in seconds; the
  product resumes from where it stopped. Measured: handoff message
  sent within 60 seconds of the block; resume within 60 seconds of the
  user's answer; zero duplicate submissions caused by resume.
- Ask-once memory: the answer is stored and never asked again for any
  application, any employer. The user experience of being asked 2-3
  sharp questions once and never again is the product (the honest
  consequence of the 58% ask-once coverage today: most applications
  still need the user in the loop; design for it, do not hide it).
- Bot checks are handed to the human, never defeated. No paid captcha
  solvers, no evasion tooling. That is a legal, terms, and reputation
  line, and it is permanent.
BETTER TARGET: this whole feature is the better. A competitor that
silently fails at the wall loses to a product that hands off gracefully
every time. It is also the natural iMessage experience.

----------------------------------------------------------------
3.7 BEYOND TSENTA: NETWORKING AND REFERRALS
----------------------------------------------------------------
Tsenta: nothing (VERIFIED absent).
ACCEPTANCE TARGET:
- For each target application, the product finds the relevant humans
  (hiring manager, recruiter, team members, alumni) from the user's own
  consented connections and public pages - NOT LinkedIn scraping
  (LinkedIn prohibits bots and automation, VERIFIED via their help
  pages; Apollo and Hunter terms bar product use).
- Drafts a short personal note referencing real specifics (the person's
  role, the user's actual background). Acceptance: the "user would send
  this unedited" bar, sampled review per release.
- The user sends with one tap. Nothing auto-sends. Ever. Cold outreach
  at volume burns the user's domain reputation and violates terms;
  draft-and-assist is the product, blasting is not.
- Follow-up management: tracks who was contacted, when, what came back;
  drafts the follow-up at the right interval; never double-contacts
  anyone.
REALISM NOTE (from the teardown): medium difficulty; the hard parts are
legal and data sourcing. Ship research + drafting first.

----------------------------------------------------------------
3.8 BEYOND TSENTA: INTERVIEW PREP
----------------------------------------------------------------
Tsenta: nothing (VERIFIED absent).
ACCEPTANCE TARGET:
- The moment an application is submitted or a recruiter replies,
  generate prep for that specific role: likely questions from the
  actual job description, the user's own stories from memory mapped to
  those questions, and a mock interview over text (voice later).
- Feedback names the specific weakness ("your answer had no metric;
  here is where one fits"), never praise. Acceptance: rubric-graded
  sessions; question quality and feedback specificity reviewed on a
  20-session sample per release; zero hallucinated company facts
  (every company claim in prep material traces to the posting or a
  stated source).
- Progress tracking per skill across sessions, visible to the user.
COST NOTE: cents per session in LLM tokens. Cheap, and it is where a
first user sees the difference from Tsenta immediately.

----------------------------------------------------------------
3.9 BEYOND TSENTA: MEMORY AND CONVERSATION
----------------------------------------------------------------
Tsenta: application-centric, no assistant memory.
ACCEPTANCE TARGET (from the depth standard, restated as targets):
- Structured, retrievable memory: every connection, application,
  preference, answer, and commitment stored and recalled exactly.
  Missing memory fallback: say so and ask, never confabulate. This is
  database plus retrieval - not "infinite context," which is a
  marketing phrase; no model has it and every version compresses or
  drops detail. Build the boring proven pattern.
- The 300-scenario conversation suite runs green; the multi-turn
  conversation eval (turn-by-turn grading) is part of the gate.
- Proactivity with judgment: surfaces the right thing at the right time
  and stays quiet otherwise. Measured: proactive-message precision
  reviewed weekly on a sample; user mute/dismiss rate tracked.
- The compound effect is the moat: answers get better, prep gets
  better, and the user never re-answers anything. A user with months of
  stored context is expensive to leave.

----------------------------------------------------------------
3.10 BEYOND TSENTA: STRATEGY AND GUIDANCE
----------------------------------------------------------------
Tsenta: nothing (VERIFIED absent).
ACCEPTANCE TARGET:
- Guidance grounded in the user's real data: "here is why you are not
  getting replies," role-family fit, resume gaps by role family, salary
  ranges, offer comparison. Every market claim points to the postings
  we actually read.
- Honest counsel: if the target is unrealistic, the product says so and
  shows the path. Flattery is a defect.
- Powered by the outcome engine (3.4): guidance without funnel data is
  astrology.

----------------------------------------------------------------
3.11 QUALITY CAP (ANTI-VOLUME)
----------------------------------------------------------------
Tsenta: priced to maximize application count; plans are volume
allowances.
ACCEPTANCE TARGET:
- Sane default weekly cap with a "why these ones" explanation per
  application; high-volume mode available for users who ask.
- Relevance floor: no application goes out below a stated match
  threshold. Anti-abuse: daily caps and employer-side behavior that
  keeps our senders welcome. Getting blocked by a major ATS because of
  our traffic is a company-level incident.
- Public posture: "we won't let you burn your email reputation" -
  something a per-application-priced competitor cannot say honestly.

================================================================
4. THE FULL FEATURE-versus-TSENTA TARGET TABLE
================================================================

This is the scoreboard. Keep it in docs/competitors/tsenta-parity.md and
update it with measured numbers as they land. Every cell starts ASSUMED
or NOT_RUN until proven.

Capability                Tsenta (labeled)          Trainee target (measurable)
-------------------------- ------------------------- ---------------------------
Career pages watched      50,000+ (VERIFIED claim)  Top 5,000 demanded + long tail;
                                                    freshness <60min median, <6h p95
ATSes supported           19 named (VERIFIED);      GH, Lever, Ashby proven at 20+
                          30+ claimed               real apps each, then expand;
                                                    Workday last (multi-month)
Tailored resume           Yes, diff, approve-first  Parity + zero invented facts
                          (VERIFIED); formatting    (100/release sampled) + links
                          complaints (REPORTED)     100% preserved + ATS-parse pass
Open-ended answers        "In your voice" (claim)   Memory-bank stories; blind-review
                                                    indistinguishable; every claim
                                                    traceable to a stored user fact
Bot-check posture         Hedges (VERIFIED FAQ)     Human handoff <60s, never evade,
                                                    never guess
Submission proof          Receipt claimed           Receipt + stored employer
                          (VERIFIED claim,          confirmation; UNCONFIRMED when
                          unverified in practice)   unproven; verified-submit rate
                                                    published weekly
Failed applications       Refunded (VERIFIED)       Never counted + reason stored +
                                                    user told
Status tracking           Via inbox (VERIFIED)      Works without inbox; 98%+ routing
                                                    precision on 200-email test set
Outcome optimization      None; priced per app      Funnel per user; throttle rule
                                                    fires on real data
Networking                None (VERIFIED absent)    Research + drafts, user sends,
                                                    nothing auto-sends
Interview prep            None (VERIFIED absent)    Role-specific, rubric-graded,
                                                    zero hallucinated facts
Career guidance           None (VERIFIED absent)    Grounded in user's funnel +
                                                    harvested postings
Memory                    Application-centric       Full structured memory; ask-once,
                                                    never re-ask
Surfaces                  Web, iOS, Android, ext,   iMessage first + extension + web;
                          iMessage, WhatsApp, MCP   no "iMessage-native" claims
                          (VERIFIED)
Cost per application      ~2.2-3.2c of PRICE        Measured, target below their
                          (VERIFIED); cost unknown  price with margin (section 6)

================================================================
5. WHAT "BETTER" MAY NEVER CLAIM UNTIL MEASURED
================================================================

These lines are hard rules about external claims and internal honesty:

- Never "undetectable." Tsenta itself hedges (VERIFIED). Nobody can
  promise it. If a plan needs it, the plan is fragile.
- Never "cheaper than Tsenta" in any user-facing copy until our
  measured cost per submitted application has run for 30 days at
  meaningful volume with the margin math in section 6.3.
- Never "apply to everything" or a specific ATS count beyond what is
  proven with the 20+ real-application runs.
- Never a success-rate number we did not compute from stored proof.
- Never "10x Tsenta." Positioning is "the career agent that gets you
  interviews; they are the volume tool" - not "Tsenta but better,"
  which makes them the standard.

================================================================
6. COST PER APPLICATION: THE EFFICIENCY STANDARD
================================================================

6.1 THE THREE ARCHITECTURES (from the teardown; ASSUMED ranges to be
replaced by measurements)

A. Direct HTTP/API submission to the ATS where allowed and possible:
   fractions of a cent to low single cents, mostly LLM tokens. Fragile
   per ATS. (ASSUMED: Tsenta's /workday-api URL hints they may do this;
   it is the only way 3-cent pricing obviously works.)
B. User-side Chrome extension doing the form fill in the user's own
   browser: near-zero server cost, runs on the user's own IP and
   logged-in sessions, which also dodges most server-side bot checks.
   The owner has chosen this as the cheapest apply path and the default.
C. Server browser with proxies: ~$0.10-$0.50 per application (REPORTED,
   one vendor blog), ~$37K/month at 75K active users from our own
   earlier research (REPORTED). Highest cost, highest bot-detection
   risk. Reserved for cases A and B genuinely cannot cover, and only
   for paid tiers.

6.2 THE EXTENSION-FIRST STANDARD (Architecture B in depth)

Why it wins on cost and reliability:
- Server cost per fill approaches zero: the compute is the user's
  browser; our costs are the LLM tokens for answers and the messaging.
  Against a competitor paying server-browser or API infrastructure on
  every application, that is the structural efficiency edge the owner
  is pointing at.
- The fill happens from the user's own IP, browser fingerprint, and
  logged-in sessions. Server-side automation is what bot checks are
  built to catch; a real browser on a real machine with a human nearby
  is the honest posture that also happens to work.
- The human handoff (3.6) is native: the user is already at the
  browser. A captcha or verification code becomes a one-tap moment
  instead of a failure.

What must be true before it ships (the honest limit the owner stated):
- Reliability on real forms is the entire bet. Acceptance: the
  extension completes readback-verified fills on the 17 captured forms
  in CI, then on 20+ real applications per launch ATS (3.3), with field
  accuracy measured per run.
- The extension never submits on its own in the default mode: it fills,
  readback-verifies, and the user (or the approved auto-mode the user
  explicitly enabled) submits. Every auto-mode is opt-in per user,
  stated in plain language.
- Degradation is honest: if the user's browser is closed, the product
  says what is waiting and what it needs. No silent queue rot.
- Fallback order per ATS is written down: extension first, direct API
  where proven and allowed, server browser never by default. The
  fallback table lives in docs/architecture/apply-paths.md and every PR
  touching apply updates it.

6.3 THE COST MODEL (required artifacts, real numbers before pricing)

Cost per submitted application =
  LLM tokens (question mapping + tailoring + answers)
+ channel cost (messaging provider per-user costs, e.g. the managed
  iMessage line - REPORTED ~$90/month at the Light tier, scaling with
  daily contacts)
+ infra per application (extension path: ~0 server; API path: ~0;
  server-browser path: measured vendor cost)
+ support and failure amortization (failed applications still cost
  tokens and time; include them)

Required table, computed from real vendor pricing with every assumption
written next to the number, at 100 / 1,000 / 10,000 / 100,000 users,
per architecture. It lives in docs/cost-model.md and is re-run monthly.

Margin reality check (worked example from the teardown): if we charge
$29/month and a heavy user costs us $0.30 per application on 300
applications, that is $90 of cost on $29 of revenue. Plan caps and
price are set from measured costs, never copied from Tsenta's page.

Pricing direction (owner-level, from the teardown): do not copy
per-application pricing. Charge for the outcome engine - monthly plan,
sane cap, extras Tsenta lacks (prep, networking, guidance), and a clear
refund rule for failed applications because the category's reputation
(LazyApply 2.1 Trustpilot stars, VERIFIED) demands it.

================================================================
7. EFFICIENCY AT MASS
================================================================

The standing design target is 100,000 users (depth standard, Test C).
For the apply pipeline specifically, state and verify:

- Throughput: applications per worker per hour (server components) and
  applications per user per day (extension path). At 10K users x 10
  applications per day = 100K submissions/day: what degrades first,
  and what the plan is when it does.
- Shared per-company form knowledge: every Greenhouse/Lever/Ashby form
  learned helps every user; the more users, the cheaper and more
  accurate. This is a real scale advantage over any new entrant - and
  Tsenta already has it. Build the form-knowledge store from day one;
  do not bolt it on.
- Rate limits per ATS per day, per IP strategy, stated, with queue
  behavior when hit: queue and slow down, tell the user, or degrade
  gracefully. "It errors" is not an answer.
- LLM token budgets: per application, per prep session, per user per
  day, with caching of repeated question mappings (question mapping by
  meaning, WO-020, exists because exact-wording reuse barely helps -
  build on it).
- Per-user isolation: one user's data, credentials, answers, and
  in-flight work never leak into or block another user's. Tested, not
  assumed.
- Queue and retry behavior idempotent: a retry never double-acts, a
  crash after approval records UNKNOWN instead of retrying or claiming
  success, and a claimed application is never resent.
- Storage growth: retention and pruning policy per data class before
  launch (postings, receipts, proof artifacts, memory).

================================================================
8. SECURITY AND TRUST STANDARD
================================================================

Non-negotiable, ordered by blast radius:

1. CREDENTIALS AND SECRETS. The leaked-token incident is the standing
   warning: tokens were found in public git history. Before anything
   else ships: rotate every leaked credential, make the repo private,
   and add automated secret scanning to CI so it cannot recur. This is
   a liability, not a feature, and it is first.
2. User credentials (employer accounts, ATS logins) are stored
   encrypted, per-user isolated, never in logs, never in prompts to
   any model, and deleted on account deletion. The extension path
   reduces what we must store at all - prefer user-side sessions to
   stored passwords wherever possible, and say so in the privacy
   policy.
3. Resume and profile data: encrypted at rest, deletable on request,
   with a written data-deletion path that actually works end to end
   (test it).
4. Privacy policy and AI disclosure: Tsenta ships an AI disclosure
   page (VERIFIED). We ship ours before beta: what the agent does,
   what it never does (no evasion, no auto-send outreach, no invented
   facts), what data it stores, and how deletion works.
5. Legal/terms exposure is tracked as a first-class risk: employer
   career-page terms, LinkedIn's automation ban (VERIFIED), and EU/UK
   automated-decision attention (BBC, Oct 14 2026, VERIFIED). The
   durable answers are company-portal applying (not logged-in
   platforms), handoff instead of evasion, and volume discipline -
   not cleverness.
6. Support and incident path: a user whose application silently failed
   will message us. Failure queue plus human response path from day
   one. One viral "Trainee ruined my job search" story ends the
   company; slow and correct beats fast and wrong.

================================================================
9. TESTING STANDARD
================================================================

- The 17 real captured application forms in trunk are the regression
  floor for fill. Every apply-path change runs against them, readback-
  verified, green before merge. Acceptance tests are never weakened to
  pass; an impossible acceptance test is escalated, not edited.
- CI runs green on a clean checkout before every push, using the real
  command. Red CI stops all feature work. (REPORTED current state: CI
  is red. Fixing it is gate 2, below.)
- Real-system proof runs: 20+ real applications per launch ATS with
  recorded numbers (3.3). These are scheduled, staffed, and reported
  like launches, not vibes.
- The 300-scenario conversation suite and multi-turn conversation eval
  are merge gates for anything touching conversation or memory.
- Every claim in every PR carries VERIFIED / ASSUMED / NOT_RUN with
  what it was verified against. "Ran against the 17 captured forms in
  CI" is a claim. "Should work" is not.
- The free-tier competitor test (section 11) is re-run quarterly, and
  docs/competitors/tsenta-parity.md is updated with measured numbers.

================================================================
10. LAUNCH GATES AND ORDER OF WORK
================================================================

Do not reorder these. Each gate is a ranked entry in the gap list until
closed, and the owner hears when each closes, with VERIFIED evidence.

GATE 1 - SECURITY (today): rotate leaked tokens, repo private, secret
  scanning in CI.
GATE 2 - CI (days): full suite green on a clean checkout with the real
  command; required before every push.
GATE 3 - COMPETITOR GROUND TRUTH (this week): the 25-application
  free-tier Tsenta test (section 11), results written to
  docs/competitors/mass-applying.md and the parity table (section 4).
GATE 4 - APPLY PROOF (weeks): Greenhouse, then Lever, then Ashby, each
  at 20+ real applications with readback-verified fill, recorded
  success/silent-failure/bot-check rates, and stored employer
  confirmations. Owner gate of 3 manual confirmed submissions per site
  holds throughout.
GATE 5 - TRUST FEATURES (with gate 4): receipts with proof, outcome
  states (SUBMITTED / UNKNOWN / FAILED), human handoff in conversation.
  These make partial coverage shippable honestly.
GATE 6 - THE BEYOND FEATURES (weeks, cheap): outcome engine, memory-
  backed answers, interview prep. This is where a first user sees the
  difference.
GATE 7 - NETWORKING ASSIST: research and drafting, user sends.
GATE 8 - COVERAGE WIDENING: more ATSes by user demand; Workday last
  (multi-month, per-tenant accounts and multi-page flows - the hardest
  ATS, REPORTED).
GATE 9 - PRICING: only after 30 days of measured cost per submitted
  application at real volume, with the margin math done.

Honest timeline (ASSUMED, from the teardown): gates 1-2 are days; gate
4 across three ATSes is weeks; gates 5-6 are weeks; gates 7-8 are
months. If anyone tells you otherwise without real-form numbers, do not
believe them. Two or three builders actually verifying beats five
features in parallel with a red CI.

================================================================
11. THE COMPETITOR GROUND-TRUTH TEST (DO THIS WEEK)
================================================================

Tsenta's free tier is 25 applications, no card (VERIFIED,
tsenta.com/pricing). Use it. Read their terms first; test as a normal
user; do not scrape or attack their systems.

1. Sign up as a test user with a real resume.
2. Watch discovery: how many matches, how fresh, actually early?
   Compare freshness against our harvest on the same employers (this
   feeds the 3.1 BETTER target).
3. Apply to 25 real, varied roles across Workday, Greenhouse, Lever,
   Ashby. Per application record: success or failure, time taken,
   wrong fields, confirmation email arrival, receipt quality.
4. Inspect receipts: do they contain real employer confirmations?
5. Read the open-ended answers: do they sound like the user? Would a
   recruiter notice?
6. Try a role needing sponsorship or an odd question: how does it fail?
7. Check what happens when a verification code is needed and inbox is
   not connected.
8. Test cancel and refund.
9. Write everything into docs/competitors/mass-applying.md with VERIFIED
   labels, and update the parity table (section 4).

Until this is done, every claim about Tsenta's real-world performance
stays REPORTED or ASSUMED - including the flattering ones.

================================================================
12. FIRST ASSIGNMENT (BEFORE NEW BUILDING)
================================================================

For each feature you own or are about to touch:

1. Write the gap list: every real-world step between what is merged
   today and the parity or beyond target in section 3 being proven.
   Rank by launch risk: what kills the launch, what embarrasses at 100
   users, what matters at 10,000. Put it in docs/gaps/<feature>.md.
2. Fill in the parity table (section 4) with the current honest status
   of every cell: VERIFIED / ASSUMED / NOT_RUN, plus the evidence.
3. Write the cost model skeleton (docs/cost-model.md) with the three
   architectures and every assumption labeled, ready for measured
   numbers as the proof runs land.
4. Work the gaps in gate order (section 10). Message the owner when
   each gap closes, with VERIFIED evidence.
```
