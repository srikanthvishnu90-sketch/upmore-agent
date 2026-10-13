"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-072", "thank-you-after-interview");
  const store = T.seedTestLog();
  s.user("(interview happened yesterday)");
  const app = T.findByCompany(store, "Datadog");
  const draft = T.draftThankYou(app, { now: NOW });
  s.tool("126-career-track.draftThankYou", draft);
  s.agent(`Your Datadog interview was yesterday (2026-10-11, on the log). Thank-you draft prepared ${draft.hours_since_interview}h after it — inside the 24h window. Nothing sends without your yes.`, { card: { title: "Thank-you — Datadog (approval required)", ...draft } });
  s.verify("interview event date read from the log; draft within_24h computed from it; approval-gated", { interview_event: app.events.filter((e) => e.type === "interview"), within_24h: draft.within_24h, sends: draft.sends });
  await s.finish({ status: "COMPLETE", outcome: "Thank-you draft for Datadog prepared within 24h of the logged interview (exactly 24h at the fixed clock), referencing the application record, on an approval card" });
})();
