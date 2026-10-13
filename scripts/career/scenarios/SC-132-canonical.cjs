"use strict"; const { T, P, H, msg, cir, NOW } = require("./d1-common.cjs");
(async () => { const s = H.session("SC-132", "funnel-resume-version-killed");
  s.user("Funnel math: response rate by resume version — kill the losing variant");
  const store = T.seedTestLog(); const f = T.funnelAnalytics(store); const v = T.resumeVersionVerdict(store);
  s.tool("126-career-track.funnelAnalytics.by_version", f.by_version); s.tool("126-career-track.resumeVersionVerdict", v);
  s.agent(`By version (your log only): ` + Object.entries(f.by_version).map(([k,g])=>`${k}: ${g.responses}/${g.n} responses (${g.response_rate})`).join("; ") + `. Verdict: ${v.reason} Killed: ${v.killed}. Kept: ${v.kept.join(", ")}.`, { card: { title: "Resume version verdict (TEST log)", killed: v.killed, kept: v.kept, by_version: f.by_version } });
  s.verify("verdict derived from by-version response rates over log rows; killed version has >=3 rows and the lowest eligible rate", { killed: v.killed, fin_v1: f.by_version["fin-v1"], swe_v2: f.by_version["swe-v2"] });
  await s.finish({ status: v.killed==="fin-v1" ? "COMPLETE" : "LEARN", outcome: "Funnel math by resume version from the log: fin-v1 (0.25 over 4) killed; swe-v2 (1.0 over 4) kept." }); })();
