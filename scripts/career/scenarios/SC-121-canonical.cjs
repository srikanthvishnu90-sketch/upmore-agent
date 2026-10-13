"use strict"; const { T, P, H, msg, cir, NOW } = require("./d1-common.cjs");
(async () => { const s = H.session("SC-121", "where-do-i-stand");
  s.user("Where do I stand?");
  const store = T.seedTestLog(); const sum = T.statusSummary(store, { now: NOW });
  s.tool("126-career-track.statusSummary", sum);
  s.agent(`Here is the true stage of everything, straight from your application log (${sum.total} applications, ${sum.open} open):\n` + sum.applications.map((a) => `• ${a.company} — ${a.role}: ${a.stage} (applied ${a.applied_at.slice(0,10)}, ${a.days_quiet}d quiet, resume ${a.resume_version}, ${a.source})`).join("\n"), { card: { title: "Where you stand (TEST log)", total: sum.total, open: sum.open, by_stage: sum.by_stage } });
  const stageSum = Object.values(sum.by_stage).reduce((a,b)=>a+b,0);
  s.verify("summary computed from the log rows themselves: total equals by-stage sum and open excludes terminal stages", { total: sum.total, stageSum, open: sum.open });
  await s.finish({ status: stageSum===sum.total && sum.total===12 ? "COMPLETE" : "LEARN", outcome: `Status answer rendered from the log: 12 applications, ${sum.open} open, every stage from the rows — nothing from memory.` }); })();
