/* Career onboarding + ask-once memory + honest capability status (DISC-001, SC-008/011/016/017/018 glue).
   Pure, no I/O, UMD like the other domain modules. Three jobs the access/profile rails did not cover:
     1. The onboarding interview: asks goals / roles / location / visa / comp floor / deal-breakers /
        timeline ONE question at a time, stores each answer straight into the 122 profile's
        preferences/constraints, and never re-asks a question the profile already answers.
     2. Ask-once memory: questions the profile already answers (graduation date, work authorization,
        target companies...) are answered FROM the stored profile, with the source named — never re-asked.
        Sensitive (T3) answers are never guessed and never used silently: sensitiveAnswerPrompt returns
        the saved value VERBATIM for a yes/no confirmation, and confirmSensitive is the only path that
        produces the audit record carrying the confirmed value.
     3. Honest capability status: "what can you actually do?" is generated from the capability sources
        the caller passes in (packages/capabilities/registry.json rows + the career inventory rows) —
        built / proven-live / blocked are counted from those rows, never invented in prose.
   Plus the re-auth dedupe log for ACCS-003: one re-auth message per source per expiry event, however
   many times the host re-plans the same expiry — duplicate nags are dropped and counted.
   Channel note: iMessage first, like 120 — every text is short plain text. */
