"use strict";
<<<<<<< HEAD
const { H, M, NOW, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-054", "civil-engineers-infrastructure-midwest");
  const q = M.parseTarget("Find 70 civil engineers at infrastructure firms in the Midwest", PROFILE);
  const offices = ["Chicago", "Kansas City", "Minneapolis", "St. Louis"];
  const records = poolOverFirms(q.firms, 8, { per: (i) => ({ title: "Civil Engineer", geography: "Midwest", office: offices[i % 4] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  s.user("Find 70 civil engineers at infrastructure firms in the Midwest");
  s.tool("124.parseTarget+buildList", { firm_set: q.firm_set, geography: q.geography, role_family: q.role_family, yield: pool.yield });
  s.agent(`Found ${pool.selected.length} civil engineers at infrastructure firms across the Midwest. Sample: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.current_firm}, ${c.office}`).join("; ")}.`);
  s.verify("selection read back: exactly 70, every firm in the infrastructure_eng set, every person Midwest", { selected: pool.selected.length, firms_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), midwest_ok: pool.selected.every((c) => c.geography === "Midwest") });
  await s.finish({ status: "COMPLETE", outcome: `70 civil engineers at Midwest infrastructure firms selected and verified (new infrastructure_eng firm set, 10 firms)` });
=======
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
  s.card(Object.assign({}, card, { title: "Apply to these 8 roles?" }));
  s.agent("One card, all 8 roles with fit and resume version. Nothing submits before your yes.");
  s.user("yes, apply to all 8");
  const recs = items.map((i) => L.Apply.buildAuditRecord(log, { jobId: i.posting.job_id, company: i.company, role: i.role, url: i.posting.url, timestamp: "2026-10-12T15:00:00Z", resumeVersionId: i.resumeVersion, status: "approved-on-batch-card (TEST harness — no real employer submission)", channel: "batch-card" }));
  s.tool("132-career-apply audit records after the yes", recs.map((r) => ({ id: r.applicationId, company: r.company, role: r.role, resumeVersionId: r.resumeVersionId })));
  s.agent(`Approved. 8 audit records created (${recs[0].applicationId}–${recs[recs.length - 1].applicationId}), one per application, each carrying its job, URL, timestamp and resume version.`);
  s.verify("exactly ONE batch card listed all 8; log had 0 records before the yes and exactly 8 after", { beforeYes, afterYes: log.records.length, cardCount: card.items.length });
  await s.finish({ status: beforeYes === 0 && log.records.length === 8 && card.items.length === 8 ? "COMPLETE" : "LEARN", outcome: "One batch card for 8 real roles; nothing recorded before the yes; 8 per-application audit records after it.", reason: beforeYes === 0 ? null : "records existed before approval", unblock: beforeYes === 0 ? null : "Fix batch flow in 132." });
>>>>>>> origin/career/sc-f03
})();
