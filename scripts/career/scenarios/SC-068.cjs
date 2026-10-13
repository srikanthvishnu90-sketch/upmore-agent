"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-068", "ghosted-detection");
  const store = T.seedTestLog();
  s.user("Palantir has been quiet for 21 days");
  const q = T.quietReport(store, { now: NOW });
  s.tool("126-career-track.quietReport", q);
  const pal = q.find((x) => x.company === "Palantir");
  const marked = T.markGhosted(store, { now: NOW });
  s.tool("126-career-track.markGhosted", marked);
  s.agent(`Confirmed from your log: Palantir applied ${T.findByCompany(store, "Palantir").applied_at.slice(0, 10)}, no signal since — ${pal.days_quiet} days quiet, so the quiet-period rule (>= ${T.GHOST_AFTER_DAYS} days) fires and the stage is now Ghosted. Your choice: I draft a nudge, or we move on and put the hours elsewhere.`);
  s.verify("days_quiet computed from last signal on the log row; stage moved to Ghosted only for Palantir", { palantir: pal, marked, stage: T.findByCompany(store, "Palantir").stage, ramp_stage_unchanged: T.findByCompany(store, "Ramp").stage });
  await s.finish({ status: "COMPLETE", outcome: "Quiet-period rule fired for Palantir at exactly 21 days from the log; stage marked Ghosted and the nudge-or-move-on choice proposed with the day count" });
})();
