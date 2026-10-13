"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-079", "duplicate-protection-via-inbox");
  // Inbox fixture (authorized, labeled TEST): the user applied MANUALLY last
  // week; the only trace is the ATS confirmation email.
  const inbox = [
    { from: "no-reply@datadoghq.com (TEST)", subject: "Your application to Datadog was received (TEST)", date: "2026-10-06", company: "Datadog", role: "Software Engineer Intern" },
    { from: "jobs@example.test (TEST)", subject: "Weekly jobs newsletter (TEST)", date: "2026-10-07" },
  ];
  s.tool("inbox fixture (TEST)", inbox);
  s.user("Apply to this Datadog Software Engineer Intern role");
  const log = L.Apply.createLog();
  const recon = L.Apply.reconcileInbox(log, inbox);
  s.tool("132-career-apply reconcileInbox (Gmail check before applying)", recon);
  const posting = { company: "Datadog", title: "Software Engineer Intern", job_id: "gh:datadog:new-id" };
  const dup = L.Apply.checkDuplicate(log, posting);
  s.tool("132-career-apply checkDuplicate", dup);
  s.agent(`Caught it — no double-apply. Your Gmail has Datadog's confirmation from 2026-10-06 for this exact role: you applied manually last week. I reconciled that into your application log (${recon.added.length ? recon.added[0].applicationId : "already there"}) and blocked the second application. If Datadog rejects or you withdraw that one, tell me and the block lifts with the record updated.`);
  const ok = recon.confirmations.length === 1 && recon.added.length === 1 && dup.duplicate === true;
  s.verify("the ONLY evidence of the first application was the inbox fixture; reconciliation created the log record and the duplicate check then refused — cross-channel dedupe from rail state", { ok, priorDate: dup.prior && String(dup.prior.timestamp).slice(0, 10) });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Duplicate protection via inbox: Gmail confirmation of last week's manual Datadog application caught and reconciled; double-apply blocked.", reason: ok ? null : "inbox reconciliation or duplicate check failed", unblock: ok ? null : "Fix reconcileInbox/checkDuplicate in 132 (see BUG-004)." });
})();
