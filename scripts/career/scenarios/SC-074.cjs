"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-074", "reapply-cooldown-respected");
  const store = T.seedTestLog();
  s.user("reapply to that Goldman role");
  const r = T.reapplyCheck(store, "Goldman Sachs", { now: NOW });
  s.tool("126-career-track.reapplyCheck", r);
  s.agent(`I can't reapply yet. Your log shows the Goldman Sachs rejection on 2026-10-05. Under the ${r.cooldown_days}-day cooldown the reopen date is ${r.reopen_date}. Honest gap: no CIR in the repo carries a cooldown field and there is no Goldman CIR at all, so that 180 days is a labeled default policy, not a Goldman-published rule.`);
  s.verify("refusal and reopen date computed from the log's rejection event date + the labeled default policy", { allowed: r.allowed, reopen_date: r.reopen_date, rejection_event: T.findByCompany(store, "Goldman Sachs").events.filter((e) => e.type === "rejection") });
  await s.finish({ status: "LEARN", outcome: "Reapply correctly refused with reopen date 2027-04-03 computed from the log, but the cooldown length is a default policy — no CIR cooldown data exists to source it from", reason: "CIR records (15 companies) contain no cooldown field and no Goldman Sachs CIR exists, so the firm-specific cooldown the ledger row implies cannot be verified from CIR data", unblock: "Add cooldown_days (with source) to the CIR schema / a Goldman Sachs CIR record; the module will then read the firm rule instead of the labeled 180-day default" });
})();
