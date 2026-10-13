"use strict";
const { T, H, NOW, msg } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-071", "assessment-stage-never-taken");
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "Hudson River Trading", role: "Software Engineering Intern", role_family: "SWE", applied_at: "2026-10-05T12:00:00Z", resume_version: "swe-v1", stage: "Confirmed", assessment_deadline: "2026-10-18T12:00:00Z" }, { now: NOW });
  s.user("(OA link arrives)");
  const r = T.ingestMessage(store, msg("TEST-msg-oa-hrt"), { now: NOW });
  s.tool("126-career-track.ingestMessage", r);
  s.agent(`${r.assessment.statement} What I will do: ${r.assessment.actions.join(", ")}. Deadline on your record: 2026-10-18.`);
  const app = T.findByCompany(store, "Hudson River Trading");
  s.verify("stage moved to OA/assessment; assessment record states will_take:false with schedule/remind/prep actions", { stage: app.stage, assessment: r.assessment });
  await s.finish({ status: "COMPLETE", outcome: "OA invite moved HRT to OA/assessment; the agent plainly refused to take the assessment and offered schedule + reminder + prep instead (Doc 2 5.3)" });
})();
