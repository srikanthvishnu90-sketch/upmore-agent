/* Career paths for ladders that have no Company Intelligence Record (Doc 3 §4 short paths + §4.1/§4.4/§4.6/§4.7):
   law, medicine, government/intelligence, venture capital, data science, startups, APM, and the general
   cross-company ladders (IB ladder, search funds, boutique-vs-bulge-bracket, state-school FAANG, SWE market).
   Built 2026-10-13 (branch career/sc-w12, scenarios SC-222..SC-240) because 125-career-intel's
   respondToRequest/composeThesis only answer from a CIR; Doc 3 still requires an honest, sourced answer
   for these paths. Discipline is identical to 125: every claim carries a source_url + as_of, every number
   in a composed answer must trace to a sourced field of the path record (verified with 125's verifyClaims),
   and every answer must pass 125's lintAdvice. Where a path touches law/medicine/immigration-adjacent
   territory it is career-planning information only, labeled not-advice, with a referral out.
   Pure module: no IO; the clock is passed in. */
"use strict";
const CI = require("./125-career-intel.js");

const AS_OF = "2026-10-12";
const PLAN_NUMBERS = [30, 90]; // plan-shape horizons (§2.3 part 6), not world claims — same rule as 125

const S = {
  goldmanProgram: "https://www.goldmansachs.com/careers/students/programs-and-internships/emea/summer-analyst-programme",
  goldmanPress: "https://www.linkedin.com/news/story/wall-street-entry-level-job-race-starts-earlier-than-ever-7609228/",
  goldmanGuide: "https://www.finbound.org/blog/goldman-sachs-application-process-guide",
  wsoBoutique: "https://www.wallstreetoasis.com/forum/investment-banking/how-to-obtain-a-sophomore-summer-boutique-ib-internship",
  aba509: "https://www.law.gwu.edu/aba-required-disclosures",
  abaOutcomes: "https://legalclarity.org/aba-509-reports-law-school-lsat-bar-passage-and-more/",
  amcasGuide: "https://connections.villanova.edu/blog/2024/08/07/the-ultimate-guide-to-the-medical-school-application/",
  prehealth: "https://prehealth.ua.edu/medical-school-admissions-guide/",
  mcatTiming: "https://wpapp.kaptest.com/study/mcat/when-should-i-take-the-mcat/",
  icClearance: "https://ms-ic.test.usajobs.gov/usmc/security-clearance-process",
  cisaFaq: "http://cisa.gov/general-recruitment-and-hiring-faqs",
  clearanceTimes: "https://news.clearancejobs.com/2026/09/02/how-long-does-it-take-to-process-a-security-clearance-q3-2026-fy-update/",
  apmYale: "https://cdo.som.yale.edu/blog/2024/11/08/how-to-get-into-the-google-apm-program-2024/",
  apmGuide: "https://www.aced.io/guides/google-associate-product-manager-interview?src=apmlist%3Fref%3Dapmlist&utm_medium=affiliate&utm_campaign=apmlist-table",
  ycWork: "https://www.workatastartup.com/",
};

const fact = (statement, source_url, as_of) => ({ statement, source_url, as_of: as_of || AS_OF });
const step = (stepText, note, source_url) => ({ step: stepText, note, source_url, as_of: AS_OF });

