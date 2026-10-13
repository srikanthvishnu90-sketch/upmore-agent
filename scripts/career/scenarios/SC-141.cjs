"use strict"; const { S, T, H } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-141", "season-dashboard");
  s.user("Season dashboard: applications by week against my plan");
  const store = T.seedTestLog(); const d = S.seasonDashboard(store, { targetApplications: 20 });
  s.tool("136-career-season.seasonDashboard", d);
  s.agent(`Season so far: ${d.text} By week: ${d.by_week.map((w) => `${w.week_start}: ${w.applied} applied (${w.referred} referred)`).join("; ")}.`, { card: { title: "Season dashboard (TEST log)", total: d.total_applications, plan_target: 20, plan_pct: d.plan_pct, by_week: d.by_week, by_stage: d.by_stage } });
  s.verify("dashboard computed from the 126 log rows themselves: 12 applications, weekly buckets sum to the total", { total: d.total_applications, weeks_sum: d.by_week.reduce((a, w) => a + w.applied, 0), plan_pct: d.plan_pct });
  await s.finish({ status: "COMPLETE", outcome: "Season dashboard rendered from the application log: 12 applications by week against a 20-application plan (60%)" }); })();
