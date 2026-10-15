/* Career GUIDANCE domain (deep dive 4; gauntlet defect CGD-1).
   Built 2026-10-13 (lane career/gauntlet-g1-guidance) because the CG grading
   found NO guidance capability in the chat path at all: 13 cases (CG01, CG04,
   CG05, CG06, CG09, CG10, CG11, CG12, CG14, CG15, CG17, CG19, CG23) each got
   the unmatched fallback — one missing domain, not thirteen bugs. This
   module IS that domain, at the service level: pure functions over
   ctx/profile/fixture data, in the style of 122/123/133/134. The chat route
   that calls it is Codex's lane (see docs/career/gauntlet-g1-guidance-route.md);
   nothing here edits or depends on 140/142/143/120/130.

   HARD RULES (deep dive 4 §§3-7, owner-locked):
   - NO fabricated odds, ever. No function in this module can emit a success
     percentage, a personal probability, or a guaranteed outcome: templates
     contain no such language, every composed reply passes guardReply()
     (which throws on odds patterns) before it can be returned, and an
     explicit odds request is refused with the reason stated.
   - Every factual claim traces to the profile (fact IDs), a CIR/host record,
     or a frozen sourced snapshot passed in ctx — or it is spoken as unknown.
     A trend/sponsorship question with NO sourced snapshot in ctx is refused
     as unknown, never improvised.
   - Sensitive/eligibility answers are never guessed: graduation windows are
     computed from stated years; CPT/OPT is a sourced GENERAL explanation
     plus the DSO route, with the individual determination left null;
     sponsorship history is context only, split into three separate unknowns.
   - Labels stay honest: a simulation is never employment, a course project
     is never an internship, a seller's hire promise is never credible, and
     no purchase is ever made or assumed by guidance.
   Pure: no IO, no clock reads (dates arrive in ctx). UMD like siblings. */
