"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-047", "batch-links-triage-12");
  s.user("apply to these 12 links (mixed real postings)");
  // 9 real postings from live feeds + 3 TEST-shaped postings carrying the
  // ledger's skip/ask conditions (expired, duplicate, clearance-required).
  const stripe = (await L.feed("greenhouse", "stripe")).filter((p) => /engineer/i.test(p.title)).slice(0, 3);
  const datadog = (await L.feed("greenhouse", "datadog")).filter((p) => /engineer/i.test(p.title)).slice(0, 3);
  const ramp = (await L.feed("ashby", "ramp")).filter((p) => /engineer/i.test(p.title)).slice(0, 3);
  const real = [...stripe, ...datadog, ...ramp];
  const dupPosting = datadog[0];
  const mkTest = (over) => Object.assign({ job_id: "test-x", company: "TEST Co", title: "Software Engineer Intern (TEST)", role_family: "SWE", seniority_band: "intern", location: "New York, NY", remote: "onsite", url: "https://example.test/posting (TEST)", posted_at: "2026-10-01", jd_text: "Python internship.", source: "test", sources: ["test"], source_urls: [], department: "", req_id: null }, over);
  const expired = mkTest({ job_id: "test-expired", company: "ExpiredCo (TEST)", posted_at: "2025-01-01" });
  const clearance = mkTest({ job_id: "test-clearance", company: "DefenseCo (TEST)", jd_text: "Software Engineer Intern. Requires TS/SCI security clearance. Python, React." });
  const twelve = [...real, expired, clearance, mkTest({ job_id: "test-extra", company: "ExtraCo (TEST)", title: "Finance Intern (TEST)", jd_text: "Excel, Financial Modeling internship in New York." })].slice(0, 12);
  // Ensure the duplicate condition is inside the 12: swap one real slot for the already-applied Datadog role.
  twelve[3] = dupPosting;
  const log = L.Apply.createLog();
  L.Apply.buildAuditRecord(log, { jobId: dupPosting.job_id, company: dupPosting.company, role: dupPosting.title, url: dupPosting.url, timestamp: "2026-10-05T10:00:00Z", resumeVersionId: "resume-v1", status: "submitted (TEST record)" });
  const rows = L.Apply.triageBatch(twelve, { profile: L.persona(), scoringProfile: L.scoringProfile(), log, expiredJobIds: [expired.job_id] });
  s.tool("132-career-apply triageBatch (121 scoreFit inside)", rows);
  const viable = rows.filter((r) => r.decision === "apply");
  const tailored = [];
  for (const row of viable) { const post = twelve.find((x) => x.job_id === row.job_id); const t = L.Tailor.tailorResume(L.persona(), post.jd_text, { jobId: post.job_id, company: post.company }); if (t.ok) tailored.push({ job_id: row.job_id, version: t.version.versionId, auditOk: t.audit.ok }); }
  const table = rows.map((r) => `${r.decision.toUpperCase()} — ${r.company} · ${r.role}${r.fit != null ? ` (fit ${r.fit})` : ""}: ${r.reasons.join("; ")}`).join("\n");
  s.agent(`Triaged all 12 links. Nothing was submitted — here is the table:\n\n${table}\n\nTailored versions are ready for the ${tailored.length} viable roles. Say the word and I'll put them on one batch approval card.`, { card: { type: "triage_table", title: "12 links triaged: apply / skip / ask", rows, tailoredReady: tailored } });
  const counts = { apply: rows.filter((r) => r.decision === "apply").length, skip: rows.filter((r) => r.decision === "skip").length, ask: rows.filter((r) => r.decision === "ask").length };
  const reasonsEverywhere = rows.every((r) => r.reasons && r.reasons.length >= 1);
  const dupRow = rows.find((r) => r.job_id === dupPosting.job_id);
  const expRow = rows.find((r) => r.job_id === expired.job_id);
  const clrRow = rows.find((r) => r.job_id === clearance.job_id);
  s.verify("12 rows back, every row has a reason; expired=skip, duplicate=skip with the 2026-10-05 date, clearance=ask; tailored versions ready for every viable (apply) row", { counts, reasonsEverywhere, dup: dupRow, expired: expRow, clearance: clrRow, tailoredCount: tailored.length, viableCount: viable.length });
  const ok = rows.length === 12 && reasonsEverywhere && dupRow.decision === "skip" && expRow.decision === "skip" && clrRow.decision === "ask" && tailored.length === viable.length && viable.length >= 1;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `12 links triaged (${counts.apply} apply / ${counts.skip} skip / ${counts.ask} ask) with reasons; ${tailored.length} tailored versions ready.`, reason: ok ? null : "triage decisions mismatch — see verification", unblock: ok ? null : "See triage rows in evidence." });
})();
