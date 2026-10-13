/* Career outreach engine (Doc 1, OUTR-001..008 / OUTE-001..013). Pure domain logic: the clock, DNS lookup,
   transports and the user's profile are passed in. Sends ride an INJECTED transport only — the Gmail shape
   (createGmailTransport) wraps a caller-supplied Gmail API client; this module never sends by itself and
   holds no key, token or vendor credential. Mocks live only in tests and are labeled mock there.
   OWNER RULES (decided 2026-10-12, not provisional): send only from the user's own Gmail via OAuth;
   caps start 10-15/day, ramp +5 per 2-3 days, ceiling 30/day, and the agent REFUSES to raise caps;
   per-domain throttle 3-5/day; per-firm cap 15 per 30 days; per-person 1 initial + max 2 follow-ups
   per 6 months; follow-up waves need a continue tap; EU/UK recipients are EXCLUDED in v1; NO LinkedIn
   scraping or automation of any kind (user-owned export data only); suppression is shared cross-user
   (only the opt-out fact is shared, campaign data stays per-user) and a suppression failure is severity-1. */
const CareerOutreach = (() => {
  "use strict";
  let FIRM_SETS = null;
  try { FIRM_SETS = require("../career-data/firm-sets.json"); } catch (e) { FIRM_SETS = { sets: {} }; }

  const CAPS = Object.freeze({
    channel: "gmail_oauth_only", startPerDay: 12, startRange: [10, 15], rampStep: 5, rampEveryDays: 3,
    ceilingPerDay: 30, userCanRaise: false, perDomainPerDay: 4, perDomainRange: [3, 5],
    perFirmPer30Days: 15, perPersonInitial: 1, perPersonMaxFollowUps: 2, perPersonWindowDays: 183,
    riskyMaxFraction: 0.10, gapMinutes: [2, 8], bounceBreakerRate: 0.03, hostileBreakerCount: 2,
    wave1Size: 40, maxWords: 120, maxLinks: 1,
  });
  const OPT_OUT_LINE = "If you'd rather not hear from me, just say so and I'll stop.";
  const BANNED_PHRASES = ["i hope this email finds you well", "i came across your profile and was impressed",
    "pick your brain", "i'd love to connect", "i would love to connect", "admire your impressive career"];
  const EU_UK_COUNTRIES = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","GB","UK"]);
  const EU_UK_PLACES = ["london", "united kingdom", "england", "scotland", "wales", "germany", "france", "ireland", "netherlands", "spain", "italy", "poland", "sweden", "belgium", "austria", "switzerland is not eu", "portugal", "denmark", "norway", "finland", "czech", "romania", "greece", "hungary", "berlin", "munich", "paris", "dublin", "amsterdam", "madrid", "milan", "stockholm", "warsaw", "zurich is not eu"];
  const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const emailDomain = (e) => { const m = String(e || "").toLowerCase().match(/@([^>\s]+)$/); return m ? m[1] : null; };
  function isEuUk(c) {
    if (!c) return false;
    if (c.country && EU_UK_COUNTRIES.has(String(c.country).toUpperCase())) return true;
    const g = norm(c.geography || c.office || c.location || "");
    if (!g) return false;
    // Zurich (CH) and Oslo (NO) are not EU/UK for this rule's country set as coded above except NO is not in set; keep place list clean:
    return ["london", "united kingdom", "england", "scotland", "wales", "germany", "france", "ireland", "netherlands", "spain", "italy", "poland", "sweden", "belgium", "austria", "portugal", "denmark", "finland", "czech", "romania", "greece", "hungary", "berlin", "munich", "paris", "dublin", "amsterdam", "madrid", "milan", "stockholm", "warsaw", "frankfurt", "luxembourg", "brussels", "vienna", "lisbon", "athens", "budapest", "prague", "bucharest", "helsinki", "copenhagen"].some((p) => g.split(" ").join(" ").includes(p));
  }

  // ---------- OUTE-001: target-spec parser ----------
  const SET_ALIASES = [
    ["bulge_bracket", /\bbulge bracket\b|\bbb banks?\b/], ["elite_boutique", /\belite boutique/],
    ["middle_market", /\bmiddle[- ]market\b|\bmm banks?\b/], ["mbb", /\bmbb\b|\bmckinsey\b|\bbain\b|\bbcg\b|\bboston consulting\b/],
    ["faang_plus", /\bfaang\b|\bmeta\b|\bgoogle\b|\bapple\b|\bamazon\b|\bnetflix\b|\bmicrosoft\b/],
    ["quant", /\bquant\b|\bprop trading\b|\bjane street\b|\bcitadel\b|\bhudson river\b/],
    ["big4", /\bbig ?4\b|\bdeloitte\b|\bpwc\b|\bkpmg\b|\bey\b/], ["mega_fund_pe", /\bmega[- ]fund\b|\bblackstone\b|\bkkr\b/],
    ["big_law", /\bbig law\b|\blaw firms?\b/], ["academic_medical", /\bmed[- ]school\b|\bmedical centers?\b|\bteaching hospitals?\b/],
    ["cpg", /\bcpg\b|\bconsumer packaged\b/], ["infrastructure_eng", /\binfrastructure firms?\b|\bcivil engineers?\b/],
    ["venture_midwest", /\bventure (analysts?|capital|funds?)\b|\bvc funds?\b/], ["logistics", /\blogistics\b|\bsupply chain\b/],
    ["real_estate_pe", /\breal[- ]estate (pe|private equity)\b/],
  ];
  function parseTarget(text, profile) {
    profile = profile || {};
    const raw = String(text || ""); const w = " " + norm(raw) + " ";
    const q = { industry: null, firm_set: null, firms: [], role_family: null, seniority_band: null, geography: null, school_filter: null, background_filters: {}, exclusions: [], count: null, vague: false, proposed_default: null };
    const num = raw.match(/\b(\d{1,4})\b/); q.count = num ? Number(num[1]) : null;
    for (const [set, re] of SET_ALIASES) if (re.test(w)) { q.firm_set = set; break; }
    if (q.firm_set && FIRM_SETS.sets[q.firm_set]) q.firms = FIRM_SETS.sets[q.firm_set].firms.map((f) => f.name);
    if (q.firm_set === "mbb") { q.industry = "consulting"; q.role_family = "consulting"; }
    if (/\bcivil engineers?\b/.test(w)) { q.industry = "engineering"; q.role_family = "civil_engineering"; }
    else if (/\b(ai\/ml|ml engineers?|machine learning)\b/.test(w)) { q.industry = q.industry || "tech"; q.role_family = "ml_engineering"; }
    if (/\blawyers?\b|\battorneys?\b/.test(w)) { q.industry = "law"; q.role_family = "law"; }
    if (/\bresidents?\b/.test(w) && /\bmed|medical|hospital|pre-med/.test(w)) { q.industry = "healthcare"; q.role_family = "medical_resident"; }
    if (/\bmarketing\b/.test(w)) { q.role_family = q.role_family || "marketing"; q.industry = q.industry || "consumer_goods"; }
    if (/\b(ops|operations) managers?\b/.test(w)) { q.role_family = "operations"; q.industry = q.industry || "logistics"; }
    if (/\bventure\b/.test(w)) { q.role_family = q.role_family || "venture"; q.industry = q.industry || "venture_capital"; }
    if (/\breal[- ]estate\b/.test(w)) { q.role_family = q.role_family || "real_estate_pe"; q.industry = q.industry || "real_estate_pe"; }
    if (/started as analysts?/.test(w)) q.background_filters.started_as_analyst = true;
    if (/teachers?-turned|teachers? (who|now) .*product|former teachers?/.test(w)) { q.background_filters.prior_career = "teaching"; q.role_family = q.role_family || "product_management"; }
    if (/publish\w* on github|active on github|github/.test(w)) q.background_filters.publishes_on_github = true;
    if (/deal[- ]specific/.test(w)) q.background_filters.deal_specific = true;
    if (/\binvestment bank|bankers?\b|ib analyst|\bm&a\b|levfin/.test(w)) { q.industry = "investment_banking"; q.role_family = q.role_family || "investment_banking"; }
    if (/\bconsult/.test(w)) { q.industry = "consulting"; q.role_family = q.role_family || "consulting"; }
    if (/\b(pms?|product managers?)\b/.test(w)) { q.role_family = "product_management"; q.industry = q.industry || "tech"; }
    if (/\b(swes?|software engineers?|engineers?)\b/.test(w) && q.role_family !== "civil_engineering" && q.role_family !== "ml_engineering") { q.role_family = "software_engineering"; q.industry = q.industry || "tech"; }
    if (/\bfounders?\b/.test(w)) { q.role_family = "founder"; q.industry = q.industry || "startups"; }
    if (/\bprivate equity|\bpe (associates?|principals?)\b/.test(w)) { q.industry = "private_equity"; q.role_family = q.role_family || "private_equity"; }
    if (/\bassociates?\b/.test(w)) q.seniority_band = "associate";
    else if (/\b(vps?|vice presidents?)\b/.test(w)) q.seniority_band = "vp_plus";
    else if (/\bprincipals?\b/.test(w)) q.seniority_band = "principal";
    else if (/\bmanagers?\b/.test(w)) q.seniority_band = "manager";
    else if (/\banalysts?\b/.test(w)) q.seniority_band = "analyst";
    const geo = raw.match(/\bin\s+(?:the\s+)?(NYC|NY|New York(?: City)?|Chicago|Boston|San Francisco|SF|Los Angeles|Houston|Dallas|London|Remote|Midwest|Texas)\b/i);
    if (geo) q.geography = geo[1].toUpperCase() === "NYC" ? "NYC" : geo[1];
    if (/went to my school|from my school|my school|same school/.test(w)) q.school_filter = profile.school || "USER_SCHOOL_UNSPECIFIED";
    else { const sm = raw.match(/\bwent to\s+([A-Z][A-Za-z& ]{2,30})/); if (sm) q.school_filter = sm[1].trim(); }
    const stage = raw.match(/series\s+([A-Z])(?:\s*[-–]\s*([A-Z]))?/i);
    if (stage) { const A = "ABCDEFGH"; const a = A.indexOf(stage[1].toUpperCase()); const b = stage[2] ? A.indexOf(stage[2].toUpperCase()) : a; q.background_filters.startup_stage = A.slice(a, b + 1).split(""); q.industry = q.industry || "startups"; }
    if (/hiring a first (swe|engineer)/.test(w)) q.background_filters.hiring_first_swe = true;
    if (/drop vps|no vps|exclude vps/.test(w)) q.exclusions.push("seniority:vp_plus");
    if (/alumni/.test(w)) q.background_filters.alumni = true;
    q.exclusions.push("geo:EU_UK"); // decided v1 rule, always on
    if (!q.count) q.count = 40;
    if (!q.firm_set && !Object.keys(q.background_filters).length && !q.school_filter && !q.geography) {
      q.vague = true;
      q.proposed_default = { industry: "investment_banking", firm_set: "bulge_bracket", role_family: "investment_banking", seniority_band: "analyst_associate", count: q.count, note: "Vague ask: proposed default shown to the user before anything is built (Doc 1 §2.1)." };
      Object.assign(q, { industry: q.proposed_default.industry, firm_set: q.proposed_default.firm_set, role_family: q.proposed_default.role_family });
      q.firms = (FIRM_SETS.sets.bulge_bracket ? FIRM_SETS.sets.bulge_bracket.firms.map((f) => f.name) : []);
    }
    if (!q.seniority_band && q.role_family) q.seniority_band = null;
    return q;
  }

  // ---------- OUTE-002: candidate pipeline ----------
  function levenshtein(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 0; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  const nameSim = (a, b) => { a = norm(a); b = norm(b); if (!a || !b) return 0; const max = Math.max(a.length, b.length); return max ? 1 - levenshtein(a, b) / max : 0; };
  const HARD_FUZZY = 0.92;
  function normalizeCandidate(r) {
    return Object.assign({ person_id: null, full_name: "", current_firm: "", title: "", group: "", seniority_band: null, office: "", geography: "", country: null, schools: [], grad_year: null, prior_firms: [], languages: [], public_links: [], work_email: null, email_confidence: 0, email_source: null, email_verification: null, personalization_facts: [], relationship_to_user: "none", opt_out: false, contacted_before: false, source_list: [], last_verified_at: null, title_stale: false }, r || {});
  }
  function resolveCandidates(records) {
    const out = [], review = []; const list = (records || []).map(normalizeCandidate);
    for (const r of list) {
      let merged = false;
      for (const c of out) {
        const sim = nameSim(c.full_name, r.full_name);
        const sameFirm = norm(c.current_firm) === norm(r.current_firm) && !!norm(r.current_firm);
        const schoolA = (c.schools || []).map(norm), schoolB = (r.schools || []).map(norm);
        const sameSchool = schoolA.some((s) => s && schoolB.includes(s));
        if (sim >= HARD_FUZZY && sameFirm && sameSchool) {
          // merge: richer record wins per field; sources union; facts union by fact text
          for (const k of ["title", "group", "work_email", "seniority_band", "office", "geography", "country", "grad_year", "last_verified_at"]) if (!c[k] && r[k]) c[k] = r[k];
          c.email_confidence = Math.max(c.email_confidence || 0, r.email_confidence || 0);
          c.source_list = [...new Set([...(c.source_list || []), ...(r.source_list || [])])];
          const seen = new Set(c.personalization_facts.map((f) => norm(f.fact)));
          for (const f of r.personalization_facts || []) if (!seen.has(norm(f.fact))) c.personalization_facts.push(f);
          merged = true; break;
        }
        if (sim >= 0.80 && sim < HARD_FUZZY && sameFirm) { review.push(Object.assign({}, r, { review_reason: "ambiguous_identity", matched_person_id: c.person_id || null })); merged = true; break; }
        if (sim >= HARD_FUZZY && sameFirm && !sameSchool) { review.push(Object.assign({}, r, { review_reason: "ambiguous_identity_school_mismatch" })); merged = true; break; }
      }
      if (!merged) out.push(r);
    }
    return { candidates: out, review };
  }
  function scoreCandidate(c, q, profile, nowMs) {
    q = q || {}; profile = profile || {};
    let fit = 0; const firmNames = (q.firms || []).map(norm);
    if (!firmNames.length || firmNames.includes(norm(c.current_firm))) fit += 0.4;
    if (!q.seniority_band || !c.seniority_band || norm(c.seniority_band) === norm(q.seniority_band)) fit += 0.2;
    if (!q.geography || norm(c.geography || c.office).includes(norm(q.geography)) || norm(q.geography) === "nyc" && /new york/.test(norm(c.geography || c.office))) fit += 0.2;
    if (!q.school_filter || q.school_filter === "USER_SCHOOL_UNSPECIFIED" || (c.schools || []).map(norm).includes(norm(q.school_filter))) fit += 0.2;
    const reachability = Math.max(0, Math.min(1, c.email_confidence || 0));
    const rel = norm(c.relationship_to_user);
    let warmth = 0.1;
    if (/1st|first/.test(rel)) warmth = 1; else if (/same school.*club|club.*same school/.test(rel)) warmth = 0.9;
    else if (/2nd|second/.test(rel)) warmth = 0.6; else if (/same school|alumni/.test(rel)) warmth = 0.7; else if (/hometown/.test(rel)) warmth = 0.5;
    if (profile.school && (c.schools || []).map(norm).includes(norm(profile.school))) warmth = Math.max(warmth, 0.7);
    let recency = 0.2;
    if (c.last_verified_at) { const age = (nowMs - Date.parse(c.last_verified_at)) / 86400000; recency = age <= 30 ? 1 : age <= 90 ? 0.7 : age <= 183 ? 0.4 : 0.2; }
    const total = Math.round((0.4 * fit + 0.25 * reachability + 0.2 * warmth + 0.15 * recency) * 1000) / 1000;
    return { fit: Math.round(fit * 1000) / 1000, reachability, warmth, recency, total };
  }
  function buildList(records, query, opts) {
    opts = opts || {}; const nowMs = opts.nowMs || Date.now(); const profile = opts.profile || {};
    const suppression = opts.suppression || null;
    const already = new Set((opts.alreadyEmailed || []).map((e) => norm(e)));
    const ownEmployers = new Set([].concat(profile.current_employer || [], profile.past_employers || []).map(norm).filter(Boolean));
    const { candidates, review } = resolveCandidates(records);
    const exclusions = { already_emailed: 0, own_employer: 0, suppressed: 0, eu_uk: 0, opt_out: 0, no_email: 0, invalid_email: 0 };
    const kept = [];
    for (const c of candidates) {
      if (c.opt_out) { exclusions.opt_out++; continue; }
      if (suppression && suppression.isSuppressed({ email: c.work_email, person_id: c.person_id }, opts.userId)) { exclusions.suppressed++; continue; }
      if (c.contacted_before || (c.work_email && already.has(norm(c.work_email))) || already.has(norm(c.full_name))) { exclusions.already_emailed++; continue; }
      if (ownEmployers.has(norm(c.current_firm)) && !opts.includeOwnEmployer) { exclusions.own_employer++; continue; }
      if (isEuUk(c)) { exclusions.eu_uk++; continue; }
      if (!c.work_email) { exclusions.no_email++; continue; }
      if (c.email_verification === "invalid") { exclusions.invalid_email++; continue; }
      c.scores = scoreCandidate(c, query, profile, nowMs); kept.push(c);
    }
    kept.sort((a, b) => b.scores.total - a.scores.total);
    const want = query && query.count ? query.count : kept.length;
    const selected = [], reserve = [], firmCount = {};
    for (const c of kept) {
      const fk = norm(c.current_firm);
      if (selected.length < want) {
        if ((firmCount[fk] || 0) >= CAPS.perFirmPer30Days) { reserve.push(c); continue; }
        firmCount[fk] = (firmCount[fk] || 0) + 1; selected.push(c);
      } else reserve.push(c);
    }
    const trusted = kept.filter((c) => c.email_verification === "verified" || (!c.email_verification && (c.email_confidence || 0) >= 0.8)).length;
    const risky = kept.filter((c) => c.email_verification === "risky" || (!c.email_verification && (c.email_confidence || 0) < 0.5)).length;
    const yieldReport = { found: (records || []).length, resolved: candidates.length, review_bucket: review.length, trusted_emails: trusted, risky_emails: risky, sendable: kept.length, selected: selected.length, reserve: reserve.length, exclusions };
    return { candidates: selected, selected, reserve, review, yield: yieldReport, exclusions };
  }
  function listReviewCard(pool, query) {
    const by = (fn) => { const m = {}; for (const c of pool.selected || []) { const k = fn(c) || "unknown"; m[k] = (m[k] || 0) + 1; } return m; };
    return { count: (pool.selected || []).length, breakdown: { by_firm: by((c) => c.current_firm), by_role: by((c) => c.title), by_seniority: by((c) => c.seniority_band), by_school_overlap: by((c) => (c.schools || [])[0]) },
      confidence: pool.yield, yield: pool.yield, sample_rows: (pool.selected || []).slice(0, 10).map((c) => ({ name: c.full_name, firm: c.current_firm, title: c.title, school: (c.schools || [])[0] || null, email_verification: c.email_verification || null, scores: c.scores || null })),
      exclusions: pool.exclusions, review_bucket: (pool.review || []).length, query: query || null,
      text: `Found ${pool.yield.found}; trusted emails ${pool.yield.trusted_emails}; sendable ${pool.yield.sendable}; selected ${pool.yield.selected}; reserve ${pool.yield.reserve}; ${pool.yield.review_bucket} ambiguous in review (never sent).` };
  }
  // OUTR-001/002: warm paths + ranking from user-owned connections only.
  function rankContacts(contacts, profile) {
    profile = profile || {};
    return (contacts || []).map((c0) => { const c = normalizeCandidate(c0); const rel = norm(c.relationship_to_user); let rank = 0, why = [];
      if (profile.school && (c.schools || []).map(norm).includes(norm(profile.school))) { rank += 40; why.push("alumni"); }
      if (/club|same org|same major/.test(rel)) { rank += 25; why.push("shared org/major"); }
      if (/hometown/.test(rel)) { rank += 15; why.push("same hometown"); }
      if (/1st|first/.test(rel)) { rank += 20; why.push("1st-degree"); }
      return { contact: c, rank, why }; }).sort((a, b) => b.rank - a.rank);
  }
  function warmPaths(contacts, company, profile) {
    const co = norm(company);
    return rankContacts((contacts || []).filter((c) => norm(c.current_firm) === co), profile)
      .map((r) => ({ person: r.contact.full_name, firm: r.contact.current_firm, path: r.why.join(" + ") || "cold", rank: r.rank, relationship: r.contact.relationship_to_user }));
  }
  // OUTR-006: relationship memory over contact history rows.
  function relationshipMemory(history) {
    const rows = history || [];
    return { talkedTo: () => rows.map((r) => ({ name: r.full_name || r.name, stage: r.stage || "cold", last_contacted_at: r.last_contacted_at || null, next_touch_at: r.next_touch_at || null, said: r.last_summary || null })),
      dueForPing: (nowIso) => rows.filter((r) => r.next_touch_at && r.next_touch_at <= nowIso) };
  }

  // ---------- OUTE-003: email verification seam ----------
  const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  function createLocalVerifier(opts) {
    const dnsLookup = (opts && opts.dnsLookup) || null;
    async function verify(email) {
      const e = String(email || "").trim();
      if (!EMAIL_RE.test(e)) return { email: e, status: "invalid", confidence: 0, reason: "syntax", verifier: "local" };
      const domain = emailDomain(e);
      if (!dnsLookup) return { email: e, status: "risky", confidence: 0.3, reason: "no_dns_lookup_injected", verifier: "local" };
      let r; try { r = await dnsLookup(domain); } catch (err) { return { email: e, status: "risky", confidence: 0.3, reason: "dns_lookup_failed", verifier: "local" }; }
      if (!r || !r.mx || !r.mx.length) return { email: e, status: "invalid", confidence: 0.1, reason: "no_mx", verifier: "local" };
      if (r.catchAll) return { email: e, status: "risky", confidence: 0.45, reason: "catch_all_domain", verifier: "local" };
      return { email: e, status: "verified", confidence: 0.9, reason: "mx_ok", verifier: "local" };
    }
    return { kind: "local", verify, verifyAll: async (emails) => { const out = []; for (const e of emails) out.push(await verify(e)); return out; } };
  }
  function createVerifier(opts) {
    opts = opts || {};
    if (opts.vendor && typeof opts.vendor.verify === "function") {
      return { kind: "vendor", verify: (e) => opts.vendor.verify(e), verifyAll: async (list) => { const o = []; for (const e of list) o.push(await opts.vendor.verify(e)); return o; } };
    }
    return createLocalVerifier(opts);
  }

  // ---------- OUTE-005/006: draft engine + voice + quality gate ----------
  const VOICE_DEFAULT = Object.freeze({ formality: 0.3, warmth: 0.6, humor: 0.0, directness: 0.7, plain_student_voice: true });
  function determineTier(c, profile) {
    profile = profile || {}; const rel = norm(c.relationship_to_user);
    const facts = c.personalization_facts || [];
    if (/mutual/.test(rel) || facts.some((f) => f.kind === "referral" && f.verified === true)) return "A";
    if (/club|team/.test(rel) && profile.school && (c.schools || []).map(norm).includes(norm(profile.school))) return "A";
    if (facts.some((f) => f.strength === "strong")) return "A";
    if (profile.school && (c.schools || []).map(norm).includes(norm(profile.school))) return "B";
    if (/same school|same city|hometown/.test(rel)) return "B";
    if (c.geography || c.office) return "B";
    return "C";
  }
  const STRUCTURES = ["path_question", "shared_context", "specific_question", "short_honest", "peer_learning"];
  function draftFor(candidate, user, opts) {
    opts = opts || {}; const c = normalizeCandidate(candidate); user = user || {};
    const voice = Object.assign({}, VOICE_DEFAULT, opts.voice || user.voice || {});
    const tier = opts.tier || determineTier(c, user);
    const structure = STRUCTURES[(opts.structureIndex != null ? opts.structureIndex : tier === "A" ? 0 : tier === "B" ? 1 : 3) % STRUCTURES.length];
    const first = (c.full_name || "").split(/\s+/)[0] || "there";
    const facts = (c.personalization_facts || []).filter((f) => f && f.fact && f.source_url);
    const dropped = [];
    const usable = facts.filter((f) => { if (f.kind === "referral" && f.verified !== true) { dropped.push({ fact: f.fact, reason: "unverified_referral_claim" }); return false; } return true; });
    for (const extra of opts.extraLines || []) if (!extra.source_url) dropped.push({ fact: extra.fact || extra.text || "", reason: "unsourced_extra_line" });
    const strong = usable.find((f) => f.strength === "strong") || usable[0] || null;
    const why = []; const lines = [];
    lines.push(`Hi ${first},`);
    let intro = `I'm ${user.name || "a student"}${user.year ? `, a ${user.year}` : ""}${user.school ? ` at ${user.school}` : ""}.`;
    if (strong) {
      const clause = strong.kind === "referral" ? `${strong.fact}` : `I saw that ${strong.fact}`;
      intro += ` ${clause}, which is why I wanted to reach out to you specifically.`;
      why.push({ line: clause, fact: strong.fact, source_url: strong.source_url, strength: strong.strength || null, kind: strong.kind || null });
    } else if (tier !== "C") {
      const clause = `I am trying to learn about ${c.title || "your role"} at ${c.current_firm}`;
      intro += ` ${clause}.`; why.push({ line: clause, fact: `role at ${c.current_firm}`, source_url: "candidate_record", strength: "record", kind: "record" });
    }
    lines.push(intro);
    if (user.experience && !opts.concise) lines.push(`I'm currently ${user.experience}.`);
    const askTopic = strong && strong.topic ? strong.topic : `${c.title || "your path"} at ${c.current_firm}`;
    lines.push(`Would you have 15 minutes in the next two weeks to talk about ${askTopic}? Totally understand if you're swamped.`);
    lines.push(OPT_OUT_LINE);
    lines.push(`Thanks,\n${user.name || ""}${user.school ? ` | ${user.school}` : ""}${user.year_label ? ` ${user.year_label}` : ""}${user.link ? `\n${user.link}` : ""}`);
    let body = lines.join("\n\n");
    if (body.split(/\s+/).length > CAPS.maxWords && user.experience) { lines.splice(2, 1); body = lines.join("\n\n"); }
    const subject = strong && strong.subject_hint ? strong.subject_hint : `${user.school ? user.school + " " : ""}${user.year ? user.year + ", " : ""}question about ${c.title || "your path"} at ${c.current_firm}`.replace(/\s+/g, " ").trim();
    return { person_id: c.person_id || null, to: c.work_email || null, subject, body, tier, structure, voice,
      facts_used: why, why_this_line: why, dropped_unsourced: dropped, title_used: c.title || null, firm_used: c.current_firm || null, name_used: c.full_name || null };
  }
  function qualityGate(draft, candidate, opts) {
    opts = opts || {}; const c = normalizeCandidate(candidate); const failures = [];
    const body = String(draft.body || ""); const low = body.toLowerCase();
    for (const w of draft.why_this_line || draft.facts_used || []) {
      if (w.source_url === "candidate_record") continue;
      const found = (c.personalization_facts || []).some((f) => norm(f.fact) === norm(w.fact) && f.source_url === w.source_url);
      if (!found) failures.push("fact_not_in_record:" + (w.fact || w.line || ""));
    }
    if (/told me to reach out|suggested i reach out|referred me|said i should (reach out|contact you)/.test(low)) {
      const ok = (c.personalization_facts || []).some((f) => f.kind === "referral" && f.verified === true);
      if (!ok) failures.push("fabricated_referral");
    }
    if (c.title_stale) failures.push("stale_title");
    if (c.latest_title && c.title && norm(c.latest_title) !== norm(c.title)) failures.push("stale_title");
    if (draft.title_used && c.title && norm(draft.title_used) !== norm(c.title)) failures.push("stale_title");
    if (opts.nowMs && c.last_verified_at && (opts.nowMs - Date.parse(c.last_verified_at)) / 86400000 > 180) failures.push("stale_record");
    if (c.full_name && !body.includes(c.full_name.split(/\s+/)[0])) failures.push("name_mismatch");
    for (const p of BANNED_PHRASES) if (low.includes(p)) failures.push("banned_phrase:" + p);
    if (/\bFREE\b/.test(body) || /!{3,}|\${2,}/.test(body)) failures.push("spam_lint");
    if (/<[a-z][\s\S]*>/i.test(body)) failures.push("not_plain_text");
    const words = body.split(/\s+/).filter(Boolean).length; if (words > CAPS.maxWords) failures.push("too_long:" + words);
    const links = (body.match(/https?:\/\/|www\.|[a-z0-9-]+\.(com|edu|io|org)\/[^\s]+/gi) || []).length; if (links > CAPS.maxLinks) failures.push("too_many_links:" + links);
    if (!norm(body).includes(norm(OPT_OUT_LINE))) failures.push("missing_opt_out_footer");
    for (const other of opts.batchBodies || []) if (other && other.person_id !== draft.person_id && norm(other.body) && norm(other.body) === norm(body)) failures.push("duplicate_body");
    return { pass: failures.length === 0, failures: [...new Set(failures)], words };
  }
  function draftAndGate(candidate, user, opts) { const draft = draftFor(candidate, user, opts); const gate = qualityGate(draft, candidate, opts); return { draft, gate, queued: gate.pass }; }
  function draftReferralAsk(contact, user, opts) {
    opts = opts || {}; const c = normalizeCandidate(contact);
    if (!opts.shared_context || !opts.shared_context.source_url) return { ok: false, reason: "no_sourced_shared_context", draft: null };
    const body = [`Hi ${(c.full_name || "").split(/\s+/)[0]},`, `I'm ${user.name || "a student"}${user.school ? ` at ${user.school}` : ""}. ${opts.shared_context.fact}.`, `Would you be open to a 15-minute coffee chat in the next two weeks? Totally understand if you're swamped.`, OPT_OUT_LINE, `Thanks,\n${user.name || ""}`].join("\n\n");
    return { ok: true, draft: { to: c.work_email || null, subject: `Coffee chat — ${user.school || "student"}`, body, why_this_line: [{ line: opts.shared_context.fact, fact: opts.shared_context.fact, source_url: opts.shared_context.source_url }] } };
  }
  function draftIntroRequest(mutual, target, user, blurb) {
    const m = normalizeCandidate(mutual), t = normalizeCandidate(target);
    if (!blurb) return { ok: false, reason: "forwardable_blurb_required" };
    return { ok: true, draft: { to: m.work_email || null, subject: `Intro to ${t.full_name} at ${t.current_firm}?`, body: `Hi ${(m.full_name || "").split(/\s+/)[0]}, would you be willing to introduce me to ${t.full_name} at ${t.current_firm}? Forwardable blurb below — no worries at all if not.\n\n${blurb}\n\nThanks,\n${user.name || ""}` } };
  }

  // ---------- OUTE-008: suppression (per-user + shared cross-user; severity-1) ----------
  function createSuppressionStore(init) {
    const data = { perUserEmails: {}, perUserIds: {}, sharedEmails: [], sharedIds: [] };
    if (init) { data.perUserEmails = init.perUserEmails || {}; data.perUserIds = init.perUserIds || {}; data.sharedEmails = init.sharedEmails || []; data.sharedIds = init.sharedIds || []; }
    const key = (v) => norm(v);
    const store = {
      data,
      suppress(opts) {
        opts = opts || {}; const scope = opts.scope || "shared"; // a stop defaults to shared: opt-out fact is product-wide
        if (opts.email) {
          if (scope === "shared" || scope === "both") { if (!data.sharedEmails.includes(key(opts.email))) data.sharedEmails.push(key(opts.email)); }
          if ((scope === "user" || scope === "both") && opts.userId) { (data.perUserEmails[opts.userId] = data.perUserEmails[opts.userId] || []); if (!data.perUserEmails[opts.userId].includes(key(opts.email))) data.perUserEmails[opts.userId].push(key(opts.email)); }
        }
        if (opts.person_id) {
          if (scope === "shared" || scope === "both") { if (!data.sharedIds.includes(String(opts.person_id))) data.sharedIds.push(String(opts.person_id)); }
          if ((scope === "user" || scope === "both") && opts.userId) { (data.perUserIds[opts.userId] = data.perUserIds[opts.userId] || []); if (!data.perUserIds[opts.userId].includes(String(opts.person_id))) data.perUserIds[opts.userId].push(String(opts.person_id)); }
        }
        return { suppressed: true, scope };
      },
      isSuppressed(target, userId) {
        target = target || {};
        if (target.email && data.sharedEmails.includes(key(target.email))) return true;
        if (target.person_id && data.sharedIds.includes(String(target.person_id))) return true;
        if (userId) {
          if (target.email && (data.perUserEmails[userId] || []).includes(key(target.email))) return true;
          if (target.person_id && (data.perUserIds[userId] || []).includes(String(target.person_id))) return true;
        }
        return false;
      },
      toJSON() { return JSON.parse(JSON.stringify(data)); },
    };
    return store;
  }

  // ---------- OUTE-007/009: send queue, caps, waves, breaker, idempotency ----------
  function dailyCapForDay(dayIndex) { const d = Math.max(0, Math.floor(dayIndex || 0)); return Math.min(CAPS.ceilingPerDay, CAPS.startPerDay + CAPS.rampStep * Math.floor(d / CAPS.rampEveryDays)); }
  function refuseRaiseCap(requested) {
    const cap = CAPS.ceilingPerDay;
    if (requested != null && Number(requested) > cap) return { refused: true, cap, requested: Number(requested), reason: `Cap stays at ${cap}/day. Raising it risks your Gmail account and reply quality; the schedule is the schedule (owner rule, decided 2026-10-12).` };
    return { refused: false, cap: requested != null ? Math.min(Number(requested), cap) : cap };
  }
  function seededRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function createCampaign(opts) {
    opts = opts || {};
    return { id: opts.id || "campaign-1", userId: opts.userId || "user-1", status: opts.approved ? "approved" : "draft",
      sending_channel: "gmail_oauth_only", cap_per_day: refuseRaiseCap(opts.requestedCap).cap, requested_cap_refused: refuseRaiseCap(opts.requestedCap).refused,
      day_index: 0, items: [], sentKeys: [], touches: {}, firmWindow: [], history: [],
      wave: { sent: 0, bounces: 0, complaints: 0, hostile: 0, provider_warning: false },
      breaker: { tripped: false, cause: null, user_message: null }, stats: { replies: 0, positive: 0, meetings_booked: 0, meetings_held: 0, referrals: 0, complaints: 0 },
      followups_continue_tap: false };
  }
  function enqueue(campaign, entries, opts) {
    opts = opts || {}; const suppression = opts.suppression || null; const results = [];
    for (const e of entries || []) {
      const c = normalizeCandidate(e.candidate || e); const draft = e.draft || null;
      const base = { person_id: c.person_id || null, email: c.work_email || null, candidate: c, draft, tier: e.tier || (draft && draft.tier) || null, verification: c.email_verification || e.verification || null };
      const reject = (reason) => { results.push(Object.assign({}, base, { status: "rejected", reason })); };
      if (campaign.status === "draft" && !opts.allowDraftEnqueue) { /* enqueue into a draft campaign is allowed; sending is what needs approval */ }
      if (!base.email) { reject("no_email"); continue; }
      if (base.verification === "invalid") { reject("invalid_email"); continue; }
      if (isEuUk(c)) { reject("eu_uk_excluded_v1"); continue; }
      if (suppression && suppression.isSuppressed({ email: base.email, person_id: base.person_id }, campaign.userId)) { reject("suppressed"); continue; }
      const touches = campaign.touches[base.person_id || base.email] || 0;
      const touch = e.touch || (touches === 0 ? 0 : touches); // 0=initial,1/2=follow-ups
      if (touch > CAPS.perPersonMaxFollowUps) { reject("per_person_cap"); continue; }
      if (touch > 0 && !opts.isFollowUp) { /* a re-enqueue of an already-touched person counts as a follow-up */ }
      if ((e.touch || 0) > 0 && !campaign.followups_continue_tap && !opts.continueTap) { reject("followup_needs_continue_tap"); continue; }
      const firmRecent = (campaign.firmWindow || []).filter((f) => f.firm === norm(c.current_firm)).length;
      const firmQueued = campaign.items.filter((i) => i.status === "queued" && norm(i.candidate.current_firm) === norm(c.current_firm)).length;
      if (firmRecent + firmQueued >= CAPS.perFirmPer30Days) { reject("per_firm_cap_15_per_30d"); continue; }
      const item = Object.assign({}, base, { id: `item-${campaign.items.length + results.length + 1}`, touch, status: "queued",
        idempotencyKey: `${campaign.id}:${base.person_id || base.email}:${touch}`, domain: emailDomain(base.email), scheduledAt: null });
      campaign.items.push(item); results.push(item);
    }
    return results;
  }
  function planWave(campaign, opts) {
    opts = opts || {}; const rng = seededRng(opts.seed || 42);
    const queued = campaign.items.filter((i) => i.status === "queued");
    const waveItems = opts.waveNumber === 1 || !opts.waveNumber ? queued.slice(0, CAPS.wave1Size) : queued;
    // distribute over days respecting daily cap, per-domain cap, risky <=10% of that day's volume; gaps modeled 2-8 min
    let placed = 0; const schedule = []; const perDay = {}, perDomainDay = {}, riskyDay = {}; const deferred = [];
    // Risky addresses are capped at 10% of the wave's volume too: excess risky items are deferred to a later
    // wave (sent last, in small batches, Doc 1 §2.4.3), never allowed to stretch or inflate this wave.
    const riskyQuota = Math.floor(waveItems.length * CAPS.riskyMaxFraction); let riskySeen = 0;
    for (const item of waveItems) {
      if (item.verification === "risky") { riskySeen++; if (riskySeen > riskyQuota) { deferred.push({ item_id: item.id, reason: "risky_over_10pct_of_wave" }); continue; } }
      // Earliest feasible day per item (NOT a shared monotonic cursor — that stretched wave 1 to 7 days in testing).
      for (let day = opts.startDayIndex || 0; day < (opts.startDayIndex || 0) + 60; day++) {
        const cap = dailyCapForDay(day); const used = perDay[day] || 0; const dk = day + ":" + item.domain; const dUsed = perDomainDay[dk] || 0;
        const isRisky = item.verification === "risky";
        const riskyAllowed = Math.floor(cap * CAPS.riskyMaxFraction);
        if (used >= cap || dUsed >= CAPS.perDomainPerDay || (isRisky && (riskyDay[day] || 0) >= riskyAllowed)) continue;
        const minute = 9 * 60 + Math.floor(rng() * 120); // morning window anchor in recipient-local terms, modeled
        const gap = CAPS.gapMinutes[0] + Math.floor(rng() * (CAPS.gapMinutes[1] - CAPS.gapMinutes[0] + 1));
        const entry = { item_id: item.id, day_index: day, gap_minutes_after_previous: gap, local_window: "09:00-11:00 recipient-local", minute_offset: minute };
        item.scheduledAt = entry; schedule.push(entry);
        perDay[day] = used + 1; perDomainDay[dk] = dUsed + 1; if (isRisky) riskyDay[day] = (riskyDay[day] || 0) + 1; placed++; break;
      }
    }
    const days = schedule.length ? Math.max(...schedule.map((s) => s.day_index)) - (opts.startDayIndex || 0) + 1 : 0;
    return { wave_items: waveItems.length, scheduled: schedule.length, deferred, days, schedule, daily_caps: Object.keys(perDay).map((d) => ({ day_index: Number(d), cap: dailyCapForDay(Number(d)), planned: perDay[d] })) };
  }
  function evaluateBreaker(campaign) {
    const w = campaign.wave; const causes = [];
    if (w.provider_warning) causes.push("provider_warning");
    if (w.sent >= 10 && w.bounces / Math.max(1, w.sent) > CAPS.bounceBreakerRate) causes.push(`bounce_rate_${(100 * w.bounces / Math.max(1, w.sent)).toFixed(1)}%_over_3%`);
    if (w.bounces >= 3 && w.bounces / Math.max(1, w.sent) > CAPS.bounceBreakerRate) { if (!causes.some((x) => x.startsWith("bounce"))) causes.push("bounce_spike"); }
    if (w.hostile + w.complaints >= CAPS.hostileBreakerCount) causes.push("hostile_or_spam_signals>=2");
    if (causes.length) { campaign.breaker = { tripped: true, cause: causes.join("; "), user_message: `Paused your campaign: ${causes.join(", ")}. No more sends until you look at this.` }; campaign.status = "paused"; }
    return campaign.breaker;
  }
  function recordOutcome(campaign, ev) {
    ev = ev || {};
    if (ev.type === "sent") campaign.wave.sent++;
    if (ev.type === "bounce") { campaign.wave.bounces++; if (ev.item) handleBounce(campaign, ev.item, ev.suppression); }
    if (ev.type === "hard_bounce" ) { campaign.wave.bounces++; if (ev.item) handleBounce(campaign, ev.item, ev.suppression); }
    if (ev.type === "complaint") { campaign.wave.complaints++; campaign.stats.complaints++; }
    if (ev.type === "hostile") campaign.wave.hostile++;
    if (ev.type === "provider_warning") campaign.wave.provider_warning = true;
    if (ev.type === "reply") campaign.stats.replies++;
    if (ev.type === "positive") campaign.stats.positive++;
    if (ev.type === "meeting_booked") campaign.stats.meetings_booked++;
    if (ev.type === "meeting_held") campaign.stats.meetings_held++;
    if (ev.type === "referral") campaign.stats.referrals++;
    return evaluateBreaker(campaign);
  }
  function handleBounce(campaign, item, suppression) {
    const it = typeof item === "string" ? campaign.items.find((i) => i.id === item) : item;
    if (it) { it.status = "bounced"; it.never_retry = true; const c = it.candidate || {}; if (suppression) suppression.suppress({ email: it.email, person_id: it.person_id, userId: campaign.userId, scope: "user", reason: "hard_bounce" }); }
    else if (suppression && item && item.email) suppression.suppress({ email: item.email, person_id: item.person_id, userId: campaign.userId, scope: "user", reason: "hard_bounce" });
    return it || null;
  }
  async function sendPending(campaign, opts) {
    opts = opts || {}; const transport = opts.transport; if (!transport || typeof transport.send !== "function") return { sent: 0, error: "NOT_WIRED: no injected transport" };
    if (campaign.status !== "approved" && campaign.status !== "running") return { sent: 0, error: "campaign_not_approved", status: campaign.status };
    if (campaign.breaker.tripped) return { sent: 0, error: "circuit_breaker_tripped", cause: campaign.breaker.cause };
    campaign.status = "running";
    const suppression = opts.suppression || null; const max = opts.maxItems || Infinity; let sent = 0; const outcomes = [];
    for (const item of campaign.items) {
      if (sent >= max) break;
      if (item.status === "sent") continue;
      if (item.status !== "queued" && item.status !== "sending") continue;
      // SEND-TIME suppression check (severity-1): a mid-queue opt-out kills pending sends.
      if (suppression && suppression.isSuppressed({ email: item.email, person_id: item.person_id }, campaign.userId)) { item.status = "suppressed"; outcomes.push({ item_id: item.id, result: "suppressed_at_send_time" }); continue; }
      if (campaign.sentKeys.includes(item.idempotencyKey)) { item.status = "sent"; outcomes.push({ item_id: item.id, result: "already_sent_idempotent" }); continue; }
      if (item.status === "sending" && typeof transport.hasSent === "function" && await transport.hasSent(item.idempotencyKey)) { item.status = "sent"; campaign.sentKeys.push(item.idempotencyKey); outcomes.push({ item_id: item.id, result: "recovered_after_crash" }); continue; }
      item.status = "sending";
      const res = await transport.send({ to: item.email, subject: item.draft ? item.draft.subject : "", body: item.draft ? item.draft.body : "", idempotencyKey: item.idempotencyKey, from_channel: "gmail_oauth_only" });
      if (res && res.bounced) { item.status = "bounced"; recordOutcome(campaign, { type: "bounce", item, suppression }); outcomes.push({ item_id: item.id, result: "bounced" }); if (campaign.breaker.tripped) break; continue; }
      item.status = "sent"; item.message_id = res && res.messageId || null;
      if (!campaign.sentKeys.includes(item.idempotencyKey)) campaign.sentKeys.push(item.idempotencyKey);
      const pk = item.person_id || item.email; campaign.touches[pk] = (campaign.touches[pk] || 0) + 1;
      campaign.firmWindow.push({ firm: norm((item.candidate || {}).current_firm), at: opts.nowIso || null });
      recordOutcome(campaign, { type: "sent" }); sent++; outcomes.push({ item_id: item.id, result: "sent" });
      if (campaign.breaker.tripped) break;
    }
    return { sent, outcomes, status: campaign.status, breaker: campaign.breaker };
  }
  function scheduleFollowUps(campaign, opts) {
    opts = opts || {};
    if (!opts.continueTap && !campaign.followups_continue_tap) return { ok: false, needs_continue_tap: true, message: "Follow-up waves need a continue tap (decided default)." };
    campaign.followups_continue_tap = true;
    const plan = [];
    for (const item of campaign.items.filter((i) => i.status === "sent" && i.touch === 0)) plan.push({ person_id: item.person_id, followup1_day: "5-7 business days", followup2_day: "14-16 days", max_followups: CAPS.perPersonMaxFollowUps, stop_on: ["any_reply", "bounce", "opt_out", "complaint"] });
    return { ok: true, plan };
  }
  function exportState(campaign) { return JSON.stringify(campaign); }
  function importState(json) { const c = typeof json === "string" ? JSON.parse(json) : JSON.parse(JSON.stringify(json)); return c; }
  // Gmail transport shape: wraps a caller-supplied Gmail API client (OAuth held by the host, never here).
  function buildGmailRaw(msg) {
    const raw = [`To: ${msg.to}`, `Subject: ${msg.subject}`, "Content-Type: text/plain; charset=UTF-8", "", msg.body].join("\r\n");
    return Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function createGmailTransport(gmailApi) {
    if (!gmailApi || !gmailApi.users || !gmailApi.users.messages || typeof gmailApi.users.messages.send !== "function") return { kind: "gmail", send: async () => ({ error: "NOT_WIRED: Gmail API client not injected" }) };
    return { kind: "gmail", send: async (msg) => { const r = await gmailApi.users.messages.send({ userId: "me", requestBody: { raw: buildGmailRaw(msg) } }); return { messageId: (r && (r.id || (r.data && r.data.id))) || "gmail-sent" }; } };
  }

  // ---------- OUTE-010: reply classifier (rule-based v1, Doc 1 §6.1) ----------
  const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function parseReturnDate(text, nowMs) {
    const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const m = text.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?/i);
    if (m) { const parts = m[0].toLowerCase().replace(/,/g, "").split(/\s+/); const mon = MONTHS[parts[0]]; const day = Number(parts[1].replace(/\D/g, "")); let year = parts[2] ? Number(parts[2]) : new Date(nowMs).getUTCFullYear(); let dt = Date.UTC(year, mon - 1, day); if (!parts[2] && dt < nowMs - 86400000) { year++; dt = Date.UTC(year, mon - 1, day); } return new Date(dt).toISOString().slice(0, 10); }
    const num = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/); if (num) { const y = num[3] ? (num[3].length === 2 ? 2000 + Number(num[3]) : Number(num[3])) : new Date(nowMs).getUTCFullYear(); return `${y}-${String(num[1]).padStart(2, "0")}-${String(num[2]).padStart(2, "0")}`; }
    return null;
  }
  function classifyReply(reply, opts) {
    opts = opts || {}; const nowMs = opts.nowMs || Date.now();
    const body = String((reply && (reply.body || reply.text)) || ""); const subject = String((reply && reply.subject) || "");
    const t = (" " + norm(subject + " " + body) + " ");
    const done = (cls, extra) => Object.assign({ classification: cls, counts_as_reply: cls !== "auto-reply-ooo" && cls !== "bounce", confidence: 0.9 }, extra || {});
    if (/mailer daemon|delivery status notification|undeliverable|delivery has failed|message could not be delivered|address not found|user unknown|mailbox full|550|554/.test(t) || /bounce|undeliverable/.test(norm(subject))) return done("bounce", { action: "suppress_never_retry" });
    // hostile / spam complaint — before generic stop wording so "spam" complaints land here
    if (/this is spam|report(ing)? (you|this) (for )?spam|spam complaint|harass|fuck|scam|leave me alone|never contact me again|i ll report you|ill report you/.test(t)) return done("hostile", { action: "suppress_notify_maybe_pause", hostile: true });
    if (/please stop|stop emailing|stop contacting|do not (email|contact|message) me|don t (email|contact) me|remove me|unsubscribe|opt out|no more emails|stop messaging/.test(t)) return done("hard-stop", { action: "suppress_notify", stop: true });
    if (/out of office|on vacation|on pto|away from (the )?office|limited access to email|currently traveling|on leave|ooo\b|auto reply|automatic reply/.test(t)) { const rd = parseReturnDate(body, nowMs); const resched = rd ? new Date(Date.parse(rd + "T00:00:00Z") + 86400000).toISOString().slice(0, 10) : null; return done("auto-reply-ooo", { action: "reschedule_followup", return_date: rd, reschedule_followup_on: resched }); }
    if (/(talk to|speak with|reach out to|you should (talk|speak|contact)|connect you with|looping in|introduc\w+ you to|better person (for|to ask)|try (asking )?)[ ]+[A-Z]/.test(body) || /talk to \w+|speak with \w+|reach out to \w+|connect you with \w+|looping in \w+/.test(t)) {
      const nameM = body.match(/(?:talk to|speak with|reach out to|connect you with|looping in|introducing you to)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)/);
      return done("referral-to-other", { action: "thank_and_add_tier_a", referral_name: nameM ? nameM[1] : null });
    }
    if (/(happy to chat|sure|works for me|that works|i m free|im free|available (on|at)|let s (schedule|talk|chat|set)|lets (schedule|talk|chat)|thursday works|tuesday works|wednesday works|monday works|friday works|next week works|glad to (chat|talk)|would be happy to|love to chat|yes[, ])/.test(t)) return done("positive-ready", { action: "propose_slots_t3_card" });
    if (/send (me )?(more )?info|tell me more|more (info|details|context)|what would (we|you)|what are you hoping|what do you want to (discuss|ask)|interested but|curious but|need more context/.test(t)) return done("positive-needs-info", { action: "draft_answer_from_profile_only" });
    if (/\?/.test(body) && /(your|you|program|school|background|experience|major|year)/.test(t)) return done("question-about-user", { action: "draft_answer_from_profile_only" });
    if (/not (a good|the right) time|can t|can t right now|cant|cannot|too busy|swamped|no thanks|not able|unfortunately|pass on|decline|not right now|maybe another time|won t be able/.test(t)) return done("polite-decline", { action: "suppress_forever_optional_thanks" });
    if (/\?/.test(body)) return done("question-about-user", { action: "draft_answer_from_profile_only" });
    if (/thanks|thank you|appreciate/.test(t)) return done("positive-needs-info", { action: "draft_answer_from_profile_only" });
    return done("positive-needs-info", { action: "draft_answer_from_profile_only", confidence: 0.5 });
  }
  function handleReply(campaign, reply, contact, opts) {
    opts = opts || {}; const cls = classifyReply(reply, opts); const suppression = opts.suppression || null;
    const out = { classification: cls, actions: [], notify_user: null, campaign_paused: false, new_candidate: null, reschedule_followup_on: cls.reschedule_followup_on || null };
    const email = contact && (contact.work_email || contact.email), pid = contact && contact.person_id;
    if (cls.classification === "hard-stop" || cls.classification === "hostile") {
      if (suppression) suppression.suppress({ email, person_id: pid, userId: campaign && campaign.userId, scope: "both", reason: cls.classification }); // user list + shared cross-user opt-out
      out.actions.push("suppressed_user_and_shared");
      out.notify_user = cls.classification === "hostile" ? "A recipient reacted badly; they are suppressed everywhere and will never be contacted again." : "Removed them and flagged it. They are suppressed on your list and the shared opt-out list.";
      if (campaign) { if (cls.classification === "hostile") recordOutcome(campaign, { type: "hostile" }); out.campaign_paused = !!campaign.breaker.tripped; }
    } else if (cls.classification === "polite-decline") { if (suppression) suppression.suppress({ email, person_id: pid, userId: campaign && campaign.userId, scope: "user", reason: "decline" }); out.actions.push("suppressed_for_user"); }
    else if (cls.classification === "bounce") { if (campaign) { const item = (campaign.items || []).find((i) => i.email === email); if (item) recordOutcome(campaign, { type: "bounce", item, suppression }); } out.actions.push("suppressed_never_retry"); }
    else if (cls.classification === "auto-reply-ooo") out.actions.push("followup_rescheduled_not_a_reply");
    else if (cls.classification === "referral-to-other" && cls.referral_name) out.new_candidate = { full_name: cls.referral_name, relationship_to_user: "referral", tier: "A", source: "reply_referral" };
    else if (cls.classification === "positive-ready") out.actions.push("propose_slots_t3_card");
    if (cls.counts_as_reply && campaign) campaign.stats.replies = (campaign.stats.replies || 0) + (cls.classification === "hard-stop" || cls.classification === "hostile" ? 0 : 1);
    return out;
  }

  // ---------- OUTE-011/012: booking + follow-through ----------
  function tzOffsetMs(dateMs, timeZone) {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const parts = {}; for (const p of dtf.formatToParts(new Date(dateMs))) parts[p.type] = p.value;
    const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
    return asUTC - Math.floor(dateMs / 1000) * 1000;
  }
  function zonedTimeToUtc(y, m, d, hh, mm, timeZone) {
    let guess = Date.UTC(y, m - 1, d, hh, mm);
    const off1 = tzOffsetMs(guess, timeZone); let utc = guess - off1;
    const off2 = tzOffsetMs(utc, timeZone); utc = guess - off2;
    return new Date(utc).toISOString();
  }
  function localDateInTz(dateMs, timeZone) { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dateMs)); }
  function proposeSlots(opts) {
    opts = opts || {}; const tz = opts.recipientTz || "America/New_York"; const busy = (opts.freeBusy || opts.busy || []).map((b) => ({ s: Date.parse(b.start), e: Date.parse(b.end) }));
    const blackout = new Set(opts.blackoutDates || opts.blackouts || []); const duration = (opts.durationMin || 30) * 60000; const buffer = 15 * 60000;
    const nowMs = opts.nowMs || Date.now(); const want = opts.count || 3; const slots = [];
    for (let day = 1; day <= 21 && slots.length < want; day++) {
      const probe = new Date(nowMs + day * 86400000);
      const [y, m, d] = localDateInTz(probe.getTime(), tz).split("-").map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (dow === 0 || dow === 6) continue;
      const localDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (blackout.has(localDate)) continue;
      for (const hh of [9, 10, 11, 13, 14, 15, 16]) {
        if (slots.length >= want) break;
        const startIso = zonedTimeToUtc(y, m, d, hh, 0, tz); const s = Date.parse(startIso); const e = s + duration;
        // blackout also honored in the user's timezone date
        if (opts.userTz && blackout.has(localDateInTz(s, opts.userTz))) continue;
        const clash = busy.some((b) => s - buffer < b.e && e + buffer > b.s);
        if (!clash) slots.push({ start: startIso, end: new Date(e).toISOString(), recipient_tz: tz, recipient_local: `${localDate} ${String(hh).padStart(2, "0")}:00 ${tz}`, buffer_minutes: 15 });
      }
    }
    return slots;
  }
  function prepBrief(input) {
    input = input || {}; const cir = input.cir || {}; const c = normalizeCandidate(input.contact || {});
    const facts = (c.personalization_facts || []).map((f) => f.fact);
    return { who: `${c.full_name}${c.title ? `, ${c.title}` : ""}${c.current_firm ? ` at ${c.current_firm}` : ""}`,
      path: cir.path || facts[0] || `${c.title || "Role"} at ${c.current_firm}`,
      talking_points: (cir.talking_points || cir.talkingPoints || [facts[0], facts[1], input.user_goal || input.goal]).filter(Boolean).slice(0, 3),
      questions: (cir.questions || ["What decided your move into this group, looking back?", "What separates analysts who get staffed well in year one?", "What skill gap do you see most in interns from my background?", "What would you do in my exact position this semester?", "Who else would you suggest I learn from, and why them?"]).slice(0, 5),
      what_not_to_ask: cir.what_not_to_ask || cir.notToAsk || ["Do not ask for a job or a referral on a first chat.", "Do not ask anything answerable from their public bio."],
      contact: c.full_name };
  }
  function thankYouDraft(opts) {
    opts = opts || {}; const c = normalizeCandidate(opts.contact || {});
    if (!opts.note) return { ok: false, reason: "user_note_required: a thank-you must cite one real thing said" };
    return { ok: true, draft: { to: c.work_email || null, subject: `Thank you — ${(c.full_name || "").split(/\s+/)[0]}`, body: `Hi ${(c.full_name || "").split(/\s+/)[0]},\n\nThank you for the time today. ${opts.note}\n\nI appreciate it, and I will follow up once I have acted on it.\n\nThanks,\n${(opts.user && opts.user.name) || ""}` } };
  }
  function scheduleFollowUpTouch(opts) {
    opts = opts || {}; const weeks = Math.max(4, Math.min(8, opts.weeks || 6)); const base = Date.parse(opts.after || opts.chatDate || new Date().toISOString());
    return { next_touch_at: new Date(base + weeks * 7 * 86400000).toISOString(), weeks, kind: "follow_up_touch_4_to_8_weeks" };
  }

  // ---------- OUTE-013: campaign metrics ----------
  function campaignMetrics(input) {
    input = input || {}; const pool = input.pool || {}; const camp = input.campaign || {}; const items = camp.items || [];
    const found = pool.found != null ? pool.found : (input.found || 0); const sendable = pool.sendable != null ? pool.sendable : items.length;
    const trusted = pool.trusted_emails != null ? pool.trusted_emails : 0;
    const sentItems = items.filter((i) => i.status === "sent"); const bouncedItems = items.filter((i) => i.status === "bounced");
    const sent = input.sent != null ? input.sent : sentItems.length + bouncedItems.length; // attempted sends: the denominator for reply % and bounce %
    const bounces = input.bounces != null ? input.bounces : Math.max(items.filter((i) => i.status === "bounced").length, (camp.wave && camp.wave.bounces) || 0);
    const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;
    const repliesByTier = {}; for (const r of input.replies || []) { const t = r.tier || "C"; repliesByTier[t] = repliesByTier[t] || { sent: 0, replies: 0 }; repliesByTier[t].replies++; }
    for (const i of sentItems) { const t = i.tier || "C"; repliesByTier[t] = repliesByTier[t] || { sent: 0, replies: 0 }; repliesByTier[t].sent++; }
    for (const t of Object.keys(repliesByTier)) repliesByTier[t].rate_pct = pct(repliesByTier[t].replies, repliesByTier[t].sent);
    const stats = camp.stats || {};
    return { yield_pct: pct(sendable, found), verified_rate_pct: pct(trusted, found || sendable), sent, bounce_pct: pct(bounces, sent), bounces,
      complaints: stats.complaints || (camp.wave && camp.wave.complaints) || 0,
      replies: stats.replies || (input.replies || []).length, reply_pct: pct(stats.replies || (input.replies || []).length, sent),
      positive: stats.positive || 0, positive_pct: pct(stats.positive || 0, sent),
      meetings_booked: stats.meetings_booked || 0, meetings_held: stats.meetings_held || 0, referrals: stats.referrals || 0,
      per_tier_reply_rates: repliesByTier, suppression_honor_target_pct: 100 };
  }

  // ---------- SC-W03 additions: live list/draft surgery, safety plan, honest yield, suppression report, digest/close-out ----------
  function applyListOps(pool, instruction, opts) {
    opts = opts || {}; const w = " " + norm(instruction) + " "; const ops = [];
    const dropBands = []; if (/drop vps|no vps|exclude vps/.test(w)) dropBands.push("vp_plus");
    if (/drop associates?/.test(w)) dropBands.push("associate"); if (/drop analysts?/.test(w)) dropBands.push("analyst");
    let keepSchool = null; const sm = String(instruction || "").match(/only\s+([A-Z][A-Za-z& ]{2,30}?)\s+(and|people|folks|$)/); if (/michigan/.test(w)) keepSchool = "University of Michigan"; else if (sm && !/boutique/.test(sm[1].toLowerCase())) keepSchool = sm[1].trim();
    if (opts.keepSchool) keepSchool = opts.keepSchool;
    let keepFirms = null; if (/boutique/.test(w) && FIRM_SETS.sets.elite_boutique) keepFirms = FIRM_SETS.sets.elite_boutique.firms.map((f) => norm(f.name));
    if (opts.keepFirms) keepFirms = opts.keepFirms.map(norm);
    if (dropBands.length) ops.push("drop_seniority:" + dropBands.join(","));
    if (keepSchool) ops.push("keep_school:" + keepSchool);
    if (keepFirms) ops.push("keep_firm_set:elite_boutique");
    const matches = (c) => { if (dropBands.includes(String(c.seniority_band || "").toLowerCase())) return false; if (keepSchool && !(c.schools || []).map(norm).includes(norm(keepSchool))) return false; if (keepFirms && !keepFirms.includes(norm(c.current_firm))) return false; return true; };
    const before = { selected: (pool.selected || []).length, reserve: (pool.reserve || []).length };
    const removed = (pool.selected || []).filter((c) => !matches(c));
    const keptSel = (pool.selected || []).filter(matches);
    const promoted = (pool.reserve || []).filter(matches);
    const newReserve = (pool.reserve || []).filter((c) => !matches(c));
    const selected = keptSel.concat(promoted);
    return { selected, reserve: newReserve, ops, removed: removed.map((c) => ({ name: c.full_name, firm: c.current_firm, seniority_band: c.seniority_band, schools: c.schools })),
      promoted_from_reserve: promoted.map((c) => c.full_name), before, after: { selected: selected.length, reserve: newReserve.length },
      text: `Re-cut: ${before.selected} selected -> ${selected.length} (${removed.length} removed by [${ops.join("; ") || "no ops"}], ${promoted.length} matching reserve promoted); reserve now ${newReserve.length}.` };
  }
  function safetyPlan(campaign, plan, opts) {
    opts = opts || {}; const start = opts.startDateIso ? Date.parse(opts.startDateIso) : Date.now();
    const days = plan && plan.days ? plan.days : 0; const finish = new Date(start + Math.max(0, days - 1) * 86400000).toISOString().slice(0, 10);
    return { channel: CAPS.channel, daily_cap_start: dailyCapForDay(0), daily_cap_ceiling: CAPS.ceilingPerDay, ramp: `+${CAPS.rampStep}/day every ${CAPS.rampEveryDays} days, never above ${CAPS.ceilingPerDay}`,
      per_domain_per_day: CAPS.perDomainPerDay, per_firm_per_30_days: CAPS.perFirmPer30Days, per_person: `${CAPS.perPersonInitial} initial + max ${CAPS.perPersonMaxFollowUps} follow-ups per ${CAPS.perPersonWindowDays} days`,
      scheduled: plan ? plan.scheduled : 0, deferred: plan ? plan.deferred.length : 0, days, start_date: new Date(start).toISOString().slice(0, 10), finish_date: finish,
      stop_rules: [`Bounce rate over ${CAPS.bounceBreakerRate * 100}% pauses the campaign`, `${CAPS.hostileBreakerCount} hostile/spam signals pause the campaign`, "Any provider warning pauses the campaign", "Any opt-out suppresses that person instantly, everywhere, forever", "Follow-up waves send only after your continue tap"],
      approval: "one approval covers this whole plan; nothing outside it sends" };
  }
  function safetyPlanText(p) {
    return [`Safety plan — approve once, then it runs alone:`, `Channel: Gmail (your own account) only. Daily cap starts at ${p.daily_cap_start}/day, ramps ${p.ramp}.`, `Scheduled: ${p.scheduled} sends over ${p.days} days, ${p.start_date} -> ${p.finish_date}. Per-domain cap ${p.per_domain_per_day}/day; per-firm cap ${p.per_firm_per_30_days} per 30 days; per person: ${p.per_person}.`, `Stop rules: ${p.stop_rules.join("; ")}.`].join("\n");
  }
  function honestYield(records, query, opts) {
    opts = opts || {}; const pool = buildList(records, query, opts); const kept = (pool.selected || []).concat(pool.reserve || []);
    const verified = kept.filter((c) => c.email_verification === "verified").length;
    const patternedOut = kept.filter((c) => c.email_verification !== "verified" && (c.email_source === "pattern" || !c.email_verification)).length;
    const out = { found: pool.yield.found, resolved: pool.yield.resolved, verified, patterned_out: patternedOut, trusted_emails: pool.yield.trusted_emails, risky_emails: pool.yield.risky_emails, sendable: pool.yield.sendable, selected: pool.yield.selected, reserve: pool.yield.reserve, exclusions: pool.yield.exclusions, pool };
    out.text = `${out.found} found, ${out.trusted_emails} trustworthy emails, ${out.sendable} sendable — of the sendable, ${verified} are verified and ${patternedOut} are pattern-inferred and unverified (they ride under the ${Math.round(CAPS.riskyMaxFraction * 100)}% risky cap, never padded into the trustworthy number).`;
    return out;
  }
  function suppressionReport(pool, opts) {
    opts = opts || {}; const sent = new Set((opts.sentHistory || []).map((e) => norm(e))); const supp = opts.suppression || null;
    const sel = pool.selected || []; const overlap = sel.filter((c) => c.work_email && sent.has(norm(c.work_email)));
    const suppHits = supp ? sel.filter((c) => supp.isSuppressed({ email: c.work_email, person_id: c.person_id }, opts.userId)) : [];
    return { sent_history_count: sent.size, selected_checked: sel.length, overlap_with_sent_history: overlap.map((c) => c.work_email), overlap_count: overlap.length, suppressed_in_selected: suppHits.length, verdict: overlap.length === 0 && suppHits.length === 0 ? "CLEAN" : "FAIL" };
  }
  function dailyDigest(campaign, pool) {
    const m = campaignMetrics({ pool: pool || {}, campaign }); const pending = Math.max(0, (m.meetings_booked || 0) - (m.meetings_held || 0));
    const d = { status: campaign.status, sent: m.sent, bounced: m.bounces, bounce_pct: m.bounce_pct, replies: m.replies, positive: m.positive, meetings_booked: m.meetings_booked, meetings_held: m.meetings_held, meetings_pending: pending, referrals: m.referrals, breaker_tripped: !!(campaign.breaker && campaign.breaker.tripped) };
    d.text = `Today: ${d.sent} sent, ${d.bounced} bounced (${d.bounce_pct}%), ${d.replies} replies, ${d.positive} positive, ${pending} meetings pending (${d.meetings_booked} booked, ${d.meetings_held} held). Campaign status: ${d.status}.`;
    return d;
  }
  function closeOut(campaign, opts) {
    opts = opts || {}; const items = (campaign.items || []).filter((i) => i.status === "sent" || i.status === "bounced");
    const byAngle = {}; for (const i of items) { const a = (i.draft && i.draft.structure) || "unknown"; byAngle[a] = byAngle[a] || { angle: a, sent: 0, replies: 0, positive: 0 }; if (i.status === "sent") byAngle[a].sent++; }
    for (const r of opts.replyLog || []) { const it = items.find((i) => i.person_id === r.person_id || i.id === r.item_id); const a = it ? ((it.draft && it.draft.structure) || "unknown") : (r.angle || "unknown"); byAngle[a] = byAngle[a] || { angle: a, sent: 0, replies: 0, positive: 0 }; byAngle[a].replies++; if (r.positive) byAngle[a].positive++; }
    const angles = Object.values(byAngle).map((a) => Object.assign({}, a, { reply_pct: a.sent ? Math.round(1000 * a.replies / a.sent) / 10 : 0 })).sort((x, y) => y.reply_pct - x.reply_pct);
    const drafts = []; for (const r of opts.replyLog || []) { if (!r.positive) continue; const note = (opts.notes || {})[r.person_id]; const contact = items.find((i) => i.person_id === r.person_id); const ty = thankYouDraft({ contact: contact ? contact.candidate : { full_name: r.name || "", work_email: r.email || null }, note, user: opts.user || {} }); drafts.push({ person_id: r.person_id, ok: ty.ok, reason: ty.ok ? null : ty.reason, draft: ty.draft || null }); }
    const m = campaignMetrics({ campaign });
    const next = []; const nonResponders = Math.max(0, m.sent - m.replies - m.bounces);
    if (nonResponders > 0) next.push(`${nonResponders} non-responders are eligible for the day-6 follow-up wave — it needs your continue tap and stops forever after the day-15 close.`);
    if (drafts.some((d) => d.ok)) next.push(`Send the ${drafts.filter((d) => d.ok).length} thank-you drafts above (each needs your yes).`);
    if (angles.length) next.push(`Lead the next campaign with the "${angles[0].angle}" angle (${angles[0].reply_pct}% reply rate here) and retire the weakest angle.`);
    next.push("Keep every opt-out and bounce suppressed; the reserve pool stays untouched until you approve a new list.");
    return { metrics: m, angles, best_angle: angles.length ? angles[0].angle : null, thank_you_drafts: drafts, next_steps: next };
  }
  function backfillFromReserve(pool, campaign, opts) {
    opts = opts || {}; const want = opts.count || 0; const supp = opts.suppression || null; const promoted = []; const remaining = [];
    for (const c of pool.reserve || []) { if (promoted.length < want && !(supp && supp.isSuppressed({ email: c.work_email, person_id: c.person_id }, campaign && campaign.userId))) promoted.push(c); else remaining.push(c); }
    pool.selected = (pool.selected || []).concat(promoted); pool.reserve = remaining;
    let enqueued = [];
    if (campaign && opts.user) { const entries = promoted.map((c) => { const d = draftAndGate(c, opts.user, {}); return { candidate: c, draft: d.draft }; }); enqueued = enqueue(campaign, entries, { suppression: supp }).filter((r) => r.status === "queued"); }
    return { promoted: promoted.map((c) => ({ name: c.full_name, firm: c.current_firm, email: c.work_email })), enqueued: enqueued.length, selected_count: pool.selected.length, reserve_count: pool.reserve.length };
  }
  function tierMix(selected, user) {
    const counts = { A: 0, B: 0, C: 0 }; for (const c of selected || []) counts[determineTier(c, user || {})]++;
    return { A: counts.A, B: counts.B, C: counts.C, total: (selected || []).length, text: `Tier mix: ${counts.A} A / ${counts.B} B / ${counts.C} C of ${(selected || []).length}. Tier C has no sourced personalization fact — hold it back?` };
  }

  return { CAPS, OPT_OUT_LINE, BANNED_PHRASES, EU_UK_COUNTRIES, FIRM_SETS, isEuUk, parseTarget,
    applyListOps, safetyPlan, safetyPlanText, honestYield, suppressionReport, dailyDigest, closeOut, backfillFromReserve, tierMix,
    normalizeCandidate, resolveCandidates, scoreCandidate, buildList, listReviewCard, rankContacts, warmPaths, relationshipMemory,
    createLocalVerifier, createVerifier, EMAIL_RE,
    VOICE_DEFAULT, determineTier, draftFor, qualityGate, draftAndGate, draftReferralAsk, draftIntroRequest, STRUCTURES,
    createSuppressionStore, dailyCapForDay, refuseRaiseCap, createCampaign, enqueue, planWave, evaluateBreaker, recordOutcome, handleBounce, sendPending, scheduleFollowUps, exportState, importState, buildGmailRaw, createGmailTransport,
    classifyReply, handleReply, parseReturnDate,
    tzOffsetMs, zonedTimeToUtc, localDateInTz, proposeSlots, prepBrief, thankYouDraft, scheduleFollowUpTouch,
    campaignMetrics };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerOutreach;
