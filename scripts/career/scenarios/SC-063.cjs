"use strict";
const { T, H, NOW, msg } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-063", "rejection-detection-honesty");
  const store = T.seedTestLog();
  // fresh Goldman row at Confirmed so the rejection move is observed live
  const gs = T.findByCompany(store, "Goldman Sachs"); gs.stage = "Confirmed"; gs.events = gs.events.filter((e) => e.type !== "rejection");
  s.user("(rejection email lands)");
  const r = T.ingestMessage(store, msg("TEST-msg-reject-goldman"), { now: NOW });
  s.tool("126-career-track.ingestMessage", r);
  const a = T.rejectionAnalysis(store, { now: NOW });
  s.tool("126-career-track.rejectionAnalysis", a);
  s.agent(`Goldman Sachs rejected this application — stage is now Rejected in your log. Honest read: ${a.headline} ${a.honest_read} Plan: ${a.plan.join("; ")}. No sugarcoating.`);
  s.verify("stage in the log is Rejected; analysis numbers come from log rows (rejected_count, by source/bucket)", { stage: T.findByCompany(store, "Goldman Sachs").stage, rejected_count: a.rejected_count, rejected_by_source: a.rejected_by_source, rejected_by_bucket: a.rejected_by_bucket });
  await s.finish({ status: "COMPLETE", outcome: "Goldman rejection moved the log stage to Rejected and produced the honest pattern note + plan from the log's own 5 rejections (all cold, 4 of 5 Reach)" });
})();
