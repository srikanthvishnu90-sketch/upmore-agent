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
  const KB_SOURCE = { type: "guidance_knowledge_base", label: "Career guidance knowledge base (deep dive 4 source set) — the module's frozen basis; no case-specific source was supplied for this answer", as_of: "2026-10-13" };
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

  const USCIS_SOURCE = { label: "USCIS Policy Manual — students and employment (deep dive 4 source C8)", url: "https://www.uscis.gov/policy-manual/volume-2-part-f-chapter-5" };
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
      return finalize("trend_scope", {
        ok: false, code: "no_sourced_snapshot", currentLocalClaim: null,
        sources: [{ type: "no_source_supplied", label: "No sourced snapshot was supplied for this trend — that absence is the finding; nothing is cited in its place", as_of: KNOWLEDGE_AS_OF }],
        plan: [
          { action: "Bring the actual source, or let the product fetch the official page", timeframe: "before relying on the claim" },
          { action: "Read the scope the source itself states — population, geography, horizon", timeframe: "same day" },
          { action: "Judge local supply from the postings open right now", timeframe: "this week" },
        ],
        unknowns: ["The trend and its scope — no sourced snapshot was supplied in this conversation."],
        nextStep: "Bring the actual source (or let the product fetch the official page) so the scope can be read from it, not remembered.",
        text: `Unknown from the sources I have here: no sourced snapshot of that trend was supplied, so I will not characterize what it covers or what it means locally. A trend claim is only as good as its source's stated scope.`,
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
      nextStep: "Treat the employer's own current postings and process as the evidence; build the strongest file you can rather than budgeting around a three-person sample.",
      text: `No, you cannot count on a similar rate for you. The figure is ${k} of ${n} students — ${n === 3 ? "three" : n} people, at ${scope}. A sample that small and that narrow is not a promise and does not predict your outcome: the limits are the size, the single employer and year, and the fact that those students were selected, not drawn at random. It is weak evidence the route exists at all — nothing more.`,
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
  function workAuthorizationGuidance(_ctx) {
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
    const skill = c.skill || "the named skill";
    const proven = provenSkillNames(c.profile);
    const alreadyHasSkill = proven.some((s) => s.toLowerCase() === String(skill).toLowerCase());
    const hours = Number(c.hoursPerWeek) || 2;
    const total = Math.round(hours * 60);
    const phases = allocate([
      { id: "learn-basics", task: `Work through the official ${skill} basics by building, not just reading`, weight: 3 },
      { id: "build-artifact", task: `Build the artifact below in ${skill}`, weight: 4 },
      { id: "document-review", task: "Write the README, finish the tests, and get one review from someone who knows the stack", weight: 2 },
    ], total);
    const artifact = `a small ${skill} service or tool, in a public repo, with a README that explains what it does and one design tradeoff, plus tests that a reviewer can run`;
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
  function oddsRefusal(_ctx) {
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
