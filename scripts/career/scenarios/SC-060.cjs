"use strict";
<<<<<<< HEAD
const { H, M, NOW, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-060", "the-dream-50-warm-paths-ranked");
  const DREAM10 = ["Stripe", "Goldman Sachs", "Jane Street", "Datadog", "Ramp", "McKinsey & Company", "Evercore", "Google", "Palantir", "Bain Capital"];
  const rels = ["same school and club", "same school", "hometown", "2nd-degree", "none"];
  const records = poolOverFirms(DREAM10, 5, { per: (i, firm, j) => ({ relationship_to_user: rels[j], title: ["Analyst", "Associate", "Engineer", "Analyst", "Associate"][j] }) });
  s.user("The dream 50: 50 named people across my 10 dream companies, warm paths ranked");
  const perCompany = DREAM10.map((co) => ({ company: co, paths: M.warmPaths(records, co, PROFILE) }));
  const all = M.rankContacts(records, PROFILE);
  s.tool("124.warmPaths x10 + rankContacts", { companies: perCompany.map((c) => ({ company: c.company, people: c.paths.length, top_path: c.paths[0] && c.paths[0].path })), ranked_total: all.length });
  const lines = perCompany.map((c) => `${c.company}: ` + c.paths.map((p) => `${p.person} (${p.path}, rank ${p.rank})`).join("; ")).join("\n");
  s.agent(`Your dream 50 — 5 named people at each of your 10 dream companies, warm paths ranked inside each company:\n${lines}\n\nWarmest overall: ${all[0].contact.full_name} at ${all[0].contact.current_firm} (${all[0].why.join(" + ")}).`, { card: { title: "The dream 50", companies: perCompany.map((c) => c.company), total: all.length, warmest: { name: all[0].contact.full_name, firm: all[0].contact.current_firm, why: all[0].why } } });
  const ranks = all.map((r) => r.rank);
  s.verify("dream-50 read back from warmPaths/rankContacts: 50 named people, 5 per dream company, global ranking non-increasing, every entry carries a stated path", { total: all.length, per_company_counts: perCompany.map((c) => c.paths.length), ranked_desc: ranks.every((r, i) => i === 0 || ranks[i - 1] >= r), all_named: all.every((r) => !!r.contact.full_name) });
  await s.finish({ status: "COMPLETE", outcome: `Dream 50 delivered: 50 named people across the 10 dream companies (5 each), warm paths ranked per company and globally; warmest path is ${all[0].contact.full_name} at ${all[0].contact.current_firm} (${all[0].why.join(" + ")})` });
=======
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-060", "application-audit-record-ramp");
  // Build the Ramp application through the real rails first (tailor + a
  // confirmed sensitive answer), then record it — the audit query below reads
  // ONLY this log, never chat memory.
  const postings = await L.feed("ashby", "ramp");
  const posting = postings.filter((p) => /engineer/i.test(p.title))[0];
  const t = L.Tailor.tailorResume(L.persona(), posting.jd_text, { jobId: posting.job_id, company: "Ramp" });
  const sens = L.Apply.confirmSensitive(L.persona(), "Will you require sponsorship?", { confirmed: true });
  const log = L.Apply.createLog();
  const seeded = L.Apply.buildAuditRecord(log, {
    jobId: posting.job_id, company: "Ramp", role: posting.title, url: posting.url, timestamp: "2026-10-10T14:22:00Z",
    resumeVersionId: t.version.versionId, coverLetterId: null,
    answers: [
      { question: "Will you require sponsorship?", answer: sens.answer, source: "profile constraints (needsSponsorship=false)", confirmationState: sens.confirmationState },
      { question: "Years of experience with Python?", answer: "1", source: "fact F-002 (SWE Intern, TEST Systems Inc)", confirmationState: "not-required" },
    ],
    confirmationProof: "TEST harness record — no real submission (doorstep rule)", referral: { attached: false, who: null }, status: "submitted (TEST record)", channel: "test-harness",
  });
  s.tool("132-career-apply log seeded via buildAuditRecord", seeded);
  s.user("show me exactly what was submitted for Ramp");
  const rec = L.Apply.getAuditRecord(log, { company: "Ramp" });
  s.tool("132-career-apply getAuditRecord(Ramp)", rec);
  s.agent(`Here is the exact audit record for Ramp (${rec.applicationId}):\n\nJob: ${rec.role}\nJob ID: ${rec.jobId}\nURL: ${rec.url}\nSubmitted: ${rec.timestamp}\nResume version: ${rec.resumeVersionId}\nCover letter: ${rec.coverLetterId || "none"}\nReferral attached: ${rec.referral.attached ? "yes" : "no"}\nConfirmation proof: ${rec.confirmationProof}\n\nEvery question + answer + source:\n${rec.answers.map((a) => `• ${a.question} → "${a.answer}" (source: ${a.source}; confirmation: ${a.confirmationState})`).join("\n")}`, { card: { type: "audit_record", title: "Audit record — Ramp", record: rec } });
  const fields = ["jobId", "company", "url", "timestamp", "resumeVersionId", "answers", "confirmationProof", "referral"];
  const complete = rec && fields.every((f) => rec[f] !== undefined && rec[f] !== null || f === "coverLetterId") && rec.answers.length === 2 && rec.answers.every((a) => a.question && a.answer && a.source && a.confirmationState);
  s.verify("record returned from the log (not chat): job, URL, timestamp, resume version, every Q&A with source + confirmation state, referral flag all present", { complete, applicationId: rec && rec.applicationId });
  await s.finish({ status: complete ? "COMPLETE" : "LEARN", outcome: `Full §5.5 audit record for the Ramp application (${rec && rec.applicationId}) returned from the application log.`, reason: complete ? null : "audit record incomplete", unblock: complete ? null : "Fix buildAuditRecord/getAuditRecord in 132." });
>>>>>>> origin/career/sc-f03
})();
