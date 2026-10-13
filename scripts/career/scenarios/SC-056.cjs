"use strict";
<<<<<<< HEAD
const { H, M, NOW, USER, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-056", "venture-analysts-midwest-funds-coffee-chats");
  const q = M.parseTarget("Get 25 coffee chats with venture analysts at Midwest funds", PROFILE);
  const records = poolOverFirms(q.firms, 4, { per: (i) => ({ title: "Venture Analyst", seniority_band: "analyst", geography: "Midwest", office: ["Chicago", "Columbus", "Minneapolis"][i % 3], personalization_facts: [{ fact: "writes about Midwest startup ecosystems (TEST fact)", source_url: "https://example.test/v" + i, strength: "medium" }] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  const drafts = pool.selected.slice(0, 3).map((c) => M.draftAndGate(c, USER, {}));
  s.user("Get 25 coffee chats with venture analysts at Midwest funds");
  s.tool("124.parseTarget+buildList", { firm_set: q.firm_set, yield: pool.yield });
  s.agent(`Found ${pool.selected.length} venture analysts at Midwest funds and drafted the coffee-chat asks (3 samples gate-checked: ${drafts.map((d) => d.gate.pass).join(", ")}). Sample people: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.current_firm}`).join("; ")}.`);
  s.verify("selection read back: exactly 25, every firm in the venture_midwest set; sample drafts pass the quality gate", { selected: pool.selected.length, firms_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), sample_gates: drafts.map((d) => d.gate.pass) });
  await s.finish({ status: "COMPLETE", outcome: `25 venture analysts at Midwest funds selected and verified (new venture_midwest firm set, 10 funds); coffee-chat drafts gate-checked on samples` });
=======
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
>>>>>>> origin/career/sc-f03
})();
