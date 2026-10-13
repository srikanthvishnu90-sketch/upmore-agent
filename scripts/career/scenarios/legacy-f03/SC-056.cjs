"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-056", "duplicate-protection-datadog");
  const postings = await L.feed("greenhouse", "datadog");
  const posting = postings.filter((p) => /software engineer/i.test(p.title))[0];
  const log = L.Apply.createLog();
  // The persona applied last week — a real record in the application log
  // (2026-10-05, seven days before today 2026-10-12) is the rail's evidence.
  const prior = L.Apply.buildAuditRecord(log, { jobId: posting.job_id, company: posting.company, role: posting.title, url: posting.url, timestamp: "2026-10-05T09:30:00Z", resumeVersionId: "resume-v1", status: "submitted (TEST record)", channel: "test-harness" });
  s.tool("132-career-apply application log (seeded prior application)", prior);
  s.user(`apply to this Datadog role (${posting.title})`);
  const dup = L.Apply.checkDuplicate(log, posting);
  s.tool("132-career-apply checkDuplicate", dup);
  s.agent(`You already applied to this exact Datadog role on 2026-10-05 (${prior.applicationId}). A second submit is refused — duplicates hurt more than they help, and Datadog's system would flag it. If that application was withdrawn or rejected, tell me and I'll re-check the record.`);
  s.verify("duplicate detected from the log's own record: same job_id, refusal cites the first application's date (2026-10-05) and ID; log still holds exactly 1 record", { duplicate: dup.duplicate, priorDate: dup.prior && String(dup.prior.timestamp).slice(0, 10), recordCount: log.records.length });
  await s.finish({ status: dup.duplicate && log.records.length === 1 ? "COMPLETE" : "LEARN", outcome: "Duplicate Datadog application refused from the application log, citing the 2026-10-05 first application.", reason: dup.duplicate ? null : "duplicate not detected", unblock: dup.duplicate ? null : "Fix checkDuplicate in 132." });
})();
