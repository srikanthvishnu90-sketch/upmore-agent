"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-077", "rejection-pattern-analysis");
  const store = T.seedTestLog();
  s.user("why am I getting rejected?");
  const a = T.rejectionAnalysis(store);
  const f = T.funnelAnalytics(store);
  s.tool("126-career-track.rejectionAnalysis", a);
  s.tool("126-career-track.funnelAnalytics(by_source)", f.by_source);
  s.agent(`${a.headline} ${a.honest_read} The supporting numbers from your log: referred apps interview at ${f.by_source.referred.interview_rate} (${f.by_source.referred.n} apps), cold at ${f.by_source.cold.interview_rate} (${f.by_source.cold.n} apps). Plan: ${a.plan.join("; ")}.`);
  s.verify("analysis over the persona's real (TEST) log rows: rejection counts by cold-vs-referred and Reach-vs-Match recomputed from rows", { rejected_count: a.rejected_count, total: a.total, by_source: a.rejected_by_source, by_bucket: a.rejected_by_bucket, store_rows: T.rowsOf(store).length });
  await s.finish({ status: "COMPLETE", outcome: "Rejection analysis over the log's 12 rows: 5 rejections, all cold, 4 of 5 at Reach companies, 0 referred rejections — honest read + plan (Doc 2 S5 pattern)" });
})();
