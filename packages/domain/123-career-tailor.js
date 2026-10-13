/* Career tailoring + truth audit (Doc 2 §3, §3.5, §4.2, S8; capabilities
   APPL-001, APPL-002, APPE-002, APPE-003, APPE-004).
   Pipeline (Doc 2 §3.1): parse the JD (must-have vs nice-to-have, level,
   keywords) -> select profile facts ranked by relevance / recency / impact
   -> assemble bullets where EVERY output line carries its fact IDs ->
   role-family variant conventions -> truth audit as a HARD GATE -> ATS-safe
   render (single-column plain text + clean markdown; standard headings).
   TRUTH AUDIT (APPE-002): auditResume(lines, profile) maps every content
   line to >=1 CONFIRMED fact ID whose text supports it. A keyword/skill may
   appear ONLY if a profile fact evidences that skill. A number may appear
   only if a supporting fact states it. Anything unmappable is a violation,
   and tailorResume REFUSES: { ok:false, refused:true, violations, output:
   null } — a tailored resume is never shipped with an audit warning.
   Unconfirmed (needs_confirmation) facts support nothing: resume-ingested
   drafts must be confirmed by the user first.
   PDF: packages/domain/62-agent-documents.js provides a document VAULT
   (metadata, receipts, policies) — it has no PDF/DOCX renderer. So render()
   returns text + markdown only and says pdf:null honestly; no renderer is
   rebuilt here.
   AI-USE RULES (Doc 2 S8, owner ruling 2026-10-12): when the CIR input says
   the company bans AI-written application text (cir.aiPolicy === "ban" or
   cir.bansAiWrittenText), tailorResume degrades to mode:"outline" —
   outline + fact-cited bullets for the USER to write from — and no cover
   letter prose is generated at all.
   Banned phrases: shared with Doc 1 §3.2 (outreach) plus Doc 2 §3.4 cover
   letter filler. Cover letters are linted; a banned phrase is a failure,
   never shipped.
   Pure: profile, JD text and CIR are passed in. UMD. */
