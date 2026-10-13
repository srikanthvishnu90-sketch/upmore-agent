"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-080", "reapply-cooldown-exact-lift-date");
  s.user("Apply to Datadog again — a different role this time");
  // Cooldown record: company's reapply cooldown from its record (TEST-labeled
  // fixture value: 90 days from the last application on 2026-09-20).
  const record = { company: "Datadog", lastApplied: "2026-09-20", cooldownDays: 90, source: "TEST fixture cooldown record — real value belongs in the company record (CIR mechanics)" };
  const c = L.Apply.checkCooldown(record, "2026-10-13");
  s.tool("132-career-apply checkCooldown", { record, result: c });
  s.agent(`Held. ${c.reason}. Datadog's reapply cooldown is still active, so applying to a different role today would break it and can get both applications discarded. The exact date it lifts is ${c.liftsOn} — I'll surface this role again on ${c.liftsOn} and apply then if you still want it. (The 90-day figure here is from a labeled TEST cooldown record; the live value belongs in Datadog's company record.)`);
  const after = L.Apply.checkCooldown(record, "2026-12-19");
  s.tool("132-career-apply checkCooldown on the lift date", after);
  const ok = c.active === true && c.liftsOn === "2026-12-19" && after.active === false;
  s.verify("cooldown math from the rail: 2026-09-20 + 90 days = 2026-12-19; active today (2026-10-13), inactive on the lift date itself", { ok, liftsOn: c.liftsOn });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Reapply held under Datadog's cooldown with the exact lift date: 2026-12-19.", reason: ok ? null : "cooldown math wrong", unblock: ok ? null : "Fix checkCooldown in 132." });
})();
