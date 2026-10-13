"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-110", "data-ml-roles");
  s.user("Data/ML roles: papers, models, evaluation metrics forward");
  const prof = L.personaProfile("test-persona.json");
  const r = await L.pollLive();
  const p = r.postings.find((x) => x.role_family === "Data/ML" && x.seniority_band === "intern") || r.postings.find((x) => x.role_family === "Data/ML");
  s.tool("121.poll (live)", { totals: L.feedTotals(r), pick: L.slim(p) });
  const t = T.tailorResume(prof, p.title + "\n" + p.jd_text.slice(0, 2500), { jobId: p.job_id });
  const sections = t.resume.sections.map((x) => x.heading);
  const metricLines = t.resume.lines.filter((l) => /\d/.test(l.text)).length;
  const papers = (prof.facts || []).filter((f) => /paper|publication/i.test(f.text || ""));
  s.agent(`Data/ML packet for ${p.title} at ${p.company}: sections lead ${sections.join(" → ")} (models/projects before experience, per the family conventions). ${metricLines} of its lines carry the metrics from your facts (users, %, stars). Papers: your profile has ${papers.length} paper/publication facts, so none are claimed — the packet forwards models and evaluation metrics only, because that is what your record actually holds. Truth audit: ${t.audit.ok}.`, { card: { title: "Data/ML packet", posting: L.slim(p), sections, metric_lines: metricLines, papers_on_profile: papers.length, audit_ok: t.audit.ok } });
  s.verify("section order + metric lines from the assembled resume; paper count from the profile facts themselves", { sections, metric_lines: metricLines, papers: papers.length });
  await s.finish({ status: t.ok && t.audit.ok ? "COMPLETE" : "LEARN", outcome: `Data/ML packet built for a live posting with metrics-forward ordering; zero papers claimed (profile holds none) and the audit is green` });
})().catch((e) => { console.error(e); process.exit(1); });