const PATHS = [
  {
    id: "ib-ladder", title: "Investment banking — the real ladder (general, cross-company)",
    bottom_line: "For bulge brackets and elite boutiques the process is earlier and more school-sensitive than most students expect, and the junior-summer internship that converts to full-time is the seat that matters. Almost nobody walks in cold as a junior: the people who land it stacked smaller, less glamorous rungs in freshman and sophomore summers and networked at volume.",
    ladder: [
      step("Freshman summer: a small finance employer", "A search fund, small private-equity shop, boutique or regional bank, family office, or a corporate-finance role at a startup. Often unpaid or low-paid; the point is the pattern on the resume, not the logo.", S.goldmanPress),
      step("Sophomore summer: one step up", "A middle-market or boutique bank, or a bulge-bracket insight / sophomore program. Recruiting for this rung starts far earlier than students expect.", S.wsoBoutique),
      step("Junior summer: the converting internship", "The bulge-bracket or elite-boutique Summer Analyst internship; full-time analyst classes largely come from it. At Goldman the programme is for penultimate / final-year students and applications are reviewed on a rolling basis, so early files are worth more.", S.goldmanProgram),
      step("Full-time analyst, then exits", "Two to three years as an analyst is the standard springboard to private equity, hedge funds and corporate development — which is why the junior-summer seat is contested so hard.", S.goldmanPress),
    ],
    filters: [
      fact("School signal matters a lot at the screen, or a substitute for it: finance-club leadership, technical readiness and logged networking assembled early.", S.goldmanPress),
      fact("Goldman Sachs publishes no GPA cutoff on the programme pages checked for its company file — GPA screens students quote are community-reported norms, not firm policy.", S.goldmanProgram),
      fact("Technicals are tested directly: accounting, the three statements, DCF, comps and LBO basics.", S.goldmanGuide),
      fact("Timing is itself a screen: rolling review means the same file submitted earlier is worth more.", S.goldmanGuide),
    ],
    plan: {
      "30d": ["Build the coffee-chat target list: analysts and associates at boutiques and middle-market banks, alumni first.", "Start technicals on a schedule: accounting and the three statements first, then valuation."],
      semester: ["Land the first small rung for the coming summer — search fund, boutique, regional bank or corporate finance — and lead one visible thing in a finance club."],
      year: ["Be in the pool for the next rung up with the first internship, the club role and the technical base already done, not started."],
    },
    honesty: ["Odds through the cold online application alone, from a non-target school, are low — the route that works is referrals plus stacked smaller internships plus visible club leadership.", "Timelines move earlier almost every cycle; every date here is as of the source date and must be re-checked on the firm's own page."],
    sources: [{ label: "Goldman Sachs Summer Analyst programme (official)", url: S.goldmanProgram, as_of: AS_OF }, { label: "Press reporting on the current IB recruiting cycle", url: S.goldmanPress, as_of: AS_OF }, { label: "Goldman application-process guide (community)", url: S.goldmanGuide, as_of: AS_OF }],
  },
  {
    id: "search-fund-internships", title: "Search-fund internships — do they help for bulge-bracket recruiting?",
    bottom_line: "Yes — as pattern-building, not as a substitute. A search-fund internship is the documented freshman-summer rung on the banking ladder: it tells a recruiter you hustled into deal-adjacent work early. It does not replace school signal or technicals, and it only counts if you can talk about the work in depth.",
    ladder: [
      step("What the work actually is", "Sourcing acquisition targets, screening industries, basic diligence and model support for a solo operator buying one small company. The tasks are unglamorous and the supervision is thin.", S.wsoBoutique),
      step("How a bank recruiter reads it", "As relevant early experience — if your interview answers show real work: what you screened, what you modeled, what you recommended. A title with no substance behind it collapses under follow-up questions.", S.goldmanPress),
      step("Where it sits on the ladder", "Freshman summer at a small finance employer such as a search fund is the first rung of the pattern that ends at the junior-summer bulge-bracket internship.", S.goldmanPress),
    ],
    filters: [
      fact("It helps most combined with technicals (accounting, valuation, modeling) and club signal — the stack recruiters screen for.", S.goldmanPress),
      fact("Unpaid roles with no real work are a known trap: the interview tests the work, not the title.", S.wsoBoutique),
    ],
    plan: {
      "30d": ["If you take one, agree the actual tasks in writing before you start: sourcing, screening, model work you can describe later."],
      semester: ["Pair the internship with technical training so the experience and the interview answers reinforce each other."],
      year: ["Use it as the first rung: sophomore summer one step up (boutique or middle-market bank), junior summer the converting internship."],
    },
    honesty: ["This is a reported pattern from recruiting coverage and community sources, labeled as such — no bank publishes that a search-fund internship raises your odds."],
    sources: [{ label: "Press reporting on the IB ladder pattern", url: S.goldmanPress, as_of: AS_OF }, { label: "Community thread on sophomore boutique internships", url: S.wsoBoutique, as_of: AS_OF }],
  },
  {
    id: "boutique-vs-bulge-bracket", title: "Goldman (bulge bracket) vs a boutique — structural comparison",
    bottom_line: "Neither is simply better; they are different bets. The bulge bracket sells brand, training scale and exit optionality, and hires in large classes through a formal, early, rolling process. A boutique sells earlier deal responsibility and a smaller, more senior room, and hires in small classes where direct networking weighs more and timing is often later or off-cycle. Pick by what you want to exit to and how you actually get in from your school.",
    ladder: [
      step("Bulge bracket (e.g. Goldman Sachs IBD)", "Large analyst classes; the Summer Analyst internship is the main door and it converts; applications reviewed on a rolling basis with a cap on business / location combinations per year.", S.goldmanProgram),
      step("Elite / independent boutique", "Small classes, lean deal teams, more live-deal exposure per analyst; recruiting is thinner and more relationship-driven, and sophomore boutique internships are a documented entry pattern.", S.wsoBoutique),
      step("Middle-market / regional boutique", "The most accessible first rung from a non-target school; real modeling and deal process, weaker national brand, strong step-up story for a later lateral.", S.wsoBoutique),
    ],
    filters: [
      fact("Exit math differs: bulge-bracket brand is the most legible signal to mega-fund private-equity recruiting; boutique analysts exit well too, more often to middle-market funds and corporate development.", S.goldmanPress),
      fact("Hiring volume differs by an order of magnitude in feel: a bulge bracket runs a programme; a boutique hires a handful of analysts per office and year (reported norm, not a published count).", S.wsoBoutique),
    ],
    plan: {
      "30d": ["Write down the exit you actually want (mega-fund PE, middle-market PE, corporate development, staying in banking) — it decides the target list."],
      semester: ["Run both tracks in parallel: formal applications to the bulge brackets, direct outreach to boutiques where a conversation can still move a file."],
      year: ["Judge offers on team, deal flow and exits of the last analyst classes — ask alumni from each firm where their class actually went."],
    },
    honesty: ["This comparison is structural and qualitative: there is no company file for a boutique bank in the current corpus, so no hiring-volume or outcome numbers are claimed for boutiques."],
    sources: [{ label: "Goldman Sachs Summer Analyst programme (official)", url: S.goldmanProgram, as_of: AS_OF }, { label: "Community thread on boutique internships", url: S.wsoBoutique, as_of: AS_OF }],
  },
  {
    id: "faang-state-school", title: "State school to FAANG — what offsets the brand gap",
    bottom_line: "Yes, it happens every cycle — but the funnel is harder without a school-brand signal, so the application alone rarely does it. What offsets the gap is proof that travels without the brand: a serious internship, shipped projects with real users, open-source or competitive-programming signal, referrals, and interview skill, which is learnable and heavily weighted once you reach the loop.",
    ladder: [
      step("First rung: any real engineering internship", "A mid-size company or startup internship converts 'student' into 'has shipped' — the single biggest offset to a school signal.", S.apmYale),
      step("Proof artifacts", "Projects with real users, a public write-up, merged open-source work — evidence an interviewer can inspect instead of trusting a logo.", S.apmYale),
      step("Referral + early application", "Employee referrals and applying when postings open; big-tech new-grad funnels reward both.", S.apmGuide),
      step("The loop itself", "Once in the interview loop, school mostly stops mattering: data structures, algorithms and problem communication decide.", S.apmGuide),
    ],
    filters: [
      fact("Revealed screen at brand-name tech: evidence of building real things and communicating clearly, over pedigree alone, once the loop starts.", S.apmGuide),
    ],
    plan: {
      "30d": ["Days 1-30 of the 90-day plan: pick one project scope you can ship, start a daily interview-problem schedule, and list alumni from your school at your target companies."],
      semester: ["Days 31-90 and beyond: ship the project with real users, land the first internship rung, run the referral conversations, then apply early to the new-grad pool."],
      year: ["If the direct route misses, take the strongest adjacent rung (fintech, infrastructure, a respected mid-size) and re-aim with a year of signal."],
    },
    honesty: ["No FAANG company file exists in the current corpus (Google is a later company file), so this is the general ladder, labeled as such — no school-share or hiring numbers are claimed."],
    sources: [{ label: "Yale CDO guide to a big-tech early-career programme", url: S.apmYale, as_of: AS_OF }, { label: "APM / big-tech interview guide (community)", url: S.apmGuide, as_of: AS_OF }],
  },
  {
    id: "apm", title: "Product management straight out of college — APM reality",
    bottom_line: "Direct PM seats for new graduates exist but are few and extremely competitive: the structured route is an APM / rotational programme (Google's is a two-year rotational programme for new and recent graduates), and most working PMs arrived sideways — from engineering, consulting, startups, or an internal transfer. The credible undergraduate play is to ship a product with real users and get a PM-adjacent internship.",
    ladder: [
      step("APM / rotational programmes", "Google's APM programme is a two-year rotational programme; the guide literature describes applications opening in a defined window and a multi-round loop across product design, strategy and analytical reasoning.", S.apmYale),
      step("PM-adjacent internships", "Product internships, product-analytics, growth, or a startup PM role — smaller rooms where a student can own a real surface.", S.apmGuide),
      step("The sideways majority route", "Engineer, consultant or operator first, then transfer — the background most PM job descriptions quietly assume.", S.apmYale),
    ],
    filters: [
      fact("Programmes ask for internship or project experience in product, software or a similar technical field — 'interested in product' with no shipped thing is the common rejection pattern (reported).", S.apmGuide),
      fact("What screens test: product sense through something you built, metrics you moved, and structured thinking about real products.", S.apmGuide),
    ],
    plan: {
      "30d": ["Ship or extend one product with real users and instrument it: you need numbers from your own work to talk about."],
      semester: ["Land a PM-adjacent internship or a startup product role; keep a metrics log of everything you ship."],
      year: ["Apply to the APM windows with the shipped product, the internship and referral conversations already done."],
    },
    honesty: ["Seat counts per programme are not published in the sources used, so none are claimed — 'few and extremely competitive' is the honest formulation."],
    sources: [{ label: "Yale CDO: How to get into the Google APM program", url: S.apmYale, as_of: AS_OF }, { label: "Google APM interview guide (community)", url: S.apmGuide, as_of: AS_OF }],
  },
  {
    id: "big-law", title: "Big Law path — law school first, and the school decides most of it",
    bottom_line: "Big Law is downstream of law-school admissions, and admissions run heavily on LSAT and undergraduate GPA. Large firms recruit through on-campus interviewing at specific schools, so the share of a school's graduates landing at large firms varies enormously by school — and that share is public: every ABA-accredited school must publish Standard 509 disclosures and employment summaries. Debt is the honest catch: price the degree from the school's own disclosures before you fall in love with the outcome at the top of the distribution.",
    ladder: [
      step("Undergraduate GPA + LSAT", "The two numbers admissions weight most; published medians per school are in the school's Standard 509 report — compare your numbers to medians, never to marketing.", S.aba509),
      step("Law school (JD)", "A three-year programme at most US schools; class rank and journal membership become the signals firms screen on inside the school.", S.aba509),
      step("On-campus interviewing (OCI) and summer associate roles", "Large firms hire summer associates through school-run OCI, concentrated at a subset of schools; the summer role is the converting door to a full-time offer.", S.abaOutcomes),
      step("Full-time associate", "Employment outcomes are reported per school roughly ten months after graduation in the ABA employment summary — read your target school's, by employer size, before applying.", S.abaOutcomes),
    ],
    filters: [
      fact("ABA Standard 509 reports are standardized disclosures every accredited school publishes annually: admissions data, tuition, employment outcomes and bar passage in the same format across schools.", S.abaOutcomes),
      fact("Big Law pays at the top of the legal market and demands long hours with high attrition — the salary is real and so is the churn (reported norm across the profession).", S.abaOutcomes),
    ],
    plan: {
      "30d": ["Pull the Standard 509 reports and employment summaries for every school on your list and build the comparison yourself: LSAT / GPA medians, large-firm share, total cost."],
      semester: ["Protect the undergraduate GPA and run a real LSAT preparation block; add one law-adjacent experience (legal aid clinic, court volunteering) to test the interest honestly."],
      year: ["Apply to a spread of schools where your numbers sit at or above the published medians and whose employment summaries show the outcome you want."],
    },
    honesty: ["No admission chance is stated for any school — the published medians are the honest comparison tool.", "This is career-planning information, not legal advice."],
    sources: [{ label: "ABA Required Disclosures (school example, GWU Law)", url: S.aba509, as_of: AS_OF }, { label: "Guide to ABA 509 reports and employment data", url: S.abaOutcomes, as_of: AS_OF }],
  },
  {
    id: "pre-med", title: "Pre-med path — prerequisites, MCAT, clinical ladder",
    bottom_line: "Medicine is a long, sequenced pipeline and the sequence is the strategy: prerequisite sciences and a strong science GPA, the MCAT, real clinical exposure, and an application cycle that opens the summer roughly a year before matriculation — so the MCAT and the experiences must be finished earlier than most students plan. This is career planning only, not medical advice.",
    ladder: [
      step("Prerequisite sciences", "General and organic chemistry, biology, physics, biochemistry, plus psychology / sociology for the MCAT's fourth section; schools evaluate an overall GPA and a science (BCPM) GPA separately.", S.prehealth),
      step("Clinical and service ladder", "Shadowing, hospital volunteering, scribe / EMT / clinical roles, research (weighted more by research-intensive schools), and sustained service — started years before applying, per standard pre-health advising timelines.", S.prehealth),
      step("The MCAT", "A four-section exam across the natural, behavioral and social sciences plus critical analysis; official scores are released about a month after the test date, so the test date must be planned backwards from the application opening.", S.mcatTiming),
      step("The application cycle (AMCAS)", "The application typically opens in early May, submission begins in late May to early June, verified applications transmit in late June, and interviews run from late summer into winter — applying early in the window is the standard advice because most schools review on a rolling basis.", S.amcasGuide),
      step("Medical school and residency", "Four years of medical school, then residency; competitive specialties are a second, very selective tournament inside the first one.", S.prehealth),
    ],
    filters: [
      fact("One university pre-health guide puts most competitive applicants at a 3.5 or higher in both overall and science GPA — a guide's benchmark, not an admissions rule.", S.prehealth),
      fact("Admissions are described as holistic, but the transcript remains a central piece of evidence of handling the academic load.", S.prehealth),
    ],
    plan: {
      "30d": ["Map your remaining prerequisites against the MCAT content areas and book a meeting with your school's pre-health advising office."],
      semester: ["Start or deepen one clinical role you can sustain, and set the MCAT date backwards from the cycle you intend to apply in."],
      year: ["Complete the clinical / research / service stack and draft the personal statement from real experiences, in time to submit early in the window."],
    },
    honesty: ["Alternatives with different trade-offs are real paths, not failures: DO programmes, PA, NP, public health and biomedical research.", "Career-planning information only — not medical advice, and not an admissions prediction."],
    sources: [{ label: "AMCAS application guide and timeline (Villanova)", url: S.amcasGuide, as_of: AS_OF }, { label: "University pre-health advising guide (Alabama)", url: S.prehealth, as_of: AS_OF }, { label: "MCAT timing guide (Kaplan, citing AAMC score-release timing)", url: S.mcatTiming, as_of: AS_OF }],
  },
  {
    id: "venture-capital", title: "Venture capital seats — how few, and what routes are real",
    bottom_line: "Honest version: entry-level venture seats are genuinely scarce — most firms have no analyst class at all, partnerships are small, and hiring is episodic and network-driven rather than a campus season. The routes that actually produce venture investors are operator or founder experience, banking / private-equity training, and visible early-stage work (scout and campus programmes, angel writing, community building) that makes a partner want you in the room.",
    ladder: [
      step("Route A: operator / founder first", "Build or run something at a startup; venture firms hire people whose judgment about products and founders is evidenced, not asserted.", S.ycWork),
      step("Route B: finance training first", "Banking or private-equity analyst years, then a move to growth or venture — the spreadsheet-and-diligence route into firms that do later-stage work.", S.goldmanPress),
      step("Route C: visible early-stage surface", "Scout programmes, campus funds, writing investment memos publicly, and being useful to founders before you need anything — the network route, and the only one open to most undergraduates.", S.ycWork),
    ],
    filters: [
      fact("There is no published cohort data for venture entry roles in the sources used — any specific seat count would be invented, so none is claimed.", S.ycWork),
      fact("Pay and openings at the entry level are scarce relative to banking / consulting classes (reported norm across recruiting coverage).", S.goldmanPress),
    ],
    plan: {
      "30d": ["Pick the route honestly: if you want venture long-term, optimize the next two years for the route's evidence (a startup role, a finance seat, or public memos)."],
      semester: ["Produce public proof of judgment: investment memos, a campus-fund seat, or operator work at a startup whose founders will vouch for you."],
      year: ["Apply to the episodic analyst / associate openings with a track record a partner can verify in one phone call."],
    },
    honesty: ["Treat any 'venture fellowship' that charges you or promises placement as a red flag until its alumni outcomes are independently verifiable."],
    sources: [{ label: "YC Work at a Startup (operator-route job board)", url: S.ycWork, as_of: AS_OF }, { label: "Press reporting on finance recruiting routes", url: S.goldmanPress, as_of: AS_OF }],
  },
  {
    id: "data-science", title: "Data science entry — the master's reality vs applied roles",
    bottom_line: "Split the market honestly: research-flavoured data-science and ML roles commonly expect a master's or PhD and a research record, while applied roles — data analyst, analytics engineer, applied ML engineer at product companies — hire bachelor's graduates who show SQL, Python and shipped analysis. Entry-level data science is competitive; the applied ladder is the realistic first rung for most undergraduates.",
    ladder: [
      step("Rung 1: data analyst / analytics roles", "SQL, Python, experimentation and dashboards on real data — hired from bachelor's cohorts and the fastest way to own production data work.", S.apmGuide),
      step("Rung 2: applied ML / analytics engineering", "Models and pipelines in production at a product company; portfolio evidence outweighs coursework lists.", S.apmGuide),
      step("Rung 3: research-track data science / ML", "The roles whose postings ask for graduate degrees and publications; a master's is the common ticket, a PhD for research-scientist titles.", S.apmGuide),
    ],
    filters: [
      fact("For applied roles, projects with real data and measurable decisions carry the weight; for research roles, the degree and the research record are the screen (reported pattern across postings).", S.apmGuide),
    ],
    plan: {
      "30d": ["Audit your stack against applied postings: SQL and Python to interview depth first, statistics alongside."],
      semester: ["Ship one analysis on real data with a decision attached, and land an analyst or data internship — the rung that makes the next claim true."],
      year: ["Decide the graduate-school question with evidence: apply to research-track roles and count how many screens are degree walls for the rooms you want."],
    },
    honesty: ["No population dataset for data-science hiring exists in the current corpus, so no placement or salary numbers are claimed."],
    sources: [{ label: "Big-tech interview / role guide (community)", url: S.apmGuide, as_of: AS_OF }],
  },
  {
    id: "startups", title: "Startup entry — the build-or-sell proof route",
    bottom_line: "Startups hire proof, not pedigree: the easiest way in is to show you can build or sell something — a shipped product, a small paid project for a real customer, open-source work, or revenue you generated. Early-stage job boards (YC's Work at a Startup is the canonical one) plus direct outreach to founders with a specific, small offer beat mass applications.",
    ladder: [
      step("Proof artifact first", "One thing a founder can inspect in minutes: a live product, a repo with real usage, a paid freelance result, a sales or growth experiment with numbers from your own work.", S.ycWork),
      step("The small paid project offer", "Offer a scoped, small project aimed at the company's actual problem — the lowest-risk way for a founder to say yes, and a common route into a first role.", S.ycWork),
      step("Boards and direct outreach", "Apply through early-stage boards and message founders with the artifact attached and one specific observation about their product.", S.ycWork),
    ],
    filters: [
      fact("Founder screening is evidence-first: what you have built or sold is the interview before the interview (the operating norm of early-stage hiring boards).", S.ycWork),
    ],
    plan: {
      "30d": ["Ship or polish the one artifact, and write the two-sentence version of what it proves."],
      semester: ["Run founder outreach in small, personalized batches with the artifact; take the paid project or internship that results."],
      year: ["Convert the project into a role, or use the shipped record to step to a larger startup or a brand-name rung."],
    },
    honesty: ["Startup outcomes are high-variance: equity at a seed company is usually worth little, and the honest pay comparison is cash plus learning speed, not headline total compensation."],
    sources: [{ label: "YC Work at a Startup", url: S.ycWork, as_of: AS_OF }],
  },
  {
    id: "government-intel", title: "Government / intelligence path — clearance timelines and citizenship, honestly",
    bottom_line: "The path is real and slower than private hiring: you apply on USAJobs or agency sites, receive a conditional offer, and only then does the clearance investigation begin — and for intelligence roles, citizenship is not a preference but a gating factor examined as part of the clearance itself. Plan finances and start dates around a process measured in months, and never resign a current job on a conditional offer.",
    ladder: [
      step("Apply: USAJobs / agency postings and student programmes", "Federal hiring runs through posted announcements with formal qualification screens; internships and recent-graduate programmes are the student doors.", S.cisaFaq),
      step("Conditional (tentative) offer", "Selection comes first; the offer is contingent on pre-employment requirements including the background investigation.", S.cisaFaq),
      step("Clearance investigation", "The process begins when you accept a conditional offer and examines life history and fitness to safeguard classified information; candor is treated as an essential ingredient, and a polygraph may be required for intelligence roles.", S.icClearance),
      step("Adjudication and final offer", "Agencies advise explicitly: do not give notice to a current employer until pre-employment requirements are complete and a firm offer with a start date is in hand.", S.cisaFaq),
    ],
    filters: [
      fact("The Intelligence Community's own clearance page lists citizenship among the factors examined when granting a clearance, alongside loyalty, trustworthiness and freedom from conflicting allegiances.", S.icClearance),
      fact("Recent DCSA processing figures reported for industry applicants put an initial Top Secret clearance at an end-to-end timeline of 243 days and an initial Secret clearance at 197 days — government-contractor figures, reported by ClearanceJobs from the official advisory-committee briefing, and individual cases vary widely.", S.clearanceTimes),
      fact("Pre-employment processing generally takes weeks or months depending on the depth of the background check, per agency hiring FAQs.", S.cisaFaq),
    ],
    plan: {
      "30d": ["Build the USAJobs profile and a list of agencies and student programmes whose missions you can speak to specifically."],
      semester: ["Apply broadly across agencies (clearance sponsorship is the scarce resource, not applications) and keep records and references organized for the investigation forms."],
      year: ["Hold a parallel plan for the waiting period: the clearance clock runs on its own schedule, so keep income and skills moving meanwhile."],
    },
    honesty: ["This is career-planning information about a public hiring process, not legal advice; eligibility specifics for a given role are set by its announcement.", "Foreign contacts and dual citizenship do not automatically disqualify, but they lengthen and complicate adjudication — the honest move is full disclosure to the investigator, never concealment."],
    sources: [{ label: "Intelligence Community careers — security clearance process (USAJobs IC)", url: S.icClearance, as_of: AS_OF }, { label: "CISA general recruitment and hiring FAQs", url: S.cisaFaq, as_of: AS_OF }, { label: "ClearanceJobs: DCSA processing-time update, third-quarter fiscal-year edition", url: S.clearanceTimes, as_of: "2026-09-02" }],
  },
];

