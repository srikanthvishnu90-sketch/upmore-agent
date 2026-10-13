/* Career warm-path graph (REF-001..010; SC-161..175 slice, w09).
   Pure domain logic, UMD like 124/126/127. User-owned data ONLY: LinkedIn export,
   alumni directory, club roster, pasted contacts — no scraping, no LinkedIn automation.
   Nothing here sends: every ask is a draft on a card until the user approves it.
   Honesty rules: warmth is never inflated (cross-city alumni are discounted AND the
   discount is disclosed); a departed contact is never written to blindly; a contact at
   the user's CURRENT employer is excluded by default with the reason surfaced;
   referral-bonus amounts are reported ONLY from a CIR field that carries them —
   no CIR in the corpus carries a bonus amount, so bonus intel says so (BUG-122).
   Persistence is injected: makeGraphStore() -> { people, interactions, referrals }.
   The application-row seam is 126-career-track (vendored from origin/career/sc-f04):
   markReferralSubmitted writes source/referred_by + a referral_submitted event onto
   the matching application row in that store. */
const CareerGraph = (() => {
  "use strict";
  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase();
  const norm = (v) => lc(v).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const normCo = (v) => norm(v).replace(/\b(inc|llc|ltd|corp|the)\b/g, " ").replace(/\s+/g, " ").trim();
  function hash(str) { let h = 0x811c9dc5; const t = s(str); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }

  function makeGraphStore() { return { people: [], interactions: [], referrals: [] }; }
  function normalizePerson(r) {
    return Object.assign({ person_id: null, full_name: "", current_firm: "", prior_firms: [], title: "", role_kind: null,
      geography: "", office: "", schools: [], major: null, hometown: null, clubs: [], work_email: null, linkedin: null,
      relationship_to_user: "none", connection_degree: null, at_company: true, departed_at: null, next_firm: null,
      is_professor: false, is_family_friend: false, source_list: [], last_verified_at: null, label: null }, r || {});
  }
  // Identity keys: exact email / exact linkedin / name+firm / name+school (never name alone).
  function identityKeys(p) {
    const keys = [];
    if (p.work_email) keys.push("email:" + norm(p.work_email));
    if (p.linkedin) keys.push("li:" + norm(p.linkedin).replace(/ /g, ""));
    if (p.full_name && p.current_firm) keys.push("nf:" + norm(p.full_name) + "@" + normCo(p.current_firm));
    if (p.full_name && (p.schools || []).length) keys.push("ns:" + norm(p.full_name) + "@" + norm(p.schools[0]));
    return keys;
  }
  function mergeInto(a, b) {
    for (const k of ["title", "role_kind", "geography", "office", "major", "hometown", "work_email", "linkedin", "relationship_to_user", "connection_degree", "departed_at", "next_firm", "last_verified_at", "label"])
      if ((a[k] == null || a[k] === "") && b[k] != null && b[k] !== "") a[k] = b[k];
    if (b.at_company === false) { a.at_company = false; }
    for (const k of ["schools", "clubs", "prior_firms", "source_list"]) a[k] = [...new Set([...(a[k] || []), ...(b[k] || [])])];
    if (b.is_professor) a.is_professor = true;
    if (b.is_family_friend) a.is_family_friend = true;
    return a;
  }
  function mergeIdentities(records) {
    const out = []; const merges = []; const byKey = new Map();
    for (const raw of records || []) {
      const r = normalizePerson(raw);
      if (!r.person_id) r.person_id = "person-" + hash(norm(r.full_name) + "|" + norm(r.work_email || r.linkedin || r.current_firm));
      const keys = identityKeys(r);
      let hit = null;
      for (const k of keys) if (byKey.has(k)) { hit = byKey.get(k); break; }
      if (hit) { merges.push({ kept: hit.person_id, absorbed_name: r.full_name, sources: r.source_list, keys_matched: keys.filter((k) => byKey.has(k)) }); mergeInto(hit, r); for (const k of keys) byKey.set(k, hit); }
      else { out.push(r); for (const k of keys) byKey.set(k, r); }
    }
    return { people: out, merges, input_count: (records || []).length, merged_count: out.length };
  }
  function importGraph(store, sources) {
    const all = [];
    for (const src of sources || []) for (const r of src.records || []) all.push(Object.assign({}, r, { source_list: [...new Set([...(r.source_list || []), src.source])] }));
    const { people, merges } = mergeIdentities(all);
    store.people = people;
    return { imported: all.length, people: store.people.length, merges, sources: (sources || []).map((x) => x.source) };
  }

  // ---------- warmth ----------
  // Base points mirror 124 rankContacts (alumni 40 / shared org 25 / hometown 15 / 1st-degree 20)
  // plus: major 10, club roster 25, professor 30, family friend 35, warm interaction history up to 15.
  // Honest discounts, always disclosed in `adjustments`: cross-city alumni -15 (SC-173),
  // departed contact -> excluded, current-employer contact -> excluded (SC-171).
  function rankWarmth(person, profile, opts) {
    opts = opts || {}; profile = profile || {};
    const p = normalizePerson(person); const why = []; const adjustments = []; let score = 0;
    const rel = norm(p.relationship_to_user);
    if (profile.school && (p.schools || []).map(norm).includes(norm(profile.school))) { score += 40; why.push("alumni:" + profile.school); }
    if ((p.clubs || []).length && profile.clubs && (p.clubs || []).some((c) => (profile.clubs || []).map(norm).includes(norm(c)))) { score += 25; why.push("shared club"); }
    else if (/club|fraternity|same org/.test(rel)) { score += 25; why.push("shared org"); }
    if (profile.major && p.major && norm(profile.major) === norm(p.major)) { score += 10; why.push("same major"); }
    if (profile.hometown && p.hometown && norm(profile.hometown) === norm(p.hometown)) { score += 15; why.push("same hometown"); }
    if (p.connection_degree === 1 || /1st|first/.test(rel)) { score += 20; why.push("1st-degree"); }
    else if (p.connection_degree === 2 || /2nd|second|mutual/.test(rel)) { score += 10; why.push("2nd-degree via mutual"); }
    if (p.is_professor) { score += 30; why.push("professor"); }
    if (p.is_family_friend) { score += 35; why.push("family friend"); }
    if (/recruiter/.test(norm(p.role_kind || p.title))) why.push("recruiter (routing ask, not practitioner ask)");
    const lastDays = opts.lastInteractionDaysAgo;
    if (lastDays != null) { if (lastDays <= 30) { score += 15; why.push("talked within 30 days"); } else if (lastDays <= 90) { score += 8; why.push("talked within 90 days"); } else if (lastDays >= 180) adjustments.push({ delta: 0, note: `dormant: last interaction ${lastDays} days ago — warmth is historical, not current` }); }
    // SC-173: alumni in a different city than the ROLE — discount and disclose, never inflate.
    let crossCity = false;
    if (opts.roleCity && (p.geography || p.office)) {
      const pc = norm(p.geography || p.office), rc = norm(opts.roleCity);
      if (pc && !pc.includes(rc) && !rc.includes(pc)) { crossCity = true; score -= 15; adjustments.push({ delta: -15, note: `cross-city: contact is in ${p.geography || p.office}, role is in ${opts.roleCity} — alumni warmth discounted, not inflated` }); }
    }
    return { person_id: p.person_id, name: p.full_name, firm: p.current_firm, score: Math.max(0, score), why, adjustments, cross_city: crossCity };
  }
  function exclusionFor(p, profile) {
    if (p.at_company === false) return { excluded: true, reason: "departed", detail: `left ${p.current_firm}${p.departed_at ? " (" + p.departed_at + ")" : ""}${p.next_firm ? " — now at " + p.next_firm : ""}; do not write to them as a ${p.current_firm} contact` };
    if (profile && profile.current_employer && normCo(p.current_firm) === normCo(profile.current_employer))
      return { excluded: true, reason: "current_employer", detail: `${p.full_name} sits at your current employer (${profile.current_employer}) — excluded by default; asking there can surface your search at work. Override only knowingly, in person, on a card.` };
    return { excluded: false };
  }
  function findPaths(store, company, profile, opts) {
    opts = opts || {};
    const rows = (store.people || []).filter((p) => normCo(p.current_firm) === normCo(company));
    const paths = [], excluded = [];
    for (const p of rows) {
      const ex = exclusionFor(p, profile);
      const w = rankWarmth(p, profile, opts);
      const row = Object.assign({}, w, { title: p.title, role_kind: p.role_kind || null, relationship: p.relationship_to_user, sources: p.source_list });
      if (ex.excluded && !opts.includeExcluded) { excluded.push(Object.assign({}, row, { exclusion: ex })); continue; }
      if (ex.excluded) row.exclusion = ex;
      paths.push(row);
    }
    paths.sort((a, b) => b.score - a.score); excluded.sort((a, b) => b.score - a.score);
    return { company, paths, excluded, best: paths[0] || null };
  }
  function pickStrongerPath(store, company, profile, opts) {
    const { paths, excluded } = findPaths(store, company, profile, opts);
    if (!paths.length) return { company, chosen: null, held: [], excluded, reason: "no live path at this company" };
    const [chosen, ...rest] = paths;
    return { company, chosen, held: rest.map((r) => Object.assign({}, r, { held_reason: "weaker path — held, not contacted, so the two asks never collide or burn both contacts" })), excluded,
      rationale: `${chosen.name} scores ${chosen.score} (${chosen.why.join(", ") || "no shared fact"}) vs ${rest.length ? rest[0].name + " at " + rest[0].score : "no second path"}. One ask, through the stronger path only.` };
  }
  function departedNextPath(store, departedName, profile, opts) {
    const dep = (store.people || []).find((p) => norm(p.full_name) === norm(departedName));
    if (!dep) return { found: false, departed: departedName };
    const company = dep.current_firm;
    const res = findPaths(store, company, profile, opts);
    return { found: true, departed: { name: dep.full_name, firm: company, departed_at: dep.departed_at || null, next_firm: dep.next_firm || null, do_not_contact_as: company + " contact" },
      next_paths: res.paths, note: res.paths.length ? `Next path at ${company}: ${res.paths[0].name} (${res.paths[0].why.join(", ") || "cold"}).` : `No other live path at ${company} in your graph — a mini-campaign (SC-170 pattern) is the honest next step, not writing to the departed contact.` };
  }

  // ---------- relationship memory / keep-warm ----------
  function relationshipMemory(store, name) {
    const rows = (store.interactions || []).filter((i) => norm(i.full_name) === norm(name)).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const person = (store.people || []).find((p) => norm(p.full_name) === norm(name)) || null;
    if (!rows.length) return { name, found: !!person, person, last: null, history: [], summary: person ? "In your graph, but no interaction logged yet." : "Not in your graph." };
    const last = rows[rows.length - 1];
    return { name, found: true, person, last: { at: last.at, channel: last.channel || null, topic: last.topic || null, summary: last.summary || null, outcome: last.outcome || null },
      history: rows, summary: `Last talked ${last.at}: ${last.summary || last.topic || "(no summary logged)"}` };
  }
  function keepWarm(store, opts) {
    opts = opts || {}; const now = Date.parse(opts.now || new Date().toISOString());
    const due = [];
    for (const p of store.people || []) {
      const mem = relationshipMemory(store, p.full_name);
      if (!mem.last) continue;
      const days = Math.floor((now - Date.parse(mem.last.at)) / 86400000);
      const weeks = opts.weeks || 6;
      if (days >= weeks * 7 && mem.last.outcome === "good_chat")
        due.push({ name: p.full_name, firm: p.current_firm, days_since: days, last_topic: mem.last.topic, suggested_reason: opts.reasonFor ? opts.reasonFor(p, mem) : `It has been ${days} days since your good chat about ${mem.last.topic || "your last topic"} — a short, real update keeps the path warm.`, status: "suggested_not_sent" });
    }
    return due.sort((a, b) => b.days_since - a.days_since);
  }
  function logInteraction(store, row) { const r = Object.assign({ at: new Date().toISOString() }, row); store.interactions.push(r); return r; }

  // ---------- blurb + asks (drafts only; approval card required) ----------
  function forwardableBlurb(profile, facts) {
    const usable = (facts || []).filter((f) => f && (f.action || f.text) && ["experience", "project", "leadership", "education"].includes(f.kind || "experience"));
    if (!usable.length || !profile || !profile.name) return { ok: false, reason: "no_real_profile_facts", blurb: null, lines: [] };
    const lines = [];
    const edu = usable.find((f) => f.kind === "education");
    lines.push({ text: `${profile.name} is a ${profile.year || "student"}${profile.school ? " at " + profile.school : ""}${edu ? " (" + (edu.title || "degree on file") + ")" : ""}.`, fact_id: edu ? edu.id : "profile" });
    const exp = usable.find((f) => f.kind === "experience") || usable[0];
    lines.push({ text: `${exp.action ? exp.action[0].toUpperCase() + exp.action.slice(1) : exp.text}${exp.result ? " — " + exp.result : ""}.`, fact_id: exp.id || null });
    const lead = usable.find((f) => f.kind === "leadership" || f.kind === "project");
    if (lead && lead !== exp) lines.push({ text: `${lead.action ? lead.action[0].toUpperCase() + lead.action.slice(1) : lead.text}${lead.result ? " — " + lead.result : ""}.`, fact_id: lead.id || null });
    const blurb = lines.map((l) => l.text).join(" ");
    return { ok: true, blurb, lines, word_count: blurb.split(/\s+/).length, rule: "Built only from real profile facts; every line carries its fact_id. Three lines, forwardable as-is." };
  }
  function askKindFor(person) {
    const p = normalizePerson(person);
    if (p.is_professor) return "professor";
    if (p.is_family_friend) return "family_friend";
    if (/recruiter|talent|hiring/.test(norm(p.role_kind || "") + " " + norm(p.title))) return "recruiter";
    return "practitioner";
  }
  function draftReferralAsk(person, user, opts) {
    opts = opts || {}; const p = normalizePerson(person); const kind = askKindFor(p);
    const first = (p.full_name || "").split(/\s+/)[0] || "there";
    if ((opts.touchNumber || 1) <= 1 && !opts.hadGoodChat)
      return { ok: false, reason: "referral_ask_never_in_email_one", kind, draft: null, rule: "A referral ask comes after a good coffee chat, never in email one (SC-151 rule carried into this slice)." };
    let body;
    if (kind === "recruiter") body = `Hi ${first},\n\nThanks for the conversation about the ${opts.role || "role"} at ${p.current_firm}. I'm applying this week — could you confirm the right requisition/team for my background and whether an employee referral should be attached before I submit, so I follow your process exactly?\n\nHappy to send my resume and the blurb below.\n\n${opts.blurb || ""}\n\nThanks,\n${user.name || ""}`;
    else if (kind === "professor") body = `Dear Professor ${p.full_name.split(/\s+/).slice(-1)[0]},\n\nI'm applying for the ${opts.role || "role"} at ${p.current_firm}, where I understand you previously worked. Would you be willing to refer me, or to point me to the right person on the team? I've attached my resume; my relevant work: ${opts.proof || "(proof from profile)"}.\n\nThank you for considering it — and for your class, which is part of why I'm aiming at this work.\n\n${user.name || ""}`;
    else if (kind === "family_friend") body = `Hi ${first},\n\nHope you and the family are well. I'm applying for the ${opts.role || "role"} at ${p.current_firm} and wanted to ask — only if you're genuinely comfortable — whether you'd be open to referring me. No pressure at all and no hard feelings either way; I completely understand if the timing or fit isn't right.\n\n${opts.blurb || ""}\n\nWith thanks,\n${user.name || ""}`;
    else body = `Hi ${first},\n\nReally enjoyed our chat${opts.chatNote ? " — " + opts.chatNote : ""}. I'm applying for the ${opts.role || "role"} at ${p.current_firm}. Would you be open to referring me? Here's a forwardable blurb so it's zero work:\n\n${opts.blurb || ""}\n\nTotally fine if not — either way, thank you for the conversation.\n\nThanks,\n${user.name || ""}`;
    return { ok: true, kind, status: "draft_only", requires_card_approval: true,
      draft: { to: p.work_email || null, person_id: p.person_id, subject: kind === "professor" ? `Referral request — ${opts.role || "role"} at ${p.current_firm}` : `Referral for ${opts.role || "the role"} at ${p.current_firm}?`, body },
      tone_note: kind === "family_friend" ? "Extra care: explicit no-pressure out, family warmth first, the user's yes required before anything sends." : kind === "recruiter" ? "Recruiter ask = process/routing (right requisition, referral attached pre-submit). Practitioner ask = endorsement. Different asks, deliberately." : null };
  }
  function thankYouReferralCombo(person, user, opts) {
    opts = opts || {};
    if (!opts.offeredToRefer) return { ok: false, reason: "no_referral_offer_on_record", draft: null, rule: "The combo is only drafted when they actually offered to refer in the chat — it is never used to manufacture an offer." };
    if (!opts.note) return { ok: false, reason: "user_note_required: the thank-you must cite one real thing said", draft: null };
    const p = normalizePerson(person); const first = (p.full_name || "").split(/\s+/)[0];
    const body = `Hi ${first},\n\nThank you for the chat — ${opts.note}\n\nAnd thank you for offering to refer me for the ${opts.role || "role"} at ${p.current_firm}. To make it zero work, here's the forwardable blurb:\n\n${opts.blurb || ""}\n\nI'll confirm the exact role link today so your referral attaches to the right posting.\n\nGrateful,\n${user.name || ""}`;
    return { ok: true, status: "draft_only", requires_card_approval: true, draft: { to: p.work_email || null, person_id: p.person_id, subject: `Thank you — and the referral blurb`, body } };
  }
  function dormantRevival(person, user, opts) {
    opts = opts || {};
    if (!opts.realUpdate || !opts.realUpdate.fact_id) return { ok: false, reason: "real_update_required", draft: null, rule: "A dormant contact is revived honestly, with a real update from your profile — never a fabricated milestone." };
    const p = normalizePerson(person); const first = (p.full_name || "").split(/\s+/)[0];
    const body = `Hi ${first},\n\nIt's been a while since we last spoke${opts.lastTopic ? " about " + opts.lastTopic : ""} — no agenda in resurrecting the thread, just a real update: ${opts.realUpdate.text}\n\nI'm now aiming at ${opts.goal || "my next step"}, and your perspective last time genuinely shaped that. Would a brief catch-up be welcome sometime in the next few weeks? No worries at all if not.\n\n${user.name || ""}`;
    return { ok: true, status: "draft_only", requires_card_approval: true, honest: true, draft: { to: p.work_email || null, person_id: p.person_id, subject: "A real update since last season", body }, update_fact_id: opts.realUpdate.fact_id };
  }

  // ---------- referral timing + lifecycle + tracking seam (126) ----------
  function referralTiming(opts) {
    opts = opts || {};
    const deadlineDays = opts.deadlineDays, eta = opts.referralEtaDays != null ? opts.referralEtaDays : 2, holdHours = opts.holdHours || 48;
    if (deadlineDays == null) return { decision: "ASK", reason: "No real deadline on file for this posting — timing cannot be decided honestly without it.", hold_hours: holdHours };
    if (deadlineDays * 24 <= holdHours + 12) return { decision: "APPLY_NOW_REFER_AFTER", reason: `Deadline is in ${deadlineDays} day(s) — inside the ${holdHours}h hold window plus a safety margin. Apply now so the application exists, then attach the referral after (most portals accept a referral note/referral link post-submit; a missed deadline accepts nothing).`, hold_hours: holdHours, eta_days: eta };
    return { decision: "WAIT_FOR_REFERRAL", max_wait_hours: holdHours, reason: `Deadline is ${deadlineDays} days out and the referral ETA is ~${eta} day(s): holding up to ${holdHours}h keeps the referral attached pre-submit without risking the deadline. Hard stop: submit at T-${Math.max(12, deadlineDays * 24 - holdHours)}h even if the referral has not landed.`, hold_hours: holdHours, eta_days: eta };
  }
  function createReferral(store, input) {
    const r = { referral_id: "ref-" + hash(s(input.company) + "|" + s(input.contact_name) + "|" + s(input.role) + "|" + (store.referrals.length + 1)),
      company: s(input.company), role: s(input.role || ""), contact_name: s(input.contact_name), contact_person_id: input.contact_person_id || null,
      ask_kind: input.ask_kind || null, status: "draft_on_card", draft: input.draft || null, created_at: new Date().toISOString(),
      approved_at: null, submitted_at: null, application_id: null, label: "TEST" };
    store.referrals.push(r); return r;
  }
  function approveReferral(store, id) { const r = store.referrals.find((x) => x.referral_id === id); if (!r) throw new Error("referral not found"); r.status = "approved_not_sent"; r.approved_at = new Date().toISOString(); return r; }
  // Seam into 126-career-track: referral submitted -> application row updated in place.
  function markReferralSubmitted(graphStore, trackStore, Track, referralId, opts) {
    opts = opts || {};
    const r = graphStore.referrals.find((x) => x.referral_id === referralId); if (!r) throw new Error("referral not found: " + referralId);
    r.status = "submitted"; r.submitted_at = opts.at || new Date().toISOString();
    let app = Track.findByCompany(trackStore, r.company);
    if (!app) app = Track.addApplication(trackStore, { company: r.company, role: r.role, role_family: opts.role_family || "SWE", source: "referred", referred_by: r.contact_name, resume_version: opts.resume_version || "", stage: "Submitted" }, { now: Date.parse(r.submitted_at) });
    else {
      app.source = "referred"; app.referred_by = r.contact_name;
      app.events.push({ type: "referral_submitted", at: r.submitted_at, source: "user-reported", detail: `referral submitted by ${r.contact_name} (TEST)`, evidence: r.referral_id });
    }
    r.application_id = app.app_id;
    return { referral: r, application: app };
  }
  function conversionByContact(store) {
    const by = {};
    for (const i of store.interactions || []) { by[i.full_name] = by[i.full_name] || { chats: 0, referrals: 0 }; if (i.outcome === "good_chat" || i.channel === "coffee_chat") by[i.full_name].chats++; }
    for (const r of store.referrals || []) { by[r.contact_name] = by[r.contact_name] || { chats: 0, referrals: 0 }; if (r.status === "submitted") by[r.contact_name].referrals++; }
    return by;
  }

  // ---------- mini-campaign at one company (SC-170) ----------
  function miniCampaign(store, company, profile, opts) {
    opts = opts || {}; const n = opts.count || 8;
    const { paths, excluded } = findPaths(store, company, profile, opts);
    const cold = (store.people || []).filter((p) => normCo(p.current_firm) === normCo(company) && !paths.some((x) => x.person_id === p.person_id) && !excluded.some((x) => x.person_id === p.person_id) && p.at_company !== false);
    const seq = paths.slice(0, n).map((p, i) => ({ order: i + 1, name: p.name, warmth: p.score, why: p.why, ask: "coffee chat first — referral ask never in email one", status: "queued_not_sent" }));
    for (const c of cold) { if (seq.length >= n) break; const w = rankWarmth(c, profile, opts); seq.push({ order: seq.length + 1, name: c.full_name, warmth: w.score, why: w.why.length ? w.why : ["cold — no shared fact on file"], ask: "coffee chat first — referral ask never in email one", status: "queued_not_sent" }); }
    return { company, count: seq.length, requested: n, sequence: seq, excluded, rule: "Sequenced warm to cold; one person at a time, replies re-rank the rest; per-firm cap 15/30d (124 CAPS) is never approached by an 8-person sequence." };
  }

  // ---------- referral-bonus intel (SC-161) ----------
  function referralBonusIntel(cirs, companies) {
    const rows = [];
    for (const co of companies || []) {
      const cir = (cirs || []).find((c) => normCo(c.company_name || c.company_id) === normCo(co) || norm(c.company_id) === norm(co));
      if (!cir) { rows.push({ company: co, cir: false, bonus_amount: null, bonus_status: "NO_CIR", referral_weight: null, note: "No CIR on file — no bonus claim made." }); continue; }
      const notes = cir.referral_weight_notes || {};
      const weight = s(notes.note || notes.statement || "") || null;
      const bonusField = cir.referral_bonus || cir.referral_bonus_notes || null;
      rows.push({ company: cir.company_name || co, cir: true, company_id: cir.company_id, bonus_amount: bonusField ? (bonusField.amount || null) : null,
        bonus_status: bonusField ? "SOURCED" : "NOT_IN_CIR",
        referral_weight: weight,
        note: bonusField ? "Bonus figure carried by the CIR field, source-labeled there." : "This CIR carries referral-WEIGHT notes but no referral-BONUS amount. No amount is claimed — inventing one would be exactly the failure this program exists to prevent. Practical read from the CIR note: a referral routes you into the process; the artifacts still carry the decision, so practitioner asks (people who can speak to your work) outrank routing asks." });
    }
    return { rows, sourced_bonus_count: rows.filter((r) => r.bonus_status === "SOURCED").length,
      headline: "No target in the merged CIR corpus publishes a sourced referral-bonus amount, so none is reported. What IS sourced per company is the referral-weight note below." };
  }

  // ---------- CIR -> 127 adapter (BUG-123) ----------
  // pivot/career's normalized CIR schema (statement fields; screening_signals as
  // {stated, revealed}; hiring_bar_summary.statement) crashes 127's normalizeCir,
  // which expects the pre-normalization shapes. adaptCirForPrep converts WITHOUT
  // altering claim text; 127 itself stays vendored unchanged.
  function adaptCirForPrep(cir) {
    if (!cir) return null;
    const flat = (v) => { if (Array.isArray(v)) return v; if (v && typeof v === "object") return [...(v.stated || []), ...(v.revealed || []), ...(v.claims || [])]; return []; };
    const toText = (x) => { if (typeof x === "string") return x; if (!x) return x; const o = Object.assign({}, x); if (!o.text && (o.statement || o.summary || o.claim)) o.text = o.statement || o.summary || o.claim; return o; };
    const bar = cir.hiring_bar_summary;
    return Object.assign({}, cir, {
      hiring_bar_summary: typeof bar === "string" ? bar : { text: s(bar && (bar.statement || bar.summary || bar.text)) },
      screening_signals: flat(cir.screening_signals).map(toText),
      interview_styles: flat(cir.interview_styles).map(toText),
      values_culture_signals: flat(cir.values_culture_signals).map(toText),
      compensation_notes: flat(cir.compensation_notes).map(toText),
      process_stages: (cir.process_stages || []).map((st) => typeof st === "string" ? st : Object.assign({}, st, { name: st.stage || st.name, description: st.description || st.claim || "" })),
      red_flags: (cir.red_flags || []).map((x) => typeof x === "string" ? x : s(x.claim || x.statement || x.text || "")),
    });
  }

  return { makeGraphStore, normalizePerson, identityKeys, mergeIdentities, importGraph, adaptCirForPrep,
    rankWarmth, findPaths, pickStrongerPath, departedNextPath, exclusionFor,
    relationshipMemory, keepWarm, logInteraction,
    forwardableBlurb, askKindFor, draftReferralAsk, thankYouReferralCombo, dormantRevival,
    referralTiming, createReferral, approveReferral, markReferralSubmitted, conversionByContact,
    miniCampaign, referralBonusIntel };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerGraph;
