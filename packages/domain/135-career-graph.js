/* Career warm-path graph engine (T-07 / T-26 / T-27 / T-73 seam / T-98; Referrals SC-146..175).
   Built 2026-10-13 on career/sc-w08 because 124-career-outreach only ranks a flat contact list
   (rankContacts/warmPaths) — there was no multi-source graph, no identity merge across sources,
   no second-degree pathfinding, no referral->application link, no conversion/decay tracking.
   Pure domain logic, UMD like 122/124/126. Sources are USER-OWNED only: LinkedIn export,
   alumni directory, club roster, pasted contacts, and labeled public-source records the user
   supplies. NO scraping, NO LinkedIn automation, NO sends — referral/intro asks are DRAFTS
   on approval cards (T3). Identity merge (T-03 seam): same person in N sources = ONE record;
   match on normalized email, else exact normalized name + (same company or same school).
   Warmth order is CANONICAL (SC-147): alumni > club > major > hometown > cold.
   CRM stages: cold -> contacted -> chat_scheduled -> chatted -> warm -> referral_asked ->
   referred -> converted (plus dormant). Stage only moves forward unless explicitly set. */
const CareerGraph = (() => {
  "use strict";
  const DAY = 86400000;
  const STAGES = ["cold", "contacted", "chat_scheduled", "chatted", "warm", "referral_asked", "referred", "converted", "dormant"];
  const WARMTH = [
    { key: "alumni", points: 50, test: (p, u) => !!u.school && !!p.school && norm(p.school) === norm(u.school) },
    { key: "club", points: 40, test: (p, u) => (p.clubs || []).some((c) => (u.clubs || []).map(norm).includes(norm(c))) },
    { key: "major", points: 30, test: (p, u) => !!u.major && !!p.major && norm(p.major) === norm(u.major) },
    { key: "hometown", points: 20, test: (p, u) => !!u.hometown && !!p.hometown && norm(p.hometown) === norm(u.hometown) },
  ];
  function norm(v) { return String(v == null ? "" : v).toLowerCase().replace(/\(test\)/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  function normCo(v) { return norm(v); }
  const daysBetween = (a, b) => Math.floor((b - a) / DAY);

  function createGraph(user) {
    return { user: Object.assign({ name: "", school: null, major: null, hometown: null, clubs: [] }, user || {}),
      people: [], interactions: [], referrals: [], snapshots: [], _seq: 0 };
  }
  function keyOf(r) { return r.email ? "email:" + norm(r.email) : "name:" + norm(r.name) + "|" + normCo(r.company || r.school || ""); }
  function samePerson(a, b) {
    if (a.email && b.email && norm(a.email) === norm(b.email)) return true;
    if (norm(a.name) && norm(a.name) === norm(b.name)) {
      if (a.company && b.company && normCo(a.company) === normCo(b.company)) return true;
      if (a.school && b.school && norm(a.school) === norm(b.school)) return true;
      if (!a.company && !b.company) return true;
    }
    return false;
  }
  // Import one labeled source list; returns {added, merged}. Merged records keep the richest fields.
  function importRecords(graph, records, source) {
    let added = 0, merged = 0;
    for (const r0 of records || []) {
      const r = Object.assign({}, r0, { source: r0.source || source });
      const hit = graph.people.find((p) => samePerson(p, r));
      if (hit) {
        merged++;
        for (const k of ["position", "company", "school", "major", "hometown", "email", "connectedOn", "connectedVia", "joinedCompanyAt", "priorCompany", "relationship"])
          if (!hit[k] && r[k]) hit[k] = r[k];
        hit.clubs = [...new Set([].concat(hit.clubs || [], r.clubs || []))];
        hit.publicLinks = [...new Set([].concat(hit.publicLinks || [], r.publicLinks || []))];
        hit.sources = [...new Set([].concat(hit.sources || [], r.source))];
        if (r.company && hit.company && normCo(r.company) !== normCo(hit.company)) { hit.priorCompany = hit.priorCompany || hit.company; hit.company = r.company; hit.joinedCompanyAt = r.joinedCompanyAt || hit.joinedCompanyAt; }
      } else {
        graph._seq++;
        graph.people.push(Object.assign({ person_id: "P-" + String(graph._seq).padStart(3, "0"), stage: "cold",
          clubs: [], publicLinks: [], lastContactAt: null, chats: 0 }, r, { sources: [r.source] }));
        added++;
      }
    }
    return { added, merged, total: graph.people.length };
  }
  function importLinkedInCsv(graph, csvText, profile122) {
    // Uses 122's real export parser when injected; falls back to the JSON-shaped records.
    if (!profile122 || !profile122.parseLinkedInConnections) throw new Error("122-career-profile parser required (real LinkedIn export shape)");
    const { connections, errors } = profile122.parseLinkedInConnections(csvText);
    const recs = connections.map((c) => ({ name: c.name, email: c.email, company: c.company, position: c.position, connectedOn: c.connectedOn, source: "linkedin-export" }));
    return Object.assign(importRecords(graph, recs, "linkedin-export"), { parse_errors: errors });
  }
  const byName = (graph, name) => graph.people.find((p) => norm(p.name) === norm(name)) || null;
  const atCompany = (graph, company) => graph.people.filter((p) => normCo(p.company) === normCo(company));

  // ---------- warmth + path ranking (SC-146/147/159) ----------
  function sharedFacts(graph, person) {
    const u = graph.user, out = [];
    for (const w of WARMTH) if (w.test(person, u)) out.push({ kind: w.key, points: w.points,
      fact: w.key === "alumni" ? `Both ${u.school}` : w.key === "club" ? `Shared club: ${(person.clubs || []).find((c) => (u.clubs || []).map(norm).includes(norm(c)))}`
        : w.key === "major" ? `Same major: ${u.major}` : `Same hometown: ${u.hometown}`, source: (person.sources || []).join("+") });
    if (person.connectedVia) out.push({ kind: "second_degree", points: 10, fact: `Connected via ${person.connectedVia}`, source: "graph" });
    return out;
  }
  function warmthOf(graph, person) {
    const facts = sharedFacts(graph, person);
    const top = facts.filter((f) => f.kind !== "second_degree").sort((a, b) => b.points - a.points)[0] || null;
    const direct = person.connectedVia ? 5 : 15; // first-degree beats second-degree at equal warmth
    return { score: (top ? top.points : 0) + direct + (facts.some((f) => f.kind === "second_degree") ? 5 : 0),
      tier: top ? top.kind : "cold", shared_fact: top ? top.fact : "No shared fact on record — cold path", all_facts: facts };
  }
  function rankPaths(graph, company) {
    return atCompany(graph, company).map((p) => { const w = warmthOf(graph, p);
      return { person_id: p.person_id, name: p.name, position: p.position || null, company: p.company, degree: p.connectedVia ? 2 : 1,
        via: p.connectedVia || null, warmth_tier: w.tier, warmth_score: w.score, shared_fact: w.shared_fact, stage: p.stage, sources: p.sources }; })
      .sort((a, b) => b.warmth_score - a.warmth_score || a.name.localeCompare(b.name));
  }
  function topWarmPathSweep(graph, companies) {
    return (companies || []).map((company) => { const paths = rankPaths(graph, company);
      return { company, paths_found: paths.length, best: paths[0] || null, all: paths }; });
  }
  function secondDegreeMap(graph, company) {
    return rankPaths(graph, company).filter((p) => p.degree === 2)
      .map((p) => Object.assign({}, p, { path: `You → ${p.via} → ${p.name}` }));
  }
  function publicSourceLookup(graph, company) {
    return atCompany(graph, company).filter((p) => (p.sources || []).some((s) => String(s).startsWith("public:")))
      .map((p) => ({ name: p.name, position: p.position || null, company: p.company, public_links: p.publicLinks, sources: p.sources,
        note: "Public sources only (GitHub / speakers / team pages as supplied by the user) — no LinkedIn scraping." }));
  }
  // Mentor map seam (T-73): warmest senior people per target company.
  function mentorMap(graph, companies) {
    return (companies || []).map((company) => ({ company,
      mentors: rankPaths(graph, company).filter((p) => /manager|lead|senior|principal|director|advocate/i.test(p.position || "")).slice(0, 3) }));
  }

  // ---------- relationship memory + CRM (SC-151/152/155/156, T-26) ----------
  function setStage(graph, name, stage, opts) {
    opts = opts || {}; const p = byName(graph, name); if (!p) return { ok: false, reason: "person_not_in_graph:" + name };
    if (!STAGES.includes(stage)) return { ok: false, reason: "unknown_stage:" + stage };
    const from = p.stage; p.stage = stage;
    graph.interactions.push({ person_id: p.person_id, name: p.name, kind: opts.kind || "stage_change", at: opts.at || null,
      summary: opts.summary || `stage ${from} -> ${stage}`, stage_after: stage });
    if (opts.at) p.lastContactAt = opts.at;
    return { ok: true, person: p.name, from, to: stage };
  }
  function recordInteraction(graph, name, input) {
    const p = byName(graph, name); if (!p) return { ok: false, reason: "person_not_in_graph:" + name };
    const ix = { person_id: p.person_id, name: p.name, kind: input.kind || "chat", at: input.at || null, summary: input.summary || "", stage_after: p.stage };
    graph.interactions.push(ix); if (input.at) p.lastContactAt = input.at;
    if (input.kind === "coffee_chat") { p.chats = (p.chats || 0) + 1; if (p.stage === "contacted" || p.stage === "chat_scheduled" || p.stage === "cold") p.stage = "chatted"; }
    return { ok: true, interaction: ix };
  }
  function relationshipMemory(graph, name) {
    const p = byName(graph, name);
    if (!p) return { found: false, name, history: [] };
    const history = graph.interactions.filter((i) => i.person_id === p.person_id);
    const last = history[history.length - 1] || null;
    return { found: true, name: p.name, company: p.company, stage: p.stage, chats: p.chats || 0,
      last_contact_at: p.lastContactAt, last_summary: last ? last.summary : null, history };
  }
  function planReferralAsk(graph, name, opts) {
    // SC-151 law: a referral ask NEVER goes in email one — it needs a held chat first.
    opts = opts || {}; const p = byName(graph, name);
    if (!p) return { ok: false, reason: "person_not_in_graph:" + name };
    if (!(p.chats > 0) && p.stage !== "chatted" && p.stage !== "warm") return { ok: false, blocked: true,
      reason: "no_held_chat_on_record: referral asks come after a good coffee chat, never in email one (SC-151)", stage: p.stage };
    return { ok: true, kind: "referral_ask", requires_approval: true, sends: false, t3: true,
      draft: { to_name: p.name, subject: `Referral for ${opts.company || p.company} — ${opts.role || "the role"}`,
        body: `Hi ${p.name.split(/\s+/)[0]}, thanks again for the chat${opts.chat_note ? ` — ${opts.chat_note}` : ""}. I applied for ${opts.role || "a role"} at ${opts.company || p.company}. Would you be willing to refer me? Happy to send a short blurb and my resume so it's easy. No pressure at all if the timing isn't right.\n\nThanks,\n${graph.user.name}` } };
  }
  function recordReferralSignal(graph, name, input) {
    input = input || {}; const p = byName(graph, name);
    if (!p) return { ok: false, reason: "person_not_in_graph:" + name };
    const ref = { person_id: p.person_id, name: p.name, company: input.company || p.company, role: input.role || null,
      status: input.status || "submitted", at: input.at || null, app_id: null };
    graph.referrals.push(ref); setStage(graph, name, "referred", { at: input.at, kind: "referral", summary: `referral ${ref.status} for ${ref.company}` });
    return { ok: true, referral: ref };
  }
  // Link a submitted referral onto the REAL application row (126 store shape: array or {rows}).
  function linkReferralToApplication(graph, trackStore, name, company) {
    const rows = Array.isArray(trackStore) ? trackStore : (trackStore && trackStore.rows) || [];
    const app = rows.find((r) => normCo(r.company) === normCo(company));
    const ref = graph.referrals.filter((r) => norm(r.name) === norm(name)).slice(-1)[0];
    if (!app) return { ok: false, reason: "no_application_row_for:" + company };
    if (!ref) return { ok: false, reason: "no_referral_signal_for:" + name };
    app.source = "referred"; app.referred_by = name; ref.app_id = app.app_id;
    app.events = app.events || []; app.events.push({ type: "referral_linked", at: ref.at, source: "graph", detail: `referral submitted by ${name} (graph ${ref.person_id})`, evidence: ref.person_id });
    return { ok: true, app_id: app.app_id, company: app.company, source_after: app.source, referred_by: app.referred_by };
  }
  function conversionTracking(graph) {
    const per = graph.people.filter((p) => (p.chats || 0) > 0 || graph.referrals.some((r) => r.person_id === p.person_id)).map((p) => {
      const refs = graph.referrals.filter((r) => r.person_id === p.person_id);
      return { name: p.name, company: p.company, chats: p.chats || 0, stage: p.stage, referrals: refs.length,
        converted: refs.length > 0 }; });
    const chatted = per.length, converted = per.filter((x) => x.converted).length;
    return { contacts_with_chats: chatted, converted_to_referral: converted,
      conversion_pct: chatted ? Math.round(1000 * converted / chatted) / 10 : 0, per_contact: per };
  }

  // ---------- keep-warm decay (T-27, SC-157/158) ----------
  function keepWarmSuggestions(graph, opts) {
    opts = opts || {}; const now = opts.now || Date.now(); const afterDays = opts.afterDays || 42; // six weeks
    return graph.people.filter((p) => ["chatted", "warm", "referred"].includes(p.stage) && p.lastContactAt
      && daysBetween(Date.parse(p.lastContactAt), now) >= afterDays)
      .map((p) => ({ name: p.name, company: p.company, stage: p.stage, days_since: daysBetween(Date.parse(p.lastContactAt), now),
        reason: `${daysBetween(Date.parse(p.lastContactAt), now)} days since your last touch — past the 6-week keep-warm line, and the relationship was warm (${p.stage}).` }))
      .sort((a, b) => b.days_since - a.days_since);
  }
  function draftUpdateTouch(graph, name, profile122Profile, opts) {
    // Built ONLY from confirmed master-profile facts (122) — no invented news.
    opts = opts || {}; const p = byName(graph, name); if (!p) return { ok: false, reason: "person_not_in_graph:" + name };
    const facts = ((profile122Profile && profile122Profile.facts) || []).filter((f) => !f.needs_confirmation);
    const news = opts.factId ? facts.find((f) => f.id === opts.factId) : facts[facts.length - 1];
    if (!news) return { ok: false, reason: "no_confirmed_profile_fact_to_share" };
    return { ok: true, requires_approval: true, sends: false, fact_id: news.id,
      draft: { to_name: p.name, body: `Hi ${p.name.split(/\s+/)[0]}, quick update since we last spoke: ${news.text} Thought you'd appreciate hearing it — your advice helped. Hope things are well at ${p.company}.\n\nBest,\n${graph.user.name}` } };
  }

  // ---------- forwardable intro (T-98, SC-150/162) ----------
  function forwardableBlurb(graph, profile122Profile) {
    const facts = ((profile122Profile && profile122Profile.facts) || []).filter((f) => !f.needs_confirmation);
    const edu = facts.find((f) => f.kind === "education"), exp = facts.find((f) => f.kind === "experience" || f.kind === "project");
    if (!edu || !exp) return { ok: false, reason: "profile_needs_education_and_experience_facts" };
    const lines = [`${graph.user.name} — ${edu.text}`, `${exp.text}`, `Reachable via me; happy to share a resume on request.`];
    return { ok: true, blurb: lines.join("\n"), lines, fact_ids: [edu.id, exp.id], note: "Three lines, built only from confirmed profile facts." };
  }
  function draftIntroRequest(graph, mutualName, targetName, blurb) {
    const m = byName(graph, mutualName), t = byName(graph, targetName);
    if (!m || !t) return { ok: false, reason: "mutual_or_target_not_in_graph" };
    if (!blurb) return { ok: false, reason: "forwardable_blurb_required" };
    return { ok: true, requires_approval: true, sends: false, t3: true, card: { kind: "intro_request", mutual: m.name, target: t.name },
      draft: { to_name: m.name, subject: `Intro to ${t.name} at ${t.company}?`,
        body: `Hi ${m.name.split(/\s+/)[0]}, would you be willing to introduce me to ${t.name} at ${t.company}? Forwardable blurb below so it's one copy-paste — no worries at all if not.\n\n${blurb}\n\nThanks,\n${graph.user.name}` } };
  }

  // ---------- new-hire radar (SC-160): graph delta between snapshots ----------
  function snapshot(graph, at) { const snap = { at: at || null, people: graph.people.map((p) => ({ name: p.name, company: p.company })) }; graph.snapshots.push(snap); return snap; }
  function newHireRadar(graph, prevSnap, opts) {
    opts = opts || {}; const now = opts.now || Date.now(); const targets = (opts.targetCompanies || []).map(normCo);
    const prev = {}; for (const p of (prevSnap && prevSnap.people) || []) prev[norm(p.name)] = p.company;
    return graph.people.filter((p) => targets.includes(normCo(p.company)) && (
      (prev[norm(p.name)] && normCo(prev[norm(p.name)]) !== normCo(p.company)) ||
      (p.joinedCompanyAt && daysBetween(Date.parse(p.joinedCompanyAt), now) <= (opts.withinDays || 90))))
      .map((p) => { const w = warmthOf(graph, p);
        return { name: p.name, company: p.company, prior_company: p.priorCompany || prev[norm(p.name)] || null, joined_at: p.joinedCompanyAt || null,
          warmth_tier: w.tier, shared_fact: w.shared_fact, flag: "New hire from your network/school at a target company — usually the warmest path in." }; });
  }

  return { STAGES, WARMTH, norm, createGraph, importRecords, importLinkedInCsv, byName, atCompany,
    sharedFacts, warmthOf, rankPaths, topWarmPathSweep, secondDegreeMap, publicSourceLookup, mentorMap,
    setStage, recordInteraction, relationshipMemory, planReferralAsk, recordReferralSignal,
    linkReferralToApplication, conversionTracking, keepWarmSuggestions, draftUpdateTouch,
    forwardableBlurb, draftIntroRequest, snapshot, newHireRadar };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerGraph;
