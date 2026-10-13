"use strict"; const { S, T, H } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-144", "assessment-score-logged");
  s.user("Assessment score comes back — logged; next-round prep adjusted");
  const store = T.seedTestLog(); const r = S.logAssessmentScore(store, "Hudson River Trading", { score: 82, max: 100, at: "2026-10-12T15:00:00Z" });
  s.tool("136.logAssessmentScore", r);
  s.agent(`Logged: Hudson River Trading assessment 82/100 on your application row. ${r.next_round_prep_adjustment}`);
  const app = T.findByCompany(store, "Hudson River Trading");
  s.verify("score sits on the application row with a user-reported event; stage untouched", { assessment: app.assessment, last_event: app.events.at(-1).type, stage: app.stage });
  await s.finish({ status: "COMPLETE", outcome: "Assessment score 82/100 logged on the HRT application row and next-round prep adjusted to interview rounds" }); })();
