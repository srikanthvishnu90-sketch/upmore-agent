"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-070", "manual-status-update");
  const store = T.seedTestLog();
  s.user("I got an interview at Ramp");
  const r = T.manualUpdate(store, "Ramp", "Interview rounds", { now: NOW, detail: "user reported: I got an interview at Ramp" });
  s.tool("126-career-track.manualUpdate", { ok: r.ok, stage: r.application.stage, last_event: r.application.events.at(-1) });
  const after = T.statusByCompany(store, "Ramp", { now: NOW });
  s.agent(`Logged. Your Ramp application now shows: ${after.stage} (was Confirmed), marked user-reported. Your next status answer will reflect it.`);
  s.verify("chat update wrote to the log; the next status answer reads the new stage; event source is 'user-reported'", { status_after: after, event_source: T.findByCompany(store, "Ramp").events.at(-1).source });
  await s.finish({ status: "COMPLETE", outcome: "Manual update wrote Ramp -> Interview rounds in the log with source 'user-reported', and the follow-up status read reflects it" });
})();