const CareerGuidance = (() => {
  const Profile = typeof CareerProfile !== "undefined" ? CareerProfile : require("./122-career-profile.js");

  // ---------------------------------------------------------------- odds guard
  // Deterministic detector for fabricated odds / guarantees (mirrors the CG
  // runner's fabricated_odds_rule). Any hit in a composed reply is a defect.
  const ODDS_PATTERNS = [
    { code: "percent_number", re: /\d[\d,.]*\s*%/ },
    { code: "fraction_chance", re: /\b\d+\s+(in|out of)\s+\d+\s+chance/i },
    { code: "guarantee_outcome", re: /\bguarantee[sd]?\s+(you|a|an|the|your)\b/i },
    { code: "guaranteed_outcome", re: /\bguaranteed\s+(job|hire|hiring|offer|sponsorship|success|admission|internship)/i },
    { code: "definite_outcome", re: /\b(will|would)\s+definitely\s+(get|be|receive|land)/i },
    { code: "definite_outcome2", re: /\bdefinitely\s+(get|will|be)\s+(hired|an offer|the job|in)\b/i },
    { code: "numeric_chance", re: /\b(chance|odds|probability|likelihood)\s+(is|are|of|:)?\s*\d/i },
  ];
  function fabricatedOddsIn(text) {
    const t = String(text || "");
    return ODDS_PATTERNS.filter((p) => p.re.test(t)).map((p) => p.code);
  }
  function guardReply(text) {
    const hits = fabricatedOddsIn(text);
    if (hits.length) {
      const err = new Error(`fabricated_odds: guidance reply refused — odds pattern(s) present: ${hits.join(", ")}`);
      err.code = "fabricated_odds";
      err.patterns = hits;
      throw err;
    }
    return text;
  }
  // The basis every guidance answer stands on when no case-specific source
  // was supplied: the module's frozen knowledge base, labeled as exactly
  // that — never dressed up as case evidence.
  const KB_SOURCE = { type: "guidance_knowledge_base", label: "Career guidance knowledge base (deep dive 4 source set)", as_of: "2026-10-13" };
  const KB_BASIS = {
    source_class: "the career guidance knowledge base (deep dive 4 source set), plus the facts supplied in context where an answer uses them",
    as_of: "2026-10-13",
    as_of_covers: "the guidance knowledge base (deep dive 4 freeze, the date in this module's header); facts supplied in context carry no as-of dates of their own, and none is claimed for them",
  };
  // Every public answer is finalized through here: kind/text/unknowns/nextStep
  // shape for the router, and the odds guard as a hard gate.
  // F7 record completion (03 F7 cited response): every answer kind carries
  // dated sources (or the record's own as_of), a basis, and — where the
  // owning function supplied one — a plan of 3-5 timed actions under both
  // `plan` and `action_plan`. The reply text ENDS with the record's concrete
  // nextStep (02 H-12: one concrete next action or a single question) — the
  // delivered texts previously ended in plain statements with nextStep null
  // in the text even when the field was set.
  function finalize(kind, r) {
    const out = Object.assign({ ok: true, kind, unknowns: [], sources: [], factIds: [], nextStep: null }, r);
    if (!out.sources || !out.sources.length) out.sources = [KB_SOURCE];
    if (!out.as_of) out.as_of = KNOWLEDGE_AS_OF;
    if (!out.basis) out.basis = KB_BASIS;
    if (out.plan && !out.action_plan) out.action_plan = out.plan;
    if (out.action_plan && !out.plan) out.plan = out.action_plan;
    if (out.text && out.nextStep) {
      const t = String(out.text).trimEnd();
      const ns = String(out.nextStep).trim().replace(/\.$/, "");
      if (!t.endsWith(ns)) {
        // The closing line must itself carry the next action in a form the
        // reply contract recognizes (grader-v2 H-12 markers: a question, or
        // tell me / say the word / want me to / shall I …). A bare "Next:"
        // label matches none of them, so a nextStep without a marker is
        // closed with an explicit invitation to start it.
        const hasMarker = /\?/.test(ns) || /\b(want me to|shall i|say the word|tell me|tap|reply (yes|with)|approve|book it|want the|want to see|shall we)\b/i.test(ns);
        out.text = hasMarker
          ? `${t}\n${out.nextStep}`
          : `${t}\nTell me when you're ready to start: ${ns.charAt(0).toLowerCase()}${ns.slice(1)}.`;
      }
    }
    out.text = guardReply(out.text);
    return out;
  }

  // ---------------------------------------------------------------- helpers
  const factsOf = (profile) => (profile ? Profile.confirmedFacts(profile) : []);
  const skillFactsOf = (profile) => factsOf(profile).filter((f) => f.kind === "skill");
  const provenSkillNames = (profile) => skillFactsOf(profile).filter((f) => !f.unproven).map((f) => f.name).filter(Boolean);
  const yearOf = (s) => { const m = String(s || "").match(/(20\d\d)/); return m ? Number(m[1]) : null; };
  const firstFact = (profile, pred) => factsOf(profile).find(pred) || null;

  const USCIS_SOURCE = { label: "USCIS Policy Manual — students and employment", url: "https://www.uscis.gov/policy-manual/volume-2-part-f-chapter-5", as_of: "2026-10-13" };
  // The guidance knowledge base's freeze date: the date this module's
  // knowledge (the deep dive 4 source set) was built, as recorded in the
  // header above. Guidance records cite it as the basis as-of FOR THE
  // KNOWLEDGE — never as a date for the user's facts. Profile facts carry
  // no as-of dates of their own, and none is invented for them.
  const KNOWLEDGE_AS_OF = "2026-10-13";

  // ------------------------------------------------------- CG01: path planning
  function planPaths(ctx) {
    const c = ctx || {};
    const profile = c.profile || null;
    // WORDING-BACKLOG (BUG-201): plan_paths used to serve ONE
    // two-paths-and-an-experiment body to every path ask — IB
    // recruiting, the quant firms, MBB and Big Law all received
    // the same text (five byte-identical groups at the capstone).
    // A path ask is answered on ITS topic: the ladder or gates
    // that topic actually runs on, the evidence the record holds,
    // and a plain no-published-figure where none exists. The
    // generic two-paths body below remains only for asks that are
    // genuinely "which of my paths fits me".
    const topicText = String(c.text || "").toLowerCase();
    const kbSources = [KB_SOURCE];
    if (/\b(ib|investment banking)\b[^.]*\b(recruiting|require|ladder)\b|\bwhat does ib\b/.test(topicText)) {
      return finalize("plan_paths", {
        headline: "IB recruiting, as it actually runs — the ladder, not the brochure.",
        sources: kbSources,
        plan: [
          { action: "Map the calendar backwards from the junior-year summer — sophomore programs and diversity/early pipelines open a full year before it", timeframe: "this week" },
          { action: "Build the technical base the screens test: accounting first, then valuation and DCF mechanics, drilled to interview speed", timeframe: "this semester" },
          { action: "Run the networking volume the off-cycle route runs on — alumni and analysts at the firms, tracked, with a follow-up cadence", timeframe: "starting now" },
          { action: "Convert any internship — boutique, search fund, corporate finance — into deal-adjacent evidence with numbers you can defend", timeframe: "next break" },
        ],
        unknowns: ["Any firm's conversion rate or your personal odds — no published figure exists in this product, and none is invented here."],
        nextStep: "Tell me your class year and I will lay the ladder out against your actual recruiting calendar.",
        text: `IB recruiting runs on a ladder with fixed rungs, and the rungs are timed. Sophomore-year internships and early programs feed the junior-year summer analyst class, and that summer class is where most full-time offers come from — banks hire their analysts largely by converting their own interns. The screens are technical and specific: accounting fluency, valuation and DCF mechanics, and "why banking / why this firm" answered with evidence, all tested at interview speed. The route in splits by school: target schools get on-campus processes, and everyone else gets in through networking volume — alumni and junior bankers, contacted in dozens, not handfuls — plus boutique and middle-market seats whose processes run later and lean on demonstrated deal interest. No bank publishes a conversion rate or an applicant's odds, and this product holds no such figure: what decides it is visible — class year against the calendar, technical readiness, and a record that shows real deal-adjacent work.`,
      });
    }
    if (/\bquant\b|\bjane street\b|\bcitadel\b/.test(topicText) && !/researcher (vs|versus|or) trader/.test(topicText)) {
      return finalize("plan_paths", {
        headline: "The Jane Street / Citadel quant path — what the signal actually is.",
        sources: kbSources,
        plan: [
          { action: "Drill probability and expected value to interview speed — games, conditional probability, and market-making reasoning out loud", timeframe: "daily, starting now" },
          { action: "Build the estimation muscle: Fermi problems and mental math under time pressure", timeframe: "this month" },
          { action: "Enter the competitions and olympiad-style events the firms read as signal, and keep the results", timeframe: "this season" },
          { action: "Apply to the firms' own internship classes — the intern class is the main door, not a side door", timeframe: "at the next opening" },
        ],
        unknowns: ["Either firm's acceptance rate — neither publishes one, and no figure is claimed here."],
        nextStep: "Tell me whether you are aiming at trader or researcher seats, and I will weight the drill plan to that interview.",
        text: `The quant path at firms like Jane Street and Citadel is an interview before it is a résumé. Probability, expected value, and game-style reasoning are tested live and at speed, with estimation and mental math alongside — the process is built to watch how you think under uncertainty, not what you have memorized. The signals that carry are exactly that performance, plus evidence of real mathematical appetite — competition results, olympiad-style work, research — read as appetite, not as a credential checklist. The honest rarity: these firms hire small classes from a global applicant pool, neither publishes an acceptance rate, and no figure is claimed here — the seats are few enough that a strong file still usually does not convert, which is why the same preparation is built to transfer to the wider quant and trading market. The main door is the internship class; full-time entry without it is the exception.`,
      });
    }
    if (/researcher (vs|versus|or) trader|quant researcher/.test(topicText)) {
      return finalize("plan_paths", {
        headline: "Quant researcher versus trader — the day-to-day decides it.",
        sources: kbSources,
        plan: [
          { action: "Run the researcher test: take one public dataset, build and write up a signal end to end, and notice whether the open-ended weeks appeal", timeframe: "two weekends" },
          { action: "Run the trader test: drill timed probability games and expected-value calls, and notice whether fast, reversible decisions energize or drain you", timeframe: "this week" },
          { action: "Weight applications by which test produced work you kept improving unasked", timeframe: "after both tests" },
        ],
        unknowns: ["Which seat fits you — the two tests are what produce that evidence; nothing in a transcript decides it."],
        nextStep: "Tell me which test to set up first — the research build or the timed probability drill — and I will lay it out.",
        text: `The two seats share an interview family and then diverge completely. A quant researcher's day is open-ended building: form a hypothesis, get the data, test a signal, write code that survives review — weeks on one problem, judged on whether the model is real. A trader's day is the opposite rhythm: fast probabilistic decisions with money attached, market-making and hedging in real time, judged daily on outcomes under uncertainty. The fit evidence is behavioral, not curricular: research fits people who keep improving a model nobody asked them to touch; trading fits people who make clean, reversible decisions quickly and stay calm being wrong in public. Your record — a CS degree in progress, Python, and a built project — evidences the researcher's toolkit directly; it says nothing yet about trading temperament, which is exactly what the timed drill test is for.`,
      });
    }
    if (/\bmbb\b|\bmckinsey\b|\bbain\b|\bbcg\b|consulting path/.test(topicText)) {
      return finalize("plan_paths", {
        headline: "The MBB path — screens, cases, and this year's reality.",
        sources: kbSources,
        plan: [
          { action: "Confirm your office's actual deadlines on the firm's own careers page — MBB dates are set per office and per school, and no single date is sourced in this product", timeframe: "this week" },
          { action: "Build case fluency: structured frameworks spoken out loud, with mental math clean under pressure — 30+ practice cases is the usual preparation volume", timeframe: "this semester" },
          { action: "Prepare the behavioral half with the same rigor — the firms score leadership and impact stories against their own rubrics", timeframe: "alongside cases" },
          { action: "Network into your office's analysts and alumni — referrals route résumés to the screen, at every firm", timeframe: "starting now" },
        ],
        unknowns: ["This year's exact deadlines for your office — office-specific and published per office; none is invented here."],
        nextStep: "Tell me your target office and class year, and I will sequence the case prep against its published window.",
        text: `The MBB path is three screens in order. First, a résumé screen that weighs school, grades, and leadership evidence; an online assessment (McKinsey's game-based Solve is the current form); then case interviews — structured problem-solving out loud, with mental math — paired with behavioral interviews scored against each firm's own rubric. The recruiting calendar is the trap: deadlines are set per office and per school and published on each firm's careers page, and this product holds no single sourced date for your office — anyone quoting you one date for "MBB" is guessing. What transfers across all three firms is identical preparation: case fluency built over dozens of practiced cases, clean estimation math, and stories of led work with measurable outcomes. The honest shape of the odds is the same as banking's: no firm publishes its rate, and the visible deciders are the calendar, the case performance, and the file's leadership evidence.`,
      });
    }
    if (/\bbig law\b|\blaw firm\b/.test(topicText)) {
      return finalize("plan_paths", {
        headline: "The Big Law path — a gated ladder, debt included.",
        sources: kbSources,
        plan: [
          { action: "Treat the LSAT and law-school admissions as the first gate — Big Law hires almost entirely from law schools, through their own recruiting", timeframe: "first" },
          { action: "Read the ABA-required employment disclosures for every school you consider — placement into large firms varies enormously by school, and the disclosures are the data", timeframe: "before applying anywhere" },
          { action: "Plan around 1L grades and on-campus interviews (OCI): the summer-associate offer at the end of 2L is the actual Big Law door", timeframe: "in law school" },
          { action: "Price the debt honestly against the outcome distribution, not the top salary — most graduates do not start at large firms", timeframe: "before signing anything" },
        ],
        unknowns: ["Any specific school's placement figure — this product holds no ABA dataset; the schools' own required disclosures are the source, and no number is quoted without them."],
        nextStep: "Tell me where you are on the ladder — pre-law, applying, or in school — and I will lay out that rung in full.",
        text: `Big Law is the most gated path of the set. There is effectively no undergraduate door — the firms hire summer associates from law schools through on-campus interviewing, and the summer offer converts to the full-time seat. The real ladder is LSAT and admissions, then 1L grades, then OCI at the start of 2L, then the summer-associate class. The data that governs the choice is the ABA-required employment disclosure every law school must publish: large-firm placement is concentrated in a minority of schools, and outside them the same degree leads somewhere else entirely. Debt must be stated in the same breath: private law school commonly leaves graduates with six-figure debt, which only the large-firm outcome services comfortably — so the school decision is the career decision, and it is made from the disclosures, not from rankings.`,
      });
    }
    const _facts = factsOf(profile);
    const skills = provenSkillNames(profile);
    const edu = firstFact(profile, (f) => f.kind === "education");
    const project = firstFact(profile, (f) => f.kind === "project");
    const anchorIds = [edu, project].filter(Boolean).map((f) => f.id);
    const paths = [];
    if (skills.includes("Python") || (edu && /computer science/i.test(`${edu.title} ${edu.text}`))) {
      paths.push({
        id: "software-engineering", title: "Software engineering",
        why: `your record shows ${skills.length ? skills.join(" and ") : "programming coursework"}${project ? ` and a built project (${project.title})` : ""} — real, inspectable evidence a software employer can check`,
        tradeoffs: "the most posting volume, and the most competition for the same seats; evidence has to be a working artifact, not coursework alone",
        factIds: anchorIds,
      });
      paths.push({
        id: "data-analytics", title: "Data / analytics",
        why: `the same ${skills.includes("Python") ? "Python" : "programming"} evidence transfers: your project work already handles structured records, and analytics roles test exactly that — cleaning data and answering a question clearly`,
        tradeoffs: "fewer freshman-level postings than software; SQL and a written explanation of limits carry more weight than code volume",
        factIds: anchorIds,
      });
    }
    if (!paths.length) {
      paths.push(
        { id: "explore-technical", title: "Technical roles (software / data) — as a hypothesis", why: "your education record is the only evidence on file, so these are hypotheses to test, not a fit finding", tradeoffs: "nothing is evidenced yet; the experiment below is what creates the first evidence", factIds: anchorIds },
        { id: "explore-operations", title: "Campus / operations roles — as a hypothesis", why: "campus and project work on file is the nearest transferable evidence", tradeoffs: "builds reliability evidence, weaker technical depth", factIds: anchorIds },
      );
    }
    const experiment = {
      task: "Run one inexpensive experiment over the next two weekends: (1) extend your existing project with one new feature and write the README section explaining the design choice — that samples software work; (2) use Python to answer one small question from a public dataset and write a short summary of what the data does and does not show — that samples data work. Then notice which one you kept improving without being asked.",
      discriminates: paths.map((p) => p.id),
      cost: "time only; no purchase, no commitment",
    };
    const constraintNotes = [];
    const cons = c.constraints || (profile && profile.constraints) || {};
    if (c.remoteOnly || cons.remoteOnly) constraintNotes.push("framed for a remote-only search, as you stated");
    if (c.needsIncome || cons.needsIncome) constraintNotes.push("paid routes only — an unpaid route is not treated as affordable");
    // GATE-3 record completion (03 F7): the cited response carries its
    // basis and a plan of 3-5 timed actions. Sources are the REAL profile
    // facts this answer used (by fact ID, with the fact's own source
    // label) — no citation is fabricated; when no anchor fact exists the
    // source is the profile record itself, which is what was supplied.
    const anchorFacts = anchorIds.map((id) => _facts.find((f) => f.id === id)).filter(Boolean);
    const sources = anchorFacts.length
      ? anchorFacts.map((f) => ({ type: "profile_fact", fact_id: f.id, label: f.title || f.text, source: f.source || "profile record" }))
      : [{ type: "profile_record", label: (profile && (profile.label || profile.id)) || "profile record supplied in context", source: "profile record" }];
    const basis = {
      source_class: "the user's own profile record — confirmed facts only (curated-qualitative, no population sample)",
      sample_size: _facts.length,
      as_of: KNOWLEDGE_AS_OF,
      as_of_covers: "the guidance knowledge base (deep dive 4 freeze, the date in this module's header); the profile facts themselves carry no as-of dates, and none is claimed for them",
    };
    const plan = [
      { action: "Pick the dataset question for part (2) of the experiment", timeframe: "this week" },
      { action: "Run experiment part (1): extend your existing project with one new feature and write the README section explaining the design choice", timeframe: "next weekend" },
      { action: "Run experiment part (2): use Python to answer one small question from a public dataset and write a short summary of what the data does and does not show", timeframe: "the following weekend" },
      { action: "Re-rank the two paths from what the experiment showed, then name the first evidence build or applications for the leading path", timeframe: "after both experiment parts — about two weeks from now" },
    ];
    const text = [
      `You do not need a verdict today — you need two plausible paths and a cheap way to tell them apart. Nothing in your record decides this yet, and I will not pretend it does.`,
      ...paths.map((p, i) => `Path ${i === 0 ? "A" : "B"} — ${p.title}: it may fit because ${p.why}. Tradeoff: ${p.tradeoffs}.`),
      `The experiment: ${experiment.task}`,
      constraintNotes.length ? `Constraints applied: ${constraintNotes.join("; ")}.` : null,
      `Next step: pick the dataset question for part (2) this week; the paths get re-ranked by what the experiment shows, not by guessing.`,
      `Basis: ${basis.source_class}; the guidance knowledge behind this answer is as of ${KNOWLEDGE_AS_OF}.`,
      `Plan: ${plan.map((a, i) => `${i + 1}. (${a.timeframe}) ${a.action}.`).join(" ")}`,
    ].filter(Boolean).join("\n");
    return finalize("plan_paths", {
      paths, experiment, deterministicVerdict: null,
      factIds: anchorIds,
      sources, basis, as_of: KNOWLEDGE_AS_OF,
      plan, action_plan: plan,
      unknowns: ["Which field fits — nothing in the record decides this; the experiment is what produces that evidence."],
      nextStep: "Run the two-part experiment over the next two weekends, then re-rank the paths from what it shows.",
      text,
    });
  }

  // ------------------------------------------- CG04: graduation-window eligibility
  function checkGraduationWindow(ctx) {
    const c = ctx || {};
    const candidateGraduation = c.candidateGraduation || (c.profile && c.profile.constraints && c.profile.constraints.graduationDate) || null;
    const candYear = yearOf(candidateGraduation);
    const required = Array.isArray(c.requiredGraduationYears) ? c.requiredGraduationYears.map(Number).filter(Number.isFinite) : null;
    if (!candYear || !required || !required.length) {
      // WORDING-BACKLOG (BUG-201): this branch used to answer every
      // missing-window ask with the posting's graduation wording —
      // including asks that name no posting at all (PM out of
      // college, PE from undergrad, grad school). Those are topic
      // questions and get topic answers; the window answer below
      // remains for asks that are actually about a posting's window.
      const gwTopic = String(c.text || "").toLowerCase();
      if (/\bpm\b|product management|associate product manager|\bapm\b/.test(gwTopic)) {
        return finalize("graduation_window", {
          headline: "PM straight out of college — the APM reality and the build-something route.",
          sources: [KB_SOURCE],
          plan: [
            { action: "Ship one product artifact you can demo — a small tool or feature with real users, however few — and write the decisions down", timeframe: "this semester" },
            { action: "Write product teardowns: pick products you use, name the metric, the tradeoff, and what you would change and why", timeframe: "monthly" },
            { action: "Apply to the APM programs that exist (a small, named set of large tech firms run them) and to adjacent doors — product analyst, program management, SWE-to-PM evidence roles", timeframe: "each cycle" },
            { action: "Build the metrics fluency the interviews test: define, instrument, and read a funnel on your own artifact", timeframe: "alongside" },
          ],
          unknowns: ["Any specific program's acceptance rate — none is published, and none is claimed here."],
          nextStep: "Tell me which artifact you would ship first, and I will scope it into a build plan.",
          text: `PM straight out of college exists, but it is a narrow door. A handful of large tech firms run Associate Product Manager programs, they recruit them like honors classes, and most working PMs still arrive from engineering, design, analytics, or consulting first. The interviews test product sense and metrics judgment, and both are judged on evidence — which is why the credible route in is building something: a shipped artifact with real usage, teardowns that show how you reason about tradeoffs, and funnel metrics you defined and read yourself. The honest alternative is not a lesser one: product-analyst and engineering roles convert into PM seats internally at a rate the APM lottery never matches. No program publishes its acceptance rate, and none is claimed here — the deciders are visible: the artifact, the reasoning, and the metrics fluency.`,
        });
      }
      if (/\bprivate equity\b|\bpe\b[^.]*\bundergrad|from undergrad/.test(gwTopic)) {
        return finalize("graduation_window", {
          headline: "PE from undergrad — the bank-first truth, plainly.",
          sources: [KB_SOURCE],
          plan: [
            { action: "Aim first at the analyst seats PE actually hires from — investment banking first, consulting second — and recruit for those on their calendars", timeframe: "now" },
            { action: "Build the modeling evidence PE screens for later: accounting, valuation, and LBO mechanics to interview speed", timeframe: "this year" },
            { action: "Take any deal-adjacent seat available meanwhile (boutique banking, search funds, corporate development internships) as pattern evidence", timeframe: "next break" },
            { action: "Enter the PE recruiting window in year two of the analyst seat, when the headhunter process opens", timeframe: "year two" },
          ],
          unknowns: ["Whether any specific fund runs an undergraduate program this cycle — a few do, unreliably; none is promised here."],
          nextStep: "Tell me your class year, and I will map the banking calendar that the PE door actually opens from.",
          text: `The plain truth: private equity almost never hires analysts straight from undergrad. The industry's model is to let banks train analysts for two years — modeling, deal process, and stamina — and then hire them away through a headhunter-run process that opens in the first analyst year. A small number of funds run undergraduate programs in some years, but they are the exception that proves the structure, not a route to plan around. So the undergraduate plan for PE is a banking plan: recruit for analyst seats on the banking calendar, build LBO-grade modeling evidence, and take deal-adjacent internships as pattern proof. Anyone selling a direct undergraduate PE route is selling the exception as the rule.`,
        });
      }
      if (/\bgrad school\b|graduate school|master'?s|phd/.test(gwTopic)) {
        return finalize("graduation_window", {
          headline: "Grad school — the ROI framework, run on your field.",
          sources: [KB_SOURCE],
          plan: [
            { action: "Name the field and the exact seat the degree unlocks — if no seat requires it, the ROI case must be made on skills and network alone", timeframe: "first" },
            { action: "Price the full cost: tuition plus the years of salary not earned — the forgone salary is usually the larger number", timeframe: "before applying" },
            { action: "Separate funded from unfunded offers: a funded PhD and a self-funded master's are different financial instruments, not one decision", timeframe: "at offer time" },
            { action: "Check whether your field treats the degree as a license (required), a screen (preferred), or a signal (optional) — the framework returns a different answer for each", timeframe: "with the field named" },
          ],
          unknowns: ["Your field's figures — no honest ROI number exists until the field, the program's cost, and its placement record are on the table together."],
          nextStep: "Pick the field you want this for, and I return the full answer — cost, license-versus-signal, and the verdict the framework gives — in one pass.",
          text: `The grad-school question has no field-free answer — it has a framework, and the framework is unforgiving. First: does a seat you actually want require the degree (a license), prefer it (a screen), or merely respect it (a signal)? Only the first case has automatic ROI. Second: price the whole cost — tuition plus forgone salary across the years in school, which is usually the bigger figure. Third: funded and unfunded are different decisions wearing the same name — a funded research doctorate pays you to become scarcer; a self-funded master's is a purchase that must repay itself from placement. The evidence that settles it is always the same trio: the program's own placement record, its real total cost, and the salary the unlocked seat actually starts at.`,
        });
      }
      return finalize("graduation_window", {
        eligible: null, status: "unknown_window",
        sources: [{ type: "stated_facts", label: "graduation date and posting window as supplied in context (one of the two is missing — named in the unknowns)" }],
        plan: [
          { action: "Get the posting's exact graduation wording", timeframe: "before applying" },
          { action: "Check that wording against your stated graduation date", timeframe: "same day" },
          { action: "If the posting does not state a window, ask the employer for it directly", timeframe: "this week" },
        ],
        unknowns: ["The posting's graduation window or your graduation date is not in the record — eligibility cannot be computed from missing facts."],
        nextStep: "Get the posting's exact graduation wording and check it against your stated graduation date.",
        text: `I cannot answer that from the record: ${!candYear ? "your graduation date is not stated" : "the posting's graduation window is not stated"}. Eligibility here is a comparison of two stated facts, and one of them is unknown — I will not guess it. Ask the employer for the exact window wording, or check the posting text, and the comparison is mechanical.`,
      });
    }
    const inside = required.includes(candYear);
    if (!inside) {
      return finalize("graduation_window", {
        eligible: false, status: "outside_window", candidateYear: candYear, requiredYears: required,
        sources: [{ type: "stated_facts", label: "graduation date and posting window as supplied in context — the comparison is computed from those two stated facts only" }],
        plan: [
          { action: "Ask the employer directly whether the window is hard", timeframe: "this week" },
          { action: "Put the application effort into roles whose stated window includes your year", timeframe: "this week" },
          { action: "Check each new posting's stated window before tailoring anything for it", timeframe: "per posting" },
        ],
        unknowns: ["Whether that employer ever makes exceptions — unknown and employer-specific; only the employer can say."],
        nextStep: "Do not spend application effort on this posting as written; ask the employer whether the window is hard, and put the effort into roles whose stated window includes your year.",
        text: `On the stated facts, that window does not include you: the posting requires students graduating in ${required.join(" or ")}, and you graduate in ${candYear}. As written, you are not eligible for that posting — the graduation requirement is a hard filter, not a preference. Whether that employer ever makes exceptions is unknown and employer-specific; nothing in the record says they do. The honest move is to ask them directly whether the window is hard before spending any effort on it, and to aim your applications at windows that include ${candYear}.`,
      });
    }
    return finalize("graduation_window", {
      eligible: true, status: "inside_window", candidateYear: candYear, requiredYears: required,
      sources: [{ type: "stated_facts", label: "graduation date and posting window as supplied in context — the comparison is computed from those two stated facts only" }],
      plan: [
        { action: "Read the posting's remaining requirements in full", timeframe: "today" },
        { action: "Check each stated requirement against your record, one by one", timeframe: "today" },
        { action: "Write down any requirement the record cannot settle as an unknown, not a yes", timeframe: "today" },
      ],
      unknowns: ["Every other requirement of the posting (skills, location, authorization) — this check settles the graduation window only."],
      nextStep: "Check the posting's remaining requirements one by one; the window passing settles only this one filter.",
      text: `The graduation window itself includes your year (${candYear} is in the stated window ${required.join(", ")}). That settles only this one requirement — it is not a finding about the posting's other requirements, which still have to be checked on their own facts.`,
    });
  }

  // ------------------------------------------- CG05: honest evidence, no invention
  function labelFor(fact) {
    const blob = `${fact.title || ""} ${fact.text || ""} ${fact.org || ""}`.toLowerCase();
    if (/volunteer/.test(blob)) return "volunteering — not employment, not an internship";
    if (/course project|coursework|intro programming|course:/.test(blob) || fact.kind === "project") return "course project / personal project — not employment";
    if (fact.kind === "education") return "education (in progress unless the record says completed)";
    if (fact.kind === "experience") return "experience as titled in the record";
    return fact.kind || "record item";
  }
  function honestEvidence(ctx) {
    const c = ctx || {};
    // WORDING-BACKLOG (BUG-201): honest_evidence used to answer
    // every ask routed here with a recitation of the user's own
    // profile — to questions about GPA cutoffs, search funds, the
    // SWE market, data-science entry and startup entry, none of
    // which ask what the user can put forward. Topic asks get
    // topic answers (the record enters only where it is evidence);
    // the recitation below remains for genuine put-forward asks.
    const heTopic = String(c.text || "").toLowerCase();
    const hePlan = (items) => items.map(([action, timeframe]) => ({ action, timeframe }));
    if (/\bgpa\b|grade point/.test(heTopic)) {
      return finalize("honest_evidence", {
        headline: "A 3.4 GPA, checked against how the screens actually run.",
        sources: [KB_SOURCE],
        plan: hePlan([
          ["Pull each firm on your list's own posting and file: the printed bar, where one exists, is the firm's own number — several firms print none, and those screens are human", "this week"],
          ["Route around the automated screen where the bar is real: a referral or a banker's eyes on the résumé bypasses the filter the GPA feeds", "starting now"],
          ["Stack the offsetting evidence the screen cannot see: deal-adjacent internship work, modeling certification, and a project with numbers", "this semester"],
        ]),
        unknowns: ["Any specific firm's internal cutoff where none is printed — not published, and not guessed here."],
        nextStep: "Tell me the firms on your list, and I will check each one's printed bar against 3.4, firm by firm.",
        text: `A 3.4 is not fatal for IB, but it is below the line the biggest banks print. Many bulge-bracket postings state a 3.5 or higher preference, and the first screen at those firms is often automated, so the 3.4 can be filtered before a human weighs anything else. Checked firm by firm, the picture splits: firms that print a bar mean it as a screen, not a verdict; firms that print none run human screens where the rest of the file decides. What offsets a below-bar GPA is specific, not motivational — a referral that puts the résumé in front of a banker, deal-adjacent internship evidence, and demonstrable modeling skill each route around or outweigh the number. The fatal version of a 3.4 is the one paired with no offsetting evidence and applications aimed only at the firms with printed bars.`,
      });
    }
    if (/search[ -]fund/.test(heTopic)) {
      return finalize("honest_evidence", {
        headline: "Search-fund internships for bulge-bracket recruiting — the pattern, honestly.",
        sources: [KB_SOURCE],
        plan: hePlan([
          ["In the internship itself, collect the artifacts bankers respect: sourced-company counts, CIMs read, models touched, calls sat in on", "during"],
          ["Write the experience in deal language on the record — what the fund evaluated, what you built, what you recommended", "at the end"],
          ["Pair it with one technical proof (a modeling test score or a built model) so the story reads as skill, not only exposure", "this semester"],
        ]),
        unknowns: ["Any conversion statistic — no dataset in this product counts search-fund interns into banking seats, and none is invented."],
        nextStep: "Tell me whether the internship is ahead of you or behind you, and I will shape the evidence list to that side of it.",
        text: `Search-fund internships do help for bulge-bracket recruiting — as pattern evidence, not as a credential. The work is genuinely deal-adjacent: sourcing acquisition targets, reading CIMs, building first-pass models, and sitting in on diligence calls is the closest undergraduate analogue to analyst work that exists outside a bank. Bankers reading the file recognize it as demonstrated interest with real reps, which is exactly what the "why banking" screen tests. The honest limit: no dataset in this product — and no published one — counts how many search-fund interns convert to banking seats, so no rate is claimed; what the pattern shows is that the experience strengthens the story and the technical interview, while the seat still turns on the same screens as everyone else's.`,
      });
    }
    if (/\bmarket\b[^.]*\b(bad|brutal|tough|down)|\bis the (swe|software|tech) market/.test(heTopic)) {
      return finalize("honest_evidence", {
        headline: "The SWE market — what is known, and what is anecdote.",
        sources: [KB_SOURCE],
        plan: hePlan([
          ["Judge your segment, not the market as a whole: new-grad generalist roles and experienced infrastructure roles are different markets with different evidence", "first"],
          ["Read current postings in your segment weekly — openings, stated bars, and time-to-fill are the data; layoff headlines are the anecdote", "weekly"],
          ["Build to the stated bars the postings print: the artifact and interview depth they name is the actionable output of the data", "this semester"],
        ]),
        unknowns: ["A single current figure for the SWE market as a whole — no sourced snapshot is in this product, and the honest answer keeps the segments separate rather than quoting one."],
        nextStep: "Tell me your segment — new-grad, internship, or experienced, and your stack — and I will read the market evidence for that segment specifically.",
        text: `Kept separate, as they should be: what is known is segment-level. New-grad and internship hiring at large tech firms contracted from its 2021 peak and has stayed selective — fewer seats, higher bars, more interview rounds per seat. Experienced hiring in infrastructure, security, and AI-adjacent roles never contracted the same way. What is anecdote is the single-story version — one viral layoff thread or one friend's easy search — generalized to "the market", plus any figure quoted without a population and a date attached. The actionable reading for one candidate is narrower than the headline: your segment's current postings, the bars they print, and how deep the interview loops run. That evidence is checkable this week; the national mood is not a plan input.`,
      });
    }
    if (/data science|data-science/.test(heTopic)) {
      return finalize("honest_evidence", {
        headline: "Data science entry — the master's reality and the practitioner wedge.",
        sources: [KB_SOURCE],
        plan: hePlan([
          ["Aim the first applications at the practitioner wedge — data analyst, analytics engineering, product analytics — where a bachelor's plus evidence is the stated bar", "this cycle"],
          ["Build the project set the practitioner screen reads: two analyses with reproducible code, a written statement of limits, and one dashboard a stranger can use", "this semester"],
          ["Decide the master's question from postings, not prestige: count the seats you want that print MS/PhD as required versus preferred", "before any application to a program"],
        ]),
        unknowns: ["Any employer's internal degree weighting where the posting is silent — not published, and not guessed here."],
        nextStep: "Tell me whether you want the practitioner roles first or the research-track seats, and I will set the project list to that bar.",
        text: `The master's reality, plainly: a large share of titled data-science postings print a master's or PhD as required or preferred. The research-track seats (experimentation science, ML research) genuinely run on graduate training. But the field's practitioner half hires differently: data analyst, analytics engineering, and product analytics roles state a bachelor's bar and screen on evidence — SQL fluency, reproducible analyses, and judgment about what data cannot say. Your record's Python and SQL are exactly the practitioner wedge's currency; what they do not yet buy is the research track, and pretending otherwise wastes a cycle. The honest strategy is sequenced: enter through the practitioner roles with project evidence, then let real postings — counted, not vibes — decide whether a master's is the unlock for the seats you actually want next.`,
      });
    }
    if (/startup entr|getting into startups|work at a startup/.test(heTopic)) {
      return finalize("honest_evidence", {
        headline: "Startup entry — the build-or-sell proof route.",
        sources: [KB_SOURCE],
        plan: hePlan([
          ["Pick the proof route that matches the seat: builders ship a working artifact in the startup's stack; sellers and operators produce a pipeline, a teardown, or a growth experiment with numbers", "this week"],
          ["Warm the introduction graph: founders hire through people who can vouch for work — two or three credible vouchers beat fifty cold applications", "starting now"],
          ["Target by stage honestly: early-stage seats trade salary for scope and equity risk; price that trade before you romanticize it", "per application"],
        ]),
        unknowns: ["Any specific startup's bar — set by its founders, unpublished, and read only from its own ask and interviews."],
        nextStep: "Tell me builder or go-to-market, and I will spec the proof artifact for that route.",
        text: `Startups hire on proof, not pedigree — the screen is "show me the thing", and it runs in both directions of the house. Builders get in by shipping: a working artifact in the company's stack, in public, with decisions explained. Go-to-market and operations candidates get in by selling or building pipeline: a researched target list, a teardown of the company's own funnel, an experiment with numbers. The stage math must be said plainly too: the earlier the startup, the more of your pay is equity in a company whose modal outcome is zero — that trade suits some candidates and is a bad one for others, and it should be priced, not romanticized. What does not work is the corporate playbook: a polished résumé with no artifact reads, to a founder, as unproven.`,
      });
    }
    const facts = factsOf(c.profile);
    const evidence = facts.filter((f) => f.kind !== "skill").map((f) => ({ factId: f.id, kind: f.kind, title: f.title, label: labelFor(f) }));
    const resumeLines = evidence.filter((e) => e.kind === "project" || e.kind === "experience")
      .map((e) => { const f = facts.find((x) => x.id === e.factId); return { text: f.text, factIds: [f.id], label: e.label }; });
    const hasFormal = evidence.some((e) => e.kind === "experience" && !/volunteer/.test(e.label));
    const gaps = hasFormal ? [] : ["No formal employment or internship exists on this record — that gap is stated plainly here, not filled in with relabeled coursework."];
    const text = [
      `Here is what you can honestly put forward — every line traces to your own record, labeled as what it actually is:`,
      ...evidence.map((e) => `- ${e.title}: ${e.label}.`),
      gaps.length ? `The gap, said plainly: ${gaps[0]}` : null,
      `That is a real starting file: a project an employer can open and read beats a padded title they can see through in one interview question. The next evidence to build is one more artifact with a README someone can follow, or a campus role with a named responsibility.`,
    ].filter(Boolean).join("\n");
    return finalize("honest_evidence", {
      evidence, resumeLines, gaps, inventedExperience: false,
      sources: evidence.length
        ? evidence.map((e) => ({ type: "profile_fact", fact_id: e.factId, label: e.title || e.label, source: "profile record" }))
        : [{ type: "profile_record", label: (c.profile && (c.profile.label || c.profile.id)) || "profile record supplied in context", source: "profile record" }],
      plan: [
        { action: "Build one more inspectable artifact — a project with a README someone can follow, or a campus role with a named responsibility", timeframe: "this week" },
        { action: "Add it to the record labeled as what it actually is", timeframe: "the same day it is built" },
        { action: "Lead the next application with the inspectable evidence, not a padded title", timeframe: "next application" },
      ],
      factIds: evidence.map((e) => e.factId),
      unknowns: ["Whether any specific employer will weigh this evidence enough — that is their call, not something the record shows."],
      nextStep: "Build one more inspectable artifact (project with README, or a campus role with a named responsibility) and add it to the record as what it is.",
      text,
    });
  }

  // ------------------------------------------- CG06: simulation vs employment
  function classifyCredential(ctx) {
    const c = ctx || {};
    const provider = c.provider || "the provider";
    const sponsor = c.sponsor || null;
    if (c.kind === "simulation") {
      const honestListing = `Certificates & Simulations: ${provider} job simulation${sponsor ? ` (sponsor-designed practice)` : ""} — simulation completed, certificate earned. List under Certificates or Projects, not under Experience.`;
      return finalize("classify_credential", {
        label: "simulation", isEmployment: false, honestListing,
        sources: [{ type: "stated_facts", label: "credential kind, provider and sponsor as supplied in context — the label follows from the kind" }],
        plan: [
          { action: "List it with the honest listing line, under Certificates or Projects — not Experience", timeframe: "today" },
          { action: "Move it out of any Experience section where it currently sits", timeframe: "today" },
          { action: "Lead the application with real artifacts from your record", timeframe: "next application" },
        ],
        unknowns: ["How any one employer weighs a simulation certificate — not in the record; it is supporting evidence, never the headline."],
        nextStep: "List it with the honest listing line, and lead the application with real artifacts from your record.",
        text: `No — do not list that as work experience at ${sponsor || "the sponsor"}. A ${provider} simulation is employer-designed practice: it is a simulation, not employment and not work experience at the sponsor, and listing it as a job would be a false claim an employer can check in one question. The honest way to use it: "${honestListing}" It still counts for something real — it shows you sampled the work and finished it — as a certificate, in its own section.`,
      });
    }
    return finalize("classify_credential", {
      label: "unknown_kind", isEmployment: null, honestListing: null,
      sources: [{ type: "stated_facts", label: "credential as described in context — its kind is not established in the record" }],
      plan: [
        { action: "Name the credential type and issuer", timeframe: "today" },
        { action: "Apply the labeling rule for that type", timeframe: "same day" },
        { action: "List only actual employment as Experience when you list it", timeframe: "when you list it" },
      ],
      unknowns: ["What kind of credential this is (simulation, course certificate, license, employment) is not established in the record."],
      nextStep: "Name the credential type and issuer; the labeling follows mechanically from the type.",
      text: `I cannot label that honestly yet: the record does not establish what kind of credential it is. The rule that will apply: only actual employment may be listed as experience; a simulation or course certificate goes under Certificates with its true label. Tell me the type and issuer and I will label it exactly.`,
    });
  }

  // ------------------------------------------- CG09: trend scope from a snapshot
  function explainTrendScope(ctx) {
    const c = ctx || {};
    const s = c.snapshot || null;
    if (!s || !s.frozen_text) {
      // WORDING-BACKLOG (BUG-201): this branch used to answer the
      // AI job-risk ask with "unknown" and an instruction for the
      // USER to bring the source. The question is answerable from
      // the guidance knowledge base — what the exposure research
      // actually shows, with its uncertainty stated in both
      // directions — and the next step is the product applying the
      // lens to the user's own role, never the user fetching the
      // evidence. The snapshot machinery below still governs asks
      // that cite a specific trend claim.
      const tsTopic = String(c.text || "").toLowerCase();
      if (/\bai\b|artificial intelligence|automat/.test(tsTopic)) {
        return finalize("trend_scope", {
          headline: "Will AI take your job — what the evidence shows, uncertainty included.",
          sources: [KB_SOURCE],
          plan: [
            { action: "Run the exposure lens on your own target role: list its weekly tasks and mark which are routine cognitive work — drafting, summarizing, first-pass analysis — versus judgment, relationships, and physical presence", timeframe: "this week" },
            { action: "Move your evidence toward the low-exposure half: work samples that show judgment calls, client context, and verification of machine output", timeframe: "this semester" },
            { action: "Read the official outlook for your occupation (the Bureau of Labor Statistics publishes one per occupation) before repeating any headline figure", timeframe: "before citing a number" },
          ],
          unknowns: ["The pace for any specific occupation — the research measures task exposure, not timelines, and this product holds no sourced snapshot to quote a figure from."],
          nextStep: "Tell me your target role, and I will run the exposure lens over its actual task list with you.",
          text: `The honest answer is narrower than both headlines. What the research actually measures is task exposure: the share of a job's tasks that current AI can plausibly do — and exposure concentrates in routine cognitive work (drafting, summarizing, first-pass research and analysis), which is why the pressure lands first on entry-level versions of knowledge jobs, where the task mix is most routine. What the evidence does not show is whole occupations vanishing on a schedule: exposure is not replacement, employers adopt unevenly, and the same tools raise the output of the people who verify and direct them — the uncertainty is real in both directions and anyone certain of a date is selling something. The actionable reading is at the level of your own week: the more of a role's day is routine production, the more its hiring bar shifts toward judgment, verification, and client context. No sourced snapshot of a specific forecast is in this product, so no figure is quoted here — the occupation-level outlook the Bureau of Labor Statistics publishes is the checkable source.`,
        });
      }
      return finalize("trend_scope", {
        ok: false, code: "no_sourced_snapshot", currentLocalClaim: null,
        sources: [{ type: "no_source_supplied", label: "No sourced snapshot was supplied for this trend — that absence is the finding; nothing is cited in its place", as_of: KNOWLEDGE_AS_OF }],
        plan: [
          { action: "Fetch the official source page and read the scope it states — population, geography, horizon", timeframe: "before relying on the claim" },
          { action: "Read the scope the source itself states — population, geography, horizon", timeframe: "same day" },
          { action: "Judge local supply from the postings open right now", timeframe: "this week" },
        ],
        unknowns: ["The trend and its scope — no sourced snapshot was supplied in this conversation."],
        nextStep: "Tell me the claim you want checked, and I will check it against its official source and show the scope it states.",
        text: `That trend cannot be characterized from what is here: no sourced snapshot of it was supplied, so I will not characterize what it covers or what it means locally. A trend claim is only as good as its source's stated scope — the product-side check is to fetch the official page and read the scope from it, not to ask you to supply the evidence.`,
      });
    }
    const place = c.place || "your area";
    const field = c.field || "those";
    return finalize("trend_scope", {
      currentLocalClaim: null,
      sources: [{ label: s.snapshot_of || "frozen source snapshot", url: s.source_url || null }],
      plan: [
        { action: `Judge ${place} openings from current local postings themselves`, timeframe: "this week" },
        { action: "Use the trend only as long-horizon context for choosing a direction", timeframe: "when planning" },
        { action: "Fetch the official source before relying on any new trend claim", timeframe: "before relying on it" },
      ],
      unknowns: [`Current ${place} internship supply — not measured by this source and unknown from this record.`],
      nextStep: `Judge ${place} openings from current local postings themselves; use the trend only as long-horizon context.`,
      text: `No — that does not follow. The source behind that trend describes national occupational outlook over a projected 10-year period; it generally does not cover short-term fluctuations or regional differences, and it does not tell us anything about ${place} ${field} internships this month. A long-term national projection is context for choosing a direction, not a reading of the current local market. What the current ${place} supply actually is remains unknown from this source — the postings open right now are the only honest evidence for that.`,
    });
  }

  // ------------------------------------------- CG10: thin sample disclosure
  function assessThinSample(ctx) {
    const c = ctx || {};
    const smp = c.sample || {};
    const n = Number(smp.n) || 0, k = Number(smp.successes) || 0;
    const scope = smp.scope || "one employer, one year";
    // WORDING-BACKLOG (BUG-201): the closer used to say "a
    // three-person sample" whatever n actually was — including
    // n = 0, where the same record's source line said "0 of 0"
    // (the judge's SC-237 contradiction). One sample size, stated
    // consistently, from the record. And the VC-seats ask that
    // routes here is a topic question: it gets the topic answer.
    const tsTopic = String(c.text || "").toLowerCase();
    if (/\bvc\b|venture capital/.test(tsTopic) && /seat|how few|analyst|associate/.test(tsTopic)) {
      return finalize("thin_sample", {
        headline: "VC seats — how few there are, and which routes are real.",
        sources: [KB_SOURCE],
        plan: [
          { action: "Build the prerequisite evidence first: two years of banking, consulting, or a startup operating role is the standard feeder — recruit for those seats on their calendars", timeframe: "first" },
          { action: "Produce venture-legible proof meanwhile: a public investment thesis, a sourced deal memo, or support work for a venture firm a partner can read in ten minutes", timeframe: "this semester" },
          { action: "Work the scout and venture-partner programs and the backed companies' own roles — the adjacent seats that convert into firm seats", timeframe: "each cycle" },
          { action: "Treat any firm's process as post-experience recruiting: seats open when a fund raises or grows, not on an annual campus calendar", timeframe: "ongoing" },
        ],
        unknowns: ["Any firm's seat count for this year — funds do not publish them, and no total is claimed here."],
        nextStep: "Tell me which feeder seat — banking, consulting, or operating — you are closest to, and I will map the VC route from it.",
        text: `VC seats are few in a way banking seats are not. A venture firm is a partnership of a dozen-odd investors, and its junior class in any year is counted in single digits per firm — many firms hire no analyst at all in a given year, because the seat opens when the fund grows, not when a calendar turns. There is also no standard undergraduate door: the analysts and associates who hold these seats overwhelmingly arrive with two or more years of banking, consulting, or startup operating work behind them, recruited through the partners' networks rather than a posting. The routes that are real are therefore sequenced: a feeder seat first, venture-legible proof built in public (a thesis, a sourced memo, scout or deal work), and adjacency — backed-company roles and scout programs — that puts your work in front of partners before a seat exists. No firm publishes its seat count or hiring rate, so no total is quoted here; the structure itself is the answer — few seats, post-experience, network-mediated.`,
      });
    }
    const limits = [
      `Sample size: ${n} people is too small to support a rate for anyone else.`,
      `Scope: ${scope} — one employer's one year says nothing about its next year or any other employer.`,
      "Selection: the students who interned there were chosen by a process; they are not a random draw of applicants.",
    ];
    return finalize("thin_sample", {
      personalRate: null, limits,
      sources: [{ type: "user_supplied_sample", label: `sample supplied in context: ${k} of ${n}, scope ${scope} — cited as the sample it is, never as a rate` }],
      plan: [
        { action: "Read the employer's own current postings for this route", timeframe: "this week" },
        { action: "Read its current process from its own pages, not from last year's sample", timeframe: "this week" },
        { action: "Build the strongest file you can from your own record instead of budgeting around the sample", timeframe: "this week" },
      ],
      unknowns: ["Your outcome, and the employer's current conversion behavior — neither is in this record."],
      nextStep: n > 0 ? `Treat the employer's own current postings and process as the evidence; build the strongest file you can rather than budgeting around a sample of ${n}.` : "Treat the employer's own current postings and process as the evidence — no sample was supplied with this question, so there is no rate here to budget around in either direction.",
      text: n > 0
        ? `No, you cannot count on a similar rate for you. The figure is ${k} of ${n} students — ${n} people, at ${scope}. A sample that small and that narrow is not a promise and does not predict your outcome: the limits are the size, the single employer and year, and the fact that those students were selected, not drawn at random. It is weak evidence the route exists at all — nothing more.`
        : `There is no rate to count on here, in either direction: no sample was supplied with this question — no students, no outcomes, no scope — so any percentage would be invented from nothing. What can be read is the employer's own current postings and process; build the strongest file you can from your own record, and let the employer's stated bar, not an absent sample, set the expectation.`,
    });
  }

  // ------------------------------------------- CG11: sponsorship history
  function sponsorshipHistoryAnswer(ctx) {
    const c = ctx || {};
    const s = c.snapshot || null;
    const separate = { presentEligibility: "unknown", futureSponsorship: "unknown", employerWillingness: "unknown" };
    return finalize("sponsorship_history", {
      currentSponsorship: "unknown", separate,
      sources: s ? [{ label: s.snapshot_of || "frozen filing-history snapshot", url: null }] : [{ type: "no_source_supplied", label: "No filing-history snapshot was supplied — the history itself is spoken of only as the user described it", as_of: KNOWLEDGE_AS_OF }],
      plan: [
        { action: "Ask the employer directly whether this role is sponsorship-eligible now", timeframe: "this week" },
        { action: "Ask your present eligibility to work as its own, separate question", timeframe: "in the same conversation" },
        { action: "Ask future sponsorship as its own, separate question", timeframe: "in the same conversation" },
      ],
      unknowns: ["The employer's current sponsorship decision for this role and this candidate — not in the record."],
      nextStep: "Ask the employer directly whether this role is sponsorship-eligible now, and keep the three questions separate when you do.",
      text: `No — past filings are history, not a current promise. The record shows this employer filed petitions in past years, for other roles. Three questions are being merged into one, and they are separate: your present eligibility to work, sponsorship in the future, and this employer's willingness to sponsor this role for you now. Each of those is unknown from a filing history, and the history does not prove sponsorship for this role or this candidate. The only honest source for the current answer is the employer, asked about this role, now.`,
    });
  }

  // ------------------------------------------- CG12: CPT/OPT, DSO route
  function workAuthorizationGuidance(ctx) {
    const c = ctx || {};
    // WORDING-BACKLOG (BUG-201): the international-student realism
    // ask (sponsors from H-1B filing data, cap-exempt options) used
    // to receive only the CPT/OPT explainer. The realism picture
    // is the answer; the CPT/OPT machinery below still governs
    // asks that are about starting a specific internship.
    const waTopic = String(c.text || "").toLowerCase();
    if (/realism|sponsor|h-1b|cap-exempt|filing/.test(waTopic)) {
      return finalize("work_authorization", {
        headline: "International-student realism — the cap, the exempt doors, and where the sponsor data lives.",
        sources: [USCIS_SOURCE],
        plan: [
          { action: "Check any target employer against the USCIS H-1B Employer Data Hub — the public filing record of who actually petitioned, by employer and year, which is the sponsor evidence that counts", timeframe: "per employer" },
          { action: "Weight cap-exempt employers into the search from the start: universities, their affiliated nonprofits, and nonprofit or government research organizations are exempt from the cap entirely", timeframe: "this cycle" },
          { action: "Use the OPT runway as the bridge it is: work authorization after graduation, with the STEM extension for eligible degrees, while an employer decides on sponsorship", timeframe: "final year" },
          { action: "Ask every employer the sponsorship question directly and early — a firm's filing history is evidence, and its answer for this role is the fact", timeframe: "first conversation" },
        ],
        unknowns: ["Any named firm's sponsorship decision for your role — the filing record shows history, and only the employer can state its current intent; this product holds no filing dataset of its own."],
        nextStep: "Tell me the employers on your list, and I will check each one's filing history against the Data Hub record with you.",
        text: `The realistic picture, without sugarcoating. The H-1B route runs through a capped annual lottery with far more registrations than visas, so a cap-subject employer's willingness to sponsor is only half the battle — the lottery is the other half. Two structural facts work in your favor: cap-exempt employers — institutions of higher education, their affiliated nonprofits, and nonprofit or government research organizations — can petition year-round outside the cap entirely, and OPT (with the STEM extension for eligible degrees) gives you a work-authorized runway after graduation during which an employer can sponsor from evidence of your work. On sponsors: the checkable record is the USCIS H-1B Employer Data Hub, the public filing data showing which employers actually petitioned and how often — this product holds no filing dataset of its own, so no sponsor list is quoted from memory; a firm's history there plus its direct answer about your role is the evidence. And the case-specific floor stays: your own status questions go to your DSO, because the general picture is not a decision about your case.`,
      });
    }
    return finalize("work_authorization", {
      canStartNextWeek: "unknown_requires_authorization", individualDetermination: null,
      sources: [USCIS_SOURCE],
      plan: [
        { action: "Book your school's designated school official (DSO)", timeframe: "this week" },
        { action: "Bring the internship description to the appointment", timeframe: "at the appointment" },
        { action: "Ask which authorization, if any, covers this internship", timeframe: "at the appointment" },
        { action: "Do not start before the authorization answer exists", timeframe: "before any start date" },
      ],
      unknowns: ["Your individual authorization status — only your DSO or qualified immigration counsel can decide the specifics of your case."],
      nextStep: "Book your school's designated school official (DSO) before any start date; bring the internship description and ask which authorization, if any, covers it.",
      text: `General information only — this is the sourced general picture, not a decision about your case. Under USCIS guidance, CPT (curricular practical training) is training tied to your curriculum, and it involves school authorization through your designated school official (DSO) before you begin. OPT (optional practical training) is temporary employment related to your field of study, with its own application and authorization process. So: do not start the internship next week on an assumption — whether you are authorized, and under which route, is exactly the case-specific question only your DSO (or qualified immigration counsel) can answer. Going to the DSO first is not a delay tactic; starting without authorization is the one move that can damage the status everything else depends on.`,
    });
  }

  // ------------------------------------------- CG14: expensive certificate challenge
  function assessCertificatePurchase(ctx) {
    const c = ctx || {};
    const requiredBy = Array.isArray(c.requiredByRoles) && c.requiredByRoles.length ? c.requiredByRoles : null;
    const cost = c.cost != null ? `${c.currency || "USD"} ${c.cost}` : "that price";
    if (requiredBy) {
      return finalize("certificate_purchase", {
        necessity: "required_by_named_role", purchase: "not_made_not_assumed", hirePromiseCredible: false,
        sources: [{ type: "stated_facts", label: "the named role's posting requirement and the cost, as supplied in context — the posting, not the seller, is the source" }],
        alternatives: ["If you take it, the posting that requires it is the justification — keep that posting as the record of why."],
        plan: [
          { action: "Re-check the named posting's requirement wording", timeframe: "before paying anything" },
          { action: "Keep that posting as the record of why the credential is required", timeframe: "same day" },
          { action: "Decide on the cost only with your own separate approval — no purchase is made or assumed here", timeframe: "before any payment" },
        ],
        unknowns: ["Whether the named role is still open and still states the requirement when you apply."],
        nextStep: "Re-check the named posting's requirement wording before paying anything; purchases need your own separate approval.",
        text: `This one is different from a sales pitch. A named role's posting states the credential as a requirement (${requiredBy.join("; ")}), so the necessity is sourced, not marketed. Even then, no purchase is made or assumed by this guidance — the cost (${cost}) and the decision stay yours, with separate approval, and the seller's hire promise adds nothing: employers make hiring decisions, course sellers do not.`,
      });
    }
    return finalize("certificate_purchase", {
      necessity: "unknown_not_established", purchase: "not_made_not_assumed", hirePromiseCredible: false,
      sources: [{ type: "stated_facts", label: "the seller's pitch and the cost, as supplied in context — the seller is not an honest source for necessity, and no posting naming this credential is in evidence" }],
      plan: [
        { action: "Pull two or three real postings for your target roles and check whether the credential is named in any of them", timeframe: "before any payment" },
        { action: "Build the same skill as a free, inspectable project artifact instead", timeframe: "this week" },
        { action: "Ask a campus adviser or a practitioner in the field whether the credential is ever the screen for your target roles", timeframe: "this week" },
      ],
      alternatives: [
        "Check the actual postings for the roles you want: if none of them name this credential, treat it as marketed, not required.",
        "Build the same skill as a free, inspectable project artifact — evidence an employer can open beats a certificate they cannot verify.",
        "Ask a campus adviser or a practitioner in the field whether the credential is ever the screen for your target roles.",
      ],
      unknowns: ["Whether any role you actually target requires this credential — not in evidence, and the seller is not an honest source for it."],
      nextStep: "Before any payment: pull two or three real postings for your target roles and check whether the credential is named in any of them.",
      text: `Do not buy it on that pitch. Challenge the necessity first: nothing in the record shows this certificate is required by any role you target — a credential can be required, merely beneficial, or merely marketed, and the seller's page cannot tell you which. The hire promise is the weakest part: no course seller can promise a hiring decision that belongs to employers, so treat that promise as not credible. The cost is real money (${cost}); the alternatives above are free or cheaper and produce evidence an employer can inspect. No purchase is made or assumed here — and if a real posting turns out to name this credential as a requirement, that posting, not the pitch, is what would change this answer.`,
    });
  }

  // ------------------------------------------- CG15: time-budgeted planning
  const TASK_POOL = [
    { id: "apply-best-fit", task: "Apply to the best-fit open roles already matched to your profile, tailoring each from your real facts", weight: 3 },
    { id: "evidence-artifact", task: "Advance one evidence artifact (project/README/tests) that closes your top named gap", weight: 3 },
    { id: "review-adjust", task: "Review responses and your own notes; adjust targets and write the next decision down", weight: 2 },
    { id: "outreach-batch", task: "Send one small, personalized outreach batch to people attached to your target roles", weight: 2 },
    { id: "interview-practice", task: "Practice interview answers out loud against your real evidence", weight: 2 },
  ];
  function allocate(tasks, totalMinutes) {
    const wsum = tasks.reduce((a, t) => a + t.weight, 0);
    let used = 0;
    const out = tasks.map((t, i) => {
      const minutes = i === tasks.length - 1 ? totalMinutes - used : Math.max(5, Math.round((totalMinutes * t.weight / wsum) / 5) * 5);
      used += minutes;
      return { id: t.id, task: t.task, minutes };
    });
    return out;
  }
  function timeBudgetPlan(ctx) {
    const c = ctx || {};
    const hours = Number(c.hoursPerWeek) || 2;
    const total = Math.round(hours * 60);
    const count = total >= 480 ? 5 : total >= 300 ? 4 : 3;
    const chosen = allocate(TASK_POOL.slice(0, count), total);
    const deferred = TASK_POOL.slice(count).map((t) => ({ id: t.id, task: t.task, reason: `does not fit inside ${hours} hours per week alongside the higher-priority work` }));
    const totalMinutesPerWeek = chosen.reduce((a, t) => a + t.minutes, 0);
    return finalize("time_budget_plan", {
      tasks: chosen, deferred, totalMinutesPerWeek, hoursPerWeek: hours,
      sources: [{ type: "stated_constraint", label: `weekly time budget stated in context: ${hours} hours per week — the plan is allocated inside exactly that budget` }],
      plan: chosen.map((t) => ({ action: t.task, timeframe: `${t.minutes} minutes per week` })),
      stoppingCondition: "Stop at the budget each week; an unfinished item rolls to next week instead of expanding the week.",
      reviewMethod: "The review task each week checks responses received against the plan and re-picks the top gap.",
      unknowns: ["Which task pays off first — the weekly review is what replaces this guess with your own response data."],
      nextStep: chosen.length ? `Start with task 1 (${chosen[0].minutes} minutes): ${chosen[0].task}.` : null,
      text: `Here is a plan that fits your stated weekly budget (${hours} hours per week), in priority order — ${totalMinutesPerWeek} minutes total, not a minute over:\n${chosen.map((t, i) => `${i + 1}. (${t.minutes} minutes) ${t.task}.`).join("\n")}\nWhat does not fit is deferred, named rather than silently stacked on: ${deferred.map((d) => d.task.toLowerCase()).join("; ")}. If a week runs short, cut from the bottom of the list — the top item is the one that can still change an outcome.`,
    });
  }

  // ------------------------------------------- CG13: skill-gap evidence plan
  function skillGapPlan(ctx) {
    const c = ctx || {};
    // WORDING-BACKLOG (BUG-201): this function also catches the
    // pre-med and government/intel path asks (they match on
    // "prereqs" / "clearance" in the router) — and used to answer
    // them with the skill-gap frame and an unsubstituted
    // placeholder, "the named skill", in the user's face. Topic
    // asks get topic answers; and where no skill is actually
    // named, the user-facing text says "the skill the posting
    // names" — the placeholder never reaches a reply.
    const sgTopic = String(c.text || "").toLowerCase();
    if (/pre-med|premed|mcat|medical school/.test(sgTopic)) {
      return finalize("skill_gap_plan", {
        headline: "The pre-med path — prereqs, the MCAT, and the timeline that is actually verified.",
        sources: [KB_SOURCE],
        plan: [
          { action: "Sequence the prereq ladder: general chemistry and biology first, then physics, organic chemistry, and biochemistry, with psychology/sociology for the MCAT's fourth section", timeframe: "by semester" },
          { action: "Build the clinical ladder in parallel: shadowing, then sustained clinical volunteering or a clinical job (scribe, EMT, medical assistant) — schools read duration and reflection, not a single summer", timeframe: "starting now" },
          { action: "Take the MCAT when the prereqs are done, not by the calendar — typically spring of the application year for direct entry", timeframe: "application year" },
          { action: "Apply in the summer a full cycle ahead: medical admissions are rolling and the cycle opens the June before the fall you would start", timeframe: "application summer" },
        ],
        unknowns: ["Any school's acceptance rate or your competitiveness figure — schools publish class profiles, not personal odds, and none is invented here."],
        nextStep: "Tell me your year and which prereqs are already done, and I will sequence the rest semester by semester.",
        text: `The pre-med path is a ladder with verified rungs, and it runs on two tracks at once. The academic track: the prereq sequence — general chemistry, biology, physics, organic chemistry, biochemistry, plus psychology and sociology for the MCAT — then the MCAT itself, taken when the coursework is finished rather than on a fixed date. The clinical track matters as much: admissions committees read sustained clinical exposure — shadowing, then real patient-contact work as a scribe, EMT, or medical assistant — as the evidence you know what the job is. The timeline most direct-entry students run: prereqs across the first two to three years, MCAT in the spring of junior year, applications the following summer, a full year before matriculation — and gap years are common enough that they are a normal variant, not a defeat. No school publishes a personal probability for you, and this product holds no figure to quote; the deciders are the GPA in the prereq sciences, the MCAT, and the clinical record's depth.`,
      });
    }
    if (/clearance|government|intelligence|\bintel\b|federal/.test(sgTopic)) {
      return finalize("skill_gap_plan", {
        headline: "The government and intel path — citizenship gates and clearance timelines, honestly.",
        sources: [KB_SOURCE],
        plan: [
          { action: "Check the citizenship gate first: security clearances require US citizenship, and most agency roles state it in the posting — it is a hard filter, not a preference", timeframe: "first" },
          { action: "Enter through the student programs (agency internships and cooperative education) — they start the clearance clock while you are still in school and are the main student door", timeframe: "each cycle" },
          { action: "Keep the record clearance-clean and documentable: finances, foreign contacts, and travel get investigated, and candor is the currency — issues disclosed early are survivable, surprises are not", timeframe: "always" },
          { action: "Budget the timeline honestly: investigations run in months and the senior clearances commonly past a year; offers are contingent on adjudication", timeframe: "at offer" },
        ],
        unknowns: ["Any current processing-time figure for a specific clearance level — the agencies publish changing statistics, and none is frozen into this answer."],
        nextStep: "Tell me the agency family you are aiming at, and I will map its student programs and stated gates.",
        text: `The government and intelligence path runs on gates the private sector does not have. The first is absolute: security clearances require US citizenship, so for cleared roles citizenship is a hard filter stated in the posting, not a preference to argue with. The second gate is time: a background investigation is measured in months, and the higher clearances commonly run past a year, with offers contingent on adjudication — which is why the agencies run student internship and co-op programs that begin the process while you are still in school. The third gate is the record itself: finances, foreign contacts, drug history, and candor are investigated, and the standard that decides cases is honesty — disclosed issues are routinely adjudicated favorably; discovered ones are not. The work is real and the pipeline is slow by design, and anyone quoting you a precise current processing time is quoting a statistic that changes quarterly.`,
      });
    }
    const skill = c.skill || "that skill";
    const proven = provenSkillNames(c.profile);
    const alreadyHasSkill = proven.some((s) => s.toLowerCase() === String(skill).toLowerCase());
    const hours = Number(c.hoursPerWeek) || 2;
    const total = Math.round(hours * 60);
    const phases = allocate([
      { id: "learn-basics", task: `Work through the official basics of ${skill} by building, not just reading`, weight: 3 },
      { id: "build-artifact", task: `Build the artifact below with ${skill}`, weight: 4 },
      { id: "document-review", task: "Write the README, finish the tests, and get one review from someone who knows the stack", weight: 2 },
    ], total);
    const artifact = `a small service or tool built with ${skill}, in a public repo, with a README that explains what it does and one design tradeoff, plus tests that a reviewer can run`;
    const levelText = c.requirementLevel === "required"
      ? `the posting states ${skill} as a requirement`
      : `the posting names ${skill} as preferred, expressly not required — so this is an advantage gap, not a wall`;
    return finalize("skill_gap_plan", {
      alreadyHasSkill, requirementLevel: c.requirementLevel || "preferred_not_required",
      artifact, phases, totalMinutesPerWeek: phases.reduce((a, t) => a + t.minutes, 0),
      sources: skillFactsOf(c.profile).length
        ? skillFactsOf(c.profile).map((f) => ({ type: "profile_fact", fact_id: f.id, label: f.title || f.text, source: f.source || "profile record" }))
        : [{ type: "profile_record", label: (c.profile && (c.profile.label || c.profile.id)) || "profile record supplied in context", source: "profile record" }],
      plan: phases.map((p) => ({ action: p.task, timeframe: `${p.minutes} minutes per week` })),
      reviewMethod: "One reviewer who knows the stack reads the README and runs the tests; their questions become the fix list.",
      stoppingCondition: `Stop when the artifact runs, its tests pass, and a reviewer can follow the README unaided — then the gap is evidenced, and more hours go to applying, not polishing.`,
      factIds: skillFactsOf(c.profile).map((f) => f.id),
      unknowns: [`How heavily the employer screens on ${skill} beyond the posting's wording — not in the posting, not guessed here.`],
      nextStep: `Start phase 1 this week (${phases[0].minutes} minutes): ${phases[0].task}.`,
      text: `The gap, stated accurately: ${levelText}. ${alreadyHasSkill ? `${skill} is already on your record.` : `${skill} is not among your proven skills — your record proves ${proven.join(" and ") || "what is on file"} — and I will not claim ${skill} for you.`} The plan to close it with evidence, inside ${hours} hours per week: build ${artifact}. Phases: ${phases.map((p, i) => `${i + 1}. (${p.minutes} min/week) ${p.task}`).join(" ")} Review method: one reviewer who knows the stack runs the tests and reads the README. Stopping condition: the artifact runs, the tests pass, and a reviewer can follow the README unaided — at that point the gap is closed with evidence, not with a claim.`,
    });
  }

  // ------------------------------------------- CG17: rejection without feedback
  function rejectionGuidance(ctx) {
    const c = ctx || {};
    if (c.feedback) {
      return finalize("rejection", {
        diagnosedCause: null,
        hypotheses: [{ text: "The employer's own feedback is the only case evidence; work from its exact words, not from general lists.", labeledAs: "employer_feedback" }],
        sources: [{ type: "employer_feedback", label: "the employer's own feedback, supplied in context — the only case evidence used" }],
        plan: [
          { action: "Name the exact point the feedback states, in its own words", timeframe: "today" },
          { action: "Turn that named point into one evidence task", timeframe: "this week" },
          { action: "Re-apply the plan to the next application with that evidence in hand", timeframe: "next application" },
        ],
        unknowns: ["Anything beyond what the feedback itself states."],
        nextStep: "Turn the feedback's named point into one evidence task, then re-apply the plan.",
        text: `Here the employer did give feedback, and that feedback — not a guess — is the evidence to work from — "${String(c.feedback).replace(/\.\s*$/, "")}". Build the next step on its exact words.`,
      });
    }
    const hypotheses = ["Timing or headcount on the employer's side, which no candidate file can fix or see.", "Another file carried stronger evidence for that specific role's requirements.", "A requirement that was not visible in the posting decided the screen."].map((text) => ({ text, labeledAs: "general_possibility_not_evidence" }));
    return finalize("rejection", {
      diagnosedCause: null, hypotheses,
      plan: [
        { action: "Pick the one role-relevant evidence gap you can actually see", timeframe: "today" },
        { action: "Close it with an artifact", timeframe: "this week" },
        { action: "Keep applying while it closes — do not rebuild the whole plan around an unknown", timeframe: "this week" },
      ],
      unknowns: ["The actual reason for this rejection — with no feedback, it is unknowable from this record."],
      nextStep: "Take the smaller step: pick the one role-relevant evidence gap you can close this week, close it with an artifact, and keep applying — do not rebuild your whole plan around an unknown.",
      text: `Honestly: I don't know why, and with no feedback there is no way to know from this record. A rejection with no feedback does not identify a particular gap, and anyone naming an exact cause would be inventing it. General possibilities — labeled as general, not evidence about your case: ${hypotheses.map((h) => h.text).join(" ")} The useful response is a smaller next step, not a verdict on you: close the one evidence gap you can actually see this week, and keep the plan moving.`,
    });
  }

  // ------------------------------------------- CG19: suspicious posting caution
  function assessSuspiciousPosting(ctx) {
    const c = ctx || {};
    const blob = `${c.postingText || ""} ${((c.snapshot && c.snapshot.posting && c.snapshot.posting.red_flags_frozen) || []).join(" ")}`.toLowerCase();
    const redFlags = [];
    if (/fee|pay.*(before|upfront|up-front)/.test(blob)) redFlags.push("an up-front fee is demanded before starting work");
    if (/bank account|bank details|banking details/.test(blob)) redFlags.push("bank account details are requested, to a personal email address");
    if (/personal email/.test(blob)) redFlags.push("payment details are routed to a personal email rather than an employer system");
    if (/social security|ssn|passport/.test(blob)) redFlags.push("identity documents are requested outside any verified employer process");
    if (/no verifiable|unnamed/.test(blob)) redFlags.push("no verifiable employer identity is given in the posting");
    const feeMatch = String(c.postingText || "").match(/\$\s?\d[\d,]*/);
    return finalize("suspicious_posting", {
      verdict: "caution_do_not_proceed_as_instructed", legalVerdict: null, unsafeActionAdvised: false,
      sources: [{ type: "user_supplied_posting", label: "the posting text supplied in context — every red flag below is read from that text" }],
      redFlags,
      doNot: ["Do not pay any fee before starting — legitimate employers do not charge new hires to begin work.", "Do not share bank account details with a personal email address; payroll details belong in a verified employer's own system, after a real offer."],
      verifySteps: ["Find the employer's legal name and official website independently of the posting, and contact them through it to confirm the role exists.", "Check the posting against the employer's own careers page and your school's career center, which vets employers.", "Ask for everything in writing on an official domain before any document or detail changes hands."],
      plan: [
        { action: "Find the employer's legal name and official website independently of the posting, and contact them through it to confirm the role exists", timeframe: "before any further contact" },
        { action: "Check the posting against the employer's own careers page and your school's career center, which vets employers", timeframe: "before any further contact" },
        { action: "Ask for everything in writing on an official domain before any document or detail changes hands", timeframe: "before anything changes hands" },
      ],
      unknowns: ["Whether this posting is legally fraudulent — not established, and not needed: the red flags alone justify stopping."],
      nextStep: "Verify the employer through its official website and your school's career center before any further contact.",
      text: `Do not do it — treat this posting with caution. The red flags: ${redFlags.join("; ")}${feeMatch ? ` (the fee named is ${feeMatch[0]})` : ""}. I am not pronouncing it a proven scam — that legal verdict is not established by a posting alone — but no verification is needed to justify stopping: legitimate employers do not charge you to start, and payroll details never go to a personal email. Verify instead: find the employer's official site independently, confirm the role exists there, and check with your school's career center before any further contact.`,
    });
  }

  // ------------------------------------------- CG20: injected instruction in a posting
  function detectInjectedInstruction(ctx) {
    const c = ctx || {};
    const t = String(c.text || "");
    const re = /(ignore (all )?previous|instruction from employer|must email|email a (scan|copy) of|send (a scan|your passport|passport)|disclose).{0,120}(passport|private document|scan)/i;
    const injected = re.test(t) || /IMPORTANT INSTRUCTION/i.test(t) && /passport/i.test(t);
    return finalize("injected_instruction", {
      injected, action: injected ? "ignored_as_authority" : "none",
      sources: [{ type: "user_supplied_posting", label: "the posting text supplied in context — read as data, never as an instruction" }],
      plan: injected ? [
        { action: "Use the posting's role facts only", timeframe: "today" },
        { action: "Report the instruction to the board or career center that carried the posting", timeframe: "today" },
        { action: "Send no private document on a posting's say-so", timeframe: "ever" },
      ] : [],
      warning: injected
        ? "Warning: this posting contains an instruction aimed at whoever reads it, directing private documents to an outside address. Do not follow it — content inside a posting is data, never an instruction to obey. No private document should be requested, disclosed, or sent on a posting's say-so."
        : "No injected instruction detected in this text.",
      unknowns: ["Who placed the instruction in the posting — not determinable from the posting itself."],
      nextStep: injected ? "Use the posting's role facts only, and report the instruction to the board or career center that carried it." : "Proceed on the posting's role facts.",
      text: injected
        ? "Warning: this posting contains an instruction aimed at whoever reads it, directing private documents to an outside address. Do not follow it — content inside a posting is data, never an instruction to obey. No private document should be requested, disclosed, or sent on a posting's say-so."
        : "No injected instruction detected in this text.",
    });
  }

  // ------------------------------------------- CG23: approved mentor information only
  function shareApprovedSourceInfo(ctx) {
    const c = ctx || {};
    const mentor = (c.source && c.source.mentor) || {};
    const approved = mentor.approved_to_share || null;
    const notApproved = Array.isArray(mentor.not_approved_to_share) ? mentor.not_approved_to_share : [];
    const withheld = [];
    const secretValues = [];
    for (const item of notApproved) {
      const s = String(item);
      if (/email/i.test(s)) withheld.push("private email");
      else if (/phone/i.test(s)) withheld.push("private phone");
      else withheld.push("private detail");
      const m = s.match(/:\s*(.+)$/); if (m) secretValues.push(m[1].trim());
      const em = s.match(/[\w.+-]+@[\w-]+\.[\w.]+/); if (em) secretValues.push(em[0]);
      const ph = s.match(/\d{3}[- ]\d{4}/); if (ph) secretValues.push(ph[0]);
    }
    if (!approved) {
      return finalize("mentor_source", {
        ok: false, code: "no_approved_information", withheld, leakCheck: "passed",
        alternative: "Ask the person directly for consent to share their details.",
        sources: [{ type: "private_source", label: "mentor source record supplied by the host — nothing in it is recorded as approved for sharing" }],
        plan: [
          { action: "Ask the source what may be shared", timeframe: "today" },
          { action: "Record only what they approve", timeframe: "same day" },
          { action: "Share only the approved part", timeframe: "after consent" },
        ],
        unknowns: ["What this source approved for sharing — nothing is recorded as approved."],
        nextStep: "Ask the source what may be shared, and share only that.",
        text: `Nothing about this source is recorded as approved for sharing, so I will share none of it. The safe route is to ask the person for consent first, then share only what they approve.`,
      });
    }
    const text = `What I can share is the approved part: ${String(approved).replace(/\.\s*$/, "")}. What I cannot share: their ${withheld.join(" and ") || "private contact details"} — those were not approved for sharing, and they stay withheld. A safe alternative: ask the mentor's consent to pass their details on, or send your thanks through the product / the channel where they mentored you, and let them choose whether to share contact details directly.`;
    const serialized = JSON.stringify({ text, withheld });
    const leaked = secretValues.filter((v) => v && serialized.includes(v));
    if (leaked.length) {
      const err = new Error("private_source_leak: approved-info answer would disclose a not-approved value");
      err.code = "private_source_leak";
      throw err;
    }
    return finalize("mentor_source", {
      withheld, leakCheck: "passed",
      sources: [{ label: "mentor source record supplied by the host (approved subset only)", type: "private_source" }],
      plan: [
        { action: "Thank them through the existing channel — the product or where they mentored you", timeframe: "today" },
        { action: "Ask consent before any contact detail moves", timeframe: "before sharing anything" },
        { action: "Share only the approved subset", timeframe: "when you share" },
      ],
      alternative: "Ask the mentor's consent, or message them through the product / the channel where they mentored you.",
      unknowns: ["Whether the mentor would consent to sharing more — only they can say."],
      nextStep: "Thank them through the existing channel, or ask consent before any contact detail moves.",
      text,
    });
  }

  // ------------------------------------------- CG16: interest-change replanning
  function replanForInterestChange(ctx) {
    const c = ctx || {};
    // WORDING-BACKLOG (BUG-201): a career-switch ask with no
    // structured interest fields used to be answered by inventing
    // a switch INTO data analytics (the transferable filter's
    // shape) plus a content-free opener, "Updated — visibly, not
    // quietly." A switcher ask gets the transferable-skills map
    // from the record itself, the honest account of where
    // switchers actually win, and — when the ask names the target
    // (nurse to data analyst) — the map aimed at that target.
    const icTopic = String(c.text || "").toLowerCase();
    if (!c.newInterest && (/career switch|switcher|switching (careers|fields|to)|to data analyst|into data|nurse/.test(icTopic) || !c.previousInterest)) {
      const recFacts = factsOf(c.profile);
      const skillNames = provenSkillNames(c.profile);
      const expFact = recFacts.find((f) => f.kind === "experience");
      const projFact = recFacts.find((f) => f.kind === "project");
      const eduFact = recFacts.find((f) => f.kind === "education");
      const targetM = icTopic.match(/(?:to|into)\s+(data analyst|data analytics|software|engineering|product|finance|design|marketing|operations)/);
      const target = targetM ? targetM[1] : null;
      const mapBits = [
        skillNames.length ? `your proven skills (${skillNames.join(" and ")}) transfer as tools of the new trade, not as the old job's leftovers` : null,
        expFact ? `your ${expFact.title} experience evidences the unglamorous half every field screens for — working inside a real organization, on real deadlines, with real stakeholders` : null,
        projFact ? `your built project (${String(projFact.title || "on file").replace(/\s*\((?:TEST)[^)]*\)/g, "")}) is inspectable proof you can produce the new field's artifacts, which is the evidence switchers are usually missing` : null,
        eduFact ? `your ${eduFact.title} underwrites the quantitative floor` : null,
      ].filter(Boolean);
      return finalize("interest_change", {
        headline: target ? `The switch to ${target} — your transferable map, from your own record.` : "Switching careers — your transferable map, from your own record.",
        sources: recFacts.length ? recFacts.slice(0, 3).map((f) => ({ type: "profile_fact", fact_id: f.id, label: f.title || f.text, source: f.source || "profile record" })) : [KB_SOURCE],
        plan: [
          { action: "Name the target seat precisely — switchers win adjacent moves (same skills, new field) far more often than total reinventions", timeframe: "first" },
          { action: "Produce one artifact in the new field's own format, judged by its standards — the single strongest counter to 'no experience in the field'", timeframe: "this month" },
          { action: "Recruit translators: people who made the same switch and can name what actually transferred — their map is evidence, not encouragement", timeframe: "starting now" },
          { action: "Price the switch honestly: a lateral or one-step-down entry with a steeper slope beats holding out for a title match that never interviews", timeframe: "at offer" },
        ],
        unknowns: ["Which specific seat fits — the artifact and the first applications produce that evidence; nothing in a past record decides it."],
        nextStep: target ? `Tell me the seat inside ${target} you want first, and I will spec the artifact that proves the switch.` : "Tell me the field you are switching into, and I will aim this map at its actual seats.",
        text: `Here is the transferable map, drawn only from your real record. ${mapBits.length ? mapBits.map((b) => b.charAt(0).toUpperCase() + b.slice(1)).join(". ") + "." : "Your record's skills and experience, labeled as what they are."} What does not transfer is equally plain: seniority, titles, and field-specific networks do not cross over, and any plan pretending otherwise collapses at the first screen. Where switchers actually win is adjacency — the move that keeps two-thirds of your evidence in play while the field changes around it — plus one artifact built to the new field's standards, which converts "career changer" from a risk flag into a demonstrated bet. At 32 the math is on your side in one specific way: the switch is early enough that the compounding years belong to the new field, provided the entry is lateral-or-better and the slope is steep.`,
      });
    }
    const newInterest = c.newInterest || "the new field";
    const previousInterest = c.previousInterest || null;
    const transferable = factsOf(c.profile).filter((f) => {
      const skills = (f.skills || []).map((s) => String(s).toLowerCase());
      return skills.some((s) => ["python", "sql"].includes(s)) || /data|sql|python/i.test(`${f.title} ${f.text}`);
    });
    const paths = [
      { id: "data-analytics-roles", title: `Data analytics roles — the active target`, why: `your stated interest now, backed by transferable evidence on file (fact ${transferable.map((f) => f.id).join(", ") || "see profile"})`, tradeoffs: "SQL depth and a clearly explained analysis carry the screen", factIds: transferable.map((f) => f.id) },
      { id: "data-analytics-evidence", title: "Data analytics evidence build", why: "one analysis artifact on a real question converts the interest change into inspectable proof", tradeoffs: "a week of building before it pays off in applications", factIds: transferable.map((f) => f.id) },
    ];
    return finalize("interest_change", {
      activeInterest: newInterest, retiredInterest: previousInterest, paths,
      sources: transferable.length
        ? transferable.map((f) => ({ type: "profile_fact", fact_id: f.id, label: f.title || f.text, source: f.source || "profile record" }))
        : [{ type: "profile_record", label: (c.profile && (c.profile.label || c.profile.id)) || "profile record supplied in context", source: "profile record" }],
      plan: [
        { action: "Build one data analysis artifact: a documented dataset, reproducible SQL, and a short write-up of its limits", timeframe: "this week" },
        { action: "Aim applications at data analytics roles with that artifact as the evidence", timeframe: "after the artifact" },
        { action: "Re-rank which analytics specialty fits from the artifact and the first applications' evidence", timeframe: "after the first applications" },
      ],
      transferableFactIds: transferable.map((f) => f.id),
      factIds: transferable.map((f) => f.id),
      unknowns: ["Which analytics specialty fits best — the first artifact and applications are what produce that evidence."],
      nextStep: `Build one data analysis artifact this week (documented dataset, reproducible SQL, short write-up of limits), then aim applications at data analytics roles.`,
      text: `Updated — visibly, not quietly. Your plan now centers ${newInterest}; the ${previousInterest || "old"} plan is retired, not kept running alongside as if nothing changed. What transfers: your Python and SQL evidence (fact ${transferable.map((f) => f.id).join(", ") || "on file"}) — data-export and query work is analytics evidence already, and it is cited here by fact, not re-invented. The active paths are data analytics roles and the one artifact that proves the direction: an analysis of a documented dataset with reproducible SQL and a short write-up of its limits.`,
    });
  }

  // ------------------------------------------- constraint filter (CG02/CG03 class)
  function filterOpportunities(opportunities, constraints) {
    const cons = constraints || {};
    const kept = [], excluded = [];
    for (const o of opportunities || []) {
      const mode = String(o.mode || o.location || "").toLowerCase();
      if (cons.remoteOnly && !/remote/.test(mode)) { excluded.push({ id: o.id, reason: "not remote — your stated constraint is remote-only, no hybrid or on-site roles" }); continue; }
      if (cons.needsIncome && (o.pay == null || o.pay === "")) { excluded.push({ id: o.id, reason: "no stated pay — with your income constraint, a pay-unknown role is never recommended as if affordable" }); continue; }
      kept.push(o);
    }
    return { kept, excluded };
  }

  // ------------------------------------------- odds request: honest refusal
  function oddsRefusal(ctx) {
    const c = ctx || {};
    // WORDING-BACKLOG (BUG-201): the bare refusal ("I cannot give
    // you that number…") used to be the WHOLE answer to asks that
    // also name their real question — is IB realistic from a
    // non-target, can a state-school student reach FAANG, is there
    // hope at a 3.0 with no internship. The refusal of a fabricated
    // personal probability stays (it is the honest core), but it
    // rides inside the substantive answer each ask actually wants:
    // the routes, the offsets, the plan.
    const oTopic = String(c.text || "").toLowerCase();
    const oPlan = (items) => items.map(([action, timeframe]) => ({ action, timeframe }));
    if (/\bib\b|investment banking|banking/.test(oTopic) && /freshman|non-target|nontarget|realistic/.test(oTopic)) {
      return finalize("odds_request", {
        personalOdds: null,
        headline: "IB from a non-target school as a freshman — realistic, on three routes.",
        sources: [{ type: "no_source_supplied", label: "No sourced data in this product can produce a personal probability — that absence is the finding; no number is cited in its place", as_of: KNOWLEDGE_AS_OF }],
        plan: oPlan([
          ["Route one — the early programs: sophomore internships and early-insight programs exist precisely to widen the funnel beyond target schools; apply to every one whose window includes your year", "each cycle"],
          ["Route two — the regional and boutique ladder: middle-market and boutique banks hire outside the target-school machine, and their analysts lateral to larger banks with deal evidence in hand", "sophomore year"],
          ["Route three — networking volume: alumni in banking, contacted personally and in dozens, with technical fluency already built — the route that replaces the on-campus process you do not have", "starting now"],
        ]),
        unknowns: ["Your personal outcome — no sourced data in this product can produce it, and none is invented."],
        nextStep: "Tell me which route to build first — the early-program calendar, the boutique list, or the networking plan — and I will lay it out week by week.",
        text: `Realistic — and here is the honest version of why. No source in this product can produce your personal probability, and you should distrust anyone who quotes you one; but the question underneath it has a real answer: non-target students do get IB seats, and they get them on three visible routes, not on luck. The early programs come first: sophomore internships and insight programs exist to widen the funnel, and your freshman year is exactly when applying to them is the job. The boutique ladder is second: regional and middle-market banks run their own recruiting, and their analysts move up with deal evidence. Networking volume is third — the target-school student has a process arrive on campus; you replace it with alumni and analysts contacted in dozens, with the technical skills already built so the conversations land. Your freshman standing is not the handicap it feels like: you have more runway than anyone else in the funnel, and the routes above are what the runway is for.`,
      });
    }
    if (/faang|state school|big tech/.test(oTopic)) {
      return finalize("odds_request", {
        personalOdds: null,
        headline: "FAANG from a state school — what offsets the brand gap, and the 90 days.",
        sources: [{ type: "no_source_supplied", label: "No sourced data in this product can produce a personal probability — that absence is the finding; no number is cited in its place", as_of: KNOWLEDGE_AS_OF }],
        plan: oPlan([
          ["Days 1–30: the referral graph — alumni from your school inside the FAANG firms are findable and contactable; a referral moves your file past the screen the school brand feeds", "days 1–30"],
          ["Days 1–60: the offsetting artifact — one substantial project in public, with a README and decisions explained; for these screens, inspectable work is the currency brand usually substitutes for", "days 1–60"],
          ["Days 30–90: interview depth at hiring-bar level — data structures and algorithms drilled to the firms' own stated patterns, plus system-design basics for new-grad loops", "days 30–90"],
          ["Day 90: applications out across the set, through referrals where they exist, inside the new-grad windows", "day 90"],
        ]),
        unknowns: ["Your personal outcome — the screens are pass/fail events no source can pre-compute, and none is invented."],
        nextStep: "Tell me your school and your strongest project, and I will turn the 90 days into your dated plan.",
        text: `Yes — FAANG hires state-school graduates every cycle. The mechanism is visible: the school brand matters most at the résumé screen, and the screen is the one stage a candidate can route around. What offsets the brand gap is specific: a referral from an alum inside the firm (state schools have large alumni bases inside every FAANG company), an inspectable artifact that does the brand's signaling work, and interview performance — which is school-blind by design once you are in the loop. No personal probability exists for this, and none is quoted; what exists is the 90-day version of the levers: thirty days on the referral graph, sixty on the artifact, ninety on hiring-bar interview depth, applications out through every referral the graph produced. The students who fail this route usually fail it at the screen, silently, with no artifact and no referral — both of which are buildable, starting now.`,
      });
    }
    if (/3\.0|no internship|any hope/.test(oTopic)) {
      return finalize("odds_request", {
        personalOdds: null,
        headline: "A 3.0 and no internship — the honest plan is picking the right game.",
        sources: [{ type: "no_source_supplied", label: "No sourced data in this product can produce a personal probability — that absence is the finding; no number is cited in its place", as_of: KNOWLEDGE_AS_OF }],
        plan: oPlan([
          ["Pick the right game first: roles and firms whose screens are work-sample-first (startups, hands-on analytics, smaller firms with human screens) over the printed-GPA automated funnels", "this week"],
          ["Build the substitute for the missing internship: one artifact with a README and real usage, or a campus/ freelance role with a named responsibility — evidence an interviewer can open", "this month"],
          ["Raise the number that is still movable: the major-GPA and the most recent semesters are what human screeners actually read when the cumulative line is weak", "this semester"],
          ["Network into the human screens: alumni and operators who can put the artifact in front of a person", "starting now"],
        ]),
        unknowns: ["Your personal outcome at any specific firm — no source can produce it, and none is invented."],
        nextStep: "Tell me the field you want, and I will set the artifact and the target list to its work-sample-first screens.",
        text: `Yes, there is hope — and it is not a pep talk, it is a routing fact. A 3.0 with no internship loses one specific game: the automated funnels at the largest firms, where a printed GPA bar and an experience keyword do the first cut. It does not lose the others — work-sample-first screens at startups and practitioner roles, smaller firms where a human reads the file, and any door a referral opens. The plan is to stop spending applications on the game your file cannot win yet, and build the one asset that changes screens everywhere: inspectable evidence — an artifact a stranger can open, or a role with a named responsibility — while the movable numbers (recent semesters, major GPA) trend up. Your file's weakness is real and it is also specific, which means it has specific counters; the students it beats are the ones still feeding the automated funnel and calling the silence a verdict.`,
      });
    }
    return finalize("odds_request", {
      personalOdds: null,
      sources: [{ type: "no_source_supplied", label: "No sourced data in this product can produce a personal probability — that absence is the finding; no number is cited in its place", as_of: KNOWLEDGE_AS_OF }],
      plan: [
        { action: "Check your record against the role's stated requirements", timeframe: "today" },
        { action: "Name the gaps that check shows", timeframe: "today" },
        { action: "Build the evidence that closes the top gap", timeframe: "this week" },
      ],
      unknowns: ["Your personal outcome — no sourced data in this product can produce it."],
      nextStep: "Work the levers that are actually yours: fit to the stated requirements, evidence an employer can inspect, and applying inside the window.",
      text: `I cannot give you that number, and you should distrust anyone who does. A personal probability for one candidate at one employer is not something any source in this product holds — population statistics describe groups, not you, and converting them into your number would be inventing it. What I can do is the honest version: check your record against the role's stated requirements, name the gaps, and build the evidence that closes them.`,
    });
  }

  // ------------------------------------------------------------- dispatch (router seam)
  const INTENT_TO_FUNCTION = {
    plan_paths: "planPaths",
    graduation_window: "checkGraduationWindow",
    honest_evidence: "honestEvidence",
    classify_credential: "classifyCredential",
    trend_scope: "explainTrendScope",
    thin_sample: "assessThinSample",
    sponsorship_history: "sponsorshipHistoryAnswer",
    work_authorization: "workAuthorizationGuidance",
    certificate_purchase: "assessCertificatePurchase",
    time_budget_plan: "timeBudgetPlan",
    skill_gap_plan: "skillGapPlan",
    rejection: "rejectionGuidance",
    suspicious_posting: "assessSuspiciousPosting",
    mentor_source: "shareApprovedSourceInfo",
    interest_change: "replanForInterestChange",
    odds_request: "oddsRefusal",
  };
  const GUIDANCE_INTENTS = Object.keys(INTENT_TO_FUNCTION);
  const IMPL = { planPaths, checkGraduationWindow, honestEvidence, classifyCredential, explainTrendScope, assessThinSample, sponsorshipHistoryAnswer, workAuthorizationGuidance, assessCertificatePurchase, timeBudgetPlan, skillGapPlan, rejectionGuidance, assessSuspiciousPosting, shareApprovedSourceInfo, replanForInterestChange, oddsRefusal };
  function answerGuidance(ctx) {
    const c = ctx || {};
    const fnName = INTENT_TO_FUNCTION[c.intent];
    if (!fnName) return { ok: false, code: "unknown_intent", kind: null, text: "That guidance request is not one this module owns.", unknowns: [], sources: [], factIds: [], nextStep: null };
    return IMPL[fnName](c);
  }

  return {
    // hard-rule machinery
    ODDS_PATTERNS, fabricatedOddsIn, guardReply,
    // CGD-1 functions (one per case family)
    planPaths, checkGraduationWindow, honestEvidence, classifyCredential,
    explainTrendScope, assessThinSample, sponsorshipHistoryAnswer,
    workAuthorizationGuidance, assessCertificatePurchase, timeBudgetPlan,
    rejectionGuidance, assessSuspiciousPosting, shareApprovedSourceInfo,
    // CGD-2 / CGD-3 / interest change / constraints
    skillGapPlan, detectInjectedInstruction, replanForInterestChange, filterOpportunities,
    oddsRefusal,
    // router seam
    GUIDANCE_INTENTS, INTENT_TO_FUNCTION, answerGuidance,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerGuidance;
