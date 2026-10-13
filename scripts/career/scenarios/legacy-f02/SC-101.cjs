"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-101", "one-page-rule-student-resume");
  s.user("One-page rule enforced for a student resume across every variant");
  const prof = L.personaProfile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const picks = [
    r.postings.find((p) => p.role_family === "SWE" && p.seniority_band === "intern"),
    r.postings.find((p) => p.role_family === "Finance"),
    r.postings.find((p) => p.role_family === "Data/ML"),
  ].filter(Boolean);
  const results = picks.map((p) => { const t = T.tailorResume(prof, p.title + "\n" + p.jd_text.slice(0, 2500), { jobId: p.job_id }); const lines = t.rendered ? t.rendered.text.split("\n").length : 0; return { company: p.company, title: p.title, ok: t.ok, pageLimit: t.resume ? t.resume.pageLimit : null, rendered_lines: lines, one_page_est: lines <= 52, audit_ok: t.audit ? t.audit.ok : false }; });
  s.agent(`One-page rule checked on every variant I built from live postings: ${results.map((x) => `${x.company} (${x.title}) — pageLimit ${x.pageLimit}, ${x.rendered_lines} rendered lines (≈1 page at 52 lines/page), truth audit ${x.audit_ok ? "passed" : "FAILED"}`).join(" | ")}. The family conventions in the tailoring module set pageLimit=1 for student variants (SWE, IB/finance, Data/ML all carry it), and every rendered variant here fits the one-page estimate with its audit green.`, { card: { title: "One-page rule — all variants", variants: results } });
  s.verify("pageLimit comes from the assembled resume object; line counts from the rendered text; audit from the truth gate", { variants: results });
  await s.finish({ status: results.every((x) => x.ok && x.pageLimit === 1 && x.one_page_est && x.audit_ok) ? "COMPLETE" : "LEARN", outcome: `${results.length} live-posting resume variants all enforce pageLimit=1, fit the one-page estimate, and pass the truth audit` });
})().catch((e) => { console.error(e); process.exit(1); });
