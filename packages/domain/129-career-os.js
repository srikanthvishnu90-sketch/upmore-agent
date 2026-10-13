/* Career OS rail (COS-001..008; starter pack §3.7) — the retention layer over the negotiation log.
   Pure domain module, UMD. Shares the injected-store seam with 128-career-negotiation
   (plain object: { offers, deadlines, drafts, wins, relationships, goals, applications, watches }).
   No dependency on the sibling 126 tracker branch — it reads the same row shapes from the
   injected store, so the tracker can adopt/back this store later without an API change.
   HONESTY LAW: a market-value estimate exists ONLY when a sourced figure exists (a CIR comp
   note figure via 128's extractor, or a salary range stated in a real posting's own text).
   Otherwise the estimate is null and the output says exactly that. Every number carries its
   evidence + as_of. Feed postings are the normalized 121-career-jobs shape. */
const CareerOS = (() => {
  const Neg = (typeof require !== "undefined") ? (() => { try { return require("./128-career-negotiation.js"); } catch (e) { return null; } })() : null;
  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase();
  const DAY = 86400000;

  function createStore(seed) { return Object.assign({ offers: [], deadlines: [], drafts: [], wins: [], relationships: [], goals: [], applications: [], watches: [] }, seed || {}); }

  // salary range stated in a posting's own JD text (the posting IS the source)
  function postingRange(posting) {
    const t = s(posting && posting.jd_text).replace(/,/g, "");
    let m = t.match(/\$(\d{4,7})\s*-\s*\$(\d{4,7})/); if (m) return { low: Number(m[1]), high: Number(m[2]), basis: "annual range stated in posting" };
    m = t.match(/\$(\d{2,3}(?:\.\d+)?)\s*\/\s*hr/i) || t.match(/\$(\d{2,3}(?:\.\d+)?)\s+per hour/i);
    if (m) return { low: Math.round(Number(m[1]) * 2080), high: Math.round(Number(m[1]) * 2080), basis: `hourly rate $${m[1]}/hr stated in posting, annualized at 2080h` };
    m = t.match(/salary range \$(\d{4,7})/i); if (m) return { low: Number(m[1]), high: Number(m[1]), basis: "figure stated in posting" };
    return null;
  }

  // ---------- COS-001 market value ----------
  function marketValue(opts) {
    opts = opts || {};
    const evidence = [];
    for (const cir of opts.cirs || []) {
      if (!Neg) break;
      for (const f of Neg.extractFigures(cir).figures) evidence.push({ kind: "cir_comp_note", company: f.company, low: f.low, high: f.high, source_url: f.source_url, source_type: f.source_type, as_of: f.as_of, anecdotal: f.anecdotal });
    }
    for (const p of opts.postings || []) {
      const r = postingRange(p); if (!r) continue;
      evidence.push({ kind: "live_posting", company: p.company, title: p.title, low: r.low, high: r.high, basis: r.basis, source_url: p.url || null, source_type: "official-posting (live feed)", as_of: p.posted_at || opts.as_of || null, anecdotal: false });
    }
    if (!evidence.length) return { estimate: null, evidence: [], as_of: opts.as_of || null, statement: "No sourced compensation figure is available for this estimate (no CIR comp-note figure and no posting with a stated range). No market value is claimed — this updates as soon as a sourced figure exists." };
    const lows = evidence.map((e) => e.low), highs = evidence.map((e) => e.high);
    const mid = evidence.map((e) => (e.low + e.high) / 2).sort((a, b) => a - b);
    const median = mid.length % 2 ? mid[(mid.length - 1) / 2] : (mid[mid.length / 2 - 1] + mid[mid.length / 2]) / 2;
    return { estimate: { low: Math.min(...lows), high: Math.max(...highs), median_midpoint: Math.round(median), currency: "USD/yr base (as stated in sources)" }, evidence, as_of: opts.as_of || (evidence.map((e) => e.as_of).filter(Boolean).sort().pop() || null), statement: `Estimate built from ${evidence.length} sourced figure(s) only — every one is listed with its source and date. Ranges mix levels/roles exactly as the sources state them; treat the median midpoint as orientation, not a promise.` };
  }

  // ---------- COS-002 skill gap vs higher-paying roles ----------
  const SKILL_LEXICON = ["Python", "JavaScript", "TypeScript", "React", "Go", "Rust", "Java", "SQL", "PostgreSQL", "Kubernetes", "Docker", "AWS", "System Design", "Machine Learning", "Excel", "Financial Modeling", "Valuation", "DCF", "Statistics", "Node.js", "GraphQL", "CI/CD", "Terraform", "Spark", "Kafka"];
  function skillsIn(text) { const t = lc(text); return SKILL_LEXICON.filter((sk) => t.includes(lc(sk)) || (sk === "Go" && /\bgo\b|\bgolang\b/.test(t))); }
  function skillGap(opts) {
    opts = opts || {};
    const have = new Set((opts.profileSkills || []).map(lc));
    const paid = (opts.postings || []).map((p) => ({ p, r: postingRange(p) })).filter((x) => x.r);
    paid.sort((a, b) => b.r.high - a.r.high);
    const top = paid.slice(0, Math.max(3, Math.ceil(paid.length / 2)));
    const counts = new Map();
    for (const { p } of top) for (const sk of skillsIn(p.jd_text + " " + p.title)) { if (have.has(lc(sk))) continue; const c = counts.get(sk) || { skill: sk, postings: 0, examples: [] }; c.postings++; if (c.examples.length < 2) c.examples.push(`${p.company} — ${p.title} (${p.url || "no url"})`); counts.set(sk, c); }
    const gaps = [...counts.values()].sort((a, b) => b.postings - a.postings || a.skill.localeCompare(b.skill));
    // CIR skills_dist adds grounded demand evidence where present
    const cirSkills = [];
    for (const cir of opts.cirs || []) { const d = cir && cir.skills_dist; if (d && Array.isArray(d.reported_patterns)) for (const pat of d.reported_patterns) cirSkills.push({ company: cir.company_name, claim: s(pat.claim || pat.text || "").slice(0, 200), source_type: pat.source_type || "unknown" }); }
    return { gaps, learn_next_order: gaps.map((g) => g.skill), basis: { higher_paying_postings_considered: top.length, postings_with_stated_ranges: paid.length, total_postings: (opts.postings || []).length }, cir_skill_evidence: cirSkills, statement: gaps.length ? "Gaps are skills named in the higher-paying postings (those with stated ranges) that your profile does not list — ordered by how many of those postings name them." : "No gap can be grounded: either no postings with stated pay ranges were supplied, or your profile already lists every skill they name." };
  }

  // ---------- COS-003 passive watch + comp-band shift (over 121 feed diffs) ----------
  function createWatch(store, criteria, opts) {
    opts = opts || {};
    const w = { watch_id: `watch-${(store.watches || []).length + 1}`, criteria: { companies: criteria.companies || [], role_families: criteria.role_families || [], locations: criteria.locations || [], keywords: criteria.keywords || [], min_fit: criteria.min_fit != null ? criteria.min_fit : null }, created_at: opts.now || new Date().toISOString(), active: true };
    (store.watches = store.watches || []).push(w); return w;
  }
  function watchMatches(watch, posting) {
    const c = watch.criteria; const reasons = [];
    if (c.companies.length && !c.companies.some((x) => lc(x) === lc(posting.company))) return null;
    if (c.companies.length) reasons.push(`starred/watched company ${posting.company}`);
    if (c.role_families.length && !c.role_families.some((x) => lc(x) === lc(posting.role_family))) return null;
    if (c.role_families.length) reasons.push(`role family ${posting.role_family}`);
    if (c.locations.length && !c.locations.some((x) => lc(posting.location).includes(lc(x)) || lc(x) === "remote")) return null;
    if (c.keywords.length && !c.keywords.some((k) => lc(posting.jd_text + " " + posting.title).includes(lc(k)))) return null;
    if (c.keywords.length) reasons.push("keyword match in posting text");
    return { job_id: posting.job_id, company: posting.company, title: posting.title, url: posting.url, posted_at: posting.posted_at, reasons: reasons.length ? reasons : ["matches watch criteria"] };
  }
  // diff semantics mirror 121's diffNew: only job_ids absent from the prior snapshot are new
  function watchDiff(watch, priorPostings, currentPostings) {
    const priorIds = new Set((priorPostings || []).map((p) => p.job_id));
    const hits = [];
    for (const p of currentPostings || []) { if (priorIds.has(p.job_id)) continue; const m = watchMatches(watch, p); if (m) hits.push(m); }
    return { watch_id: watch.watch_id, new_postings_seen: (currentPostings || []).filter((p) => !priorIds.has(p.job_id)).length, hits, ping: hits.length ? `Ping: ${hits.length} new posting(s) match your watch — ${hits.map((h) => `${h.company}: ${h.title}`).join("; ")}` : null };
  }
  function compBandShift(company, priorPostings, currentPostings) {
    const rng = (ps) => (ps || []).filter((p) => lc(p.company) === lc(company)).map((p) => ({ p, r: postingRange(p) })).filter((x) => x.r);
    const before = rng(priorPostings), after = rng(currentPostings);
    if (!before.length || !after.length) return { company, shift: null, statement: `Cannot detect a comp-band move for ${company}: ${!before.length ? "no prior posting with a stated range" : "no current posting with a stated range"}. No market claim is made.` };
    const bMax = Math.max(...before.map((x) => x.r.high)), aMax = Math.max(...after.map((x) => x.r.high));
    const bMin = Math.min(...before.map((x) => x.r.low)), aMin = Math.min(...after.map((x) => x.r.low));
    if (aMax === bMax && aMin === bMin) return { company, shift: null, statement: `No comp-band move detected for ${company} in the stated posting ranges.` };
    return { company, shift: { prior: { low: bMin, high: bMax }, current: { low: aMin, high: aMax }, direction: aMax > bMax ? "up" : "changed" }, evidence: { prior: before.map((x) => ({ title: x.p.title, range: x.r, url: x.p.url })), current: after.map((x) => ({ title: x.p.title, range: x.r, url: x.p.url })) }, statement: `${company}'s company-wide stated-range envelope moved from $${bMin.toLocaleString()}–$${bMax.toLocaleString()} to $${aMin.toLocaleString()}–$${aMax.toLocaleString()} (ranges as stated in the postings themselves; envelope spans roles — the evidence lists the exact postings, this is not a same-role comparison).` };
  }

  // ---------- COS-004 network upkeep ----------
  function networkUpkeep(store, opts) {
    opts = opts || {}; const now = opts.now ? Date.parse(opts.now) : Date.now();
    const rows = [...(store.relationships || [])].map((r) => ({ name: r.name, org: r.org || null, warmth: r.warmth || null, last_touch: r.last_touch || null, days_since: r.last_touch ? Math.floor((now - Date.parse(r.last_touch)) / DAY) : null, channel: r.channel || null }))
      .sort((a, b) => (b.days_since == null ? 1e9 : b.days_since) - (a.days_since == null ? 1e9 : a.days_since));
    const coldestWarm = rows.find((r) => r.warmth === "warm") || rows[0] || null;
    const restartDraft = coldestWarm ? `Hi ${coldestWarm.name.split(" ")[0]} — it's been a while${coldestWarm.days_since != null ? ` (we last spoke ${coldestWarm.days_since} days ago)` : ""} and I realized I never followed up properly. I'd love to hear what you're working on at ${coldestWarm.org || "your end"} these days — and if a short catch-up call sometime in the next couple of weeks works, I'm in. No ask attached, just wanted to reconnect.` : null;
    return { ranked: rows, coldest_warm: coldestWarm, restart_draft: restartDraft, card: restartDraft ? { type: "approval_card", kind: "network_restart", title: `Restart draft for ${coldestWarm.name} — review before anything sends`, body: restartDraft, requires_approval: true, sent: false } : null, as_of: new Date(now).toISOString() };
  }

  // ---------- COS-005/006 wins log + review packet ----------
  function logWin(store, win, opts) {
    opts = opts || {};
    const row = { win_id: `win-${(store.wins || []).length + 1}`, text: s(win.text || win), outcome: win.outcome || null, date: win.date || (opts.now || new Date().toISOString()).slice(0, 10), source: "user-reported win (living log)" };
    (store.wins = store.wins || []).push(row); return row;
  }
  function reviewPacket(store, opts) {
    opts = opts || {};
    const wins = [...(store.wins || [])].sort((a, b) => s(a.date).localeCompare(s(b.date)));
    return { achievements: wins.map((w) => ({ date: w.date, achievement: w.text, outcome: w.outcome || "outcome not stated — add it before the review if you can quantify it" })), count: wins.length, packet_text: wins.length ? wins.map((w) => `• ${w.date} — ${w.text}${w.outcome ? ` (Outcome: ${w.outcome})` : ""}`).join("\n") : "No wins logged yet — text wins as they happen and this packet builds itself.", note: "Assembled only from the wins log — nothing is invented or back-filled." };
  }

  // ---------- COS-007 return-offer playbook + intern timeline ----------
  function returnOfferPlaybook(opts) {
    opts = opts || {}; const cir = opts.cir || null;
    const steps = [
      "This week: thank the team in writing, confirm the offer terms in the log (base/equity/bonus/start/expiry parsed from the letter), and note the decision deadline.",
      "Before deciding: run the comp benchmark from the company's CIR comp notes — sourced figures only — and list your two strongest internship outcomes from the wins log as your counter evidence.",
      "Have the growth conversation: ask your manager what the first-year expectations and promotion bar are for this level, in writing.",
      "Negotiate from evidence (your shipped outcomes + the sourced range), accept or decline on a card-approved draft — never verbally on the spot.",
    ];
    const first90 = [
      "Days 1–30: rebuild context — team roadmap, your manager's priorities, one small shipped win logged.",
      "Days 31–60: own one scoped project end-to-end; log outcomes in the wins log as they land.",
      "Days 61–90: present results, agree next-half goals with your manager, and start the promotion-evidence file from the wins log.",
    ];
    return { company: cir ? cir.company_name : (opts.offer && opts.offer.company) || null, steps, first_90_days: first90, cir_grounding: cir ? { hiring_bar_summary: s(cir.hiring_bar_summary && (cir.hiring_bar_summary.text || cir.hiring_bar_summary)).slice(0, 300) || null, as_of: cir.as_of } : null, disclaimer: "Playbook is guidance, not a guarantee of a return offer or outcome." };
  }
  function internTimeline(opts) {
    opts = opts || {}; const end = Date.parse((opts.endDate || "2027-08-15") + "T00:00:00Z");
    const at = (d) => new Date(end + d * DAY).toISOString().slice(0, 10);
    return { internship_end: opts.endDate || "2027-08-15", milestones: [
      { date: at(-42), action: "Midpoint check-in with your manager: ask explicitly what a return offer requires and whether you're tracking to it." },
      { date: at(-28), action: "Ship/land your main project outcome; log it in the wins log with the metric." },
      { date: at(-14), action: "Final presentation/demo; collect feedback in writing from manager and mentor." },
      { date: at(-7), action: "The return-offer conversation: if no signal yet, ask directly about timeline for a decision." },
      { date: at(0), action: "Last day: thank-you notes to manager/mentor/team (drafts on approval cards); confirm how the offer decision will reach you." },
      { date: at(21), action: "If a return offer arrives: parse it into the log, benchmark it, and negotiate from evidence — don't accept on the spot." },
    ] };
  }

  // ---------- COS-008 goals check-in + career timeline ----------
  function goalsCheckin(store, opts) {
    opts = opts || {}; const now = opts.now || new Date().toISOString();
    const reality = { applications_logged: (store.applications || []).length, offers_logged: (store.offers || []).length, wins_logged: (store.wins || []).length, active_watches: (store.watches || []).filter((w) => w.active).length, deadlines: (store.offers || []).filter((o) => o.expiry_date).map((o) => ({ company: o.company, expiry_date: o.expiry_date })) };
    const checks = (store.goals || []).map((g) => ({ goal: g.text, target: g.target != null ? g.target : null, progress: g.progress_from || null, measured: g.metric ? reality[g.metric] != null ? reality[g.metric] : null : null, status: g.target != null && g.metric && reality[g.metric] != null ? (reality[g.metric] >= g.target ? "on track / met" : "behind — adjust the plan with the user, don't quietly lower the target") : "no measurable target stored — confirm one at this check-in" }));
    return { as_of: now, stated_goals: checks, reality, adjustment_prompt: "Compare each goal against the log's reality above. Adjustments are proposed here and only saved after you confirm them — the log never rewrites a goal silently." };
  }
  function careerTimeline(store, persona, opts) {
    opts = opts || {}; const events = [];
    for (const f of (persona && persona.facts) || []) {
      if (!["education", "experience", "leadership", "project"].includes(f.kind)) continue;
      events.push({ date: f.start || f.end || null, end: f.end || null, kind: f.kind, title: f.title || f.text, org: f.org || null, source: `profile fact ${f.id || ""} (stored record)` });
    }
    for (const a of store.applications || []) events.push({ date: a.date || a.applied_at || null, kind: "application", title: `Applied — ${a.company || ""} ${a.role || ""}`.trim(), org: a.company || null, source: "application log (stored record)" });
    for (const o of store.offers || []) events.push({ date: o.parsed_at ? String(o.parsed_at).slice(0, 10) : null, kind: "offer", title: `Offer — ${o.company || ""} ${o.role || ""}`.trim(), org: o.company || null, source: "parsed offer in the negotiation log (stored record)" });
    for (const w of store.wins || []) events.push({ date: w.date || null, kind: "win", title: w.text, org: null, source: "wins log (stored record)" });
    events.sort((a, b) => s(a.date || "9999").localeCompare(s(b.date || "9999")));
    return { events, count: events.length, statement: "Timeline rendered only from stored records (profile facts, application log, parsed offers, wins log) — nothing is inferred or back-filled." };
  }

  return { createStore, postingRange, marketValue, skillGap, skillsIn, SKILL_LEXICON, createWatch, watchMatches, watchDiff, compBandShift, networkUpkeep, logWin, reviewPacket, returnOfferPlaybook, internTimeline, goalsCheckin, careerTimeline };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerOS;
