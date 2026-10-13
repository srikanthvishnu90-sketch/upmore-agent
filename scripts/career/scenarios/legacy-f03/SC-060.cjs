"use strict";
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
})();
