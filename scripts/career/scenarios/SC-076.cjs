"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-076", "application-timeline-view");
  const store = T.seedTestLog();
  // give Ramp the fuller history the ledger row describes (applied -> confirmed), read from the log
  s.user("show me my Ramp application's history");
  const t = T.timeline(store, "Ramp");
  s.tool("126-career-track.timeline", t);
  s.agent("Ramp history from the log:\n" + t.events.map((e) => `${e.at.slice(0, 10)} — ${e.type} (${e.source}): ${e.detail}`).join("\n"));
  s.verify("timeline is exactly the log row's events array, each with its evidence source", { events: t.events, raw_row_events: T.findByCompany(store, "Ramp").events.length });
  await s.finish({ status: "COMPLETE", outcome: "Ramp timeline returned from the log: applied 2026-10-02 (seed/system, resume swe-v2) then confirmed (inbox evidence) — every entry carries its source" });
})();
