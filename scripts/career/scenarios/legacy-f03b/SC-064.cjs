"use strict";
const { T, H, NOW, msg } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-064", "interview-invite-detection");
  const store = T.createMemoryStore([]);
  T.addApplication(store, { company: "Datadog", role: "Software Engineering Intern", role_family: "SWE", applied_at: "2026-09-25T12:00:00Z", resume_version: "swe-v2", source: "referred", stage: "Confirmed" }, { now: NOW });
  s.user("(recruiter invite email lands)");
  const r = T.ingestMessage(store, msg("TEST-msg-interview-datadog"), { now: NOW });
  s.tool("126-career-track.ingestMessage", r);
  s.agent(`${r.alert.text} Calendar event attached to the application and prep triggered (F09 seam).`, { card: { title: "Calendar event (attached to application)", ...r.calendar_event } });
  const app = T.findByCompany(store, "Datadog");
  s.verify("log stage = Interview rounds; calendar_event_attached event present on the application row", { stage: app.stage, events: app.events.map((e) => e.type), calendar_event: r.calendar_event });
  await s.finish({ status: "COMPLETE", outcome: "Datadog invite moved the stage to Interview rounds, a calendar-event record was attached to the application row, and prep was triggered via the F09 seam (no standalone calendar rail exists yet — the event lives on the log row)" });
})();
