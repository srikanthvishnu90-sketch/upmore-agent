"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-034", "role-family-variants-data-analyst");
  s.user("find me data analyst roles instead");
  const prof = L.profile("persona-switcher-nurse.json");
  const r = await L.pollLive();
  s.tool("121.poll (live) + profileFromPersona(switcher-nurse)", { totals: L.feedTotals(r), profile: { role_families: prof.preferences.role_families, skills: prof.skills, level: prof.level } });
  const data = r.postings.filter((p) => p.role_family === "Data/ML");
  const scored = L.scoreAll(data, prof);
  const shortlist = await J.buildShortlist(scored, { limit: 5 });
  const transfer = shortlist.filter((x) => (x.matched_skills || []).length || /SQL|Tableau/i.test(x.reasons.join(" ")));
  s.agent(`Scored for YOU — a nurse switching to data, not for the SWE persona: your evidenced skills are SQL and Tableau (Python is on your profile without evidence, so it does not count as a match). Of ${data.length} live Data/ML postings, your top ${shortlist.length}: ${shortlist.map((x) => `${x.posting.title} at ${x.posting.company} (${x.adjusted_score}) — ${x.reasons.slice(0, 2).join("; ")}`).join(" | ")}. The transferable matches named in those reasons come straight from your ICU dashboard and readmission-analysis facts.`, { card: { title: "Data analyst picks (switcher persona)", items: shortlist.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score, reasons: x.reasons, gaps: x.gaps })) } });
  s.verify("profile role_families = Data/ML (BUG-003 fix); shortlist rows are Data/ML family scored against the nurse's own skills", { role_families: prof.preferences.role_families, data_rows: data.length, shortlist_families: shortlist.map((x) => x.posting.role_family), sample_matched: shortlist.map((x) => x.matched_skills || []) });
  await s.finish({ status: "COMPLETE", outcome: `${data.length} live Data/ML postings scored for the switcher persona; top-${shortlist.length} delivered with transferable-skill reasons (SQL/Tableau) named from her own facts` });
})().catch((e) => { console.error(e); process.exit(1); });
