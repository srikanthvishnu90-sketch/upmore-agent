"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-067", "follow-up-nudge-draft");
  const store = T.seedTestLog();
  s.user("it's been 10 days since I applied to Ramp — nudge them");
  const app = T.findByCompany(store, "Ramp");
  const daysApplied = Math.floor((NOW - Date.parse(app.applied_at)) / 86400000);
  const draft = T.draftNudge(app, { now: NOW });
  s.tool("126-career-track.draftNudge", draft);
  s.agent(`Drafted from your Ramp record (applied ${app.applied_at.slice(0, 10)} — ${daysApplied} days ago, resume ${app.resume_version}, stage ${app.stage}). Nothing sends without your yes.`, { card: { title: "Follow-up nudge — Ramp (approval required)", ...draft } });
  s.verify("day count from the log row's applied_at; draft is approval-gated, sends:false, log stage unchanged", { days_since_applied: daysApplied, draft_sends: draft.sends, requires_approval: draft.requires_approval, stage_after: T.findByCompany(store, "Ramp").stage });
  await s.finish({ status: "COMPLETE", outcome: "Ramp nudge drafted from the application record (10 days since applied, from the log) and shown on an approval card; nothing sent" });
})();
