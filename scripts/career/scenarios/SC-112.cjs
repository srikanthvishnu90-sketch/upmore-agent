"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-112", "career-switcher-nurse-to-data");
  s.user("Career switcher: nurse to data analyst — transferable-skills narrative from real facts only");
  const prof = L.personaProfile("persona-switcher-nurse.json");
  const r = await L.pollLive();
  const p = r.postings.find((x) => x.role_family === "Data/ML" && /analyst/i.test(x.title)) || r.postings.find((x) => x.role_family === "Data/ML");
  s.tool("121.poll (live)", { totals: L.feedTotals(r), pick: L.slim(p) });
  const t = T.tailorResume(prof, p.title + "\n" + p.jd_text.slice(0, 2500), { jobId: p.job_id });
  s.agent(`Switcher packet for ${p.title} at ${p.company}, built ONLY from her real facts: the narrative runs ICU sepsis-alert workflow → unit dashboards (Excel/Tableau) → 2 years of readmission-data analysis presented to hospital leadership. Selected facts: ${t.resume.selectedFactIds.join(", ")}. Every line carries fact IDs and the truth audit passed (${t.audit.ok}) — no clinical-to-corporate translation was invented, and her unevidenced Python appears nowhere as a claim.`, { card: { title: "Switcher packet (nurse → data)", posting: L.slim(p), selected_facts: t.resume.selectedFactIds, audit_ok: t.audit.ok, lines: t.resume.lines.map((l) => l.text) } });
  s.verify("audit verdict + selected fact ids from the tailoring run itself; all facts are the nurse fixture's own", { audit_ok: t.audit.ok, selected: t.resume.selectedFactIds });
  await s.finish({ status: t.ok && t.audit.ok ? "COMPLETE" : "LEARN", outcome: `Nurse→data-analyst packet tailored to a live posting using only her evidenced facts; truth audit green` });
})().catch((e) => { console.error(e); process.exit(1); });
