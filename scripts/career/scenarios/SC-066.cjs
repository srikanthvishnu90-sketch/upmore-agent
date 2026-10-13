"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-066", "funnel-analytics");
  const store = T.seedTestLog();
  s.user("what's working in my search?");
  const f = T.funnelAnalytics(store);
  s.tool("126-career-track.funnelAnalytics", f);
  s.agent(`From your own log (${f.total} applications): referred interview rate ${f.by_source.referred.interview_rate} (${f.by_source.referred.interviews}/${f.by_source.referred.n}) vs cold ${f.by_source.cold.interview_rate} (${f.by_source.cold.interviews}/${f.by_source.cold.n}) — that claim is supported by your data. Resume swe-v2: ${f.by_version["swe-v2"].interviews} interviews from ${f.by_version["swe-v2"].n}; fin-v1: 0 interviews, ${f.by_version["fin-v1"].rejections} rejections from ${f.by_version["fin-v1"].n}. SWE family response rate ${f.by_family.SWE.response_rate} vs Finance ${f.by_family.Finance.response_rate}.`);
  s.verify("conversion tables read back from the log rows; the one comparative claim carries supported:true with its basis n", { total: f.total, by_source: f.by_source, by_version_keys: Object.keys(f.by_version), claims: f.claims });
  await s.finish({ status: "COMPLETE", outcome: "Funnel analytics computed from the log by version/family/source; the referred-vs-cold claim is made only because the user's own rows support it (n=4 vs 8)" });
})();
