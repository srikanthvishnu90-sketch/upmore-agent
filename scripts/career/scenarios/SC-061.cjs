"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-061", "adjust-resume-and-auto-apply");
  s.user("Adjust my resume and auto apply");
  // Locked decision: auto-apply runs ONLY under an approved rule / batch card.
  const postings = await L.feedMany(L.STARRED_FEEDS);
  const candidates = postings.filter((p) => /engineer/i.test(p.title) && /intern|new grad/i.test(p.title)).slice(0, 4);
  const scoring = L.scoringProfile();
  const items = candidates.map((post) => { const t = L.Tailor.tailorResume(L.persona(), post.jd_text, { jobId: post.job_id, company: post.company }); const f = L.Jobs.scoreFit(post, scoring); return { company: post.company, role: post.title, fit: f.excluded ? null : f.score, resumeVersion: t.ok ? t.version.versionId : null, posting: post, auditOk: t.ok }; });
  const log = L.Apply.createLog();
  const card = L.Apply.batchCard(items, { title: "Auto-apply batch — your approval runs it" });
  s.agent(`Here's how "auto apply" works under your locked rules: I tailor your resume per role (truth audit on every version), and applications run only under a rule or batch card you approved — never silently. These ${items.length} roles are tailored and ready:`, { card });
  s.agent("Approve this batch and it runs; or set a standing rule (like SC-078's) and matching roles run under it with a nightly summary. Nothing has been submitted yet.");
  const beforeYes = log.records.length;
  s.user("yes — run this batch");
  const recs = items.map((i) => L.Apply.buildAuditRecord(log, { jobId: i.posting.job_id, company: i.company, role: i.role, url: i.posting.url, timestamp: "2026-10-13T09:00:00Z", resumeVersionId: i.resumeVersion, status: "submitted under user-approved batch card (TEST record)", channel: "batch-card" }));
  s.tool("132-career-apply records after approval", recs.map((r) => r.applicationId));
  s.agent(`Ran the batch: ${recs.length} applications recorded, each with its own tailored resume version and audit record.`);
  const ok = items.length >= 1 && items.every((i) => i.auditOk) && beforeYes === 0 && log.records.length === items.length;
  s.verify("every role tailored per-role with audit passing BEFORE the card; zero records before the yes; one audit record per role after it; no silent autopilot anywhere in the flow", { beforeYes, afterYes: log.records.length, auditOk: items.map((i) => i.auditOk) });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `"Adjust my resume and auto apply" ran the locked way: per-role tailoring + approved batch card, ${recs.length} applications recorded, no silent autopilot.`, reason: ok ? null : "flow invariant broken — see verification", unblock: ok ? null : "See tool records." });
})();
