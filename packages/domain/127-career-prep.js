/* Career interview prep (PREP-001..008; starter pack section 3.5).
   Pure domain module, UMD like the other domain modules. NO network, NO invented facts:
   every company claim comes from a merged Company Intelligence Record (CIR) in
   packages/career-data/cirs/ and keeps its source label (official / reported / anecdotal).
   If no CIR is on file for a company, functions say so (status NO_CIR) and ground only in
   JD text the caller supplies — they never fabricate stages, bars, comp or selectivity.

   OWNER RULING (binding, 2026-10-12): live interview assist is OFF. liveAssistGuard()
   refuses any request to feed answers during a real interview and offers prep instead.
   Voice mocks are NOT wired for prep: voiceMockAvailability() reports that honestly and
   the text mock is the fallback (SC-174).

   Persistence is via injected stores: makePrepStore() -> { stories, mocks, debriefs,
   packs, drills } (plain arrays the caller owns; a KV {get,set} adapter also works for
   the story bank via storyStoreRows()).

   Functions:
     normalizeCir(cir)                 tolerant reader for the 15 merged CIR shapes
     composeBrief({cir, jdText, role, round})   PREP-001 brief: bar, stages, emphasis
     questionBank({cir, roleFamily, round, stories})  PREP-002 questions, each CIR-tagged
     mineStories(facts)                PREP-004 STAR drafts mined from profile facts
     captureStory(store, story) / findStories(store, query)
     scoreAnswer(answer)               rubric: structure / evidence / specificity (0-5 each)
     startMock(store, {bank, count}) / answerMock(store, id, answer) / mockSummary(store, id)  PREP-003
     technicalDrills({cir, roleFamily})  PREP-005 coding + system-design sets from CIR round types
     financeDrill() / quantDrill() / gradeDrillAnswer(set, id, answer)   graded drills (SC-169/170)
     caseSession({cir}) / scoreCaseResponse(resp)   consulting case practice (SC-168)
     interviewerBrief({name, role, company, publicFacts})  PREP-006 public-facts-only; unknown stays unknown
     captureDebrief(store, d) / thankYouDraft({company, interviewer, debrief})  PREP-007
     salaryPrep({cir})                 comp ranges ONLY from CIR comp notes, source-labeled; script
     coffeeChatBrief({contact, cir})   lighter chat brief (OUTE-012 seam, SC-173)
     twoInterviewPlan(items)           ordered briefs + gap plan for same-day interviews (SC-176)
     rejectionPivot({funnel, cir, similar})  tightening plan; NO_CIR when the bar is unsourced (SC-177)
     assemblePack(store, parts)        PREP-001..007 pack with per-section traceability (SC-180)
     liveAssistGuard(text)             PREP-008: refusal + prep offer (owner OFF ruling)
     voiceMockAvailability()           honest capability report for SC-174
*/
const CareerPrep = (() => {
  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase();
  function hash(str) { let h = 0x811c9dc5; const t = s(str); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }

  // ---------- CIR normalization (accepts BOTH the batch dialects and the canonical
  // 125-validator schema the corpus was normalized to at integration, 2026-10-13) ----------
  function factText(x) { if (!x) return ""; if (typeof x === "string") return x; return s(x.statement || x.claim || x.signal || x.summary || x.text || x.style || x.pattern || x.note || ""); }
  function factSource(x) { if (!x || typeof x !== "object") return null; const f = x.fact || x.basis || x; return { source_type: s(f.source_type || x.source_type || "unspecified"), source_url: s(f.source_url || x.source_url || "") || null, as_of: s(f.as_of || x.as_of || "") || null }; }
  function stageList(cir) {
    const ps = cir && cir.process_stages; if (!ps) return [];
    const raw = Array.isArray(ps) ? ps : (ps.stages || []);
    return raw.map((st) => {
      if (typeof st === "string") return { name: st, source: factSource(ps.basis) };
      return { name: s(st.stage || st.claim || st.name), detail: s(st.description || ""), source: factSource(st) };
    }).filter((x) => x.name);
  }
  function normalizeCir(cir) {
    if (!cir || typeof cir !== "object") return null;
    const barRaw = cir.hiring_bar_summary;
    const bar = typeof barRaw === "string" ? barRaw : factText(barRaw);
    const sigRaw = cir.screening_signals;
    const sigList = Array.isArray(sigRaw) ? sigRaw : [].concat((sigRaw && sigRaw.stated) || [], (sigRaw && sigRaw.revealed) || []);
    const compNotes = (cir.compensation_notes || []).map((c) => {
      const f = c.fact || c;
      return { text: factText(f) || factText(c), label: s(c.label || c.source_type || (f && f.source_type) || "company file comp note"), source: factSource(c) };
    }).filter((x) => x.text);
    return {
      company_id: s(cir.company_id), company_name: s(cir.company_name || cir.company_id),
      as_of: s(cir.as_of || cir.last_verified_at || "") || null,
      bar, stages: stageList(cir),
      signals: sigList.map((x) => ({ text: factText(x), source: factSource(x) })).filter((x) => x.text),
      styles: (cir.interview_styles || []).map((x) => ({ text: factText(x), source: factSource(x) })).filter((x) => x.text),
      values: (cir.values_culture_signals || []).map((x) => ({ text: factText(x), source: factSource(x) })).filter((x) => x.text),
      compNotes,
      redFlags: (cir.red_flags || []).map((x) => factText(x) || s(x)).filter(Boolean),
    };
  }
  function findCir(cirs, company) {
    const want = lc(company).replace(/[^a-z0-9]/g, "");
    for (const c of cirs || []) { const n = normalizeCir(c); if (n && (lc(n.company_id).replace(/[^a-z0-9]/g, "") === want || lc(n.company_name).replace(/[^a-z0-9]/g, "").includes(want) || want.includes(lc(n.company_id).replace(/[^a-z0-9]/g, "")))) return c; }
    return null;
  }

  // ---------- JD emphasis (grounded only in text the caller supplies) ----------
  const JD_KEYS = ["python", "java", "go", "rust", "javascript", "react", "sql", "postgres", "kubernetes", "aws", "distributed", "system design", "data structures", "algorithms", "machine learning", "probability", "statistics", "excel", "financial model", "dcf", "trading", "leadership", "teamwork", "communication", "product", "experimentation", "mentoring"];
  function jdKeywords(jdText) { const t = lc(jdText); return JD_KEYS.filter((k) => t.includes(k)); }

  // ---------- PREP-001 brief ----------
  function composeBrief(opts) {
    opts = opts || {};
    const company = s(opts.company || (opts.cir && opts.cir.company_name) || "");
    const n = normalizeCir(opts.cir);
    const jdKw = jdKeywords(opts.jdText);
    if (!n) {
      return { status: "NO_CIR", company, role: s(opts.role || "") || null, round: s(opts.round || "") || null,
        bar: null, stages: [], emphasis: jdKw.map((k) => ({ point: `JD mentions: ${k}`, source: { type: "jd_text_supplied_by_user" } })),
        gaps: [`No company file on file for ${company || "this company"} — process stages, hiring bar and comp are not claimed.`, "Supply the JD text or add a company file for this company to ground a full brief."],
        sources: [] };
    }
    const emphasis = [
      ...n.signals.slice(0, 4).map((x) => ({ point: x.text, source: { type: "CIR screening_signals", source_type: x.source && x.source.source_type, source_url: x.source && x.source.source_url } })),
      ...jdKw.slice(0, 4).map((k) => ({ point: `JD emphasis: ${k}`, source: { type: "jd_text_supplied_by_user" } })),
    ];
    return { status: "OK", company: n.company_name, company_id: n.company_id, role: s(opts.role || "") || null, round: s(opts.round || "") || null,
      bar: n.bar || null, stages: n.stages, emphasis, styles: n.styles, values: n.values.slice(0, 3),
      compNotes: n.compNotes, redFlags: n.redFlags.slice(0, 3),
      gaps: n.bar ? [] : ["The company file has no hiring-bar summary; bar not claimed."],
      sources: [{ type: "CIR", company_id: n.company_id, as_of: n.as_of }] };
  }

  // ---------- PREP-004 story bank ----------
  function makePrepStore() { return { stories: [], mocks: [], debriefs: [], packs: [], drills: [], sent: [] }; }
  function mineStories(facts) {
    return (facts || []).filter((f) => f && (f.action || f.result) && ["experience", "project", "leadership"].includes(f.kind))
      .map((f) => ({
        story_id: "story-" + hash(f.id || f.title), fact_id: f.id || null, title: s(f.title),
        situation: s(f.text || ""), task: s(f.title), action: s(f.action || ""), result: s(f.result || ""),
        method: s(f.method || ""), metrics: f.metrics || [], skills: f.skills || [],
        tags: storyTags(f), source: "profile_fact:" + s(f.id || "unknown"),
      }));
  }
  function storyTags(f) {
    const t = lc([f.title, f.text, f.action, f.method].join(" "));
    const tags = [];
    if (/\b(led|lead|president|organis|organiz|mentor|team|club|participants|members|users)\b/.test(t)) tags.push("teamwork", "leadership");
    if (/\b(cut|reduc|improv|automat|replac)/.test(t)) tags.push("impact", "initiative");
    if (/\b(model|dcf|valuation|financial)/.test(t)) tags.push("finance", "analysis");
    if (/\b(built|deploy|dashboard|kubernetes|go\b|react)/.test(t)) tags.push("technical", "building");
    if (/\b(present|pitch|competition)/.test(t)) tags.push("communication");
    return [...new Set(tags)];
  }
  function captureStory(store, story) {
    const row = { story_id: story.story_id || "story-" + hash(s(story.title) + s(story.action)), title: s(story.title),
      situation: s(story.situation), task: s(story.task), action: s(story.action), result: s(story.result),
      metrics: story.metrics || [], skills: story.skills || [], tags: story.tags || storyTags(story), fact_id: story.fact_id || null,
      source: story.source || "user_capture", captured_at: new Date().toISOString() };
    store.stories.push(row); return row;
  }
  function findStories(store, query) {
    const q = lc(query); const rows = (store && store.stories) || [];
    return rows.map((r) => { const hay = lc([r.title, r.action, r.result, (r.tags || []).join(" ")].join(" "));
      const score = q.split(/\W+/).filter(Boolean).reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) + ((r.tags || []).some((t) => q.includes(t)) ? 2 : 0);
      return { story: r, score }; }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.story);
  }

  // ---------- PREP-002 question bank ----------
  const GENERIC_BEHAVIORAL = [
    "Tell me about yourself and why this role.",
    "Tell me about a time you worked with a team under a deadline.",
    "Tell me about a hard problem you solved and how you approached it.",
    "Tell me about a failure and what you changed afterward.",
    "Why this company, specifically?",
  ];
  function questionBank(opts) {
    opts = opts || {};
    const n = normalizeCir(opts.cir);
    const stories = opts.stories || [];
    const qs = [];
    const push = (q, round, source) => { const match = findStories({ stories }, q)[0] || null;
      qs.push({ q, round: round || "any", source, matched_story: match ? { story_id: match.story_id, title: match.title } : null }); };
    if (n) {
      for (const st of n.stages) push(`[${n.company_name} stage] Walk me through how you will handle: ${st.name}`, st.name, { type: "CIR process_stages", company_id: n.company_id, source_type: st.source && st.source.source_type, source_url: st.source && st.source.source_url });
      for (const sg of n.signals.slice(0, 3)) push(`Evidence check (${n.company_name} screens for this): ${sg.text} — give a concrete example.`, opts.round || "screen", { type: "CIR screening_signals", company_id: n.company_id, source_type: sg.source && sg.source.source_type });
      for (const st of n.styles.slice(0, 2)) push(`Style drill (${n.company_name}): ${st.text}`, opts.round || "loop", { type: "CIR interview_styles", company_id: n.company_id, source_type: st.source && st.source.source_type });
    }
    for (const g of GENERIC_BEHAVIORAL) push(g, "behavioral", { type: "generic_behavioral_bank", company_id: null });
    if (/quant|trading|finance/i.test(s(opts.roleFamily) + " " + s(opts.role))) {
      push("Walk me through a DCF.", "technical", { type: "finance_drill_bank", company_id: n && n.company_id || null });
      push("A fair coin is flipped until two heads in a row appear. Expected number of flips?", "technical", { type: "quant_drill_bank", company_id: n && n.company_id || null });
    }
    return { company: n ? n.company_name : (s(opts.company) || null), cir_grounded: !!n, questions: qs };
  }

  // ---------- PREP-003 mock engine + rubric ----------
  function scoreAnswer(answer) {
    const a = s(answer); const low = lc(a);
    const has = (re) => re.test(low);
    let structure = 1;
    if (has(/\b(first|started|began|situation|context)\b/)) structure += 1;
    if (has(/\b(then|next|after that|so i|i (built|wrote|led|designed|modelled|modeled|created))\b/)) structure += 1;
    if (has(/\b(result|ended|outcome|in the end|led to)\b/)) structure += 1;
    if (a.split(/\s+/).filter(Boolean).length >= 60) structure += 1;
    let evidence = 0;
    if (/\d/.test(a)) evidence += 2;
    if (has(/\b(because|measured|compared|data|users|members|percent|%)\b/)) evidence += 1;
    if (has(/\b(specifically|for example|for instance)\b/)) evidence += 1;
    if (/\d+\s*(%|users|members|people|teams|pages|companies|participants)/.test(low)) evidence += 1;
    let specificity = 0;
    if (has(/\b(i|my|we)\b/)) specificity += 1;
    if (has(/\b(python|react|go|excel|sql|postgres|kubernetes|docker|javascript)\b/)) specificity += 1;
    if (has(/\b(week|month|deadline|semester|summer)\b/)) specificity += 1;
    if (a.split(/\s+/).filter(Boolean).length >= 40) specificity += 1;
    if (has(/\b(something|stuff|things|various|etc)\b/)) specificity = Math.max(0, specificity - 1);
    const clamp = (x) => Math.max(0, Math.min(5, x));
    const sc = { structure: clamp(structure), evidence: clamp(evidence), specificity: clamp(specificity) };
    sc.total = sc.structure + sc.evidence + sc.specificity;
    const feedback = [];
    if (sc.structure < 4) feedback.push("Structure: order it Situation -> Task -> Action -> Result so the interviewer never has to reconstruct it.");
    if (sc.evidence < 4) feedback.push("Evidence: add a number (users, %, time saved) and how you know it.");
    if (sc.specificity < 4) feedback.push("Specificity: name the tool, the constraint and your exact role — drop vague words like 'various things'.");
    if (!feedback.length) feedback.push("Landed: clear structure, quantified evidence, specific ownership. Keep this story as a primary.");
    return { scores: sc, feedback };
  }
  function startMock(store, opts) {
    opts = opts || {};
    const bank = opts.bank || questionBank({});
    const qs = (bank.questions || []).slice(0, opts.count || 5);
    const m = { mock_id: "mock-" + hash(Date.now() + ":" + qs.length + ":" + (store.mocks.length + 1)), company: bank.company || null,
      questions: qs, idx: 0, answers: [], status: "in_progress", started_at: new Date().toISOString() };
    store.mocks.push(m); store.drills.push({ kind: "mock", mock_id: m.mock_id, at: m.started_at });
    return m;
  }
  function answerMock(store, mockId, answer) {
    const m = store.mocks.find((x) => x.mock_id === mockId); if (!m) throw new Error("mock not found: " + mockId);
    const q = m.questions[m.idx]; if (!q) throw new Error("mock already complete");
    const graded = scoreAnswer(answer);
    m.answers.push({ q: q.q, answer: s(answer), scores: graded.scores, feedback: graded.feedback });
    m.idx += 1;
    if (m.idx >= m.questions.length) { m.status = "complete"; m.finished_at = new Date().toISOString(); }
    return { mock: m, graded, next_question: m.status === "complete" ? null : m.questions[m.idx].q, done: m.status === "complete" };
  }
  function mockSummary(store, mockId) {
    const m = store.mocks.find((x) => x.mock_id === mockId); if (!m) return null;
    const n = m.answers.length || 1;
    const avg = { structure: 0, evidence: 0, specificity: 0, total: 0 };
    for (const a of m.answers) for (const k of Object.keys(avg)) avg[k] += a.scores[k] / n;
    for (const k of Object.keys(avg)) avg[k] = Math.round(avg[k] * 10) / 10;
    const weakest = ["structure", "evidence", "specificity"].sort((a, b) => avg[a] - avg[b])[0];
    return { mock_id: m.mock_id, company: m.company, status: m.status, answered: m.answers.length, average_scores: avg,
      what_landed: m.answers.filter((a) => a.scores.total >= 12).map((a) => a.q),
      what_didnt: m.answers.filter((a) => a.scores.total < 12).map((a) => ({ q: a.q, scores: a.scores, fix: a.feedback })),
      fix_first: weakest };
  }

  // ---------- PREP-005 + drills ----------
  function technicalDrills(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir);
    const stageNames = n ? n.stages.map((x) => x.name).join(" | ") : "";
    const sets = [];
    if (/coding|technical screen|online coding/i.test(stageNames) || !n) sets.push({ type: "coding", source: n ? { type: "CIR process_stages", company_id: n.company_id } : { type: "generic_swe_bank" },
      prompts: ["Reverse a linked list in place, then handle cycles.", "Given a stream of events, return the top-K most frequent in the last hour.", "Implement an LRU cache with O(1) get/put."] });
    if (/design/i.test(stageNames)) sets.push({ type: "system_design", source: { type: "CIR process_stages", company_id: n.company_id },
      prompts: ["Design a notification system for 10M users (a design prompt shape reported for this company's loops — labeled anecdotal in the company file where applicable).", "Design a multi-tenant quota service.", "Design a URL shortener, then scale reads 100x."] });
    if (/code.review|pair/i.test(JSON.stringify(n ? [...n.styles.map((x) => x.text), n.bar] : []))) sets.push({ type: "code_review_pairing", source: { type: "CIR interview_styles+hiring_bar_summary", company_id: n.company_id },
      prompts: ["Review a provided diff: find the correctness bug before style issues, say why, propose the fix.", "Pair on a production-like codebase task; narrate trade-offs aloud."] });
    if (!sets.length) sets.push({ type: "coding", source: { type: "generic_swe_bank" }, prompts: ["Two-sum variants with follow-ups toward performance/trade-off discussion."] });
    return { company: n ? n.company_name : null, cir_grounded: !!n, sets };
  }
  const FINANCE_DRILL = [
    { id: "fin-1", topic: "accounting", q: "Walk me through the three financial statements and how a $10 increase in depreciation flows through them (40% tax).", key: ["income", "depreciation", "net income", "cash flow", "balance sheet", "6", "4"], expect: "IS: NI down $6; CFS: +$4 net (add back $10, tax shield); BS balances." },
    { id: "fin-2", topic: "dcf", q: "What drives a DCF's value most: WACC or terminal growth? How do you sanity-check it?", key: ["terminal", "wacc", "sensitivity", "multiple"], expect: "Terminal value usually dominates; sanity-check vs trading multiples and sensitivity tables." },
    { id: "fin-3", topic: "comps", q: "Why might two similar companies trade at different EV/EBITDA multiples?", key: ["growth", "margin", "risk", "capital"], expect: "Growth, margins, risk, capital intensity / returns on capital." },
    { id: "fin-4", topic: "lbo", q: "In an LBO, name the three main sources of returns.", key: ["debt paydown", "multiple expansion", "ebitda growth"], expect: "EBITDA growth, debt paydown (equity build), multiple expansion." },
    { id: "fin-5", topic: "accounting", q: "If working capital increases, what happens to cash flow and why?", key: ["decrease", "cash", "inventory", "receivables"], expect: "Cash flow decreases — cash is tied up in inventory/receivables." },
  ];
  const QUANT_DRILL = [
    { id: "q-1", topic: "probability", q: "Expected number of fair-coin flips to get two heads in a row?", answer: 6, tol: 0.01, expect: "6 (states: E0=1+E1/2+E0/2 etc.)." },
    { id: "q-2", topic: "probability", q: "Roll two dice. Probability the sum is 8?", answer: 5 / 36, tol: 0.01, expect: "5/36 ≈ 0.139." },
    { id: "q-3", topic: "mental_math", q: "What is 17 x 24?", answer: 408, tol: 0, expect: "408." },
    { id: "q-4", topic: "expected_value", q: "A game pays $10 with probability 0.3 and $0 otherwise, and costs $2 to play. Expected value of playing?", answer: 1, tol: 0.01, expect: "0.3*10 - 2 = +$1." },
    { id: "q-5", topic: "probability", q: "Three cards are drawn without replacement from a standard deck. Probability all three are aces? (decimal)", answer: (4 / 52) * (3 / 51) * (2 / 50), tol: 0.001, expect: "≈ 0.00018." },
  ];
  function financeDrill() { return { kind: "finance", questions: FINANCE_DRILL.map(({ id, topic, q, expect }) => ({ id, topic, q, expect })) }; }
  function quantDrill() { return { kind: "quant", questions: QUANT_DRILL.map(({ id, topic, q, expect }) => ({ id, topic, q, expect })) }; }
  function gradeDrillAnswer(kind, id, answer) {
    if (kind === "finance") { const d = FINANCE_DRILL.find((x) => x.id === id); if (!d) return null;
      const low = lc(answer); const hits = d.key.filter((k) => low.includes(k)); const score = Math.round((hits.length / d.key.length) * 5);
      return { id, topic: d.topic, score_0_5: score, hits, missed: d.key.filter((k) => !low.includes(k)), answer_key: d.expect, gap: score >= 4 ? null : `Missing: ${d.key.filter((k) => !low.includes(k)).join(", ")}` }; }
    const d = QUANT_DRILL.find((x) => x.id === id); if (!d) return null;
    const cleaned = s(answer).replace(/[^0-9.\-\/]/g, "");
    let num = NaN;
    if (/^-?\d+(\.\d+)?\/\d+(\.\d+)?$/.test(cleaned)) { const [a, b] = cleaned.split("/"); num = parseFloat(a) / parseFloat(b); }
    else num = parseFloat(cleaned.replace(/\//g, ""));
    const ok = !isNaN(num) && Math.abs(num - d.answer) <= Math.max(d.tol, Math.abs(d.answer) * 0.02);
    return { id, topic: d.topic, correct: ok, your_answer: isNaN(num) ? s(answer) : num, answer_key: d.expect, score_0_5: ok ? 5 : 0 };
  }
  function runDrill(store, kind, answers) {
    const set = kind === "finance" ? financeDrill() : quantDrill();
    const graded = set.questions.map((q) => gradeDrillAnswer(kind, q.id, (answers || {})[q.id] || ""));
    const row = { kind, graded, total: graded.reduce((n, g) => n + (g ? g.score_0_5 : 0), 0), max: graded.length * 5, at: new Date().toISOString(),
      gaps: graded.filter((g) => g && g.score_0_5 < 4).map((g) => g.gap || `${g.topic}: expected ${g.answer_key}`) };
    store.drills.push(row); return row;
  }

  // ---------- case prep ----------
  function caseSession(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir);
    const style = n && n.styles[0] ? n.styles[0] : null;
    return { company: n ? n.company_name : (s(opts.company) || null), cir_grounded: !!n,
      practice_norms_label: n ? "Norms below are from the company file on file and keep their source labels; community practice-count advice is folklore and is NOT quantified." : "No company file on file for this company — generic case framework only; no company-specific norms claimed.",
      style: style ? { text: style.text, source_type: style.source && style.source.source_type } : null,
      case_prompt: "Your client is a regional grocery chain whose profits fell 15% last year while revenue grew 5%. Find out why and recommend what to do.",
      framework: ["Clarify the objective and constraints", "Structure: revenue (price x volume x mix) vs costs (COGS, labour, logistics, shrink)", "Hypothesise, then ask for the data that discriminates", "Synthesise: recommendation, risks, next steps"] };
  }
  // Case prep plan (SC-185 canonical): the 30-50 practice-case norm is community
  // folklore, labeled as such; every plan line is plain prose — no function names.
  function casePrepPlan(opts) {
    opts = opts || {}; const session = caseSession(opts);
    const weeks = opts.weeks || 6, perWeek = opts.casesPerWeek || 7;
    const focuses = ["framework + structuring drills first", "mix of interviewer-led cases + mental-math/market-sizing drills", "mix of interviewer-led cases + mental-math/market-sizing drills", "mix of interviewer-led cases + mental-math/market-sizing drills", "mix of interviewer-led cases + mental-math/market-sizing drills", "timed, interviewer-led, full feedback loop"];
    const plan = [];
    for (let w = 1; w <= weeks; w++) plan.push(`Week ${w}: ${perWeek} cases (${focuses[Math.min(w - 1, focuses.length - 1)]}), each answer scored against the case rubric and the gaps re-drilled next session`);
    return { kind: "case_prep_plan", company: session.company, cir_grounded: session.cir_grounded, company_file_grounded: session.cir_grounded,
      style: session.style, framework: session.framework, case_prompt: session.case_prompt,
      practice_norm: { low: 30, high: 50, unit: "full practice cases before interviews", label: "community-reported", official: false,
        note: "This count is community-reported preparation folklore passed on by candidates and prep communities — it is NOT published or endorsed by any MBB firm, and the company files on file do not quantify it. It is a planning target, not a requirement." },
      schedule: { weeks, sessions_per_week: perWeek, total_cases: weeks * perWeek, inside_norm: weeks * perWeek >= 30 && weeks * perWeek <= 50, plan },
      text: `Practice norm, labeled honestly: 30-50 full practice cases before interviews (community-reported, not official). Schedule: ${weeks} weeks, ${perWeek} cases a week, ${weeks * perWeek} total.` };
  }
  function scoreCaseResponse(resp) {
    const low = lc(resp); const checks = {
      clarified_objective: /\b(objective|goal|clarify|profit|question)\b/.test(low),
      structured: /\b(first|second|branch|split|structure|revenue|cost)\b/.test(low),
      hypothesis_led: /\b(hypothesis|hypothesise|hypothesize|because|driver)\b/.test(low),
      asked_for_data: /\b(data|numbers|breakdown|segment|trend|compare)\b/.test(low),
      recommendation: /\b(recommend|therefore|so the|next step)\b/.test(low),
    };
    const score = Object.values(checks).filter(Boolean).length;
    return { score_0_5: score, checks, feedback: Object.entries(checks).filter(([, v]) => !v).map(([k]) => `Missing: ${k.replace(/_/g, " ")}`) };
  }

  // ---------- PREP-006 interviewer research (public facts only, supplied by caller) ----------
  function interviewerBrief(person) {
    person = person || {};
    const facts = (person.publicFacts || []).filter((f) => f && s(f.text));
    if (!facts.length) return { name: s(person.name), role: s(person.role || "") || null, company: s(person.company || "") || null,
      status: "UNKNOWN", known: [s(person.role || ""), s(person.company || "")].filter(Boolean),
      brief: [], unknown: ["background and prior roles", "team and focus areas", "public talks or posts"],
      note: "No public professional facts were supplied for this person, so no bio is invented. Prep from the role and the company file instead." };
    return { name: s(person.name), role: s(person.role || "") || null, company: s(person.company || "") || null, status: "OK",
      brief: facts.map((f) => ({ text: s(f.text), source: s(f.source || "provided public fact") })), unknown: [],
      note: "Built only from the public professional facts supplied; nothing inferred about private life." };
  }

  // ---------- PREP-007 debrief + thank-you ----------
  function captureDebrief(store, d) {
    const row = { debrief_id: "debrief-" + hash(s(d.company) + s(d.at || "") + store.debriefs.length), company: s(d.company), role: s(d.role || ""),
      interviewer: s(d.interviewer || ""), went_well: d.wentWell || [], stumbled: d.stumbled || [], questions_asked: d.questionsAsked || [],
      follow_up_by: s(d.followUpBy || "same day"), at: d.at || new Date().toISOString() };
    store.debriefs.push(row); return row;
  }
  function thankYouDraft(opts) {
    opts = opts || {}; const d = opts.debrief || {};
    const specific = (d.went_well && d.went_well[0]) || (d.questions_asked && d.questions_asked[0]) || "our conversation";
    return { to: s(opts.interviewer || d.interviewer || ""), subject: `Thank you — ${s(opts.company || d.company)} ${s(opts.role || d.role || "")} conversation`.trim(),
      body: `Hi ${s((opts.interviewer || d.interviewer || "").split(" ")[0] || "there")},\n\nThank you for your time today. I especially enjoyed discussing ${specific} — it sharpened how I think about the work your team is doing at ${s(opts.company || d.company)}.\n\nI'd welcome the chance to continue the conversation. Thanks again for considering me.\n\nBest,\n${s(opts.senderName || "")}`,
      status: "draft_only", note: "Draft on a card for the user's approval — never auto-sent." };
  }

  // ---------- salary-talk prep (NEGO-002 seam) ----------
  function salaryPrep(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir);
    if (!n) return { status: "NO_CIR", company: s(opts.company || ""), ranges: [], script: null, note: "No company file on file — no comp numbers are claimed or invented." };
    const withFigures = n.compNotes.filter((c) => /\$\s?\d/.test(c.text));
    return { status: withFigures.length ? "OK" : "NO_SOURCED_FIGURE", company: n.company_name,
      ranges: withFigures.map((c) => ({ text: c.text, label: c.label, source_type: c.source && c.source.source_type, source_url: c.source && c.source.source_url })),
      all_comp_notes: n.compNotes.map((c) => ({ text: c.text, label: c.label })),
      script: "“I'm focused on finding the right role and team first. Based on the range published for this role [cite the sourced figure above], I'm comfortable discussing a package in that band once we get there — could you share the band budgeted for this level?”",
      note: withFigures.length ? "Every figure above is copied from the company file comp notes with its source label; nothing is estimated." : "The company file explicitly records that no figure is published for this company — say so, anchor on the role's posted band if the employer shares one, and do not invent a number." };
  }

  // Coffee-chat prep (SC-182 canonical): who/path/talking points/questions,
  // grounded in the company file's own values; plain prose only.
  function coffeeChatPrep(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir); const c = opts.contact || {};
    const pathIn = opts.path || [s(c.path || "")].filter(Boolean);
    const value = n && n.values[0] ? n.values[0].text : null;
    const talking = [];
    if (value) talking.push(`What the company says it optimizes for: ${value}`);
    if (pathIn.length) talking.push(`Their path in: ${pathIn.join(" -> ")} — ask what each step actually taught them.`);
    if (opts.sharedGround) talking.push(`Real shared ground: ${opts.sharedGround} — open there, briefly, then get out of the way.`);
    while (talking.length < 3) talking.push("What their team actually spends its week on, and what surprised them most after joining.");
    const questions = [
      "What does your team actually spend its week on — and what would surprise an outsider about that split?",
      n && n.bar ? `The company's stated bar is: ${n.bar} — what separates people who do well from people who prepare generically?` : "What separates people who do well in the interviews from people who prepare generically?",
      "What did you misunderstand about this role before you started, and when did it click?",
      "If you were starting again from my seat this semester, what would you do in the next 30 days — and what would you stop doing?",
      "Who else should I learn from, and may I mention you connected us?",
    ];
    return { kind: "coffee_chat_prep", who: { name: s(c.name), role: s(c.role || ""), company: s(c.company || (n && n.company_name) || "") },
      path: pathIn, talking_points: talking.slice(0, 3), questions,
      do_not_ask: ["Do not ask for a referral in a first chat — earn the second conversation instead", "Do not ask anything they would have to keep confidential (unreleased products, internal comp, other candidates)", "Do not ask what the role pays — comp questions go to the recruiter, with ranges sourced from the company file only", "Do not pitch yourself for more than 60 seconds total"],
      company_file_grounded: !!n, cir_grounded: !!n };
  }

  // ---------- coffee chat + two-interview + pivot + pack ----------
  function coffeeChatBrief(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir); const c = opts.contact || {};
    return { kind: "coffee_chat", lighter_than_interview_prep: true, contact: { name: s(c.name), role: s(c.role || ""), company: s(c.company || (n && n.company_name) || "") },
      company_context: n ? { bar: n.bar, values: n.values.slice(0, 2), source: { type: "CIR", company_id: n.company_id } } : null,
      good_questions: ["What does your team actually spend its week on?", "What surprised you most after joining?", "What would you tell someone my year about the application process?", "Who else would you recommend I learn from?"],
      do_not: ["Do not pitch for a referral in a first chat", "Do not ask anything you'd expect them to keep confidential"],
      cir_grounded: !!n };
  }
  function twoInterviewPlan(items) {
    const sorted = [...(items || [])].sort((a, b) => s(a.time).localeCompare(s(b.time)));
    return { ordered: sorted.map((x, i) => ({ order: i + 1, time: x.time, company: x.brief.company || x.company, brief_status: x.brief.status || "OK" })),
      gap_plan: sorted.length > 1 ? `Between ${sorted[0].time} and ${sorted[sorted.length - 1].time}: 20 min reset (no new material), re-read the second company's bar + your two matched stories, eat, and travel/buffer 30 min.` : "Single interview — standard prep.",
      note: "Briefs are delivered in interview order; each brief keeps its own company-file grounding and gaps." };
  }
  function rejectionPivot(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir); const f = opts.funnel || {};
    const plan = [`Stage reached: ${s(f.stage || "unknown")} at ${s(f.company || "")} — tighten the exact skill that stage tests (timed, scored drills, not re-reading).`,
      "Re-run a scored mock focused on that stage within 48 hours while the experience is fresh.",
      "Keep the story bank — stories transfer; only the stage skill changes."];
    return { status: n ? "OK" : "NO_CIR", company: s(f.company || ""), stage: s(f.stage || "") || null,
      cir_bar: n ? n.bar : null, plan,
      gaps: n ? [] : [`No company file on file for ${s(f.company || "this company")} — the company-specific bar cannot be cited; the plan above is stage-based only.`],
      similar_roles: (opts.similar || []).map((x) => ({ company: x.company, cir_grounded: !!x.cir })) };
  }
  function assemblePack(store, parts) {
    parts = parts || {};
    const sections = [];
    const add = (name, rail, present, payload) => sections.push({ section: name, rail, present: !!present, payload: present ? payload : null });
    add("brief", "PREP-001", parts.brief && parts.brief.status === "OK", parts.brief);
    add("questions", "PREP-002", parts.bank && parts.bank.questions && parts.bank.questions.length, parts.bank);
    add("stories", "PREP-004", parts.stories && parts.stories.length, parts.stories);
    add("interviewer_notes", "PREP-006", parts.interviewers && parts.interviewers.length, parts.interviewers);
    add("logistics", "calendar", parts.logistics, parts.logistics || null);
    const pack = { pack_id: "pack-" + hash(JSON.stringify(sections.map((x) => x.section + x.present))), company: s(parts.company || ""), when: s(parts.when || ""),
      sections, complete: sections.every((x) => x.present), missing: sections.filter((x) => !x.present).map((x) => x.section),
      traceability: sections.map((x) => `${x.section} <- ${x.rail}`) };
    store.packs.push(pack); return pack;
  }

  // ---------- FIN-A1 additions (canonical SC-181..190, 2026-10-13) ----------
  function sharedGround(person, profile) {
    profile = profile || {}; const out = [];
    const factsText = ((person && person.publicFacts) || []).map((f) => s(f.text)).join(" ");
    const low = lc(factsText);
    const check = (label, val) => { if (val && low.includes(lc(val))) out.push({ ground: label, basis: val }); };
    check("same school", profile.school); check("same club", (profile.clubs || [])[0]);
    check("same hometown", s(profile.hometown).replace(/\s*\(TEST\)\s*/g, "")); check("same major", profile.major);
    for (const sk of profile.skills || []) check("shared skill: " + sk, sk);
    return out;
  }
  function interviewerResearch(opts) {
    opts = opts || {};
    const people = (opts.people || []).map((p) => { const b = interviewerBrief(p);
      return { name: b.name, role: b.role, company: b.company, team: s(p.team || "") || null, path: p.path || [], status: b.status,
        brief: b.brief, unknown: b.unknown, shared_ground: b.status === "OK" ? sharedGround(p, opts.profile) : [], note: b.note }; });
    return { kind: "interviewer_research", people, grounded: people.filter((p) => p.status === "OK").length,
      note: "Paths, teams and shared ground come only from the public professional facts supplied per person (TEST fixtures in scenario runs); a person with no supplied facts stays UNKNOWN — no bio is invented." };
  }
  function coffeeChatPrep(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir); const c = opts.contact || {};
    const path = c.path || []; const shared = sharedGround({ publicFacts: c.publicFacts || [] }, opts.profile);
    const cirPoint = n && n.values[0] ? n.values[0].text : (n && n.bar ? n.bar : null);
    const talking_points = [
      cirPoint ? `What the company says it optimizes for: ${cirPoint}` : "Your own shipped work — the thing on your profile with real users and a real number attached.",
      path.length ? `Their path in: ${path.join(" -> ")} — ask what each step actually taught them.` : "How they got into this seat — the step that mattered most is rarely the first one.",
      shared.length ? `Real shared ground: ${shared.map((g) => g.basis).join("; ")} — open there, briefly, then get out of the way.` : "Your current project and the one decision in it you are still unsure about — specific beats impressive."];
    const stylePoint = n && n.styles[0] ? n.styles[0].text : null;
    const questions = [
      "What does your team actually spend its week on — and what would surprise an outsider about that split?",
      stylePoint ? `Your firm's signature round is described as: ${stylePoint.slice(0, 140)} — what separates people who do well in it from people who prepare generically?` : "Which round or conversation in your process separates strong candidates, and what does 'strong' look like in it?",
      "What did you misunderstand about this role before you started, and when did it click?",
      "If you were starting again from my seat this semester, what would you do in the next 30 days — and what would you stop doing?",
      "Who else should I learn from, and may I mention you connected us?"];
    return { kind: "coffee_chat_prep", who: { name: s(c.name), role: s(c.role || ""), company: s(c.company || (n && n.company_name) || "") },
      path, talking_points, questions,
      do_not_ask: ["Do not ask for a referral in a first chat — earn the second conversation instead", "Do not ask anything they would have to keep confidential (unreleased products, internal comp, other candidates)", "Do not ask what the role pays — comp questions go to the recruiter, with CIR-sourced ranges only", "Do not pitch yourself for more than 60 seconds total"],
      shared_ground: shared, cir_grounded: !!n, cir_source: n ? { type: "CIR", company_id: n.company_id, as_of: n.as_of } : null };
  }
  function systemDesignPrep(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir);
    const drills = technicalDrills(opts); const sd = drills.sets.find((x) => x.type === "system_design");
    return { kind: "system_design_prep", company: n ? n.company_name : null, cir_grounded: !!n, level: s(opts.level || "experienced-hire"),
      prompts: sd ? sd.prompts : ["Design a notification system for 10M users.", "Design a multi-tenant quota service.", "Design a URL shortener, then scale reads 100x."],
      prompt_source: sd ? sd.source : { type: "generic_system_design_bank" },
      framework: ["Clarify requirements and scale numbers out loud before drawing anything", "High-level design: API, data model, core components", "Deep-dive the bottleneck the interviewer steers to; name the trade-off of each choice", "Scale and failure: caching, queues, partitioning, backpressure, observability", "Close with what you would build differently at 10x and why"],
      level_notes: ["Experienced-hire bar: you drive the design — the interviewer should mostly react", "Ground choices in a system you have actually run where you honestly can; say so when you cannot", "Every claim gets a number: QPS, storage, latency budget"] };
  }
  function casePrepPlan(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir); const sess = caseSession(opts);
    const weeks = Math.max(2, Math.min(10, opts.weeks || 6));
    const perWeek = Math.max(5, Math.round(40 / weeks)); const total = perWeek * weeks;
    return { kind: "case_prep_plan", company: n ? n.company_name : (s(opts.company) || null), cir_grounded: !!n, style: sess.style, framework: sess.framework,
      practice_norm: { low: 30, high: 50, unit: "full practice cases before interviews", label: "community-reported", official: false,
        note: "This count is community-reported preparation folklore passed on by candidates and prep communities — it is NOT published or endorsed by any MBB firm, and the CIRs on file do not quantify it. It is a planning target, not a requirement." },
      schedule: { weeks, sessions_per_week: perWeek, total_cases: total, inside_norm: total >= 30 && total <= 50,
        plan: Array.from({ length: weeks }, (_, i) => `Week ${i + 1}: ${perWeek} cases (${i === 0 ? "framework + structuring drills first" : i === weeks - 1 ? "timed, interviewer-led, full feedback loop" : "mix of interviewer-led cases + mental-math/market-sizing drills"}), each scored with scoreCaseResponse and the gaps re-drilled next session`) } };
  }
  const MM_DRILL = [
    { id: "mm-1", topic: "market_making", q: "A stock's fair value you estimate at $10.00. How do you quote, and what moves your spread?", key: ["bid", "ask", "fair value", "spread", "inventory", "informed"], expect: "Bid below / ask above your fair-value estimate; widen with inventory risk, volatility, or informed (adverse-selection) flow." },
    { id: "mm-2", topic: "market_making", q: "You are long 500 shares from fills and a big buy order arrives. What do you do to your quotes and why?", key: ["skew", "lower", "inventory", "sell"], expect: "Skew quotes down (cheaper ask, lower bid) to shed inventory and discourage more buys — you are paid to provide liquidity, not to accumulate directional risk." }];
  function marketMakingDrill() { return { kind: "market_making", questions: MM_DRILL.map(({ id, topic, q, expect }) => ({ id, topic, q, expect })) }; }
  function gradeMarketMaking(id, answer) {
    const d = MM_DRILL.find((x) => x.id === id); if (!d) return null;
    const low = lc(answer); const hits = d.key.filter((k) => low.includes(k)); const score = Math.round((hits.length / d.key.length) * 5);
    return { id, topic: d.topic, score_0_5: score, hits, missed: d.key.filter((k) => !low.includes(k)), answer_key: d.expect, gap: score >= 4 ? null : `Missing: ${d.key.filter((k) => !low.includes(k)).join(", ")}` };
  }
  function quantPrepSet(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir); const q = quantDrill();
    return { kind: "quant_prep", company: n ? n.company_name : null, cir_grounded: !!n,
      topics: [...new Set([...q.questions.map((x) => x.topic), "market_making"])],
      probability_and_ev: q.questions, market_making: marketMakingDrill().questions,
      drills_note: "Probability/EV/mental-math items are auto-graded numerically (gradeDrillAnswer); market-making items are keyword-graded (gradeMarketMaking). Company framing, where claimed, comes only from the CIR on file." };
  }
  function pmPrep(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir); const stories = opts.stories || [];
    const shipped = stories.filter((x) => (x.metrics || []).length).sort((a, b) => (b.metrics || []).length - (a.metrics || []).length)[0] || stories[0] || null;
    return { kind: "pm_prep", company: n ? n.company_name : null, cir_grounded: !!n,
      styles: n ? n.styles : [],
      shipped_thing: shipped ? { title: shipped.title, action: shipped.action, result: shipped.result, metrics: shipped.metrics || [], story_id: shipped.story_id } : null,
      product_sense_walkthrough: shipped ? [`Open with the shipped thing: ${shipped.title} — ${shipped.action}; result: ${shipped.result}.`, "Walk it as a product: who the user is, the painful workflow it replaced, the one metric that proved it worked.", "Name a decision you reversed from usage evidence — PM interviewers probe for that specifically."] : ["No shipped story mined from the profile yet — mine one before product-sense prep can anchor."],
      product_sense_questions: ["How would you improve the product you shipped — and what would you measure before building anything?", "Pick a product you use daily: what is its north-star metric, and what input metrics actually move it?", "Your key metric drops 20% week over week. Walk me through your first hour.", "Design this company's product for a user segment it does not serve today."],
      metrics_ready: shipped ? (shipped.metrics || []).map((m) => `${shipped.title}: ${m}`) : [],
      note: "Metrics listed are copied from the user's own profile facts — none are invented for polish." };
  }
  function sendThankYou(store, draft, opts) {
    opts = opts || {};
    if (!draft || draft.status !== "draft_only") return { status: "not_sent", reason: "Only a thankYouDraft (draft_only) can be sent." };
    if (opts.approved !== true) return { status: "not_sent", reason: "Approval card gate: nothing sends without the user's explicit yes." };
    if (!store.sent) store.sent = [];
    const row = { kind: "thank_you", to: draft.to, subject: draft.subject, body: draft.body, status: "sent", sent_at: new Date().toISOString(), rail: "approval_card_approved" };
    store.sent.push(row); return { status: "sent", row };
  }

  // ---------- PREP-008 live assist OFF + voice honesty ----------
  function liveAssistGuard(text) {
    if (/\b(during|live|feed me|listen in|real interview|while i'?m in)\b/i.test(s(text)) && /\b(answer|assist|help|feed)\b/i.test(s(text))) {
      return { refused: true, ruling: "Owner ruling 2026-10-12: live interview assist is OFF (PREP-008).",
        message: "I can't feed you answers during a real interview — that's off, by decision, not by limitation. What I can do is get you ready: a brief, a scored mock, and drills on the exact round, today.",
        prep_offer: ["a company brief", "a scored mock", "drills on the exact round"] };
    }
    return { refused: false };
  }
  function voiceMockAvailability() {
    return { available: false, reason: "No voice rail is wired for interview prep in this build.", fallback: "text mock (PREP-003) — same questions, same rubric, scores stored the same way." };
  }

  // ---------- finisher A2 additions (SC-191..200, BUG-A2-01..10) ----------
  function videoInterviewPractice(store, opts) {
    opts = opts || {}; const qs = opts.questions || []; const answers = opts.answers || [];
    const feedback = qs.map((q, i) => { const g = scoreAnswer(answers[i] || ""); return { q, scores: g.scores, feedback: g.feedback }; });
    const avg = feedback.length ? Math.round(feedback.reduce((n, f) => n + f.scores.total, 0) / feedback.length * 10) / 10 : 0;
    const row = { kind: "video_practice", company: s(opts.company || ""), count: feedback.length, average_total: avg, at: new Date().toISOString() };
    if (store && store.drills) store.drills.push(row);
    return { kind: "video_interview_practice", label: "TEST recorded-answer practice (transcript supplied in chat; no real camera or employer portal)", company: row.company, feedback, average_total: avg, submitted: false, submission_attempted: false, note: "Practice only — answers are scored on content here and are NEVER submitted to any employer by the agent. Submission, if any, is the user's own act in the employer's portal." };
  }
  function takeHomePlan(opts) {
    opts = opts || {}; const deliverables = opts.deliverables || []; const available = opts.available || [];
    const total_est_min = deliverables.reduce((n, d) => n + (d.est_min || 0), 0);
    const total_available_min = available.reduce((n, b) => n + (b.minutes || 0), 0);
    const schedule = []; let bi = 0, left = available.length ? available[0].minutes : 0;
    for (const d of deliverables) { let need = d.est_min || 0; const parts = [];
      while (need > 0 && bi < available.length) { const use = Math.min(need, left); parts.push(`${available[bi].label}: ${use} min`); need -= use; left -= use; if (left === 0) { bi += 1; left = bi < available.length ? available[bi].minutes : 0; } }
      schedule.push({ deliverable: d.name, est_min: d.est_min || 0, blocks: parts, unscheduled_min: need }); }
    const fits = total_est_min <= total_available_min;
    return { title: s(opts.title || "Take-home"), total_est_min, total_available_min, fits, warning: fits ? null : `Scope is ${total_est_min - total_available_min} min over the time you said you have — cut scope or add a block before starting; do not plan an all-nighter by default.`, schedule, checkpoints: ["After the first deliverable: re-estimate the rest against actual pace", "30 min before the deadline: stop building, write up and check the submission format yourself"], work_stays_mine: true, agent_does_work: false, note: "Plan only. The agent scopes and schedules; it does not do, draft or submit the take-home — the work stays yours." };
  }
  function finalRoundDelta(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir);
    if (!n) return { status: "NO_CIR", company: s(opts.company || ""), final_stage: null, earlier_stages: [], changes: [], gaps: ["No merged CIR on file — what changes in the final round cannot be claimed."] };
    let fi = n.stages.length - 1; for (let i = n.stages.length - 1; i >= 0; i--) { if (/final|superday|onsite|interview|loop/i.test(n.stages[i].name)) { fi = i; break; } }
    const final = n.stages[fi] || null; const earlier = n.stages.slice(0, fi);
    const changes = [];
    if (final) changes.push(`The final stage on record is "${final.name}"${final.detail ? `: ${final.detail}` : ""} — earlier stages (${earlier.map((x) => x.name).join("; ") || "none recorded"}) are screens; this one is the decision round.`);
    for (const st of n.styles.slice(0, 2)) changes.push(`Format signal for the final round (CIR interview_styles): ${st.text}`);
    changes.push("What changes in practice: breadth screens give way to depth — expect follow-ups on your own resume/stories and the technical core of the role, with several interviewers rather than one screener (grounded only in the stage/style records above).");
    return { status: "OK", company: n.company_name, final_stage: final, earlier_stages: earlier, changes, bar: n.bar, sources: [{ type: "CIR", company_id: n.company_id, as_of: n.as_of }] };
  }
  function salaryDeflectionScripts(opts) {
    const prep = salaryPrep(opts || {});
    const scripts = [
      { when: "early screen", text: "I'm focused on the role and the team first, and I'd rather not anchor on a number before I understand the full scope. Could you share the band budgeted for this level?" },
      { when: "pressed for a number", text: "I don't have a fixed number at this stage — my priority is fit, and I'm confident we can land somewhere fair inside the band for this level once we're both sure it's right." },
      { when: "they share a band", text: "Thanks for sharing that — that's helpful context. I'd like to keep the conversation on the role for now and revisit comp once we're further along." }];
    return { status: prep.status, company: prep.company, ranges: prep.ranges || [], scripts, anchor_rule: "Do not anchor early: never name the first number inside an interview; ask for the employer's band, and cite only a CIR-sourced figure if one exists.", note: prep.note };
  }
  function questionsToAsk(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir); const iv = opts.interviewer || {};
    const brief = interviewerBrief(iv); const team = s(iv.team || "");
    const teamFact = (iv.publicFacts || []).find((f) => /team/i.test(s(f.text)));
    const questions = [];
    if (team) questions.push({ text: `What does the ${team} team actually spend its week on, and what does a strong first project look like on it?`, source: { type: "interviewer_team_supplied", team } });
    else if (teamFact) questions.push({ text: `Your background notes mention: ${teamFact.text} — what is that team focused on this year?`, source: { type: "interviewer_public_fact", source: teamFact.source || "supplied" } });
    if (n) { const fin = n.stages[n.stages.length - 1];
      if (fin) questions.push({ text: `For someone coming through the ${fin.name} stage, what separates the people who thrive here in the first six months?`, source: { type: "CIR process_stages", company_id: n.company_id } });
      for (const v of n.values.slice(0, 2)) questions.push({ text: `The record for this company stresses: ${v.text} — how does that show up in your team's day-to-day decisions?`, source: { type: "CIR values_culture_signals", company_id: n.company_id } });
      for (const sg of n.signals.slice(0, 1)) questions.push({ text: `You screen for ${sg.text} — what does great look like on that in this team specifically?`, source: { type: "CIR screening_signals", company_id: n.company_id } }); }
    questions.push({ text: "What would you want someone in this seat to have accomplished by the end of the first term?", source: { type: "generic_good_question" } });
    return { company: n ? n.company_name : s(opts.company || ""), interviewer: { name: s(iv.name), role: s(iv.role || "") || null, team: team || null }, team_unknown: !team && !teamFact, interviewer_status: brief.status, questions, note: !team && !teamFact ? "No team fact was supplied for this interviewer, so no team is invented — questions are CIR-grounded; ask the team question once you learn the team." : "Team-tailored question is first; the rest are grounded in the company CIR." };
  }
  function failureStoryFromFacts(opts) {
    opts = opts || {}; const facts = opts.facts || [];
    const hit = facts.find((f) => /\b(fail|failure|setback|missed|broke|broken|rejected|rejection|lost|delay|delayed|dropped|mistake|wrong)\b/i.test([f.title, f.text, f.action, f.result].join(" ")));
    if (!hit) return { status: "NO_SETBACK_FACT", story: null, ask: ["Tell me about a real setback in your own words: what went wrong, on what (course, project, team)?", "What did you change afterward, and what is different now because of it?", "Is there a number or a before/after I can cite, so the story carries evidence?"], note: "No confirmed fact in the profile describes a setback or failure, so no failure story is built and nothing is invented. The story gets built from your answer, captured with its fact source." };
    return { status: "OK", story: { fact_id: hit.id || null, title: s(hit.title), situation: s(hit.text), task: s(hit.title), action: s(hit.action || ""), result: s(hit.result || ""), source: "profile_fact:" + s(hit.id || "unknown") }, ask: [] };
  }
  function structureDrill(opts) {
    opts = opts || {}; const g = scoreAnswer(opts.answer || "");
    return { fix_first: "structure", before_scores: g.scores, scaffold: ["First, the situation: <one line — where, what was at stake>", "My task was: <your specific job, not the team's>", "So I: <2-3 actions, named tools, specifically …>", "In the end, the result was: <a number, measured how, over what period>"], drill: "Re-answer the same question using exactly those four signposts, in order, with no new facts — structure only. Then re-mock and compare the structure score.", note: "The drill changes ordering and signposting only; it never adds facts to a story." };
  }
  function dayOfChecklist(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir); const missing = [];
    if (!opts.when) missing.push("when"); if (!opts.link) missing.push("link"); if (!opts.company && !n) missing.push("company");
    const groups = {
      logistics: [`When: ${s(opts.when || "NOT SUPPLIED")}`, `Company: ${n ? n.company_name : s(opts.company || "NOT SUPPLIED")}${n && n.stages.length ? " — stage on record: " + n.stages[n.stages.length - 1].name : ""}`, `Location/joining: ${s(opts.location || opts.link || "NOT SUPPLIED")}`, "Arrive / join 10 minutes early; ID and a quiet room if in person (TEST plan)"],
      links: opts.link ? [`Interview link (supplied, TEST-labeled where marked): ${opts.link}`, "Open the link once now to confirm it loads; keep it pinned, not buried in email"] : ["NO LINK SUPPLIED — flagged, not invented"],
      tech_check: ["Camera, mic and speaker test in the actual app", "Charger plugged in; notifications off; backup: phone hotspot ready", "Close heavy tabs; water within reach"],
      materials: [...(opts.materials || ["Resume (one page)", "Your two primary STAR stories, one line each", "Your questions-to-ask list", "Pen + paper for names and follow-ups"])] };
    return { company: n ? n.company_name : s(opts.company || ""), when: s(opts.when || "") || null, groups, missing, note: "Checklist built from the supplied logistics/link/materials and the CIR stage on record; nothing about the employer's systems is claimed beyond that." };
  }
  function debriefRetro(storeOrOpts) {
    const debriefs = (storeOrOpts && storeOrOpts.debriefs) || (storeOrOpts && storeOrOpts.debriefs === undefined && storeOrOpts.all) || [];
    const rows = Array.isArray(storeOrOpts) ? storeOrOpts : debriefs;
    const buckets = [
      { theme: "technical / valuation depth", re: /technical|valuation|dcf|model|accounting|math|accretion/i },
      { theme: "answer structure", re: /structure|ramble|rambling|organ|order/i },
      { theme: "specificity / evidence", re: /vague|specific|number|evidence|detail/i },
      { theme: "company / role knowledge", re: /company|why here|role knowledge|research/i },
      { theme: "timing / pace", re: /time|slow|rushed|pace/i }];
    const patterns = buckets.map((b) => { const hits = rows.filter((d) => (d.stumbled || []).some((x) => b.re.test(s(x)))); return { theme: b.theme, count: hits.length, companies: hits.map((d) => d.company) }; }).filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
    return { total_debriefs: rows.length, patterns, recurring: patterns.filter((p) => p.count >= 2), top_miss: patterns.length ? patterns[0].theme : null, note: rows.length ? "Mined only from the debriefs stored in the prep store (labeled TEST fixtures in this run); a theme counts once per debrief." : "No debriefs stored — nothing to mine." };
  }
  function superdayPlan(opts) {
    opts = opts || {}; const n = normalizeCir(opts.cir);
    if (!n) return { status: "NO_CIR", company: s(opts.company || ""), final_stage: null, schedule: [], drill_topics: [], gaps: ["No merged CIR on file — no superday plan is claimed."] };
    const fin = financeDrill(); const delta = finalRoundDelta({ cir: opts.cir });
    return { status: "OK", company: n.company_name, when: s(opts.when || "") || null, final_stage: delta.final_stage, earlier_stages: delta.earlier_stages,
      drill_topics: fin.questions.map((q) => q.topic + ": " + q.q),
      schedule: [{ at: "T-60 min", block: "Arrive area early; no new material — re-read the bar and your two finance stories (F-004/F-006 pattern)" }, { at: "T-15 min", block: "Tech/room check if virtual, water, pen + paper; phone on silent" }, { at: "Between interviews", block: "2-minute reset: write down each interviewer's name + one specific from the conversation (feeds your thank-yous); do not replay mistakes" }, { at: "Midday", block: "Eat something real; the afternoon technicals (accounting / DCF / LBO topics in the drill set) are the known pressure point" }, { at: "After the last interview", block: "Capture a debrief per interviewer while fresh (went well / stumbled / questions asked) — that is what the retro mines later" }],
      survival_rules: ["Depth over breadth in the final round: follow-ups on your own resume are the test, per the CIR stage record", "If a technical stalls, state your structure out loud and work it — silent freezing is the failure mode, not a wrong first step", "Names + one specific per interviewer, written down immediately"], sources: [{ type: "CIR", company_id: n.company_id, as_of: n.as_of }] };
  }

  return { normalizeCir, findCir, jdKeywords, composeBrief, questionBank, videoInterviewPractice, takeHomePlan, finalRoundDelta, salaryDeflectionScripts, questionsToAsk, failureStoryFromFacts, structureDrill, dayOfChecklist, debriefRetro, superdayPlan,
    makePrepStore, mineStories, captureStory, findStories, storyTags,
    scoreAnswer, startMock, answerMock, mockSummary,
    technicalDrills, financeDrill, quantDrill, gradeDrillAnswer, runDrill,
    caseSession, scoreCaseResponse, interviewerBrief, captureDebrief, thankYouDraft,
    salaryPrep, coffeeChatBrief, twoInterviewPlan, rejectionPivot, assemblePack,
    interviewerResearch, sharedGround, coffeeChatPrep, systemDesignPrep, casePrepPlan,
    quantPrepSet, marketMakingDrill, gradeMarketMaking, pmPrep, sendThankYou,
    liveAssistGuard, voiceMockAvailability, GENERIC_BEHAVIORAL };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerPrep;
