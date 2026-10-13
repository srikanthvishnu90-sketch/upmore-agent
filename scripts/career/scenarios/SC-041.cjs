"use strict";
<<<<<<< HEAD
const { H, M, NOW, USER, PROFILE, poolOverFirms, FIRM_SETS } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-041", "live-list-surgery-drop-vps-michigan-boutique");
  const bands = ["analyst", "associate", "vp_plus"];
  const bout = poolOverFirms(FIRM_SETS.sets.elite_boutique.firms.map((f) => f.name), 4, { per: (i, firm, j) => ({ seniority_band: bands[i % 3], schools: [i % 2 ? "University of Michigan" : "Ohio State University"] }) });
  const bb = poolOverFirms(FIRM_SETS.sets.bulge_bracket.firms.filter((f) => f.status !== "historical").map((f) => f.name), 4, { startIndex: 100, per: (i, firm, j) => ({ seniority_band: bands[i % 3], schools: [i % 2 ? "University of Michigan" : "Ohio State University"] }) });
  const records = bout.concat(bb);
  const q = M.parseTarget("Find 76 bankers for coffee chats", PROFILE);
  const pool = M.buildList(records, Object.assign({}, q, { count: records.length }), { profile: PROFILE, nowMs: NOW });
  s.user("Build me a banker list for coffee chats");
  s.tool("124.buildList", pool.yield);
  s.agent(`Built your list: ${pool.selected.length} selected, ${pool.reserve.length} in reserve. Mix: ${pool.selected.filter((c) => c.seniority_band === "vp_plus").length} VPs, firms across bulge bracket and boutiques, schools Michigan and Ohio State.`);
  s.user("drop VPs, only Michigan and boutique people");
  const cut = M.applyListOps(pool, "drop VPs, only Michigan and boutique people");
  s.tool("124.applyListOps", { ops: cut.ops, before: cut.before, after: cut.after, removed: cut.removed.length, promoted_from_reserve: cut.promoted_from_reserve.length });
  s.agent(cut.text + ` Removed: ${cut.removed.slice(0, 5).map((r) => `${r.name} (${r.firm}, ${r.seniority_band}, ${(r.schools || [])[0]})`).join("; ")}${cut.removed.length > 5 ? "; …" : ""}`);
  const boutiqueNames = FIRM_SETS.sets.elite_boutique.firms.map((f) => f.name);
  s.verify("re-cut list read back from applyListOps output: zero VPs, every person Michigan, every firm an elite boutique", { after: cut.after, vps_left: cut.selected.filter((c) => c.seniority_band === "vp_plus").length, non_michigan: cut.selected.filter((c) => !(c.schools || []).includes("University of Michigan")).length, non_boutique: cut.selected.filter((c) => !boutiqueNames.includes(c.current_firm)).length });
  await s.finish({ status: "COMPLETE", outcome: `Live surgery re-cut the list ${cut.before.selected} -> ${cut.after.selected} selected (${cut.removed.length} removed, ${cut.promoted_from_reserve.length} reserve promoted); verified 0 VPs, all Michigan, all boutique from the returned list state` });
})();
=======
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-041", "tailor-for-real-stripe-swe-role");
  s.user("tailor my resume for this Stripe SWE intern role");
  const postings = await L.feed("greenhouse", "stripe");
  const posting = postings.filter((p) => /software engineer/i.test(p.title) && /intern/i.test(p.title) && !/high school/i.test(p.title)).sort((a, b) => ((/^software engineer, intern/i.test(a.title) ? 0 : 1) + (/united states|new york|san francisco|seattle/i.test(a.location) ? 0 : 1)) - ((/^software engineer, intern/i.test(b.title) ? 0 : 1) + (/united states|new york|san francisco|seattle/i.test(b.location) ? 0 : 1)))[0];
  s.tool("121-career-jobs greenhouse/stripe feed", { status: 200, count: postings.length, chosen: { title: posting.title, location: posting.location, url: posting.url, job_id: posting.job_id } });
  const p = L.persona();
  const base = L.Tailor.tailorResume(p, "Software Engineer Intern. Required: Python, JavaScript.", {});
  const r = L.Tailor.tailorResume(p, posting.jd_text, { jobId: posting.job_id, company: "Stripe", baseLines: base.resume.lines.map((l) => l.text) });
  if (!r.ok) { s.agent(`I could not tailor this one — the truth audit refused the output: ${JSON.stringify(r.violations)}`); await s.finish({ status: "LEARN", outcome: "Tailor refused on the real Stripe JD (see violations).", reason: JSON.stringify(r.violations), unblock: "Fix the audit violation in 123 and rerun." }); return; }
  s.agent(`Tailored for ${posting.title} at Stripe (${posting.location}). Every line cites the profile fact that supports it, and the truth audit passed with 0 unmapped claims. Diff vs your base resume: ${r.diff.summary}.`, { card: { type: "tailored_resume", title: `Tailored resume — Stripe ${posting.title}`, version: r.version.versionId, family: r.resume.family, audit: r.audit, lines: r.resume.lines } });
  s.tool("123-career-tailor tailorResume", { ok: r.ok, audit: r.audit, diff: r.diff.summary, version: r.version });
  const allCited = r.resume.lines.every((l) => Array.isArray(l.factIds) && l.factIds.length >= 1);
  const factIdsReal = r.resume.lines.every((l) => l.factIds.every((id) => !!L.Profile.getFact(p, id)));
  s.verify("tailored lines ↔ fact IDs from the audit output: audit.ok, every line has >=1 fact ID, every cited ID exists in the master profile", { auditOk: r.audit.ok, checked: r.audit.checked, violations: r.audit.violations, allCited, factIdsReal, selectedFactIds: r.resume.selectedFactIds });
  await s.finish({ status: allCited && factIdsReal && r.audit.ok ? "COMPLETE" : "LEARN", outcome: `Tailored resume for the real Stripe posting "${posting.title}" — audit passes, ${r.resume.lines.length} lines all fact-cited, diff shown.`, reason: allCited ? null : "some lines lacked fact IDs", unblock: allCited ? null : "Fix line citation in 123 assemble()." });
})().catch(async (e) => { console.error(e); process.exit(1); });
>>>>>>> origin/career/sc-f03
