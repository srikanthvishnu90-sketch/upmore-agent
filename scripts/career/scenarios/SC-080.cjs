"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-080", "status-by-company");
  const store = T.seedTestLog();
  s.user("what happened with my Stripe application? (Doc 2 A5)");
  const r = T.statusByCompany(store, "Stripe", { now: NOW });
  s.tool("126-career-track.statusByCompany", r);
  s.agent(`Stripe — ${r.role}: stage ${r.stage}. Applied ${r.applied_at.slice(0, 10)} (${r.days_since_applied} days ago), resume ${r.resume_version}, source ${r.source}. Last signal: ${r.last_signal.type} on ${r.last_signal.at.slice(0, 10)} (source: ${r.last_signal.source}). Offer deadline on file: ${r.offer_deadline.slice(0, 10)}.`);
  s.verify("single-application answer read from the one log row: stage, dates, and last signal's source all match the row", { row_stage: T.findByCompany(store, "Stripe").stage, row_last_event: T.findByCompany(store, "Stripe").events.at(-1), answer: r });
  await s.finish({ status: "COMPLETE", outcome: "Stripe answer from the log alone: Offer stage, applied 2026-09-20, last signal = offer on 2026-10-10 (inbox), deadline 2026-10-20" });
})();
