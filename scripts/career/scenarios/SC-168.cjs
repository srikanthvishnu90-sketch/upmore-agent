<<<<<<< HEAD
"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-168", "mckinsey-case-no-cir");
  await s.user("prep me for a McKinsey case");
  const cir = cirById("mckinsey"); await s.tool("127-career-prep.findCir", { company: "McKinsey", cir_found: !!cir });
  const cs = P.caseSession({ company: "McKinsey", cir });
  await s.agent(`First, honesty: ${cs.practice_norms_label} So I won't quote you McKinsey-specific practice norms (how many cases, their exact format) as facts. The case engine itself works fine — here is a full practice case on the standard framework:\n\nCASE: ${cs.case_prompt}\n\nFramework: ${cs.framework.join(" → ")}\n\nGo ahead: your first two minutes — clarify and structure it, out loud, in chat.`);
  await s.user("The objective is to restore profit growth for the chain. I'd structure into revenue and costs. Revenue grew 5%, so my hypothesis is costs are the driver because margins compressed while sales rose. I need data: cost breakdown by COGS, labour, logistics and shrink, by segment and trend over the year. Then I'd recommend based on the biggest driver.");
  const sc = P.scoreCaseResponse("The objective is to restore profit growth for the chain. I'd structure into revenue and costs. Revenue grew 5%, so my hypothesis is costs are the driver because margins compressed while sales rose. I need data: cost breakdown by COGS, labour, logistics and shrink, by segment and trend over the year. Then I'd recommend based on the biggest driver.");
  await s.tool("127-career-prep.scoreCaseResponse", sc);
  await s.agent(`Structured feedback: ${sc.score_0_5}/5. Checks: ${Object.entries(sc.checks).map(([k, v]) => `${k.replace(/_/g, " ")} ${v ? "✓" : "✗"}`).join(", ")}. ${sc.feedback.length ? "Work on: " + sc.feedback.join("; ") : "Full structure landed — next rep: add numbers discipline (size each branch before asking for data)."}`);
  s.verify("case session + scoring state", { cir_grounded: cs.cir_grounded, score: sc });
  await s.finish({ status: "LEARN", outcome: "Case practice session ran end-to-end with structured feedback (score stored), but no McKinsey-specific norms could be claimed: there is no McKinsey CIR on file anywhere in the repo.", reason: "Ledger expectation cites 'CIR mckinsey'; no mckinsey.json exists on pivot/career or any cir-b* branch. Community practice norms for McKinsey therefore cannot be labeled from a sourced record.", unblock: "Merge a McKinsey CIR (bain/bcg pattern) into packages/career-data/cirs; caseSession({cir}) then labels its norms from that record automatically." });
=======
"use strict"; const { H, G, Track } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-168", "referral-timing-vs-deadline");
  await s.user("Referral timing: apply now or wait 48 hours — decided from the real deadline");
  const ts = Track.createMemoryStore([]); const app = Track.addApplication(ts, { company: "Datadog", role: "Software Engineering Intern", role_family: "SWE", source: "cold", resume_version: "swe-v2", stage: "Ready" });
  const tight = G.referralTiming({ deadlineDays: 1, referralEtaDays: 2 });
  const loose = G.referralTiming({ deadlineDays: 14, referralEtaDays: 2 });
  await s.tool("135-career-graph.referralTiming(deadline in 1 day)", tight);
  await s.tool("135-career-graph.referralTiming(deadline in 14 days)", loose);
  await s.agent(`Decided from the real deadline, both ways so you can see the rule work:\n\n• If the Datadog posting closes in 1 day: ${tight.decision} — ${tight.reason}\n\n• With the actual 14 days left on this posting: ${loose.decision} — ${loose.reason}\n\nYour application row is at stage "Ready" and stays unsubmitted during the hold — the hard stop in the decision guarantees it goes in even if the referral never lands.`);
  s.verify("timing decisions + application row state", { tight: tight.decision, loose: loose.decision, app_stage: Track.findByCompany(ts, "Datadog").stage, app_id: app.app_id });
  await s.finish({ status: "COMPLETE", outcome: "Timing decided from the real deadline by the rail: 1-day deadline → apply now/refer after; actual 14-day window → wait up to 48h with a hard submit stop; application row held at Ready." });
>>>>>>> origin/career/sc-w09
})();
