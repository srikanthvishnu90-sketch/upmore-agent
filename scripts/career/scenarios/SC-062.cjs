"use strict";
const { T, H, NOW, msg } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-062", "inbox-confirmation-detection");
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "Ramp", role: "Software Engineering Intern", role_family: "SWE", applied_at: "2026-10-02T12:00:00Z", resume_version: "swe-v2", source: "cold", stage: "Submitted" }, { now: NOW });
  s.user("(ATS confirmation email lands in the test inbox)");
  const m = msg("TEST-msg-confirm-ramp");
  s.tool("inbox.message", m);
  const r = T.ingestMessage(store, m, { now: NOW });
  s.tool("126-career-track.ingestMessage", r);
  if (r.alert) s.agent(r.alert.text + " (alert generated from the inbox signal — you didn't have to ask)");
  const noise = T.ingestMessage(store, msg("TEST-msg-noise-marketing"), { now: NOW });
  s.tool("126-career-track.ingestMessage(noise)", noise);
  const app = T.findByCompany(store, "Ramp");
  s.verify("log row for Ramp: stage moved Submitted->Confirmed, event source=inbox, evidence=message id; marketing noise changed nothing", { stage: app.stage, last_event: app.events.at(-1), noise_moved: noise.moved });
  await s.finish({ status: "COMPLETE", outcome: "Ramp confirmation classified, linked to the right log row, stage moved to Confirmed, alert record generated; marketing noise classified no-signal and moved nothing" });
})();
