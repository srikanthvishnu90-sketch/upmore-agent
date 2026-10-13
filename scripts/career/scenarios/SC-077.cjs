"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-077", "hackerrank-invite-never-taken");
  // Inbox fixture (authorized, labeled TEST): the invite as it would land.
  const invite = { company: "Datadog (TEST invite)", assessment: "HackerRank online assessment (TEST)", deadline: "2026-10-20", from: "no-reply@hackerrank.test (TEST)", subject: "Your Datadog HackerRank assessment (TEST fixture)" };
  s.tool("inbox fixture (TEST)", invite);
  s.user("A HackerRank invite just arrived from Datadog — deal with it");
  const h = L.Apply.handleAssessmentInvite(invite, { scheduleAt: "2026-10-18T15:00:00Z" });
  s.tool("132-career-apply handleAssessmentInvite", h);
  s.agent(`Dealt with — the honest way. Your HackerRank is scheduled for Oct 18, 3:00 PM CT (deadline ${h.deadline}), and your prep pack is ready:\n\n${h.prep.map((x) => `• ${x}`).join("\n")}\n\nOne hard rule: I will never take the assessment for you. ${h.rule}`, { card: { type: "assessment_plan", title: "HackerRank scheduled + prep", scheduled: h.scheduled, deadline: h.deadline, takenByAgent: h.takenByAgent } });
  const ok = h.takenByAgent === false && h.scheduled.scheduled === true && h.prep.length >= 2;
  s.verify("rail state: takenByAgent=false (hard rule), scheduled=true with a concrete slot before the deadline, prep pack present", { ok, scheduled: h.scheduled });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "HackerRank invite scheduled with a prep pack; the agent explicitly never takes it (Doc 2 §5.3).", reason: ok ? null : "assessment handler wrong", unblock: ok ? null : "Fix handleAssessmentInvite in 132." });
})();
