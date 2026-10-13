"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-061", "status-of-everything");
  const store = T.seedTestLog();
  s.user("where do I stand with my applications?");
  const sum = T.statusSummary(store, { now: NOW });
  s.tool("126-career-track.statusSummary", sum);
  const lines = sum.applications.map((a) => `${a.company}: ${a.stage} (applied ${a.applied_at.slice(0, 10)}, ${a.days_since_applied}d ago, resume ${a.resume_version}, ${a.source})`);
  s.agent(`From your application log — ${sum.total} applications, ${sum.open} still open:\n` + lines.join("\n"));
  s.verify("status answer computed from the log's rows: total, by-stage counts, and per-app stage all read back from the store", { total: sum.total, by_stage: sum.by_stage, open: sum.open, store_rows: T.rowsOf(store).length, stages_match_store: sum.applications.every((a) => T.findByCompany(store, a.company).stage === a.stage) });
  await s.finish({ status: "COMPLETE", outcome: "Status answer computed from the 12-row TEST log (7 open, 5 rejected, 1 offer) — every stage read from the store, not chat memory" });
})();
