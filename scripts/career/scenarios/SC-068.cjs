"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-068", "batch-17-match-roles-review-first-3");
  s.user("Batch: 17 Match roles tailored; I review the first 3; then submit the batch on my card yes");
  const all = await L.feedMany(L.WIDE_FEEDS);
  const scoring = L.scoringProfile();
  const scored = all.map((p) => ({ p, f: L.Jobs.scoreFit(p, scoring) })).filter((x) => !x.f.excluded && x.f.bucket === "Match");
  const prefer = (x) => (/intern|new grad|junior|associate/i.test(x.p.title) ? 0 : 1);
  scored.sort((a, b) => prefer(a) - prefer(b) || b.f.score - a.f.score);
  const seventeen = scored.slice(0, 17);
  s.tool("121-career-jobs + scoreFit Match pool", { totalPostings: all.length, matchPool: scored.length, chosen: seventeen.map((x) => ({ company: x.p.company, title: x.p.title, fit: x.f.score })) });
  const rawItems = seventeen.map((x) => { const t = L.Tailor.tailorResume(L.persona(), x.p.jd_text, { jobId: x.p.job_id, company: x.p.company }); return { company: L.Apply.displayCompany(x.p.company), role: String(x.p.title).trim(), fit: x.f.score, resumeVersion: t.ok ? t.version.versionId : null, auditOk: t.ok, diff: t.ok ? t.diff.summary : null, posting: x.p }; });
  // FIN-E-005: dedupe identical company+role before review, card and submission,
  // so every number in this conversation (reviewed, carded, submitted) agrees.
  const seenK = new Set(); const items = rawItems.filter((i) => { const k = `${i.company.toLowerCase()}::${i.role.toLowerCase()}`; if (seenK.has(k)) return false; seenK.add(k); return true; });
  const n = items.length;
  const log = L.Apply.createLog();
  const first3 = items.slice(0, 3);
  s.agent(`${n} Match roles tailored${rawItems.length !== n ? ` (${rawItems.length - n} duplicate listing${rawItems.length - n === 1 ? "" : "s"} removed)` : ""}. Review the first 3 before anything moves:\n\n${first3.map((i, n) => `${n + 1}. ${i.company} — ${i.role} (fit ${i.fit}, ${i.resumeVersion}): diff vs base — ${i.diff}`).join("\n")}`, { card: { type: "review_first_3", title: `Review the first 3 of ${n}`, items: first3.map((i) => ({ company: i.company, role: i.role, fit: i.fit, resumeVersion: i.resumeVersion, diff: i.diff })) } });
  s.user("first 3 look right");
  const card = L.Apply.batchCard(items, { title: `Submit all ${n} Match roles?` });
  s.card(card);
  const beforeYes = log.records.length;
  s.user("yes — submit the batch");
  const recs = items.map((i) => L.Apply.buildAuditRecord(log, { jobId: i.posting.job_id, company: i.company, role: i.role, url: i.posting.url, timestamp: "2026-10-13T11:00:00Z", resumeVersionId: i.resumeVersion, status: "submitted under user-approved batch card (TEST record)", channel: "batch-card" }));
  s.tool("132-career-apply records", recs.map((r) => r.applicationId));
  s.agent(`Batch submitted under your yes: ${recs.length} audit records (${recs[0].applicationId}–${recs[recs.length - 1].applicationId}).`);
  const ok = items.length >= 3 && card.items.length === items.length && items.every((i) => i.auditOk) && beforeYes === 0 && log.records.length === items.length;
  s.verify(`exactly the deduped Match-bucket roles (feed carried ${rawItems.length} rows incl. duplicates), all tailored with audit ok, first-3 review happened before the card, 0 records before the card yes and ${n} after — card, prose and records agree`, { matchPool: scored.length, ok, beforeYes });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `${n} unique Match roles tailored (duplicates in the feed removed), first 3 reviewed, batch submitted on the card yes — ${n} audit records.`, reason: ok ? null : `pool or flow shortfall: tailored=${items.length}, pool=${scored.length} — see verification`, unblock: ok ? null : "See tool records." });
})();