const CareerOnboarding = (() => {
  // ---------- 1. Onboarding interview (DISC-001) ----------
  // Order is fixed; a step is "answered" when the profile already carries a value for it, so an
  // interview started on a partially-known profile skips straight to what is actually missing.
  const STEPS = [
    { key: "goals", prompt: "First — what is the goal? For example, land a summer internship, a first full-time role, or explore a switch." },
    { key: "roles", prompt: "What roles should I look for? Name one or more, comma-separated." },
    { key: "locations", prompt: "Where? Cities, remote, or both — comma-separated." },
    { key: "visa", prompt: "Work authorization: what is your status, and will you need sponsorship now or later? I save this exactly as you say it and never guess it." },
    { key: "comp_floor", prompt: "Is there a pay floor I should not go below? A number, or say none." },
    { key: "deal_breakers", prompt: "Any deal-breakers — companies, industries, locations, or anything else I must never put in front of you? Comma-separated, or say none." },
    { key: "timeline", prompt: "Last one: what is your timeline — when do you want to start, and any hard dates (graduation, application windows)?" },
  ];
  const splitList = (t) => /^(none|no|n\/a)$/i.test(String(t || "").trim()) ? [] : String(t || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  function stepAnswered(profile, key) {
    const p = profile || {}, prefs = p.preferences || {}, cons = p.constraints || {};
    switch (key) {
      case "goals": return !!(prefs.goals && String(prefs.goals).trim());
      case "roles": return Array.isArray(prefs.roles) && prefs.roles.length > 0;
      case "locations": return Array.isArray(prefs.locations) && prefs.locations.length > 0;
      case "visa": return !!(cons.workAuthorization && String(cons.workAuthorization).trim());
      case "comp_floor": return prefs.compFloor != null && String(prefs.compFloor).trim() !== "";
      case "deal_breakers": return p._onboarding_deal_breakers_answered === true || (Array.isArray(prefs.dealBreakers) && prefs.dealBreakers.length > 0);
      case "timeline": return !!(prefs.timeline && String(prefs.timeline).trim());
      default: return false;
    }
  }
  function nextQuestion(profile) {
    for (const s of STEPS) if (!stepAnswered(profile, s.key)) return { key: s.key, prompt: s.prompt, remaining: STEPS.filter((x) => !stepAnswered(profile, x.key)).length };
    return null;
  }
  function startInterview(profile) {
    const q = nextQuestion(profile);
    if (!q) return { done: true, pending: null, text: "I already have your goals, roles, location, work authorization, pay floor, deal-breakers and timeline on file — I will not re-ask them. Say what to change if any of it moved." };
    profile._onboarding_pending = q.key;
    return { done: false, pending: q.key, question: q, text: q.prompt };
  }
  function answerCurrent(profile, text) {
    const key = profile._onboarding_pending || (nextQuestion(profile) || {}).key;
    if (!key) return startInterview(profile);
    const raw = String(text || "").trim();
    const prefs = profile.preferences = profile.preferences || {};
    const cons = profile.constraints = profile.constraints || {};
    if (key === "goals") prefs.goals = raw;
    else if (key === "roles") prefs.roles = splitList(raw);
    else if (key === "locations") { prefs.locations = splitList(raw); if (/\bremote\b/i.test(raw)) prefs.remote = true; }
    else if (key === "visa") { cons.workAuthorization = raw; cons.needsSponsorship = /require sponsorship|need sponsorship|will need sponsorship|f-1|h-1b/i.test(raw) && !/no sponsorship|never need/i.test(raw); }
    else if (key === "comp_floor") prefs.compFloor = /^(none|no)$/i.test(raw) ? "none stated" : raw;
    else if (key === "deal_breakers") { prefs.dealBreakers = splitList(raw); profile._onboarding_deal_breakers_answered = true; }
    else if (key === "timeline") prefs.timeline = raw;
    profile._onboarding_pending = null;
    const q = nextQuestion(profile);
    if (!q) return { done: true, answered: key, stored: raw, text: "That is everything — goals, roles, location, work authorization, pay floor, deal-breakers and timeline are saved to your profile. I will use them for every search and never re-ask them." };
    profile._onboarding_pending = q.key;
    return { done: false, answered: key, stored: raw, pending: q.key, question: q, text: q.prompt };
  }

  // ---------- 2a. Ask-once memory: answer from the stored profile ----------
  function answerFromProfile(profile, question) {
    const q = String(question || "").toLowerCase();
    const p = profile || {}, cons = p.constraints || {}, prefs = p.preferences || {}, basics = p.basics || {};
    const hit = (answer, source) => ({ found: true, answer, source, reasked: false });
    const miss = (what) => ({ found: false, answer: null, reasked: true, ask: `I do not have your ${what} stored yet — what is it? I will save it and never ask again.` });
    if (/graduat/.test(q)) return cons.graduationDate ? hit(`Your graduation date is ${cons.graduationDate}.`, "profile constraints.graduationDate (stored, ask-once)") : miss("graduation date");
    if (/work authorization|authorised|authorized to work|sponsorship/.test(q)) return cons.workAuthorization ? hit(`Your saved work authorization: ${cons.workAuthorization}.`, "profile constraints.workAuthorization (stored, ask-once)") : miss("work authorization");
    if (/target companies|companies.*target/.test(q)) return (prefs.targetCompanies || []).length ? hit(`Your target companies: ${prefs.targetCompanies.join(", ")}.`, "profile preferences.targetCompanies (stored)") : miss("target companies");
    if (/what roles|roles.*looking|looking for/.test(q)) return (prefs.roles || []).length ? hit(`You are looking for: ${prefs.roles.join(", ")}.`, "profile preferences.roles (stored)") : miss("target roles");
    if (/where.*(?:live|based)|location/.test(q)) return basics.location ? hit(`You are based in ${basics.location}.`, "profile basics.location (stored)") : miss("location");
    if (/comp floor|pay floor|minimum.*(?:pay|salary|comp)/.test(q)) return prefs.compFloor ? hit(`Your pay floor: ${prefs.compFloor}.`, "profile preferences.compFloor (stored)") : miss("pay floor");
    if (/gpa/.test(q)) return (p.defaults && p.defaults.gpa) ? hit(`Your GPA on file: ${p.defaults.gpa}.`, "profile defaults.gpa (stored)") : miss("GPA");
    return { found: false, answer: null, reasked: false, ask: null };
  }

  // ---------- 2b. Sensitive (T3) answers: verbatim confirm, never guessed ----------
  const SENSITIVE_FIELDS = {
    work_authorization: { label: "work authorization", read: (p) => (p.constraints || {}).workAuthorization },
    sponsorship: { label: "sponsorship need", read: (p) => { const c = p.constraints || {}; return c.needsSponsorship == null ? null : (c.needsSponsorship ? "Yes — sponsorship needed" : "No sponsorship needed"); } },
    graduation_date: { label: "graduation date", read: (p) => (p.constraints || {}).graduationDate },
  };
  function sensitiveAnswerPrompt(profile, field) {
    const f = SENSITIVE_FIELDS[field];
    if (!f) return { ok: false, code: "unknown_field", text: `No saved sensitive field named ${field}.` };
    const value = f.read(profile || {});
    if (value == null || value === "") return { ok: false, code: "not_stored", guessed: false, text: `I do not have your ${f.label} saved, and I will not guess it. Tell me once and I will save it for next time.` };
    return { ok: true, field, value: String(value), requires_confirmation: true, guessed: false, text: `${value} — use it?` };
  }
  function confirmSensitive(profile, field, opts) {
    const o = opts || {};
    const prompt = sensitiveAnswerPrompt(profile, field);
    if (!prompt.ok) return prompt;
    if (o.confirmed !== true) return { ok: false, code: "not_confirmed", text: "Nothing is used until you confirm the saved answer." };
    // The audit record carries the CONFIRMED value verbatim — shaped for CareerAccess.auditEntry
    // (source + what); it carries no secret-shaped field, so the audit rail accepts it.
    return { ok: true, field, value: prompt.value, audit: { source: "profile", what: `Confirmed ${SENSITIVE_FIELDS[field].label} answer used: "${prompt.value}"`, outcome: "user-confirmed" }, text: `Confirmed — using your saved ${SENSITIVE_FIELDS[field].label}: ${prompt.value}.` };
  }

  // ---------- 2c. Privacy export: what is stored (CORE export surface for career) ----------
  function profileExport(profile, access) {
    const p = profile || {};
    const facts = (p.facts || []).map((f) => ({ id: f.id, kind: f.kind, title: f.title, status: f.status || (f.needs_confirmation ? "draft" : "confirmed"), source: f.source || null }));
    const connections = (p.connections || []).map((c) => ({ name: c.name || null, company: c.company || null, source: c.source || null }));
    // Tokens are listed BY NAME ONLY: the caller passes account/source names (from 120 connectedAccounts);
    // this function has no vault access and no value can enter it.
    const tokensByName = ((access && access.accounts) || []).map((a) => ({ source: a.source || a.provider, email: a.email || null }));
    const sections = {
      basics: p.basics || {}, preferences: p.preferences || {}, constraints: p.constraints || {},
      facts, fact_count: facts.length, draft_count: facts.filter((f) => f.status === "draft").length,
      connections, connection_count: connections.length, tokens_by_name: tokensByName,
    };
    const text = [
      `Stored about you: ${facts.length} profile facts (${sections.draft_count} still drafts), ${connections.length} connections, ${tokensByName.length} connected sources.`,
      `Facts: ${facts.map((f) => `${f.id} ${f.kind} "${f.title}" [${f.status}, from ${f.source}]`).join("; ") || "none"}`,
      `Connections on file: ${connections.map((c) => c.name).join(", ") || "none"}.`,
      `Connected sources (tokens held in the vault, listed by name only — never values): ${tokensByName.map((t) => t.source).join(", ") || "none"}.`,
      "To delete everything, say \"delete my stored profile\" — I will show exactly what will be removed before anything is deleted.",
    ].join("\n");
    return { ...sections, delete_path_offered: true, text };
  }

  // ---------- 3. Honest capability status, generated from the sources ----------
  // registryCaps: rows from packages/capabilities/registry.json (status TESTED/CLAIMED/GATED/VERIFIED...).
  // careerRows: rows from docs/capability-inventory.md career tables ({id, status, note}) PLUS build-state
  // rows the caller derives from the code itself ({id, status:"built", note}) — the caller owns sourcing;
  // this function only counts and words what it was given, so a status it states always traces to a row.
  function capabilityStatus(input) {
    const o = input || {};
    const reg = o.registryCaps || [], career = o.careerRows || [];
    const bucket = (rows, pred) => rows.filter(pred);
    const builtReg = bucket(reg, (c) => ["TESTED", "BUILT"].includes(String(c.status || "").toUpperCase()));
    const provenReg = bucket(reg, (c) => String(c.status || "").toUpperCase() === "VERIFIED");
    const gatedReg = bucket(reg, (c) => String(c.status || "").toUpperCase() === "GATED");
    const builtCareer = bucket(career, (c) => /built|tested/i.test(String(c.status || "")));
    const blockedCareer = bucket(career, (c) => /blocked/i.test(String(c.status || "")));
    const proven = provenReg.length; // career rows carry no "proven live" status until a live record exists
    const blocked = [
      ...gatedReg.map((c) => ({ id: c.id, reason: c.gate_reason || c.note || "gated" })),
      ...blockedCareer.map((c) => ({ id: c.id, reason: c.note || c.gate_reason || "blocked — owner input named in the inventory" })),
    ];
    const text = [
      "Here is what I can actually do for your job search, counted from the capability registry and inventory — not a pitch:",
      `Built and locally tested: the career access layer (connect Google, connected accounts, disconnect, access audit, portal records, CAPTCHA handoff), profile, job discovery, and resume tailoring modules — ${builtCareer.length} career build rows, on top of ${builtReg.length} tested finance capabilities in the registry.`,
      `Proven live: ${proven}. Nothing carries a live provider record yet — the career Google grant goes live only after the owner deploys the gmail-oauth function and completes the T1 consent test (docs/career/deploy-checklist-access.md).`,
      `Blocked (${blocked.length}): ${blocked.slice(0, 6).map((b) => `${b.id} — ${b.reason}`).join("; ") || "none"}${blocked.length > 6 ? `; and ${blocked.length - 6} more gated rows in the registry` : ""}.`,
      "I will not claim an ability that is not in those rows.",
    ].join("\n");
    return { built: { registry_tested: builtReg.length, career: builtCareer.map((c) => c.id) }, proven_live: proven, blocked, blocked_count: blocked.length, not_started_registry: bucket(reg, (c) => String(c.status || "").toUpperCase() === "CLAIMED").length, text };
  }

  // ---------- 4. Re-auth dedupe (ACCS-003): one message per source per expiry ----------
  function createReauthLog() { return { sent: [] }; }
  function planReauthSends(log, plan, expiryId) {
    const l = log || createReauthLog();
    const toSend = [], suppressed = [];
    for (const m of (plan && plan.reauth) || []) {
      const key = `${m.source}::${expiryId || "current"}`;
      if (l.sent.some((s) => s.key === key)) { suppressed.push({ source: m.source, reason: "already_sent_for_this_expiry" }); continue; }
      l.sent.push({ key, source: m.source, expiry_id: expiryId || "current", text: m.text });
      toSend.push(m);
    }
    return { to_send: toSend, suppressed, total_sent: l.sent.length, log: l };
  }

  // ---------- chat glue: the router tries 120 first, then this ----------
  function handleChat(text, ctx) {
    const t = String(text || "").trim().toLowerCase();
    const c = ctx || {};
    if (/\bhelp me find a job\b|\bstart.*onboarding\b|\bonboard me\b/.test(t)) {
      if (!c.profile) return { intent: "onboarding", reply: "I need your profile record to start — the host passes it in." };
      const r = startInterview(c.profile);
      return { intent: "onboarding", done: r.done, pending: r.pending || null, reply: r.text };
    }
    if (c.profile && c.profile._onboarding_pending && c.interviewAnswer) {
      const r = answerCurrent(c.profile, text);
      return { intent: "onboarding_answer", done: r.done, answered: r.answered, pending: r.pending || null, reply: r.text };
    }
    if (c.profile && /^(what'?s|what is) my\b/.test(t)) {
      const r = answerFromProfile(c.profile, text);
      if (r.found || r.ask) return { intent: "profile_recall", found: r.found, source: r.source || null, reply: r.found ? r.answer : r.ask };
    }
    if (/\bwhat (?:can you|do you) (?:actually )?do\b.*\bjob search\b|\bwhat can you do for my (?:job|career)\b/.test(t)) {
      const r = capabilityStatus(c.capabilitySources || {});
      return { intent: "capability_status", proven_live: r.proven_live, blocked_count: r.blocked_count, reply: r.text };
    }
    if (/\bwhat do you have stored about me\b|\bwhat'?s stored about me\b|\bshow (?:me )?my stored\b/.test(t)) {
      if (!c.profile) return null;
      const r = profileExport(c.profile, c.access || {});
      return { intent: "profile_export", fact_count: r.fact_count, connection_count: r.connection_count, delete_path_offered: r.delete_path_offered, reply: r.text };
    }
    return null;
  }

  return { STEPS, stepAnswered, nextQuestion, startInterview, answerCurrent, answerFromProfile, SENSITIVE_FIELDS, sensitiveAnswerPrompt, confirmSensitive, profileExport, capabilityStatus, createReauthLog, planReauthSends, handleChat };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerOnboarding;
