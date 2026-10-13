"use strict";
// Canonical SC-064 = the 12-link triage (same outcome family as F03's SC-047,
// re-run fresh under the canonical ID with a new link set drawn at run time).
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-064", "apply-to-12-links-triage");
  s.user("Apply to these 12 links — return apply / skip / ask with reasons for each");
  const stripe = (await L.feed("greenhouse", "stripe")).filter((p) => /engineer/i.test(p.title)).slice(0, 3);
  const datadog = (await L.feed("greenhouse", "datadog")).filter((p) => /engineer/i.test(p.title)).slice(0, 3);
  const ramp = (await L.feed("ashby", "ramp")).filter((p) => /engineer/i.test(p.title)).slice(0, 3);
  const real = [...stripe, ...datadog, ...ramp];
  const mkTest = (over) => Object.assign({ job_id: "test-x", company: "TEST Co", title: "Software Engineer Intern (TEST)", role_family: "SWE", seniority_band: "intern", location: "New York, NY", remote: "onsite", url: "https://example.test/posting (TEST)", posted_at: "2026-10-01", jd_text: "Python internship.", source: "test", sources: ["test"], source_urls: [], department: "", req_id: null }, over);
  const expired = mkTest({ job_id: "test-expired", company: "ExpiredCo (TEST)", posted_at: "2025-01-01" });
  const clearance = mkTest({ job_id: "test-clearance", company: "DefenseCo (TEST)", jd_text: "Software Engineer Intern. Requires TS/SCI security clearance. Python, React." });
  const twelve = [...real, expired, clearance, mkTest({ job_id: "test-extra", company: "ExtraCo (TEST)", title: "Finance Intern (TEST)", jd_text: "Excel, Financial Modeling internship in New York." })].slice(0, 12);
  const dupPosting = datadog[0]; twelve[3] = dupPosting;
  const log = L.Apply.createLog();
  L.Apply.buildAuditRecord(log, { jobId: dupPosting.job_id, company: dupPosting.company, role: dupPosting.title, url: dupPosting.url, timestamp: "2026-10-05T10:00:00Z", resumeVersionId: "resume-v1", status: "submitted (TEST record)" });
  const rows = L.Apply.triageBatch(twelve, { profile: L.persona(), scoringProfile: L.scoringProfile(), log, expiredJobIds: [expired.job_id] });
  s.tool("132-career-apply triageBatch (121 scoreFit inside)", rows);
  const viable = rows.filter((r) => r.decision === "apply");
  const tailored = [];
  for (const row of viable) { const post = twelve.find((x) => x.job_id === row.job_id); const t = L.Tailor.tailorResume(L.persona(), post.jd_text, { jobId: post.job_id, company: post.company }); if (t.ok) tailored.push(row.job_id); }
  const table = rows.map((r) => `${r.decision.toUpperCase()} — ${r.company} · ${r.role}${r.fit != null ? ` (fit ${r.fit})` : ""}: ${r.reasons.join("; ")}`).join("\n");
  s.agent(`All 12 triaged — nothing submitted yet:\n\n${table}\n\nTailored versions are ready for the ${tailored.length} viable roles.`, { card: { type: "triage_table", title: "12 links: apply / skip / ask", rows, tailoredReady: tailored } });
  const counts = { apply: viable.length, skip: rows.filter((r) => r.decision === "skip").length, ask: rows.filter((r) => r.decision === "ask").length };
  const ok = rows.length === 12 && rows.every((r) => r.reasons.length >= 1) && rows.find((r) => r.job_id === dupPosting.job_id).decision === "skip" && rows.find((r) => r.job_id === expired.job_id).decision === "skip" && rows.find((r) => r.job_id === clearance.job_id).decision === "ask" && tailored.length === viable.length;
  s.verify("12 rows, every row reasoned; expired=skip, duplicate=skip (2026-10-05), clearance=ask; tailored ready for every apply row", { counts, ok });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `12 links triaged (${counts.apply} apply / ${counts.skip} skip / ${counts.ask} ask) with per-link reasons; tailored versions ready for the viable set.`, reason: ok ? null : "triage mismatch — see verification", unblock: ok ? null : "See rows in evidence." });
})();