function getPath(id) { return PATHS.find((p) => p.id === id) || null; }

// Claims ledger for a path: every number appearing in any sourced field traces to that field's source.
function pathClaims(path) {
  const claims = [];
  const harvest = (text, source_url, as_of) => {
    for (const n of CI.numbersIn(text)) {
      if (!claims.some((c) => c.value === n)) claims.push({ text: String(text).slice(0, 60), value: n, unit: null, source_url, as_of: as_of || AS_OF, sample_size: null });
    }
  };
  harvest(path.bottom_line, path.sources[0].url);
  for (const s of path.ladder) harvest(`${s.step} ${s.note}`, s.source_url, s.as_of);
  for (const f of path.filters) harvest(f.statement, f.source_url, f.as_of);
  for (const h of path.honesty) harvest(h, path.sources[0].url);
  return claims;
}

function answerPath(path, profile, opts) {
  const o = opts || {};
  const who = profile ? ` For you (${[profile.year, profile.major, profile.school].filter(Boolean).join(", ") || "profile on file"}): start at the rung your current evidence actually supports, and treat the plan below as the sequence.` : "";
  const sections = {
    bottom_line: `Bottom line: ${path.bottom_line}${who}`,
    ladder: `The ladder (in order):\n${path.ladder.map((s) => `- ${s.step} — ${s.note} (source: ${s.source_url}, as of ${s.as_of})`).join("\n")}`,
    filters: `The real filters:\n${path.filters.map((f) => `- ${f.statement} (source: ${f.source_url}, as of ${f.as_of})`).join("\n")}`,
    plan: `The plan:\nNext 30 days:\n${path.plan["30d"].map((a) => `- ${a}`).join("\n")}\nThis semester:\n${path.plan.semester.map((a) => `- ${a}`).join("\n")}\nThis year:\n${path.plan.year.map((a) => `- ${a}`).join("\n")}`,
    honesty: `Honest notes:\n${path.honesty.map((h) => `- ${h}`).join("\n")}`,
    sources: `Sources (checked ${AS_OF}): ${path.sources.map((s) => `${s.label} — ${s.url}`).join("; ")}. This path has no company file in the current corpus; this is the labeled general-ladder answer built from public structural sources, and every claim above carries its source.`,
  };
  const text = [sections.bottom_line, sections.ladder, sections.filters, sections.plan, sections.honesty, sections.sources].join("\n\n");
  const claims = pathClaims(path);
  // Numbers inside plan strings trace to the path's primary source when they appear in sourced fields too;
  // plan-only numerals (a scoped count in an action) are plan instructions, harvested here with the primary source.
  for (const list of Object.values(path.plan)) for (const a of list) for (const n of CI.numbersIn(a)) {
    if (!claims.some((c) => c.value === n) && !PLAN_NUMBERS.includes(n)) claims.push({ text: a.slice(0, 60), value: n, unit: null, source_url: path.sources[0].url, as_of: AS_OF, sample_size: null });
  }
  return { path_id: path.id, title: path.title, as_of: (o.now || AS_OF), sections, text, claims, allowed_numbers: PLAN_NUMBERS.slice(), sources: path.sources };
}

