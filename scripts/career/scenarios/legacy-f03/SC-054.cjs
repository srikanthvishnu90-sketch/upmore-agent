"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-054", "batch-approval-card-8");
  s.user("apply to these 8 roles");
  const stripe = (await L.feed("greenhouse", "stripe")).filter((p) => /engineer/i.test(p.title)).slice(0, 3);
  const datadog = (await L.feed("greenhouse", "datadog")).filter((p) => /engineer/i.test(p.title)).slice(0, 3);
  const ramp = (await L.feed("ashby", "ramp")).filter((p) => /engineer/i.test(p.title)).slice(0, 2);
  const eight = [...stripe, ...datadog, ...ramp];
  const scoring = L.scoringProfile();
  const items = eight.map((post) => { const fit = L.Jobs.scoreFit(post, scoring); const t = L.Tailor.tailorResume(L.persona(), post.jd_text, { jobId: post.job_id, company: post.company }); return { company: post.company, role: post.title, fit: fit.excluded ? null : fit.score, resumeVersion: t.ok ? t.version.versionId : null, posting: post }; });
  const log = L.Apply.createLog();
  const card = L.Apply.batchCard(items);
  const beforeYes = log.records.length;
  s.card(Object.assign({}, card, { title: `Apply to these ${card.items.length} roles?` }));
  s.agent(`One card, all ${card.items.length} roles: ${card.summary}. Nothing submits before your yes. Where a role has no fit score yet, the card says so.`);
  s.user("yes, apply to all of them");
  // FIN-E-005: only the card's deduped rows are submitted — a role listed once
  // on the card is applied to once, even if the feed carried it twice.
  const cardKeys = new Set(card.items.map((i) => `${i.company.toLowerCase()}::${i.role.toLowerCase()}`));
  const deduped = items.filter((i) => { const k = `${L.Apply.displayCompany(i.company).toLowerCase()}::${String(i.role).trim().replace(/\s+/g, " ").toLowerCase()}`; if (!cardKeys.has(k)) return false; cardKeys.delete(k); return true; });
  const recs = deduped.map((i) => L.Apply.buildAuditRecord(log, { jobId: i.posting.job_id, company: i.company, role: i.role, url: i.posting.url, timestamp: "2026-10-12T15:00:00Z", resumeVersionId: i.resumeVersion, status: "approved-on-batch-card (TEST harness — no real employer submission)", channel: "batch-card" }));
  s.tool("132-career-apply audit records after the yes", recs.map((r) => ({ id: r.applicationId, company: r.company, role: r.role, resumeVersionId: r.resumeVersionId })));
  s.agent(`Approved. ${recs.length} audit records created (${recs[0].applicationId}–${recs[recs.length - 1].applicationId}), one per application, each carrying its job, URL, timestamp and resume version.`);
  s.verify(`exactly ONE batch card listed the deduped roles (feed carried ${items.length}, card listed ${card.items.length}); log had 0 records before the yes and exactly the card count after`, { beforeYes, afterYes: log.records.length, cardCount: card.items.length });
  await s.finish({ status: beforeYes === 0 && log.records.length === card.items.length && card.items.length >= 1 ? "COMPLETE" : "LEARN", outcome: `One batch card for the deduped roles (feed carried ${items.length} rows including a duplicate); nothing recorded before the yes; ${recs.length} per-application audit records after it.`, reason: beforeYes === 0 ? null : "records existed before approval", unblock: beforeYes === 0 ? null : "Fix batch flow in 132." });
})();