const CareerTailor = (() => {
  const Profile = typeof CareerProfile !== "undefined" ? CareerProfile : require("./122-career-profile.js");

  const BANNED_PHRASES = [
    "i hope this email finds you well",
    "i came across your profile and was impressed",
    "pick your brain",
    "i'd love to connect",
    "i am writing to express my interest",
    "to whom it may concern",
    "passionate team player",
    "results-driven professional",
    "team player with a proven track record",
    "synergy",
    "think outside the box",
    "fast-paced environment enthusiast",
  ];
  function bannedPhrasesIn(text) {
    const t = String(text || "").toLowerCase();
    return BANNED_PHRASES.filter((p) => t.includes(p));
  }

  // Skill lexicon for JD parsing + audit keyword checks. Deliberately finite:
  // a word not in this list is ordinary prose, not a claimed skill.
  const SKILL_LEXICON = ["Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust", "Ruby", "Swift", "Kotlin", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "React", "Angular", "Vue", "Node.js", "Django", "Flask", "Spring", "Kubernetes", "Docker", "Terraform", "AWS", "GCP", "Azure", "Git", "Linux", "Machine Learning", "TensorFlow", "PyTorch", "Pandas", "NumPy", "Excel", "Financial Modeling", "Valuation", "Bloomberg", "Capital IQ", "PowerPoint", "Tableau", "Figma", "Photoshop", "A/B Testing", "Statistics", "Probability", "Data Structures", "Algorithms", "System Design", "CI/CD", "GraphQL", "REST", "Spark", "Hadoop", "R"];
  const lexLower = new Map(SKILL_LEXICON.map((s) => [s.toLowerCase(), s]));
  function skillsInText(text) {
    const t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9+#. ]/g, " ")} `;
    const found = [];
    for (const s of SKILL_LEXICON) {
      const needle = ` ${s.toLowerCase()} `;
      // single-letter / dotted skills need token care; substring on padded text is the deterministic rule here.
      if (t.includes(needle) || t.includes(` ${s.toLowerCase()},`) || t.includes(` ${s.toLowerCase()}.`)) if (!found.includes(s)) found.push(s);
    }
    return found;
  }
  const numbersIn = (text) => (String(text || "").match(/\d[\d,.]*%?/g) || []).map((x) => x.replace(/,/g, ""));

  // ---- JD parsing (Doc 2 §3.1 step 1) ----
  function parseJD(text) {
    const raw = String(text || "");
    const low = raw.toLowerCase();
    const niceIdx = low.search(/nice to have|preferred qualifications|bonus points|plus(es)?[:\s]|preferred[:\s]/);
    const mustText = niceIdx >= 0 ? raw.slice(0, niceIdx) : raw;
    const niceText = niceIdx >= 0 ? raw.slice(niceIdx) : "";
    const mustSkills = skillsInText(mustText);
    const niceSkills = skillsInText(niceText).filter((s) => !mustSkills.includes(s));
    let level = "unspecified";
    if (/intern(ship)?\b/i.test(raw)) level = "intern";
    else if (/new grad|entry[- ]level|junior/i.test(raw)) level = "new-grad/junior";
    else if (/senior|staff|principal/i.test(raw)) level = "senior";
    else if (/manager|lead\b/i.test(raw)) level = "manager/lead";
    const keywords = [...new Set(raw.toLowerCase().replace(/[^a-z0-9+# ]/g, " ").split(/\s+/).filter((w) => w.length > 4))].slice(0, 200);
    const family = detectFamily(raw);
    return { mustHaveSkills: mustSkills, niceToHaveSkills: niceSkills, level, keywords, family, rawText: raw };
  }
  function detectFamily(text) {
    const t = String(text || "").toLowerCase();
    const score = {
      swe: /\b(software engineer|backend|front[- ]?end|full[- ]?stack|api|deployment|kubernetes|react)\b/.test(t) ? 2 : 0,
      quant: /\b(quant|trader|probability|stochastic|low[- ]latency|market making)\b/.test(t) ? 2 : 0,
      ib_finance: /\b(investment banking|analyst|m&a|dcf|valuation|deal|banking)\b/.test(t) ? 2 : 0,
      consulting: /\b(consulting|consultant|case study|client engagement|strategy)\b/.test(t) ? 2 : 0,
      pm: /\b(product manager|product management|roadmap|user research)\b/.test(t) ? 2 : 0,
      data_ml: /\b(data scientist|machine learning|ml engineer|data analyst|analytics)\b/.test(t) ? 2 : 0,
      design: /\b(product designer|ux|ui designer|figma|portfolio)\b/.test(t) ? 2 : 0,
      law: /\b(summer associate|law firm|legal intern|moot court|law review|juris doctor)\b/.test(t) ? 2 : 0,
      medicine: /\b(medical school|pre-?med|clinical|mcat|shadowing|patient care)\b/.test(t) ? 2 : 0,
    };
    const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] > 0 ? best[0] : "swe";
  }

  // ---- role-family variants (Doc 2 §3.3) — SWE + IB/finance most fully realised ----
  const FAMILIES = {
    swe: { label: "SWE", sectionOrder: ["Skills", "Experience", "Projects", "Education", "Leadership"], skillsBlock: "grouped", bulletStyle: "outcome-first", conventions: ["Skills block first (languages, infra), projects with stack and scale, internships with measurable impact, GitHub link in header."], pageLimit: 1 },
    ib_finance: { label: "IB/finance", sectionOrder: ["Education", "Experience", "Leadership", "Projects", "Skills"], skillsBlock: "technical-line", bulletStyle: "concise-deal", conventions: ["Strict one-pager: education first for students, GPA shown, deal/transaction and modelling experience, finance club roles, skills rendered as a single 'Technical skills:' line (Excel, Bloomberg, Capital IQ only where evidenced)."], pageLimit: 1 },
    quant: { label: "Quant/trader", sectionOrder: ["Education", "Projects", "Experience", "Skills"], skillsBlock: "grouped", bulletStyle: "outcome-first", conventions: ["Competitions, research, probability/statistics coursework and data or low-latency projects lead."], pageLimit: 1 },
    consulting: { label: "Consulting", sectionOrder: ["Education", "Experience", "Leadership", "Projects", "Skills"], skillsBlock: "grouped", bulletStyle: "accomplished-x-by-y-z", conventions: ["Every bullet in 'Accomplished X by Y, resulting in Z' form, from the fact's action/method/result fields only; leadership and quantified results lead."], pageLimit: 1 },
    pm: { label: "PM", sectionOrder: ["Experience", "Projects", "Leadership", "Skills", "Education"], skillsBlock: "grouped", bulletStyle: "outcome-first", conventions: ["Shipped things, metrics moved, user research and cross-functional leadership lead."], pageLimit: 1 },
    data_ml: { label: "Data/ML", sectionOrder: ["Skills", "Projects", "Experience", "Education"], skillsBlock: "grouped", bulletStyle: "outcome-first", conventions: ["Models shipped, evaluation metrics and tooling lead; papers where present."], pageLimit: 1 },
    design: { label: "Design", sectionOrder: ["Projects", "Experience", "Skills", "Education"], skillsBlock: "grouped", bulletStyle: "outcome-first", conventions: ["Portfolio-first: projects lead and the portfolio link sits in the header."], pageLimit: 1 },
    law: { label: "Law (Big Law summer associate)", sectionOrder: ["Education", "Experience", "Leadership", "Projects", "Skills"], skillsBlock: "grouped", bulletStyle: "outcome-first", conventions: ["CV conventions: education first with school and journal signals, then legal experience and leadership; conservative formatting, one page."], pageLimit: 1 },
    medicine: { label: "Medicine (med-school application)", sectionOrder: ["Education", "Experience", "Projects", "Leadership", "Skills"], skillsBlock: "grouped", bulletStyle: "outcome-first", conventions: ["Clinical and research experience forward, each activity cited to a real experience fact; service and leadership shown with sustained commitment."], pageLimit: 1 },
  };

  // ---- fact selection: relevance, then recency, then impact (Doc 2 §3.1 step 3) ----
  function scoreFact(fact, jd) {
    const wanted = [...(jd.mustHaveSkills || []), ...(jd.niceToHaveSkills || [])];
    const fskills = (fact.skills || []).map((s) => String(s).toLowerCase());
    let relevance = 0;
    for (const s of wanted) relevance += fskills.includes(s.toLowerCase()) ? 3 : (String(fact.text || "").toLowerCase().includes(s.toLowerCase()) ? 1 : 0);
    for (const kw of jd.keywords || []) if (kw.length > 5 && String(fact.text || "").toLowerCase().includes(kw)) relevance += 0.25;
    const endMs = fact.end ? Date.parse(`${fact.end}-01T00:00:00Z`) : (fact.start ? Date.parse(`${fact.start}-01T00:00:00Z`) : 0);
    const recency = Number.isFinite(endMs) && endMs ? Math.min(2, Math.max(0, (endMs / 1e12))) : 0;
    const impact = numbersIn(fact.text).length + (fact.metrics ? fact.metrics.length : 0);
    return { factId: fact.id, relevance: Math.round(relevance * 100) / 100, recency: Math.round(recency * 100) / 100, impact, total: Math.round((relevance * 10 + recency + impact) * 100) / 100 };
  }
  function selectFacts(profile, jd, opts) {
    const o = opts || {};
    const pool = Profile.confirmedFacts(profile).filter((f) => f.kind !== "skill");
    return pool.map((f) => ({ fact: f, score: scoreFact(f, jd) })).sort((a, b) => b.score.total - a.score.total).slice(0, o.limit || 8);
  }
  function provenSkills(profile, jd) {
    const wanted = [...(jd.mustHaveSkills || []), ...(jd.niceToHaveSkills || [])];
    const all = Profile.listFacts(profile, { kind: "skill" }).filter((f) => !f.needs_confirmation);
    const rows = all.map((f) => ({ name: f.name, factId: f.id, proven: !f.unproven, evidence: f.evidence || [] }));
    // Wanted skills first, then the rest, each only ever listed with its proof state.
    return rows.sort((a, b) => (wanted.includes(b.name) - wanted.includes(a.name)));
  }

  function bulletFor(fact, family) {
    const fam = FAMILIES[family] || FAMILIES.swe;
    if (fam.bulletStyle === "accomplished-x-by-y-z" && fact.action && fact.method && fact.result) {
      return { text: `Accomplished ${fact.action} by ${fact.method}, resulting in ${fact.result}`, factIds: [fact.id] };
    }
    const base = (fact.bullets && fact.bullets[0]) || fact.text;
    return { text: base, factIds: [fact.id] };
  }

  function assemble(profile, jd, opts) {
    const o = opts || {};
    const family = o.family || jd.family || "swe";
    const fam = FAMILIES[family] || FAMILIES.swe;
    const selected = selectFacts(profile, jd, o);
    const byKind = { experience: [], project: [], education: [], leadership: [] };
    for (const { fact } of selected) if (byKind[fact.kind]) byKind[fact.kind].push(fact);
    const sections = [];
    const skillsProven = provenSkills(profile, jd).filter((s) => s.proven);
    const skillsLine = skillsProven.length ? { heading: "Skills", lines: [] } : null;
    if (skillsLine) {
      if (fam.skillsBlock === "technical-line") {
        skillsLine.lines.push({ text: `Technical skills: ${skillsProven.map((s) => s.name).join(", ")}`, factIds: skillsProven.map((s) => s.factId), type: "skills" });
      } else {
        skillsLine.lines.push({ text: skillsProven.map((s) => s.name).join(", "), factIds: skillsProven.map((s) => s.factId), type: "skills" });
      }
    }
    const mk = (heading, facts) => facts.length ? { heading, lines: facts.flatMap((f) => [{ text: f.title, factIds: [f.id], type: "entry" }, ...((f.bullets && f.bullets.length ? f.bullets : [f.text]).map((b) => family === "consulting" && f.action ? bulletFor(f, family) : { text: b, factIds: [f.id], type: "bullet" }))]) } : null;
    // consulting: one structured bullet per fact replaces the raw bullets
    const mkSection = (heading, facts) => {
      if (!facts.length) return null;
      if (family === "consulting") return { heading, lines: facts.flatMap((f) => [{ text: f.title, factIds: [f.id], type: "entry" }, bulletFor(f, family)]) };
      return mk(heading, facts);
    };
    const sectionByHeading = {
      Skills: skillsLine,
      Experience: mkSection("Experience", byKind.experience),
      Projects: mkSection("Projects", byKind.project),
      Education: mkSection("Education", byKind.education),
      Leadership: mkSection("Leadership", byKind.leadership),
    };
    for (const h of fam.sectionOrder) if (sectionByHeading[h]) sections.push(sectionByHeading[h]);
    for (const h of Object.keys(sectionByHeading)) if (sectionByHeading[h] && !sections.includes(sectionByHeading[h])) sections.push(sectionByHeading[h]);
    const lines = sections.flatMap((s) => s.lines.map((l) => ({ ...l, section: s.heading })));
    return { family, familyLabel: fam.label, conventions: fam.conventions, pageLimit: fam.pageLimit, header: { name: profile.basics.name, email: profile.basics.email, location: profile.basics.location, links: profile.basics.links || {} }, sections, lines, selectedFactIds: selected.map((x) => x.fact.id) };
  }

  // ---- TRUTH AUDIT — hard gate (APPE-002) ----
  function auditResume(resume, profile) {
    const lines = Array.isArray(resume) ? resume : (resume && resume.lines) || [];
    const violations = [];
    for (const line of lines) {
      const text = typeof line === "string" ? line : line.text;
      const factIds = typeof line === "string" ? [] : (line.factIds || []);
      if (!text || !String(text).trim()) continue;
      if (!factIds.length) { violations.push({ line: text, reason: "no fact ID: line maps to no profile fact", factIds: [] }); continue; }
      const facts = factIds.map((id) => Profile.getFact(profile, id));
      if (facts.some((f) => !f)) { violations.push({ line: text, reason: `unknown fact ID (${factIds.filter((id, i) => !facts[i]).join(", ")})`, factIds }); continue; }
      if (facts.some((f) => f.needs_confirmation)) { violations.push({ line: text, reason: "supported only by an unconfirmed (needs_confirmation) fact", factIds }); continue; }
      const supportText = facts.map((f) => `${f.title} ${f.text} ${(f.bullets || []).join(" ")}`).join(" ").toLowerCase();
      // Keyword rule: any lexicon skill named in the line must be evidenced.
      for (const skill of skillsInText(text)) {
        const ev = Profile.skillEvidence(profile, skill);
        const cited = factIds.some((id) => ev.evidenceFactIds.includes(id) || (Profile.getFact(profile, id) || {}).name === skill);
        const inSupport = supportText.includes(skill.toLowerCase()) && ev.proven;
        if (!ev.proven || (!cited && !inSupport)) violations.push({ line: text, reason: `skill "${skill}" is not evidenced by the cited fact(s)`, factIds, skill });
      }
      // Number rule: any number in the line must appear in a supporting fact.
      for (const n of numbersIn(text)) {
        if (!supportText.replace(/,/g, "").includes(n)) violations.push({ line: text, reason: `number "${n}" does not appear in any supporting fact`, factIds });
      }
      // Support rule: a skill-fact-only line is fine (the skills line); other
      // lines must share meaningful tokens with their supporting facts.
      const onlySkillFacts = facts.every((f) => f.kind === "skill");
      if (!onlySkillFacts) {
        const tokens = String(text).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
        const hits = tokens.filter((w) => supportText.includes(w)).length;
        if (tokens.length && hits / tokens.length < 0.35) violations.push({ line: text, reason: "line text is not supported by its cited fact(s) (token overlap too low)", factIds });
      }
    }
    return { ok: violations.length === 0, violations, checked: lines.length };
  }
  const audit = auditResume;

  // ---- diff vs base resume (Doc 2 §3.1 step 8) ----
  function diffResume(baseLines, tailored, profile) {
    const base = (baseLines || []).map((l) => (typeof l === "string" ? l : l.text));
    const out = ((tailored && tailored.lines) || []).map((l) => l.text);
    const baseSet = new Map(base.map((t, i) => [t, i]));
    const outSet = new Map(out.map((t, i) => [t, i]));
    const added = [], moved = [], removed = [];
    ((tailored && tailored.lines) || []).forEach((l, i) => {
      if (!baseSet.has(l.text)) {
        // Reason cites the EVIDENCE behind the line, not just its own fact:
        // for a skills line that is the project/experience fact that proves
        // the skill (Doc 2 §3.1 step 8: "added Kubernetes — you deployed on
        // EKS in Project X (fact F-…)").
        const cited = new Set(l.factIds || []);
        if (profile) for (const id of l.factIds || []) { const f = Profile.getFact(profile, id); if (f && f.kind === "skill") for (const e of f.evidence || []) cited.add(e); }
        const facts = [...cited];
        const skillNames = skillsInText(l.text);
        added.push({ text: l.text, factIds: l.factIds || [], evidenceFactIds: facts, reason: skillNames.length ? `added ${skillNames.join(", ")} — evidenced by fact ${facts.join(", ")}` : `added — supported by fact ${facts.join(", ") || "none"}` });
      } else if (baseSet.get(l.text) !== i) moved.push({ text: l.text, from: baseSet.get(l.text), to: i, reason: "moved — section order follows the role-family variant" });
    });
    base.forEach((t) => { if (!outSet.has(t)) removed.push({ text: t, reason: "removed — not selected for this role (relevance/recency/impact ranking)" }); });
    const changed = added.length + removed.length;
    return { added, moved, removed, summary: `${added.length} added, ${removed.length} removed, ${moved.length} moved (${changed} content changes)` };
  }

  // ---- ATS-safe render (Doc 2 §3.1 step 6) ----
  function render(resume) {
    const secs = resume.sections || [];
    const head = [resume.header && resume.header.name, resume.header && resume.header.email, resume.header && resume.header.location].filter(Boolean).join(" | ");
    const links = Object.values((resume.header && resume.header.links) || {}).filter(Boolean).join(" | ");
    const textParts = [head, links].filter(Boolean);
    const mdParts = [`# ${(resume.header && resume.header.name) || ""}`, [resume.header && resume.header.email, resume.header && resume.header.location].filter(Boolean).join(" | ")].filter(Boolean);
    for (const s of secs) {
      textParts.push("", s.heading.toUpperCase(), ...s.lines.map((l) => (l.type === "bullet" ? `- ${l.text}` : l.text)));
      mdParts.push("", `## ${s.heading}`, ...s.lines.map((l) => (l.type === "bullet" ? `- ${l.text}` : l.text)));
    }
    return { text: textParts.join("\n"), markdown: mdParts.join("\n"), pdf: null, pdfNote: "No PDF renderer exists in packages/domain/62-agent-documents.js (it is a document vault, not a renderer); plain text is the ATS-safe extractable form.", singleColumn: true, headings: secs.map((s) => s.heading.toUpperCase()) };
  }

  // ---- cover letter (Doc 2 §3.4; APPL-002) ----
  function wordCount(t) { return String(t || "").trim().split(/\s+/).filter(Boolean).length; }
  function generateCoverLetter(profile, jdInput, cir, opts) {
    const o = opts || {};
    const jd = jdInput && jdInput.mustHaveSkills ? jdInput : parseJD((jdInput && jdInput.text) || jdInput || "");
    if (cir && (cir.aiPolicy === "ban" || cir.bansAiWrittenText)) {
      return { ok: false, mode: "outline", reason: "company bans AI-written application text (CIR); outline only — the user writes the letter (Doc 2 S8)", outline: coverOutline(profile, jd, cir), text: null };
    }
    const companyFacts = (cir && cir.facts) || [];
    if (!cir || !cir.company || !companyFacts.length) return { ok: false, reason: "no real company fact in the CIR input; a cover letter is never written from invented company facts", text: null };
    const selected = selectFacts(profile, jd, { limit: 3 });
    if (!selected.length) return { ok: false, reason: "no confirmed profile facts to prove fit", text: null };
    const proof = selected[0].fact;
    const companyFact = companyFacts[0];
    const role = o.role || jd.level || "the role";
    const name = profile.basics.name || "Candidate";
    const sentences = [
      `Dear ${cir.company} hiring team,`,
      `I am applying for ${role} at ${cir.company}. ${companyFact.text || companyFact}`,
      `In my own work, ${proof.text}`,
    ];
    if (selected[1]) sentences.push(`I have also done work that maps directly to this team: ${selected[1].fact.text}`);
    if (selected[2]) sentences.push(`Earlier experience adds range: ${selected[2].fact.text}`);
    sentences.push(`That combination — direct, measured work and a specific interest in ${cir.company} — is why I am applying here rather than sending the same letter everywhere. I would welcome the chance to talk through the work in detail.`);
    sentences.push(`Thank you for your time.`, `Sincerely,`, `${name}`);
    let text = sentences.join("\n\n");
    // Deterministic length control into the 150–250 window using only real facts.
    let guard = 0;
    while (wordCount(text) < 150 && guard++ < 3) {
      const extra = selected[guard % selected.length];
      if (!extra) break;
      text = text.replace("\n\nThank you", `\n\nOne further proof point from my record: ${extra.fact.text}\n\nThank you`);
    }
    const banned = bannedPhrasesIn(text);
    if (banned.length) return { ok: false, reason: `cover letter contains banned phrase(s): ${banned.join(", ")}`, text: null, banned };
    const wc = wordCount(text);
    if (wc < 150 || wc > 250) return { ok: false, reason: `cover letter is ${wc} words, outside the 150-250 window`, text: null, wordCount: wc };
    const auditResult = auditResume([{ text: proof.text, factIds: [proof.id] }], profile);
    return { ok: true, text, wordCount: wc, companyFact: companyFact.text || companyFact, proofFactId: proof.id, factIds: selected.map((x) => x.fact.id), banned: [], groundedAuditOk: auditResult.ok };
  }
  function coverOutline(profile, jd, cir) {
    const selected = selectFacts(profile, jd, { limit: 3 });
    return {
      company: cir && cir.company,
      points: [
        `Open with the specific company fact you care about: ${((cir && cir.facts && cir.facts[0]) || {}).text || (cir && cir.facts && cir.facts[0]) || "pick one real company fact from the CIR"}`,
        ...selected.map((x) => `Proof point (fact ${x.fact.id}): ${x.fact.text}`),
        "Close in your own words: why this company, specifically.",
      ],
      instruction: "This company bans AI-written application text. Use this outline and the cited facts, and write the letter yourself.",
    };
  }

  // ---- "why this company" answer bank (Doc 2 §3.5; APPE-004) ----
  function buildAnswerBank(profile, jdInput, cir, opts) {
    const jd = jdInput && jdInput.mustHaveSkills ? jdInput : parseJD((jdInput && jdInput.text) || jdInput || "");
    if (!cir || !cir.company || !(cir.facts || []).length) return { ok: false, reason: "answer bank entries need real CIR company facts; none passed in", entries: [] };
    const selected = selectFacts(profile, jd, { limit: 3 });
    const cf = cir.facts.map((f) => (typeof f === "string" ? f : f.text));
    const entries = [
      { theme: "why_us", company: cir.company, text: `${cir.company}: ${cf[0]} That is specific to ${cir.company}, and it connects to my record: ${selected[0] ? selected[0].fact.text : "see profile"}`, factIds: selected[0] ? [selected[0].fact.id] : [], cirFacts: [cf[0]], rewrittenForCompany: true },
      { theme: "hard_problem", company: cir.company, text: selected[1] ? selected[1].fact.text : (selected[0] ? selected[0].fact.text : ""), factIds: (selected[1] || selected[0]) ? [(selected[1] || selected[0]).fact.id] : [], cirFacts: [], rewrittenForCompany: false },
      { theme: "project_story", company: cir.company, text: selected[0] ? selected[0].fact.text : "", factIds: selected[0] ? [selected[0].fact.id] : [], cirFacts: cf.slice(0, 1), rewrittenForCompany: true },
    ].filter((e) => e.text);
    return { ok: true, entries };
  }

  // ---- main entry: tailor with the hard gate ----
  let versionSeq = 0;
  function tailorResume(profile, jdInput, opts) {
    const o = opts || {};
    const jd = jdInput && jdInput.mustHaveSkills ? jdInput : parseJD((jdInput && jdInput.text) || jdInput || "");
    const cir = o.cir || null;
    const aiBan = !!(cir && (cir.aiPolicy === "ban" || cir.bansAiWrittenText));
    const assembled = assemble(profile, jd, o);
    // Caller/user-supplied extra lines (e.g. "add Rust experience") are
    // appended BEFORE the audit, so an attempt to insert an unevidenced
    // skill or claim hits the same hard gate and refuses the whole output.
    if (Array.isArray(o.extraLines) && o.extraLines.length) {
      assembled.lines.push(...o.extraLines.map((l) => (typeof l === "string" ? { text: l, factIds: [], type: "bullet" } : l)));
      assembled.sections.push({ heading: "Additional", lines: o.extraLines.map((l) => (typeof l === "string" ? { text: l, factIds: [], type: "bullet" } : l)) });
    }
    const auditResult = auditResume(assembled, profile);
    if (!auditResult.ok) return { ok: false, refused: true, reason: "truth audit failed; tailored output refused (APPE-002 hard gate)", violations: auditResult.violations, output: null, resume: null };
    const baseLines = o.baseLines || o.baseResumeLines || [];
    const diff = diffResume(baseLines, assembled, profile);
    const rendered = render(assembled);
    const version = { versionId: o.versionId || `resume-v${++versionSeq}`, jobId: o.jobId || null, company: cir && cir.company || o.company || null, date: o.date || null, family: assembled.family, diff, outcome: null };
    if (aiBan) {
      return { ok: true, mode: "outline", reason: "company bans AI-written application text (CIR); degraded to outline+bullets for the user to write (Doc 2 S8)", outline: coverOutline(profile, jd, cir), bullets: assembled.lines, resume: assembled, rendered: null, coverLetter: null, audit: auditResult, diff, version };
    }
    const cover = o.wantCoverLetter ? generateCoverLetter(profile, jd, cir, o) : null;
    return { ok: true, mode: "full", resume: assembled, rendered, coverLetter: cover, audit: auditResult, diff, version };
  }

  return { BANNED_PHRASES, bannedPhrasesIn, SKILL_LEXICON, skillsInText, parseJD, detectFamily, FAMILIES, scoreFact, selectFacts, provenSkills, auditResume, audit, diffResume, render, generateCoverLetter, coverOutline, buildAnswerBank, tailorResume, wordCount };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerTailor;