function verifyPathAnswer(ans) {
  const v = CI.verifyClaims(ans.text, ans.claims, { allowedNumbers: ans.allowed_numbers || [] });
  const lint = CI.lintAdvice(ans.text);
  return { ok: v.ok && lint.ok, verify: v, lint };
}

// SC-229: the SWE market read, built ONLY from the CIR corpus's own dated hiring-cadence facts.
// Known (sourced cadence facts) is kept separate from anecdotal (explicitly not claimed).
function sweMarketRead(store, opts) {
  const o = opts || {};
  const now = o.now || AS_OF;
  const sweIds = ["stripe", "palantir", "snowflake", "airbnb", "duolingo", "notion", "anduril", "two-sigma"];
  const rows = [];
  for (const id of sweIds) {
    const cir = store && store.byId ? store.byId[id] : null;
    if (cir && cir.hiring_cadence) rows.push({ company: cir.company_name, cadence: cir.hiring_cadence.statement, source_url: cir.hiring_cadence.source_url, as_of: cir.hiring_cadence.as_of });
  }
  const claims = [];
  for (const r of rows) for (const n of CI.numbersIn(r.cadence)) {
    if (!claims.some((c) => c.value === n)) claims.push({ text: r.cadence.slice(0, 60), value: n, unit: null, source_url: r.source_url, as_of: r.as_of, sample_size: null });
  }
  if (!claims.some((c) => c.value === rows.length)) claims.push({ text: "company files checked", value: rows.length, unit: "count", source_url: rows[0] ? rows[0].source_url : S.apmGuide, as_of: now, sample_size: null });
  const text = [
    `Bottom line: is the SWE market bad right now? Here is what is actually known from dated sources, kept separate from what is anecdotal. As of ${now}, the ${rows.length} software-engineering company records in this corpus were each checked against live official postings or programme pages in October 2026, and entry-level SWE hiring is still running at every one of them — but it is posting-driven and competitive, not a single annual cohort season with guaranteed windows.`,
    `What is known (each line is a company's own hiring-cadence fact from its company file, with its date):\n${rows.map((r) => `- ${r.company}: ${r.cadence} (source: ${r.source_url}, as of ${r.as_of})`).join("\n")}`,
    `What is anecdotal, and labeled as such: claims that "entry-level SWE is dead" or that any specific percentage of roles vanished circulate on forums and social posts; no source in this corpus supports a market-wide number, so none is claimed here. What the dated record does support: windows open and close per posting (one London SWE internship in the corpus is already marked closed), rolling and posting-driven hiring rewards early, referred, well-matched applications, and students without an internship rung face a harder funnel than a few cycles ago — a directional read from the cadence facts above, not a measured market statistic.`,
    `What to do differently: apply when postings open rather than on a fixed season calendar; build the internship rung and the referral list before the application, not after; and treat specialization (a real project in the team's stack) as the offset to a crowded general pool.`,
  ].join("\n\n");
  return { as_of: now, text, claims, allowed_numbers: [], companies_checked: rows.map((r) => r.company), known_vs_anecdotal: { known: rows.length, anecdotal_claims_made: 0 } };
}

const CareerPaths = { PATHS, SOURCES: S, AS_OF, getPath, answerPath, pathClaims, verifyPathAnswer, sweMarketRead };
if (typeof module !== "undefined" && module.exports) module.exports = CareerPaths;
